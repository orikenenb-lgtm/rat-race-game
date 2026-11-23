// T6 §5.1 + §6.2: the personal end summary (result.recap) — pure, built once at the end of a game from engine data only.
// Every sentence is a template of spec §14 filled with engine numbers / names. No "because", no composite score.
// The engine passes one input object (no engine import here):
//   I = { tl, marks, decisions, luckLog, verdicts, nDecisions, hints, stats, mastery, won, months, stars, thresholds:[t3,t2,max],
//         progress, maxMonths, E, hapAvg, burnouts, bailout, econTruth:[{m, phase}], endMonth, biz:{had,…}|null, rivalDeals:[…],
//         top:[{t, c, o, v}], memory:[{m, chain, t}], leakTip, tip, planLabels, focusLabels, fmt, persona(id) }

const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
const oneDec = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, '');
const pctOf = (x) => Math.max(0, Math.min(100, Math.floor((+x || 0) * 100)));
/** month counts in Hebrew — the same rule as engine.js heMonths (this module imports no engine code): 1 → חודש, 2 → חודשיים */
const heMonths = (n) => (+n === 1 ? 'חודש' : +n === 2 ? 'חודשיים' : `${n} חודשים`);
export const T = {
  speedWon: 'יצאת בחודש {m} (★★ עד חודש {m2})', speedNot: 'הגעת ל־{p}% מהדרך לחופש', speedShortWon: 'חודש {m}', speedShortNot: '{p}% מהדרך',
  resCrises: 'עברת {c} משברים — {n} בלי הלוואה כפויה. הכרית הכי נמוכה: {xm} (חודש {m}).', resNone: 'לא היו משברים. הכרית הכי נמוכה: {xm} (חודש {m}).', resShort: '{f} הלוואות כפויות',
  decLine: '{s} החלטות חזקות · {o} סבירות{mx} · {w} חלשות', decMixed: ' · {x} עם מה לשפר', decShort: '{s} חזקות · {w} חלשות',
  hapLine: 'התחלת ב־{s} וסיימת ב־{e} · ממוצע {a} · {b}', hapShort: 'ממוצע {a}',
  bizLine: 'העסק הרוויח ב־{p} מתוך {tm} · שלב "{stage}"', bizLineNoStage: 'העסק הרוויח ב־{p} מתוך {tm}', bizNone: 'לא ניהלת עסק במשחק הזה', bizShort: '{p} מתוך {t} רווחיים',
  alt: 'שווי נקי: התחלת ב־{a}, שיא {b} בחודש {m}, סיום ב־{c}.',
  crisisTitle: 'המשבר הגדול: חודשים {from}–{to}', crisisTrough: 'השווי הנקי ירד ב־{depth}. הכרית הכי נמוכה: {xm} (חודש {m}).',
  crisisBack: 'חזרת לשווי שלפני המשבר אחרי {nm}.', crisisNotBack: 'עד סוף המשחק לא חזרת לשווי שלפני המשבר.', crisisNone: 'לא היה משבר גדול במשחק הזה.',
  rForced: 'חודש {m}: הבנק נתן הלוואה כפויה של {x}', rSell: 'חודש {m}: מכרת את {name} ב־{x}', rPlan: 'חודש {m}: עברת לתוכנית "{plan}"', rFocus: 'חודש {m}: מוקד החודש — {focus}', rStory: 'חודש {m}: {text}',
  next: 'בחודש {m}, בכרטיס "{c}"{lp}: {why}. זה הלקח לפעם הבאה.', strengthen: 'כדאי לחזק: {name} — {tip}',
};
/** A decision's `why` as a clause inside the focused lesson (old saves keep the pre-E3 subject-less cushion text; "היה עדיף: X" → quoted). */
export function whyClause(why) {
  const w = String(why || '').trim().replace(/[.。]+$/, '');
  if (w === 'השאיר אותך בלי כרית') return 'כמעט לא נשארה לך כרית ביטחון';
  const m = /^היה עדיף: (.+)$/.exec(w); return m ? `היה עדיף "${m[1]}"` : w;
}
export const DIM_META = {
  speed: { icon: '⏱️', title: 'מהירות', orderText: 'מסודר לפי: מי יצא קודם, ואחר כך מי התקדם יותר' },
  resilience: { icon: '🛡️', title: 'חוסן', orderText: 'מסודר לפי: פחות הלוואות כפויות, ואחר כך כרית נמוכה פחות' },
  decisions: { icon: '🧠', title: 'החלטות', orderText: 'מסודר לפי: חלק ההחלטות החלשות (פחות זה טוב)' },
  happiness: { icon: '😊', title: 'אושר', orderText: 'מסודר לפי: אושר ממוצע' },
  business: { icon: '🏪', title: 'עסק', orderText: 'מסודר לפי: חלק החודשים הרווחיים' },
};
export const GRID_TITLES = {
  goodWon: '✅ החלטה טובה שגם הצליחה', goodUnlucky: '💪 עשית נכון — הפעם לא הסתדר',
  luckyWeak: '🍀 הצליח, אבל בזכות מזל — אל תסמוך על זה', weakCostly: '⚠️ החלטה חלשה שגם עלתה ביוקר',
};
export const PRINCIPLE_NAME = { cashflow: 'תזרים', cushion: 'כרית ביטחון', debt_cost: 'מחיר החוב', leverage: 'מינוף', rate_risk: 'סיכון ריבית', diversification: 'פיזור', time_in_market: 'זמן בשוק', opportunity_cost: 'מחיר הוויתור', risk_size: 'גודל הסיכון', fees_tax: 'מסים ועמלות', time: 'זמן וכוח', knowledge: 'ידע' };
const PRINCIPLE_TIP = {
  cashflow: 'לפני כל קנייה לבדוק כמה נשאר בסוף החודש אחרי עלות החוב', cushion: 'קודם כרית של כמה חודשי הוצאות, אחר כך נכסים גדולים',
  debt_cost: 'להשוות את הריבית למה שהנכס מכניס', leverage: 'מינוף מגדיל גם את הרווח וגם את ההפסד', rate_risk: 'לחשוב מה קורה לתזרים אם הריבית עולה',
  diversification: 'לא לשים את כל הכסף במקום אחד', time_in_market: 'להישאר מושקע גם כשהמדד יורד', opportunity_cost: 'כל שקל על פיתוי הוא שקל שלא קנה נכס',
  risk_size: 'לא לשים על הימור יותר ממה שמותר להפסיד', fees_tax: 'לבדוק כמה נשאר אחרי מס ועמלות', time: 'לשמור על 🔋 — שחיקה עולה משכורת שלמה',
  knowledge: 'לבדוק עסקה עם סימני אזהרה לפני שקונים',
};
const NOTE_KINDS = new Set(['buy', 'sell', 'forced', 'crisis', 'rivalLost', 'win']);

/** rows of the timeline as objects */
function rowsOf(tl) { return (tl && tl.m ? tl.m : []).map((m, i) => ({ m, nw: tl.nw[i] * 100, liq: tl.liq[i] * 100, debt: tl.debt[i] * 100, pas: tl.pas[i], exp: tl.exp[i], pg: tl.pg[i], hap: tl.hap[i], en: tl.en[i] })); }
const cushion = (r) => (r.exp > 0 ? r.liq / r.exp : 99);
/** runs of consecutive rows matching pred → [{from, to}] */
function runs(rows, pred) { const out = []; let cur = null; for (const r of rows) { if (pred(r)) { if (!cur) { cur = { from: r.m, to: r.m }; out.push(cur); } else cur.to = r.m; } else cur = null; } return out; }

/** the largest peak-to-trough drop of net worth → {from, to, depth, peakNw} | null */
function biggestDrop(rows) {
  let peak = null, best = null;
  for (const r of rows) {
    if (!peak || r.nw > peak.nw) peak = r;
    const d = peak.nw - r.nw;
    if (d > 0 && (!best || d > best.depth)) best = { from: peak.m, to: r.m, depth: d, peakNw: peak.nw };
  }
  return best;
}

export function dimsOf(I, rows) {
  const s = I.stats || {}; const fmt = I.fmt;
  const [t3, t2, mx] = I.thresholds || [null, null, I.maxMonths];
  const speed = { facts: { won: !!I.won, months: I.months, stars: I.stars || 0, thresholds: [t3, t2, mx], progress: Math.round((I.progress || 0) * 1000) / 1000, maxMonths: I.maxMonths } };
  speed.headline = I.won ? fill(T.speedWon, { m: I.months, m2: t2 }) : fill(T.speedNot, { p: pctOf(I.progress) });
  speed.short = I.won ? fill(T.speedShortWon, { m: I.months }) : fill(T.speedShortNot, { p: pctOf(I.progress) });
  let minC = null, minM = null, under1 = 0;
  for (const r of rows) { const c = cushion(r); if (c < 1) under1++; if (minC == null || c < minC) { minC = c; minM = r.m; } }
  const drop = biggestDrop(rows); let recovery = null;
  if (drop) { const back = rows.find((r) => r.m > drop.to && r.nw >= drop.peakNw); recovery = back ? back.m - drop.to : null; }
  const forced = s.autoLoans || 0;
  const resilience = { facts: { crises: s.crises || 0, crisisNoLoan: s.crisisNoLoan || 0, forcedLoans: forced, forcedTotal: s.forcedLoans || 0, negMonths: s.negMonths || 0,
    minCushion: minC == null ? null : Math.round(Math.max(0, minC) * 10) / 10, minCushionM: minM, monthsUnder1: under1, recoveryMonths: recovery, bailout: !!I.bailout } };
  const xm = { c: s.crises || 0, n: s.crisisNoLoan || 0, x: oneDec(Math.max(0, minC ?? 0)), m: minM ?? I.months }; xm.xm = heMonths(xm.x);
  resilience.headline = fill(s.crises ? T.resCrises : T.resNone, xm);
  resilience.short = fill(T.resShort, { f: forced });
  // 'mixed' ("יש מה לשפר") is its own count — it is not a "סבירה" decision
  const V = I.verdicts || {}; const st = V.strong || 0, ok = V.ok || 0, mix = V.mixed || 0, wk = (V.costly || 0) + (V.risky || 0);
  const decisions = { facts: { strong: st, ok, mixed: mix, weak: wk, n: I.nDecisions ?? st + ok + mix + wk, hints: I.hints || 0 } };
  decisions.headline = fill(T.decLine, { s: st, o: ok, w: wk, mx: mix ? fill(T.decMixed, { x: mix }) : '' }); decisions.short = fill(T.decShort, { s: st, w: wk });
  let hMin = null, hMinM = null; for (const r of rows) if (hMin == null || r.hap < hMin) { hMin = r.hap; hMinM = r.m; }
  const hs = rows.map((r) => r.hap); const hEnd = hs.length ? hs[hs.length - 1] : 0; const hStart = hs.length ? hs[0] : hEnd;
  const avg = I.hapAvg != null ? I.hapAvg : (hs.length ? Math.round(hs.reduce((a, b) => a + b, 0) / hs.length) : hEnd);
  const happiness = { facts: { start: hStart, end: hEnd, avg, min: hMin, minM: hMinM, burnouts: I.burnouts || 0, lowEnergyMonths: rows.filter((r) => r.en < 25).length } };
  happiness.headline = fill(T.hapLine, { s: hStart, e: hEnd, a: avg, b: I.burnouts ? `${I.burnouts} שחיקות` : 'בלי שחיקות' });
  happiness.short = fill(T.hapShort, { a: avg });
  const B = I.biz;
  const business = B && B.had && B.months > 0
    ? { facts: { had: true, months: B.months, profitMonths: B.profitMonths, lossMonths: B.lossMonths, worstNp: B.worstNp, worstM: B.worstM, stage: B.stage || '' },
      headline: fill(B.stage ? T.bizLine : T.bizLineNoStage, { p: B.profitMonths, t: B.months, tm: heMonths(B.months), stage: B.stage }), short: fill(T.bizShort, { p: B.profitMonths, t: B.months }) }
    : { facts: { had: false }, headline: T.bizNone, short: '—' };
  void fmt;
  const out = { speed, resilience, decisions, happiness, business };
  for (const [id, d] of Object.entries(out)) Object.assign(d, { id, icon: DIM_META[id].icon, title: DIM_META[id].title, orderText: DIM_META[id].orderText });
  return out;
}

/** linked luck per decision index k (luckLog [m, part, amount, k]) */
function luckByK(luckLog) { const m = new Map(); for (const [, , a, k] of luckLog || []) if (k != null && k >= 0) m.set(k, (m.get(k) || 0) + a); return m; }
const isGood = (v) => v === 'strong' || v === 'ok';
const isWeak = (v) => v === 'costly' || v === 'risky';

export function recapOf(I) {
  const rows = rowsOf(I.tl); const E = Math.max(1, I.E); const fmt = I.fmt;
  const dims = dimsOf(I, rows);
  // graph
  const recessions = [];
  const tr = I.econTruth || [];
  for (let i = 0; i < tr.length; i++) {
    if (tr[i].phase !== 'rec') continue;
    const to = i + 1 < tr.length ? Math.max(tr[i].m, tr[i + 1].m - 1) : Math.max(tr[i].m, I.endMonth);
    const last = recessions[recessions.length - 1];
    if (last && tr[i].m <= last.to + 1) last.to = Math.max(last.to, to); else recessions.push({ from: tr[i].m, to });
  }
  const lowCushion = runs(rows, (r) => cushion(r) < 1);
  const cand = (I.marks || []).filter((k) => NOTE_KINDS.has(k[1])).slice().sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
  const notes = [];
  for (const k of cand) {
    if (notes.length >= 3) break;
    if (k[1] !== 'win' && Math.abs(k[2]) < 0.05 * E) continue;
    if (notes.some((n) => Math.abs(n.m - k[0]) < 3)) continue;
    let text;
    if (k[1] === 'buy') text = `קנית: ${k[4]}`; else if (k[1] === 'sell') text = `מכרת: ${k[4]}`; else if (k[1] === 'forced') text = `הלוואה כפויה ${fmt(k[2])}`;
    else if (k[1] === 'crisis') text = `משבר: ${k[4]}`; else if (k[1] === 'win') text = 'יצאת מהמירוץ';
    else { const d = (I.rivalDeals || []).find((x) => x.m === k[0] && x.name === k[4]); const a = I.persona(d ? d.by : null); text = `${a.name} ${a.g === 'f' ? 'לקחה' : 'לקח'}: ${k[4]}`; }
    notes.push({ m: k[0], kind: k[1], text });
  }
  notes.sort((a, b) => a.m - b.m);
  let alt = '';
  if (rows.length) { const pk = rows.reduce((a, r) => (r.nw > a.nw ? r : a), rows[0]); alt = fill(T.alt, { a: fmt(rows[0].nw), b: fmt(pk.nw), m: pk.m, c: fmt(rows[rows.length - 1].nw) }); }
  const graph = { tl: I.tl, recessions, lowCushion, notes, alt };
  // 2×2 judgment vs luck
  const LK = luckByK(I.luckLog); const decs = I.decisions || [];
  const grid = { goodWon: null, goodUnlucky: null, luckyWeak: null, weakCostly: null };
  for (const r of decs) {
    const L = LK.get(r.k); if (L == null || Math.abs(L) < 0.5 * E) continue;
    const cell = isGood(r.v) ? (L > 0 ? 'goodWon' : 'goodUnlucky') : isWeak(r.v) ? (L > 0 ? 'luckyWeak' : 'weakCostly') : null;
    if (!cell) continue;
    if (!grid[cell] || Math.abs(L) > Math.abs(grid[cell].luck)) grid[cell] = { m: r.m, c: r.c, o: r.o, luck: Math.round(L), k0: r.k0 != null && r.k0 >= 0 ? r.k0 : null, why: r.why, title: GRID_TITLES[cell] };
  }
  // the main crisis
  let crisis = null;
  const drop = biggestDrop(rows);
  const hard = (I.marks || []).some((k) => k[1] === 'crisis' || k[1] === 'forced' || k[1] === 'burnout');
  if (drop && (drop.depth >= E || hard)) {
    const inWin = rows.filter((r) => r.m >= drop.from && r.m <= drop.to);
    const tro = inWin.reduce((a, r) => (cushion(r) < cushion(a) ? r : a), inWin[0]);
    const back = rows.find((r) => r.m > drop.to && r.nw >= drop.peakNw);
    const resp = [];
    for (const k of I.marks || []) if (k[0] >= drop.from && k[0] <= drop.to + 2) {
      if (k[1] === 'forced') resp.push({ m: k[0], text: fill(T.rForced, { m: k[0], x: fmt(k[2]) }) });
      if (k[1] === 'sell') resp.push({ m: k[0], text: fill(T.rSell, { m: k[0], name: k[4], x: fmt(k[2]) }) });
    }
    for (const r of decs) if (r.m >= drop.from && r.m <= drop.to + 2) {
      if (/^plan:/.test(r.o) && I.planLabels[r.o.slice(5)]) resp.push({ m: r.m, text: fill(T.rPlan, { m: r.m, plan: I.planLabels[r.o.slice(5)] }) });
      if (r.type === 'focus' && (r.o === 'frugal' || r.o === 'debt')) resp.push({ m: r.m, text: fill(T.rFocus, { m: r.m, focus: I.focusLabels[r.o] || r.o }) });
    }
    for (const x of I.memory || []) if (x.m >= drop.from && x.m <= drop.to + 2) resp.push({ m: x.m, text: fill(T.rStory, { m: x.m, text: x.t }) });
    resp.sort((a, b) => a.m - b.m);
    const x = oneDec(Math.max(0, cushion(tro)));
    crisis = { from: drop.from, to: drop.to, trough: { m: tro.m, cushion: Math.round(Math.max(0, cushion(tro)) * 10) / 10, nw: tro.nw }, depth: drop.depth, recoveredAt: back ? back.m : null,
      responses: resp.slice(0, 4), title: fill(T.crisisTitle, drop), text: fill(T.crisisTrough, { depth: fmt(drop.depth), x, xm: heMonths(x), m: tro.m }),
      outcome: back ? fill(T.crisisBack, { n: back.m - drop.to, nm: heMonths(back.m - drop.to) }) : T.crisisNotBack };
  }
  // one focused suggestion (rule order)
  let suggestion = null;
  const weak1 = decs.filter((r) => isWeak(r.v) && ((LK.get(r.k) ?? 0) <= -E || (r.gap || 0) >= 1)).sort((a, b) => (LK.get(a.k) ?? 0) - (LK.get(b.k) ?? 0) || (b.gap || 0) - (a.gap || 0))[0];
  if (weak1) { // J1 E3: the lesson names the month, the card and the choice (and reads as a sentence)
    const why = whyClause(weak1.why); const l = weak1.l ? String(weak1.l) : '';
    suggestion = { rule: 1, text: fill(T.next, { m: weak1.m, c: weak1.c, lp: l ? ` בחרת "${l}"` : '', why }), k0: weak1.k0 != null && weak1.k0 >= 0 ? weak1.k0 : null, m: weak1.m, card: weak1.c, choice: l || null, why };
  }
  else if (I.leakTip) suggestion = { rule: 2, text: I.leakTip, k0: null };
  else {
    const weakP = Object.entries(I.mastery || {}).filter(([k, m]) => m.n >= 3 && m.v < 0.6 && PRINCIPLE_NAME[k]).sort((a, b) => a[1].v - b[1].v)[0];
    if (weakP) suggestion = { rule: 3, text: fill(T.strengthen, { name: PRINCIPLE_NAME[weakP[0]], tip: PRINCIPLE_TIP[weakP[0]] || '' }), k0: null };
    else suggestion = { rule: 4, text: I.tip || '', k0: null };
  }
  // ≤ 3 meaningful decisions (the life summary's biggest + their linked luck)
  const decisions = [];
  for (const e of I.top || []) {
    if (decisions.length >= 3) break;
    const r = decs.find((d) => d.t === e.t && String(d.c) === String(e.c).slice(0, 24));
    decisions.push({ m: r ? r.m : null, c: e.c, o: e.o, v: e.v, verdict: r ? r.v : null, luck: r ? Math.round(LK.get(r.k) || 0) : 0, k0: r && r.k0 != null && r.k0 >= 0 ? r.k0 : null });
  }
  const rivalDeals = (I.rivalDeals || []).map((d) => ({ m: d.m, name: d.name, by: d.by, how: d.how, claimedCf: d.claimedCf, cf: d.truth.cf, repair: d.truth.repair || 0, text: d.text || null }));
  return { v: 1, dims, graph, grid, crisis, suggestion, decisions, rivalDeals, happiness: { ...dims.happiness.facts } };
}
