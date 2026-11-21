// T4 §6 / E-7: dream goals — pure data + a pure progress function. A dream changes NOTHING that affects outcomes (money, 🔋, 😊,
// stars, win, RNG, the verdict, optionU, the server summary): it only reads public numbers and writes st.dream.
// The engine passes a small read-only view `v` (no engine import here).

export const DREAMS = [
  { id: 'biz', icon: '🚀', name: 'עסק משלי', line: 'לבנות משהו שעובד גם בלעדיך', missions: [
    { id: 'biz_seed', title: 'הון התחלתי: חודשיים של הוצאות בצד' },
    { id: 'biz_own', title: 'עסק ראשון' },
    { id: 'biz_quarter', title: 'העסק מכסה רבע מההוצאות' }] },
  { id: 'family', icon: '👨‍👩‍👧', name: 'זמן למשפחה', line: 'פחות שעות בשביל כסף, יותר בשביל אנשים', missions: [
    { id: 'fam_rest', title: 'חודש של מנוחה ומשפחה בלי לרדת למינוס' },
    { id: 'fam_power', title: '🔋 כוח מעל 50 שישה ימי משכורת ברצף' },
    { id: 'fam_half', title: 'ההכנסה הפסיבית מכסה חצי מההוצאות' }] },
  { id: 'stable', icon: '🛟', name: 'יציבות', line: 'שקט: כרית בצד ובלי חובות מפתיעים', missions: [
    { id: 'st_fund1', title: 'חודש הוצאות בקרן החירום' },
    { id: 'st_fund3', title: 'שלושה חודשים בקרן' },
    { id: 'st_clean', title: '12 חודשים בלי הלוואה כפויה ובלי חוב אשראי' }] },
  { id: 'free', icon: '🗽', name: 'חופש כלכלי', line: 'נכסים שמשלמים את כל ההוצאות', missions: [
    { id: 'fr_first', title: 'נכס ראשון שמכניס כסף' },
    { id: 'fr_quarter', title: 'הכנסה פסיבית = רבע מההוצאות' },
    { id: 'fr_half', title: 'הכנסה פסיבית = חצי מההוצאות' }] },
];
export const DREAM_BY_ID = Object.fromEntries(DREAMS.map((d) => [d.id, d]));
export const DREAM_IDS = DREAMS.map((d) => d.id);

/** A fresh dream state, or null for an unknown id. */
export function newDream(id) { return DREAM_BY_ID[id] ? { id, done: {}, track: { powerStreak: 0, cleanSince: 1 } } : null; }

const clamp01 = (x) => Math.max(0, Math.min(1, x));
/**
 * Progress of every mission (0..1) from the view v =
 *   {month, cash, savings, E, passive, energy, credit, bizCf, hasBiz, posAsset, track, restPayday}
 */
function progressOf(id, v) {
  const E = Math.max(1, v.E);
  switch (id) {
    case 'biz_seed': return clamp01((v.cash + v.savings) / (2 * E));
    case 'biz_own': return v.hasBiz ? 1 : 0;
    case 'biz_quarter': return clamp01(v.bizCf / (0.25 * E));
    case 'fam_rest': return v.restPayday ? 1 : 0;
    case 'fam_power': return clamp01((v.track.powerStreak || 0) / 6);
    case 'fam_half': return clamp01(v.passive / (0.5 * E));
    case 'st_fund1': return clamp01(v.savings / E);
    case 'st_fund3': return clamp01(v.savings / (3 * E));
    case 'st_clean': return clamp01((v.month - (v.track.cleanSince ?? 1)) / 12);
    case 'fr_first': return v.posAsset ? 1 : 0;
    case 'fr_quarter': return clamp01(v.passive / (0.25 * E));
    case 'fr_half': return clamp01(v.passive / (0.5 * E));
    default: return 0;
  }
}
/**
 * Update the trackers (payday only) and record newly completed missions. → [{id, title}] (new completions, in mission order).
 * payday = true at the end of a payday: powerStreak counts consecutive paydays with 🔋 ≥ 50; cleanSince = the month of the last forced
 * loan or of the last month with credit-card debt.
 */
export function dreamTick(dream, v, { payday = false, forced = false } = {}) {
  if (!dream || !DREAM_BY_ID[dream.id]) return [];
  const T = dream.track || (dream.track = { powerStreak: 0, cleanSince: 1 });
  if (payday) {
    T.powerStreak = v.energy >= 50 ? (T.powerStreak || 0) + 1 : 0;
    if (forced || v.credit > 0) T.cleanSince = v.month;
  }
  const got = []; v = { ...v, track: T };
  for (const m of DREAM_BY_ID[dream.id].missions) {
    if (dream.done[m.id] != null) continue;
    if (m.id === 'fam_rest' && !payday) continue;
    if (progressOf(m.id, v) >= 1) { dream.done[m.id] = v.month; got.push({ id: m.id, title: m.title }); }
  }
  return got;
}
/** metrics().dream block: {id, icon, name, line, missions:[{id, title, progress, done, doneMonth}], done} */
export function dreamBlock(dream, v) {
  const D = dream && DREAM_BY_ID[dream.id]; if (!D) return null;
  const missions = D.missions.map((m) => { const done = dream.done[m.id] != null; return { id: m.id, title: m.title, progress: done ? 1 : Math.round(progressOf(m.id, { ...v, track: dream.track || {} }) * 100) / 100, done, doneMonth: done ? dream.done[m.id] : null }; });
  return { id: D.id, icon: D.icon, name: D.name, line: D.line, missions, done: missions.filter((m) => m.done).length };
}
