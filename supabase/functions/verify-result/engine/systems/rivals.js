// T6 §1 + §3: the four rival personas and the deal competition (pure — no engine import, no state, only + − × ÷).
// The engine draws exactly RIVAL_DRAWS values from the 'rival' stream (index 12) on every deal / mystery landing under rules 4,
// whatever the card turns out to be and whatever the player does. Interest (n, who) is a function of the card's PUBLIC data only;
// close / taker are sealed. The per-step hazard is public (shown on every delay option).

export const RIVAL_DRAWS = 4;
/** Paydays until the player hears how a lost deal turned out for the rival. */
export const RIVAL_REVEAL = 6;
export const ARCH_IDS = ['saver', 'founder', 'diversified', 'gambler'];

/** §1 persona table (the engine owns all card text; the UI reads E.RIVALS). The rule cards must stay literally true (AC-30). */
export const ARCH = {
  saver: { id: 'saver', icon: '🐢', name: 'רותם', label: 'חוסכת זהירה', g: 'f', verbClose: 'סגרה', offer: 'הציעה', from: 'מרותם', toHim: 'לה', escaped: 'יצאה',
    rule: 'שומרת כרית של 6 חודשים. קונה רק נכס שמכניס כסף כל חודש, בלי הלוואה. בודקת כל עסקה עם סימן אזהרה. 20% מהעודף לקרן מדד.',
    strong: 'במשברים, במיתון ובריבית גבוהה', weak: 'כשהכלכלה צומחת והאשראי זול — היא יוצאת לאט' },
  founder: { id: 'founder', icon: '🚀', name: 'עומר', label: 'יזם', g: 'm', verbClose: 'סגר', offer: 'הציע', from: 'מעומר', toHim: 'לו', escaped: 'יצא',
    rule: 'מעדיף עסקים. לוקח הלוואה כשהעסקה מכניסה יותר מהריבית. מנהל את העסק בעצמו.',
    strong: 'כשיש עסקים טובים על הלוח ובתקופת צמיחה', weak: 'בשחיקה, במיתון, וכשכל הכסף בעסק אחד' },
  diversified: { id: 'diversified', icon: '🧺', name: 'מאיה', label: 'משקיעה מפוזרת', g: 'f', verbClose: 'סגרה', offer: 'הציעה', from: 'ממאיה', toHim: 'לה', escaped: 'יצאה',
    rule: '40% מהעודף לקרן מדד, נכס אחד מכל סוג, כרית של 3 חודשים.',
    strong: 'במשחקים ארוכים ובמחזורים מעורבים', weak: 'במרוץ קצר' },
  gambler: { id: 'gambler', icon: '🎲', name: 'רועי', label: 'חובב סיכון', g: 'm', verbClose: 'סגר', offer: 'הציע', from: 'מרועי', toHim: 'לו', escaped: 'יצא',
    rule: "מינוף מקסימלי, קריפטו וצ'קים גדולים לסטארט־אפים. אף פעם לא בודק עסקה, ותמיד מנסה להוריד מחיר.",
    strong: 'כשיש מזל ובתקופת צמיחה', weak: 'כמעט בכל השאר — מורה טוב לכך שמזל הוא לא שיקול דעת' },
};
/** In a ghost's own game the persona equal to the ghost is replaced by "another investor" (never competing against himself). */
export const OTHER = { id: 'other', icon: '👤', name: 'משקיע אחר', label: '', g: 'm', verbClose: 'סגר', offer: 'הציע', from: 'ממשקיע אחר', toHim: 'לו', escaped: 'יצא', rule: '', strong: '', weak: '' };
export const persona = (id) => ARCH[id] || OTHER;

/* ---------------------------------------------------------------- tables [TUNE, spec §16] */
const GENTLE = {
  pN: { weak: [0.85, 0.15, 0, 0], mid: [0.55, 0.35, 0.10, 0], strong: [0.30, 0.45, 0.20, 0.05], golden: [0.15, 0.40, 0.35, 0.10] },
  close: { 1: [0.10, 0.10, 0.10, 0.70], 2: [0.20, 0.15, 0.10, 0.55], 3: [0.30, 0.20, 0.10, 0.40] },
};
const HARD = {
  pN: { weak: [0.70, 0.25, 0.05, 0], mid: [0.35, 0.40, 0.20, 0.05], strong: [0.15, 0.35, 0.35, 0.15], golden: [0.05, 0.25, 0.40, 0.30] },
  // balance pass (T6 verify D2, G7): the first delay step is a quick look — others rarely close that fast; a second step gives them time
  // (was 1: .20 .20 .15 .45 · 2: .35 .25 .15 .25 · 3: .50 .25 .15 .10)
  close: { 1: [0.08, 0.22, 0.15, 0.55], 2: [0.15, 0.30, 0.15, 0.40], 3: [0.25, 0.30, 0.15, 0.30] },
};
/** w4: most deals carry hidden problems (prior risk 2–3 ≈ 52%), so checking is needed more often — interest closes a bit slower there. */
const HARD_W4 = { pN: HARD.pN, close: { 1: [0.06, 0.18, 0.14, 0.62], 2: [0.12, 0.25, 0.15, 0.48], 3: [0.20, 0.28, 0.15, 0.37] } };
const CFG = {
  w1: { enabled: true, roiCuts: [8, 16], ...GENTLE },
  w2: { enabled: true, roiCuts: [5, 9], ...HARD },
  w3: { enabled: true, roiCuts: [10, 20], ...HARD },
  w4: { enabled: true, roiCuts: [10, 20], ...HARD_W4 },
  h: { enabled: true, roiCuts: [8, 16], ...GENTLE },
};
/** → {enabled, roiCuts:[lo, hi], pN:{weak, mid, strong, golden}, close:{1:[p1,p2,p3,pNever], 2:…, 3:…}} */
export function rivalCfg(worldId) { return CFG[worldId] || CFG.w1; }

const TIERS = ['weak', 'mid', 'strong', 'golden'];
/** pub = {kind, rent, golden, cfClaim, down, warn} (public card data only) → 'weak'|'mid'|'strong'|'golden' */
export function tierOf(pub, worldId) {
  if (pub.golden) return 'golden';
  const [lo, hi] = rivalCfg(worldId).roiCuts;
  let t;
  if (!(pub.cfClaim > 0)) t = 0;
  else {
    const roi = pub.down > 0 ? (pub.cfClaim * 12 / pub.down) * 100 : Infinity;
    t = roi < lo ? 0 : roi < hi ? 1 : 2;
  }
  t = Math.max(0, t - (pub.warn || 0)); // every warn flag scares investors one tier down
  return TIERS[t];
}
/** Eligible personas from their rule cards (public data only), in the fixed order saver, founder, diversified, gambler. */
export function eligibleOf(pub, worldId) {
  const tier = tierOf(pub, worldId); const midUp = tier !== 'weak'; const warn = pub.warn || 0;
  const out = [];
  if (pub.cfClaim > 0 && warn === 0 && midUp) out.push('saver');
  if ((!pub.rent || pub.golden) && warn <= 1) out.push('founder');
  if (warn <= 1 && midUp) out.push('diversified');
  if (midUp) out.push('gambler');
  return out;
}
/** inverse CDF of a discrete distribution (probabilities in order) → index */
function invCDF(ps, r) { let acc = 0; for (let i = 0; i < ps.length; i++) { acc += ps[i]; if (r < acc) return i; } return ps.length - 1; }

/**
 * Use the 4 sealed draws [nR, pickR, closeR, takerR]. self = the ghost's own archetype (or null).
 * → {n, who:[archId|'other'], close: 0|1|2|3, taker: archId|'other'|null, steps: 0, tier}
 */
export function drawRival(rs, pub, worldId, self = null) {
  const C = rivalCfg(worldId); const tier = tierOf(pub, worldId); const el = eligibleOf(pub, worldId);
  const n0 = invCDF(C.pN[tier], rs[0]); const n = Math.min(n0, el.length);
  const rot = el.length ? Math.floor(rs[1] * el.length) % el.length : 0;
  const who = el.slice(rot).concat(el.slice(0, rot)).slice(0, n).map((id) => (self && id === self ? 'other' : id));
  let close = 0;
  if (n > 0) { const i = invCDF(C.close[Math.min(3, n)], rs[2]); close = i === 3 ? 0 : i + 1; }
  const taker = close ? who[Math.min(n - 1, Math.floor(rs[3] * n))] : null;
  return { n, who, close, taker, steps: 0, tier };
}
/** P(a rival closes at delay step `step` | nobody closed before it). 0 when n = 0 or step > 3. Public. */
export function hazard(worldId, n, step) {
  if (!(n > 0) || step < 1 || step > 3) return 0;
  const ps = rivalCfg(worldId).close[Math.min(3, n)];
  let rest = 0; for (let j = step - 1; j < ps.length; j++) rest += ps[j];
  return rest > 0 ? ps[step - 1] / rest : 0;
}
export const round2 = (x) => Math.round(x * 100) / 100;

/* ---------------------------------------------------------------- §14.3 engine strings */
export const TEXT = {
  none: '👥 אף משקיע אחר לא מתעניין כרגע — אפשר לבדוק בנחת.',
  one: '👥 משקיע אחד מתעניין: {who}',
  many: '👥 {n} משקיעים מתעניינים: {who}',
  explain: 'קנייה עכשיו — העסקה שלך. כל בדיקה או הצעה נמוכה יותר נותנת להם הזדמנות לסגור לפניך.',
  chip: '👥 {p}% שיקדימו אותך',
  lostTitle: '{icon} {name} {verbClose} את העסקה לפניך',
  lostInspect: 'בזמן שבדקת, {name} {offer} למוכר את המחיר המלא. על הבדיקה כבר שילמת — לפחות עכשיו אתה יודע מה היה שם.',
  lostOffer: 'בזמן שניסית להוריד את המחיר, {name} {offer} למוכר את המחיר המלא.',
  lostFooter: 'בעוד כמה חודשים נשמע איך זה הלך {toHim}.',
  lostButton: 'הבנתי',
  revealWorse: 'שמעת {from}: הנכס "{deal}" מכניס {cf} בחודש — הוצהר {claimed}.',
  revealRepair: ' התיקונים עלו {repair}.',
  revealSame: 'שמעת {from}: הנכס "{deal}" מכניס בדיוק כמו שהוצהר — {cf} בחודש.',
  revealBetter: 'שמעת {from}: הנכס "{deal}" מכניס {cf} בחודש — יותר מה־{claimed} שהוצהרו.',
  mentorLost: 'בעסקה טובה יש תחרות. לפעמים בדיקה שווה את הסיכון, ולפעמים לא — זה תלוי בכמה סימני אזהרה יש ובכמה אנשים מחכים.',
  reason: '{n} משקיעים מתעניינים — עיכוב יכול לעלות לך בעסקה ({p}% בשלב הבא)',
  branchOpen: 'העסקה עדיין פתוחה אחרי השלב הזה',
  branchLost: 'משקיע אחר סוגר לפניך — שילמת רק על השלב',
};
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
export const tplR = fill;
/** The interest line for a card (n = 0 → the calm line). */
export function interestText(rv) {
  if (!rv || !rv.n) return TEXT.none;
  const who = rv.who.map((id) => { const a = persona(id); return `${a.icon} ${a.name}`; }).join(' · ');
  return fill(rv.n === 1 ? TEXT.one : TEXT.many, { n: rv.n, who });
}
/** {text, sub} of a lost deal (how = 'inspect' | 'offer'). */
export function lostTexts(taker, how) {
  const a = persona(taker);
  return { text: fill(TEXT.lostTitle, a), sub: fill(how === 'offer' ? TEXT.lostOffer : TEXT.lostInspect, a) + ' ' + fill(TEXT.lostFooter, a) };
}
/** The reveal line ("how it turned out for them"). fmt = the engine's money formatter. */
export function revealText(d, fmt) {
  const a = persona(d.by); const t = d.truth;
  const v = { from: a.from, deal: d.name, cf: fmt(t.cf), claimed: fmt(d.claimedCf), repair: fmt(t.repair || 0) };
  if (Math.abs(t.cf - d.claimedCf) < 10 && !(t.repair > 0)) return fill(TEXT.revealSame, v);
  return fill(t.cf > d.claimedCf ? TEXT.revealBetter : TEXT.revealWorse, v) + (t.repair > 0 ? fill(TEXT.revealRepair, v) : '');
}
