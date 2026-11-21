// T4 §10 — in-context practice ("💡 שאלת רגע"): the 24 items + a pure, deterministic selector. Owned by T4.
// Pure module: no DOM, no engine import (engine.js may import this file), no randomness, no money/🔋/😊 effect, no lesson unlock.
//
// Contract with the engine lane (E-10, action code 'K' — 'Q' belongs to T3):
//   engine.practiceDue(st, memo)       = pickPractice(st, memo, expensesOf(st), fmtM)
//   engine.answerPractice(st, qid, idx): guard (ranked/history, unknown/answered qid, phase !== 'roll' → {ok:false}),
//                                        then act(st, ['K', qid, idx]) and return recordAnswer(st, qid, idx, st.turn).
//   replay(): case 'K': r = answerPractice(st, a[1], a[2]); break;   verify_core CODES gains 'K'.
// The lobby / onboard.js only call the engine functions (feature-detected: typeof E.practiceDue === 'function').

/** Topic id → Hebrew name (shown as S-P3 "💡 שאלת רגע · {topicName}"). */
export const TOPICS = {
  budget: 'תקציב', debt: 'חוב וריבית', fund: 'קרן חירום', cfnw: 'תזרים מול שווי', liq: 'נזילות', div: 'פיזור',
  cmp: 'ריבית דריבית', inf: 'אינפלציה', tax: 'מסים', risk: 'סיכון', opp: 'מחיר הוויתור', prof: 'רווח מול מחזור',
};
export const topicName = (t) => TOPICS[t] || '';

const A = (id, topic, principle, after, q, answers, c, why, sim) => ({ id, topic, topicName: TOPICS[topic], principle, kind: id.endsWith('_b') ? 'b' : 'a', after, q, answers, c, why, ...(sim ? { sim } : {}) });
const BUDGET = ['cashflow', 'gross_net', 'lifestyle_creep', 'hedonic'];
const DEBT = ['credit_card_debt', 'forced_loan', 'good_debt', 'credit_score'];
const FUND = ['emergency_fund', 'forced_loan'];
const CFNW = ['asset_liability', 'passive_income', 'cashflow'];
const LIQ = ['emergency_fund', 'forced_loan', 'drawdown'];
const DIV = ['diversification', 'fx_risk', 'rate_risk', 'power_law'];
const CMP = ['compound_interest', 'pension_match', 'dollar_cost', 'index_fund'];
const INF = ['inflation', 'wage_lag', 'real_vs_nominal'];
const RISK = ['power_law', 'bubble', 'panic_selling', 'negotiation_fail'];

/** The 24 items (§10.2). `c` = index of the correct answer. {E}/{3E}/{6E} = this game's monthly expenses (rounded to ₪100). */
export const PRACTICE = [
  A('budget_a', 'budget', 'cashflow', BUDGET, 'לנועה נטו ₪8,000 והוצאות קבועות ₪6,500. היא נרשמת לחדר כושר ב־₪250 בחודש. כמה נשאר לה בסוף החודש?', ['₪1,750', '₪1,250', '₪1,500'], 1, '8,000 − 6,500 − 250 = 1,250. כל מנוי חדש יוצא מהתזרים.'),
  A('budget_b', 'budget', 'cashflow', BUDGET, 'לרון עסק קטן: נכנסים ₪12,000 בחודש ויוצאים ₪11,400. ספק מעלה מחיר ב־₪200 לחודש. כמה נשאר לו?', ['₪800', '₪600', '₪400'], 2, '12,000 − 11,400 − 200 = 400. אותו חשבון, גם בעסק.'),
  A('debt_a', 'debt', 'debt_cost', DEBT, 'חוב של ₪10,000 בריבית 12% בשנה. משלמים ₪100 בחודש. מה קורה לחוב?', ['יורד לאט', 'נשאר בערך אותו דבר', 'נגמר בעוד 100 חודשים'], 1, '12% בשנה הם בערך ₪100 ריבית בחודש. כל התשלום הולך לריבית.'),
  A('debt_b', 'debt', 'debt_cost', DEBT, 'בחנות: מקרר ב־₪3,600 עכשיו, או 12 תשלומים של ₪330. כמה עולה האשראי?', ['₪360', 'כלום', '₪330'], 0, '12 × 330 = 3,960. 3,960 − 3,600 = 360 — זה המחיר של הכסף.'),
  A('fund_a', 'fund', 'cushion', FUND, 'ההוצאות החודשיות שלך עכשיו: {E}. כמה צריך בצד לכרית של 3 חודשים?', ['{E}', '{3E}', '{6E}'], 1, '3 × ההוצאות החודשיות — לא 3 משכורות.'),
  A('fund_b', 'fund', 'cushion', FUND, 'למיכל ₪12,000 בצד והוצאות של ₪6,000 בחודש. היא מאבדת את העבודה, ואין לה שום הכנסה אחרת. כמה זמן הכרית מחזיקה?', ['חודש', 'חודשיים', 'חצי שנה'], 1, '12,000 ÷ 6,000 = 2. הכרית קונה זמן לחפש עבודה בלי לקחת חוב.'),
  A('cfnw_a', 'cfnw', 'cashflow', CFNW, 'לדנה דירה ששווה ₪2 מיליון ומשכנתא של ₪1.5 מיליון, והדירה מוציאה ממנה ₪500 בחודש. מה נכון?', ['שווי נקי חיובי, תזרים שלילי', 'היא כבר חופשית כלכלית', 'יש לה הפסד של ₪500 אלף'], 0, 'שווי = מה יש פחות מה חייבים. תזרים = מה נשאר כל חודש.'),
  A('cfnw_b', 'cfnw', 'cashflow', CFNW, 'לאבי 3 מכונות כביסה ששוות ₪20,000 ומכניסות ₪900 בחודש נטו. לגיל דירה של ₪1 מיליון בלי משכנתא, ריקה. למי יש יותר הכנסה פסיבית?', ['לאבי', 'לגיל', 'שווה'], 0, 'שווי גבוה לא משלם חשבונות. תזרים כן.'),
  A('liq_a', 'liq', 'cushion', LIQ, 'מה הכי מהר הופך למזומן, בלי להפסיד?', ['דירה להשכרה', 'חיסכון נזיל בבנק', 'מניה שירדה 30%'], 1, 'נזיל = זמין מחר, בלי למכור בזול.'),
  A('liq_b', 'liq', 'cushion', LIQ, 'ליוסי דירה ששווה ₪400,000 ו־₪2,000 בעו"ש. מחר המוסך מבקש ₪6,000. מה הבעיה שלו?', ['אין לו מספיק שווי', 'אין לו מספיק נזילות', 'יש לו יותר מדי חיסכון'], 1, 'עשיר על הנייר, בלי מזומן זמין. דירה לא מוכרים בשביל מוסך.'),
  A('div_a', 'div', 'diversification', DIV, 'לרון 3 דירות באותה עיר, ושום דבר אחר. מה הסיכון הכי גדול?', ['מכה אחת לעיר פוגעת בכולן', 'אין סיכון בנדל"ן', 'המס'], 0, 'פיזור = לא כל הכסף תלוי בדבר אחד.'),
  A('div_b', 'div', 'diversification', DIV, 'יבואן מוכר רק דרך אתר אחד, וכל הסחורה מספק אחד. איזה צעד הכי מפזר את הסיכון?', ['להוריד מחירים', 'להוסיף ספק שני', 'להגדיל הזמנה מאותו ספק'], 1, 'כשספק אחד נופל, השני ממשיך. פיזור עובד גם בעסק.'),
  A('cmp_a', 'cmp', 'time_in_market', CMP, '₪1,000 בתשואה של 5% בשנה, בלי למשוך. כמה יהיה אחרי שנתיים?', ['₪1,100', '₪1,102.50', '₪1,050'], 1, 'בשנה השנייה גם ה־₪50 מהשנה הראשונה מרוויחים: 1,050 × 1.05.'),
  A('cmp_b', 'cmp', 'time_in_market', CMP, 'שני חברים חוסכים ₪500 בחודש באותה תשואה. אחד מתחיל בגיל 25, השני בגיל 35. למי יהיה יותר בגיל 65?', ['שווה — אותו סכום בחודש', 'למי שהתחיל ב־25', 'למי שהתחיל ב־35'], 1, 'עשר שנים נוספות של ריבית על ריבית — זה ההבדל הגדול.'),
  A('inf_a', 'inf', 'fees_tax', INF, 'אינפלציה 4% בשנה, והחיסכון שלך מקבל 2% בשנה. מה קרה לכוח הקנייה של ₪10,000 אחרי שנה?', ['עלה', 'ירד, בערך 2%', 'לא השתנה'], 1, 'ריאלי ≈ ריבית פחות אינפלציה: 2% − 4% = בערך −2%.'),
  A('inf_b', 'inf', 'fees_tax', INF, 'קיבלת העלאה של 3%, והמחירים עלו השנה ב־5%. מה קרה למשכורת שלך באמת?', ['עלתה ב־3%', 'ירדה בערך ב־2%', 'עלתה ב־8%'], 1, 'במספרים עלתה, בקנייה ירדה. זה ההבדל בין נומינלי לריאלי.'),
  A('tax_a', 'tax', 'fees_tax', ['biz_vat', 'tax_brackets', 'gross_net', 'capital_gains'], 'מחיר בקופה ₪59, כולל מע"מ 18%. כמה מזה מע"מ?', ['₪10.62', '₪9', '₪18'], 1, '59 × 18 ÷ 118 = 9. המע"מ כבר בתוך המחיר.', 'שיעור המע"מ במשחק: 18%.'),
  A('tax_b', 'tax', 'fees_tax', ['marginal_overtime', 'tax_brackets', 'side_tax'], 'הרווחת עוד ₪1,000 ברוטו בשעות נוספות. מדרגת המס השולית שלך 31%. כמה נשאר לך?', ['₪1,000', '₪690', '₪310'], 1, 'המדרגה חלה רק על השקל הנוסף: 1,000 × 0.69 = 690.', 'פישוט: בלי ביטוח לאומי ומס בריאות.'),
  A('risk_a', 'risk', 'risk_size', RISK, 'א׳: ₪100 בטוח. ב׳: 50% לקבל ₪250, 50% לקבל ₪0. מה התוחלת של ב׳?', ['₪250', '₪125', '₪100'], 1, '0.5 × 250 + 0.5 × 0 = 125 — הממוצע על הרבה פעמים.'),
  A('risk_b', 'risk', 'risk_size', RISK, 'הימור: 50% לזכות ב־₪25,000, 50% לקבל ₪0, תמורת ₪10,000. יש לך בדיוק ₪10,000 — וזה כסף השכירות. מה נכון?', ['לקחת, התוחלת ₪12,500', 'לוותר, הפסד אחד יפיל אותך', 'לקחת חצי בהלוואה'], 1, 'תוחלת גבוהה לא שווה כלום אם הפסד אחד מוציא אותך מהמשחק.'),
  A('opp_a', 'opp', 'opportunity_cost', ['opportunity_cost', 'hedonic', 'lifestyle_creep'], '₪4,500 על טלפון חדש, או להשאיר אותם בחיסכון של 2% בשנה. על מה אתה מוותר כשאתה קונה את הטלפון?', ['₪90', '₪4,500 ועוד הריבית שהיו מרוויחים', 'כלום, זה הכסף שלך'], 1, 'הוויתור = כל מה שהכסף יכול היה לעשות במקום.'),
  A('opp_b', 'opp', 'time', ['time_scarce', 'rest_value', 'side_hustle', 'marginal_overtime'], 'שבת אחת: משמרת נוספת תמורת ₪600, או יום עם המשפחה. מה המחיר של יום המשפחה?', ['₪0', '₪600 שלא תרוויח', '₪600 שתוציא'], 1, 'גם לזמן יש מחיר: מה שוויתרת עליו. לפעמים שווה לשלם אותו.'),
  A('prof_a', 'prof', 'cashflow', ['biz_revenue_profit', 'biz_gross_net', 'biz_owner_job', 'side_hustle'], 'פלאפלייה: מחזור ₪60,000 בחודש, חומרי גלם ₪20,000, שכירות ושכר ₪35,000. מה הרווח לפני מס?', ['₪60,000', '₪5,000', '₪40,000'], 1, '60,000 − 20,000 − 35,000 = 5,000. מחזור זה לא רווח.'),
  A('prof_b', 'prof', 'cashflow', ['biz_receivables', 'biz_inventory', 'biz_revenue_profit'], 'אותה פלאפלייה הרוויחה ₪5,000, אבל חצי מהמחזור (משרדים) ישולם רק בחודש הבא. מה קורה לקופה החודש?', ['עולה ב־₪5,000', 'יכולה לרדת למינוס, למרות הרווח', 'לא משתנה'], 1, 'רווח ≠ מזומן. כסף שעוד לא נכנס לא משלם לספקים.'),
];
export const PRACTICE_BY_ID = Object.fromEntries(PRACTICE.map((x) => [x.id, x]));

/** Dose rules (§10.1). */
export const DOSE = { minTurn: 4, gap: 3, maxPerGame: 6, farGap: 8 };

const groups = (n) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const localMoney = (n) => (n < 0 ? '−' : '') + '₪' + groups(n);
const r100 = (n) => Math.round((+n || 0) / 100) * 100;
/** Fill {E} / {3E} / {6E} with this game's expenses (rounded to ₪100). fmt = the engine's fmtM when the engine calls it. */
export function fillItem(item, expenses, fmt = localMoney) {
  const E = r100(expenses);
  const sub = (t) => String(t).replace(/\{(\d*)E\}/g, (m, k) => fmt((+k || 1) * E));
  return { id: item.id, topic: item.topic, topicName: item.topicName, kind: item.kind, q: sub(item.q), answers: item.answers.map(sub), why: item.why, ...(item.sim ? { sim: item.sim } : {}) };
}
const playable = (st) => !!st && st.mode === 'free' && !st.over;
const introPending = (st) => !!(st.intro && st.intro.step && st.intro.step !== 'done' && st.intro.step !== 'skipped');

/**
 * The next practice offer, or null. Deterministic (no RNG): lessons unlocked THIS game, newest first, then the turn.
 * memo = { lastTurn:int|null, offered:[qid], doneA:[topic] } — kept by the caller (UI); an ignored chip counts as offered.
 * Item 'b' (far transfer) of a topic only after its 'a' was answered ≥ DOSE.farGap turns ago in this game, or topic ∈ memo.doneA.
 * Returns {id, topic, topicName, kind, q, answers, why, sim?} — the correct index is NOT returned.
 */
export function pickPractice(st, memo = {}, expenses = 0, fmt) {
  if (!playable(st) || introPending(st)) return null;
  const turn = +st.turn || 0;
  const offered = Array.isArray(memo.offered) ? memo.offered : [];
  if (turn < DOSE.minTurn || offered.length >= DOSE.maxPerGame) return null;
  if (memo.lastTurn != null && turn - memo.lastTurn < DOSE.gap) return null;
  const P = st.practice || {}; const answered = P.answered || {}; const at = P.turns || {};
  const doneA = new Set(Array.isArray(memo.doneA) ? memo.doneA : []);
  const free = (id) => !(id in answered) && !offered.includes(id);
  const lessons = Array.isArray(st.lessons) ? st.lessons : [];
  for (let i = lessons.length - 1; i >= 0; i--) {
    const lid = lessons[i];
    const topics = [...new Set(PRACTICE.filter((x) => x.kind === 'a' && x.after.includes(lid)).map((x) => x.topic))];
    for (const t of topics) {
      const a = PRACTICE_BY_ID[t + '_a']; const b = PRACTICE_BY_ID[t + '_b'];
      if (free(a.id)) return fillItem(a, expenses, fmt);
      const aLongAgo = a.id in answered && at[a.id] != null && turn - at[a.id] >= DOSE.farGap;
      if (b && free(b.id) && (aLongAgo || doneA.has(t))) return fillItem(b, expenses, fmt);
    }
  }
  return null;
}

/** Pure check (no state): {right, correct, why, sim?} or null for an unknown id / index. */
export function checkAnswer(qid, idx) {
  const it = PRACTICE_BY_ID[qid]; idx = Math.floor(+idx);
  if (!it || !(idx >= 0 && idx < it.answers.length)) return null;
  return { right: idx === it.c, correct: it.c, why: it.why, ...(it.sim ? { sim: it.sim } : {}) };
}

/**
 * Record an answer on the state (the engine calls this AFTER its guard and act(st, ['K', qid, idx])).
 * Changes only st.practice ({answered:{qid:0|1}, turns:{qid:turn}}) and st.dq.transfer[principle] ({n, right}).
 */
export function recordAnswer(st, qid, idx, turn = st.turn) {
  const r = checkAnswer(qid, idx); if (!r) return { ok: false, error: 'אין שאלה כזו' };
  const it = PRACTICE_BY_ID[qid];
  const P = st.practice || (st.practice = { answered: {} });
  P.answered ||= {}; P.turns ||= {};
  if (qid in P.answered) return { ok: false, error: 'כבר ענית על השאלה הזו' };
  P.answered[qid] = r.right ? 1 : 0; P.turns[qid] = +turn || 0;
  const dq = st.dq || (st.dq = {}); const T = dq.transfer || (dq.transfer = {});
  const cur = T[it.principle] || { n: 0, right: 0 };
  T[it.principle] = { n: cur.n + 1, right: cur.right + (r.right ? 1 : 0) };
  return { ok: true, topic: it.topic, principle: it.principle, kind: it.kind, ...r };
}
