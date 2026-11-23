// 3D upgrade wave 2 (team ד, A2 G-04 / G-07, brief §14–15): the "יעד העולם" panel model and the new-debt chip numbers.
// PURE (no DOM, no state writes): everything comes from the engine's own outputs — E.metrics(S) (goalParts, goalHold,
// emergency, life, totals, liabilities, expenseLines) and E.starThresholds(world, charId, rules). The only arithmetic here is
// the difference of two engine values (target − value of the engine's own goal part; liabilities after − before). No new
// rules, no fields added to metrics(), nothing saved. Tested against the engine in tests/hud_goal.test.mjs.
import { fmtM } from './engine.js';

const nf = (n) => Math.round(+n || 0);
const paydays = (n) => (n === 1 ? 'משכורת אחת' : n === 2 ? 'שתי משכורות' : `${n} משכורות`);
const pts = (n) => (n === 1 ? 'נקודת השפעה אחת' : `${n} נקודות השפעה`);
const PART_LABEL = { passive: 'הכנסה פסיבית מול הוצאות', netWorth: 'שווי נקי', impact: 'נקודות השפעה', benchmark: 'שווי מול "קנה והחזק"', passive12: 'ממוצע 12 חודשים: הכנסה מהנכסים' };

/** One goal part with its gap (target − value of the engine's own part, never below 0). */
function part(p) {
  const value = +p.value || 0, target = +p.target || 0;
  const gap = Math.max(0, target - value);
  const isPts = p.key === 'impact';
  return {
    key: p.key, label: PART_LABEL[p.key] || p.label, value, target, gap, progress: Math.max(0, Math.min(1, +p.progress || 0)),
    met: p.key === 'passive' ? value > 0 && value >= target : value >= target,
    valueText: isPts ? String(nf(value)) : fmtM(value), targetText: isPts ? String(nf(target)) : fmtM(target),
    note: p.note || null, months: p.months ?? null, window: p.window ?? null,
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
    case 'passive12': return `חסרים ${fmtM(p.gap)} בחודש בממוצע השנתי (היעד: ${fmtM(p.target)} בחודש)`;
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
    case 'passive12': { const p = parts.find((x) => x.key === 'passive12'); return `יוצאים מהמירוץ כשהממוצע של 12 ימי המשכורת האחרונים — הכנסה מהנכסים, קיץ וחורף יחד — מגיע ל־${p ? p.targetText : ''} בחודש. חודש קיץ אחד לא מספיק.`; }
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
  // worlds: a module's own ★★★ rule when the engine exposes it (w6 worldIndicators.plant.starGate: no safety-inspection stop in 12 months)
  for (const x of Object.values(m.worldIndicators || {})) {
    const sg = x && typeof x === 'object' ? x.starGate : null;
    if (sg && sg.label) gates.push({ key: sg.id || 'world', text: String(sg.label).replace(/^★+\s*/, ''), now: sg.ok ? 'כרגע ✓' : 'נעצר', ok: !!sg.ok });
  }
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
  const ladder = bench ? [] : milestoneLadder(m);   // wave 3a: the near-goal ladder (metrics values only)
  return {
    goalType, rule: ruleText(goalType, parts), parts, gaps, met: allMet, hold, stars, starsNote, month, ladder, next: bench ? null : nextMilestone(m),
    pending: goalType === 'netWorthImpact' && o.impactPending ? `עוד ${pts(nf(o.impactPending))} בדרך (מתבשלות)` : (parts.find((p) => p.note) || {}).note || null,
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

/* ---------- wave 3a (J1 P0-2, brief §8 "יעד קרוב"): the near-goal milestone ladder for every world and mode.
 * Built ONLY from E.metrics(S) values (emergency.months / target, assets[].cf, goalParts value / target, goalHold) — comparisons, no new
 * rule, nothing saved. The rungs, in order: 🛟 one month in the fund → a first asset that brings money every month → 🛟 the fund target
 * (★★★) → each goal part at ¼, ½ and ¾ of its target → the goal itself → the goal holding its paydays. The next unmet rung is shown in
 * the HUD (#hNext) once the tutorial goal chain (metrics().nextGoal) is done; null when everything is met (or for the benchmark race). */
const QUARTER = [[0.25, 'רבע'], [0.5, 'חצי'], [0.75, 'שלושה רבעים']];
const mo1 = (x) => Math.round((+x || 0) * 10) / 10;
export function milestoneLadder(m) {
  const out = [];
  const E = m.emergency || null; const fundT = E && E.target ? E.target : 3;
  if (E) out.push({ id: 'fund1', icon: '🛟', title: 'חודש הוצאות בקרן החירום', value: mo1(E.months), target: 1, unit: 'mo', met: (+E.months || 0) >= 1 });
  const cfAssets = (m.assets || []).filter((a) => (+a.cf || 0) > 0).length;
  out.push({ id: 'asset1', icon: '🏠', title: 'נכס ראשון שמכניס כסף כל חודש', value: Math.min(1, cfAssets), target: 1, unit: 'n', met: cfAssets >= 1 });
  if (E && fundT > 1) out.push({ id: 'fund' + fundT, icon: '🛟', title: `${fundT} חודשי הוצאות בקרן (ל־★★★)`, value: mo1(E.months), target: fundT, unit: 'mo', met: (+E.months || 0) >= fundT });
  const parts = (m.goalParts || []).filter((p) => p.key !== 'benchmark');
  for (const p of parts) {
    const v = +p.value || 0, t = +p.target || 0; if (!(t > 0)) continue;
    for (const [f, word] of QUARTER) {
      const goal = t * f;
      const title = p.key === 'passive' ? `הכנסה פסיבית שמכסה ${word} מההוצאות` : p.key === 'impact' ? `${Math.ceil(goal)} נקודות השפעה` : p.key === 'passive12' ? `ממוצע שנתי של ${fmtM(goal)} בחודש מהנכסים` : `שווי נקי של ${fmtM(goal)}`;
      out.push({ id: `${p.key}${Math.round(f * 100)}`, icon: p.key === 'impact' ? '💗' : p.key === 'passive' || p.key === 'passive12' ? '💸' : '📈', title, value: v, target: p.key === 'impact' ? Math.ceil(goal) : Math.round(goal), unit: p.key === 'impact' ? 'n' : '₪', met: v >= goal && (p.key !== 'passive' || v > 0) });
    }
  }
  if (parts.length) {
    const all = parts.every((p) => (+p.value || 0) >= (+p.target || 0) && (p.key !== 'passive' || (+p.value || 0) > 0));
    out.push({ id: 'goal', icon: '🏁', title: m.goalType === 'passive' ? 'הכנסה פסיבית שמכסה את כל ההוצאות' : 'היעד של העולם', value: parts.length === 1 ? +parts[0].value || 0 : parts.filter((p) => (+p.value || 0) >= (+p.target || 0)).length,
      target: parts.length === 1 ? +parts[0].target || 0 : parts.length, unit: parts.length === 1 ? (parts[0].key === 'impact' ? 'n' : '₪') : 'n', met: all });
    const H = m.goalHold; if (H && H.need) out.push({ id: 'hold', icon: '⏳', title: `היעד מחזיק ${paydays(H.need)} ברצף`, value: Math.min(H.streak || 0, H.need), target: H.need, unit: 'n', met: (H.streak || 0) >= H.need });
  }
  return out;
}
/** the next unmet rung as the #hNext card data ({id, title, value, target, unit, valText, step, of}) — null when none is left */
export function nextMilestone(m) {
  if (!m || m.goalType === 'benchmark') return null;
  const L = milestoneLadder(m); const i = L.findIndex((x) => !x.met); if (i < 0) return null;
  const x = L[i];
  // "X מתוך Y" (words, not a slash: a fraction inside a Hebrew line reads in either order)
  const valNum = x.unit === '₪' ? `${fmtM(x.value)} מתוך ${fmtM(x.target)}` : x.unit === 'mo' ? `${x.value} מתוך ${x.target}` : `${nf(x.value)} מתוך ${nf(x.target)}`;
  const valUnit = x.unit === 'mo' ? 'חודשים' : '';
  return { id: 'ms:' + x.id, icon: x.icon, title: x.title, value: Math.max(0, x.value), target: x.target, unit: x.unit === '₪' ? '₪' : '', valNum, valUnit,
    valText: valUnit ? `${valNum} ${valUnit}` : valNum, step: i + 1, of: L.length, done: false };
}

/* ---------- wave 3a (J1 P0-4, brief §18): one "💼 ניהול כסף" hub — the model (engine values only; every action is an existing call) */
/**
 * m = E.metrics(S). Rows in the order fund → loans → index → plan → focus; each row: current value text + its actions
 * (act ids game.js already handles: save / unsave → E.moveSavings, loan / repay / credit → E.takeLoan / repayLoan / payCredit,
 * invest → E.invest / E.setAutoInvest, plan → E.setPlan, focus → E.setFocus). `on` mirrors the engine's own enable flags.
 */
export function moneyHubModel(m) {
  const E = m.emergency || { months: 0, target: 3, balance: 0 };
  const ix = m.index || null; const L = m.life || {}; const F = m.focus || null;
  const loans = +m.loans || 0, card = +m.credit || 0; const monthly = debtMonthly(m);
  const planLabel = ((L.plans || []).find((p) => p.id === L.plan) || {}).label || '';
  const rows = [
    { id: 'fund', icon: '🛟', title: 'קרן חירום', value: `${Math.round((+E.months || 0) * 10) / 10} מתוך ${E.target || 3} חודשי הוצאות · ${fmtM(+E.balance || 0)}`,
      acts: [{ act: 'save', label: 'להפקיד', on: (+m.cash || 0) > 0 }, { act: 'unsave', label: 'למשוך', on: (+E.balance || 0) > 0 }] },
    { id: 'loans', icon: '🏦', title: 'הלוואות ואשראי', value: loans || card ? `הלוואות ${fmtM(loans)}${card ? ` · אשראי ${fmtM(card)}` : ''}${monthly ? ` · ריבית ${fmtM(monthly)} בחודש` : ''}` : 'אין חובות',
      acts: [{ act: 'loan', label: `לקחת ${fmtM(+m.loanUnit || 0)}`, on: m.canBorrow !== false }, { act: 'repay', label: `להחזיר ${fmtM(+m.loanUnit || 0)}`, on: !!m.canRepay }, ...(card ? [{ act: 'credit', label: 'לסגור אשראי', on: !!m.canPayCredit }] : [])] },
  ];
  if (ix) rows.push({ id: 'index', icon: '📊', title: 'קרן מדד', value: `${nf(ix.qty)} יחידות · ${fmtM(+ix.value || 0)}${ix.autoInvest ? ` · הוראת קבע ${fmtM(ix.autoInvest)} בחודש` : ' · בלי הוראת קבע'}`,
    acts: [{ act: 'invest', label: 'לקנות / למכור · הוראת קבע', on: true }] });
  if (L.plans && L.plans.length) rows.push({ id: 'plan', icon: '📅', title: 'התוכנית החודשית', value: planLabel || L.plan || '', acts: [{ act: 'plan', label: 'לשנות', on: true }] });
  // worlds wave 1: a world with a panel descriptor (w5 "עונות ותפוסה") opens it from the hub too
  const WI = m.worldIndicators || {};
  if (WI.panel) {
    const se = WI.season; const pl = WI.plant; const g = (WI.panel.gauges || []).find((x) => x.id === 'runway');
    // w6 (plant): lines, utilisation, lines down, runway (metrics values only)
    const down = pl ? (WI.panel.rows || []).filter((r) => r.down).length : 0;
    const value = se ? `ביקוש ${(Math.round((+se.tour || 0) * 100) / 100).toFixed(2)}${g && g.value != null ? ` · כרית לחורף ${Math.round(g.value * 10) / 10} חודשים` : ''}${se.line ? ` · קו עונתי ${fmtM(se.line)}` : ''}`
      : pl ? `${pl.lines} מתוך ${pl.slots} קווים${pl.utilisation != null ? ` · ניצולת ${Math.round(pl.utilisation * 100)}%` : ''}${down ? ` · ${down} בתקלה` : ''}${pl.runway != null ? ` · כרית ${Math.round(pl.runway * 10) / 10} חודשי קבועות` : ''}`
      : (WI.panel.title || '');
    rows.push({ id: 'world', icon: se ? '🌴' : pl ? '🏭' : '🧭', title: WI.panel.title || 'לוח העולם', value, acts: [{ act: 'world', label: se ? 'מחירים, צוות וקו עונתי' : pl ? 'תחזוקה, משמרות וחוזים' : 'לפתוח', on: true }] });
  }
  if (F && F.current) rows.push({ id: 'focus', icon: '🎯', title: 'מוקד החודש', value: F.opsOpen ? 'לוח העסק מחכה' : F.current.label, acts: [{ act: 'focus', label: F.opsOpen ? 'לפתוח את לוח העסק' : 'לבחור', on: true }] });
  return { rows, cash: +m.cash || 0, cashText: fmtM(+m.cash || 0) };
}
