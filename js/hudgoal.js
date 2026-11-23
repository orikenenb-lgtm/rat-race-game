// 3D upgrade wave 2 (team ד, A2 G-04 / G-07, brief §14–15): the "יעד העולם" panel model and the new-debt chip numbers.
// PURE (no DOM, no state writes): everything comes from the engine's own outputs — E.metrics(S) (goalParts, goalHold,
// emergency, life, totals, liabilities, expenseLines) and E.starThresholds(world, charId, rules). The only arithmetic here is
// the difference of two engine values (target − value of the engine's own goal part; liabilities after − before). No new
// rules, no fields added to metrics(), nothing saved. Tested against the engine in tests/hud_goal.test.mjs.
import { fmtM } from './engine.js';

const nf = (n) => Math.round(+n || 0);
const paydays = (n) => (n === 1 ? 'משכורת אחת' : n === 2 ? 'שתי משכורות' : `${n} משכורות`);
const pts = (n) => (n === 1 ? 'נקודת השפעה אחת' : `${n} נקודות השפעה`);
const PART_LABEL = { passive: 'הכנסה פסיבית מול הוצאות', netWorth: 'שווי נקי', impact: 'נקודות השפעה', benchmark: 'שווי מול "קנה והחזק"' };

/** One goal part with its gap (target − value of the engine's own part, never below 0). */
function part(p) {
  const value = +p.value || 0, target = +p.target || 0;
  const gap = Math.max(0, target - value);
  const isPts = p.key === 'impact';
  return {
    key: p.key, label: PART_LABEL[p.key] || p.label, value, target, gap, progress: Math.max(0, Math.min(1, +p.progress || 0)),
    met: p.key === 'passive' ? value > 0 && value >= target : value >= target,
    valueText: isPts ? String(nf(value)) : fmtM(value), targetText: isPts ? String(nf(target)) : fmtM(target),
  };
}
/** The main "what is missing" line for a part (null when it is met). */
function gapText(p, goalType) {
  if (p.met) return null;
  switch (p.key) {
    case 'passive': return p.value <= 0 && p.target <= 0 ? null : `חסרה ${fmtM(p.gap)} הכנסה פסיבית לכיסוי ההוצאות`;
    case 'netWorth': return `חסרים ${fmtM(p.gap)} לשווי נקי של ${fmtM(p.target)}`;
    case 'impact': return p.gap === 1 ? 'חסרה נקודת השפעה אחת' : `חסרות ${nf(p.gap)} נקודות השפעה`;
    case 'benchmark': return `השווי שלך נמוך ב־${fmtM(p.gap)} משל "קנה והחזק"`;
    default: return goalType ? `חסרים ${fmtM(p.gap)}` : null;
  }
}
function ruleText(goalType, parts) {
  const nw = parts.find((p) => p.key === 'netWorth'), im = parts.find((p) => p.key === 'impact');
  switch (goalType) {
    case 'passive': return 'יוצאים מהמירוץ כשההכנסה הפסיבית (כסף שנכסים מכניסים בלי לעבוד) מכסה את כל ההוצאות החודשיות.';
    case 'netWorth': return `יוצאים מהמירוץ בשווי נקי (כל מה שיש לך פחות החובות) של ${nw ? nw.targetText : ''}.`;
    case 'netWorthImpact': return `שני יעדים יחד: שווי נקי של ${nw ? nw.targetText : ''} וגם ${im ? pts(nf(im.target)) : ''}. שני הפסים חייבים להתמלא.`;
    case 'benchmark': return 'בסוף התקופה השווי שלך צריך להיות גבוה משל משקיע שקנה את המדד והחזיק.';
    default: return '';
  }
}

/**
 * The panel model.
 * @param m   E.metrics(S)
 * @param o   { thresholds: E.starThresholds(world, charId, m.rules), learn?: bool, startNW?: number (history only),
 *              impactPending?: number (m.worldIndicators.impactPending) }
 */
export function goalPanelModel(m, o = {}) {
  const th = o.thresholds || {};
  const goalType = m.goalType;
  const parts = (m.goalParts || []).map(part);
  const gaps = parts.map((p) => gapText(p, goalType)).filter(Boolean);
  const bench = goalType === 'benchmark';
  const allMet = parts.length > 0 && parts.every((p) => p.met);
  const H = m.goalHold || { streak: 0, need: 2, met: false };
  const hold = bench ? null : {
    need: H.need, streak: Math.min(H.streak || 0, H.need), met: !!H.met, ok: (H.streak || 0) >= H.need,
    text: `היעד צריך להחזיק ${paydays(H.need)} ברצף`,
    status: H.met || H.streak > 0 ? `מחזיק ${Math.min(H.streak || 0, H.need)}/${H.need}` : 'עוד לא התחיל',
  };
  const month = m.month || 0;
  const happyNow = m.life ? (m.life.happinessBase ?? m.life.happiness) : null;   // buildEnd reads st.life.happiness (the base, without the passing glow)
  const fundNow = m.emergency ? m.emergency.months : null;
  const gates = [];
  if (fundNow != null && th.fundMonths != null) gates.push({ key: 'fund', text: `קרן חירום: לפחות ${th.fundMonths} חודשי הוצאות`, now: `${fundNow}/${th.fundMonths}`, ok: fundNow >= th.fundMonths });
  if (happyNow != null && th.happy != null) gates.push({ key: 'happy', text: `אושר ${th.happy} לפחות`, now: `${Math.round(happyNow)}/${th.happy}`, ok: Math.round(happyNow) >= th.happy, note: m.life && m.life.happiness !== m.life.happinessBase ? 'בלי השמחה הזמנית' : null });
  let stars = null, starsNote = null;
  if (o.learn) starsNote = 'במשחק לימוד לא אוספים כוכבים — כאן רק לומדים.';
  else if (bench) {
    const realNW = m.life ? m.life.realNetWorth : null;
    stars = [
      { n: 1, text: 'שווי ריאלי (אחרי אינפלציה) גבוה מבהתחלה', now: realNW != null ? fmtM(realNW) : null, ok: o.startNW != null && realNW != null ? realNW > o.startNW : null },
      { n: 2, text: 'לנצח את "קנה והחזק" בסוף התקופה', now: null, ok: allMet },
      { n: 3, text: 'לנצח, וגם אושר 60 לפחות', now: null, ok: null, gates: gates.filter((g) => g.key === 'happy') },
    ];
  } else {
    const max = m.maxMonths ?? th.maxMonths;
    const row = (n, lim) => ({ n, limit: lim, text: `לצאת מהמירוץ עד חודש ${lim}`, now: month <= lim ? `עכשיו חודש ${month}` : `עבר — עכשיו חודש ${month}`, ok: month <= lim });
    stars = [row(1, max), row(2, th.t2 ?? max), { ...row(3, th.t3 ?? max), gates }];
    if (m.mode === 'free') starsNote = 'במשחק חופשי הזמן לא נגמר — אבל הכוכבים נמדדים לפי החודש שבו יוצאים.';
  }
  return {
    goalType, rule: ruleText(goalType, parts), parts, gaps, met: allMet, hold, stars, starsNote, month,
    pending: goalType === 'netWorthImpact' && o.impactPending ? `עוד ${pts(nf(o.impactPending))} בדרך (מתבשלות)` : null,
    totals: { assets: m.totalAssets, liabilities: m.totalLiabilities, netWorth: m.netWorth,
      assetsText: fmtM(m.totalAssets || 0), liabilitiesText: fmtM(m.totalLiabilities || 0), netWorthText: fmtM(m.netWorth || 0) },
    /** one line for the toggle's accessible name and the phone HUD (the first gap, or "the goal is met") */
    summary: gaps[0] || (bench ? 'השווי שלך מעל "קנה והחזק"' : hold && hold.ok ? 'היעד הושג' : `היעד הושג — ${hold ? hold.status : ''}`),
  };
}

/** Debt-bearing monthly lines of the engine's statement (bank-loan and card interest): their sum. */
const DEBT_LINES = new Set(['loan', 'credit']);
export function debtMonthly(m) { return (m.expenseLines || []).reduce((s, l) => s + (DEBT_LINES.has(l.id) ? +l.amount || 0 : 0), 0); }
/** The snapshot game.js keeps between renders (engine values only). */
export const debtSnap = (m) => ({ total: +m.totalLiabilities || 0, monthly: debtMonthly(m) });
/**
 * New debt between two snapshots: {amount, monthly, text} when total liabilities rose, else null.
 * monthly = the rise of the engine's own loan / card interest lines (0 for a mortgage: its cost is inside the asset's cash flow).
 */
export function newDebt(before, after) {
  if (!before || !after) return null;
  const amount = Math.round(after.total - before.total);
  if (!(amount > 0)) return null;
  const monthly = Math.max(0, Math.round(after.monthly - before.monthly));
  return { amount, monthly, text: `חוב חדש ${fmtM(amount)}${monthly ? ` · ${fmtM(monthly)} בחודש` : ''}` };
}
