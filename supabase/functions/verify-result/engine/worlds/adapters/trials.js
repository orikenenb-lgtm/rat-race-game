// Rule adapter `trials` — w17 גבעת המעבדות (CATALOG-25 §1.4 w17, §2.2; docs/full-upgrade/worlds/w17-labs.md). A drug company of 6 candidate
// slots. Every candidate walks four public stages (phase I / II / III / approval: printed cost and months, the `stages` lib's build record,
// paid from cash month by month — no cash, the stage stalls) and has PRINTED odds per stage plus a sealed quality that shifts every stage's
// odds by up to ±10 pp (drawn when the candidate is created). The distinct rule — known-odds real options: at each readout you choose to
// continue (pay the next stage), abandon (salvage 5 % of the cost so far) or license out (the partner pays an upfront now, runs the rest
// and pays you a royalty on sales). Sunk cost is shown and irrelevant. An approved drug ramps to peak sales over 12 months and earns until
// its patent cliff (then −80 %). The pipeline counts at cost (the w8 rule: no paper value); a drug at 5× its trailing annual profit, never
// more than the years left to the cliff. A biotech sector regime (bull / normal / winter) prices licensing deals and bought candidates.
//
// Contract (DESIGN §4.2): a mech-contract object, all state in st.world.trials (V-adapter); pure, deterministic, no engine import; only
// + − × ÷ and Math.round / min / max / floor / abs. Fixed 'world' draws: init 6 (one per slot: a starting candidate's sealed quality),
// every payday 8 (one per slot — a readout or a finished discovery uses it, else it is spent unused · the sector regime · an event target),
// 'V' landing 3 (the template, its sealed quality, the stage / price). `uses`: the catalog composes `stages` (the build record and its
// monthly step are used as is), `market` (only its biotech-sector regime idea, re-implemented here: the market module lists equities on its
// own stream) and `dd` (the V card's due diligence narrows the sealed quality, like w14's credit committee).
import { newBuild, buildMonth, costToComplete, pctDone } from '../mech/stages.js';

export const ID = 'trials';
export const SLOTS = 8;
export const DRAWS = Object.freeze({ init: SLOTS, month: SLOTS + 2, landing: Object.freeze({ V: 3 }) });
/** The four public stages: months and base cost (× the candidate's cost multiplier). */
export const PH = Object.freeze([Object.freeze({ n: 'שלב I', m: 4, cost: 8000000 }), Object.freeze({ n: 'שלב II', m: 6, cost: 24000000 }), Object.freeze({ n: 'שלב III', m: 9, cost: 60000000 }), Object.freeze({ n: 'אישור', m: 4, cost: 8000000 })]);
/** Candidate templates (fictional molecules): area, printed odds per stage, peak sales a month (₪), patent months after approval, cost multiplier. */
export const TEMPLATES = Object.freeze([
  Object.freeze({ n: 'אונקופין', area: 'onc', odds: [0.6, 0.4, 0.6, 0.9], peak: 48000000, life: 60, cm: 1.2 }),
  Object.freeze({ n: 'רמיטל', area: 'rare', odds: [0.75, 0.55, 0.7, 0.92], peak: 21000000, life: 84, cm: 0.8 }),
  Object.freeze({ n: 'סרבלין', area: 'neuro', odds: [0.55, 0.3, 0.5, 0.88], peak: 72000000, life: 60, cm: 1.3 }),
  Object.freeze({ n: 'קרדיון', area: 'cardio', odds: [0.7, 0.45, 0.65, 0.9], peak: 39000000, life: 48, cm: 1.1 }),
  Object.freeze({ n: 'אנטיבר', area: 'anti', odds: [0.75, 0.5, 0.7, 0.92], peak: 8000000, life: 48, cm: 0.7 }),
  Object.freeze({ n: 'דרמלון', area: 'derm', odds: [0.7, 0.5, 0.65, 0.9], peak: 14000000, life: 36, cm: 0.6 }),
  Object.freeze({ n: 'אימונקס', area: 'immu', odds: [0.65, 0.4, 0.6, 0.9], peak: 45000000, life: 60, cm: 1.0 }),
  Object.freeze({ n: 'מטבוליס', area: 'metab', odds: [0.65, 0.45, 0.65, 0.9], peak: 30000000, life: 60, cm: 0.9 }),
]);
export const AREAS = Object.freeze({ onc: 'אונקולוגיה', rare: 'מחלות נדירות', neuro: 'מוח ועצבים', cardio: 'לב', anti: 'אנטיביוטיקה', derm: 'עור', immu: 'חיסון', metab: 'מטבוליזם' });
export const SECTOR = Object.freeze({ bull: Object.freeze({ label: 'בועת ביוטק', k: 1.3, exit: 0.2, next: 'normal' }), normal: Object.freeze({ label: 'שוק רגיל', k: 1, exit: 0.12 }), winter: Object.freeze({ label: 'חורף בביוטק', k: 0.6, exit: 0.18, next: 'normal' }) });
/** TUNE: margin on own sales, the plant, licensing (upfront share of the value, royalty), abandon salvage, discovery, value multiple. */
export const TR = Object.freeze({ margin: 0.6, plantUp: 0.08, plant: 60000000, plantKeep: 0.7, up: Object.freeze([0.05, 0.15, 0.3, 0.4]), roy: Object.freeze([0.04, 0.06, 0.1, 0.13]), vet: 1.2, salvage: 0.05, disc: 8000000, discM: 4, mult: 5, ramp: 9, trail: 6, cliff: 0.2, roySale: 0.3, royPx: 0.9,
  ddFee: 2000000, band: 0.1, ddBand: 0.03, rev: Object.freeze([1, 0.5, 0.25, 0.1]), buyK: 0.9, inv: 0.6, ovh: 800000, comp: 0.6, price: 0.85, plantOpex: 600000 });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round3 = (x) => Math.round(x * 1000) / 1000;
const T = (st) => st.world.trials;
const isSci = (st) => st.charId === 'scientist';
const vet = (st) => (st.charId === 'pharmaVet' ? TR.vet : 1);
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
const tplOf = (c) => TEMPLATES[c.t];
/** The odds of stage k as a player sees them: printed, or the truth for the scientist's (or a checked) candidate. */
/** The shown band of the sealed quality shift: ±10 pp at first; due diligence (±3 pp) or each passed readout (× ½) narrows it; it always contains the truth. The scientist sees her own exactly. */
export const bandOf = (st, c) => { if (c.seen) return { lo: c.q, hi: c.q }; const a = c.adj || 0; if (!c.dd && !c.rev) return { lo: round3(a - TR.band), hi: round3(a + TR.band) }; const w = Math.min(c.dd ? TR.ddBand : TR.band, TR.band * TR.rev[Math.min(3, c.rev || 0)]); const lo = round3(c.q - 2 * w * (c.j ?? 0.5)); return { lo, hi: round3(lo + 2 * w) }; };
const midOf = (st, c) => { const b = bandOf(st, c); return (b.lo + b.hi) / 2; };
/** The odds of stage k: printed + the middle of the shown band (what a player can know), or printed + the truth. */
export const oddsOf = (st, c, k, truth = false) => clamp(tplOf(c).odds[k] + (truth ? c.q : midOf(st, c)), 0.05, 0.98);
const stageCost = (c, k) => Math.round(PH[k].cost * tplOf(c).cm);
/** A launched drug's yearly profit at peak (own share), and its value at launch for an EV: × min(5, patent years) × 0.75 (ramp, time). */
const peakYear = (st, c) => tplOf(c).peak * 12 * (TR.margin + (T(st).plant ? TR.plantUp : 0)) * T(st).price;
const launchVal = (st, c) => peakYear(st, c) * Math.min(TR.mult, tplOf(c).life / 12) * 0.75;
/** The value of paying for c's next stage now (public odds unless `truth`), with the option to stop later: backwards from launch, every later
 *  stage is worth max(0, odds × the value after it − its cost) — you will only pay for it if it is worth it then. */
export function rnpv(st, c, truth = false) { let v = launchVal(st, c); for (let k = 3; k >= c.ph; k--) { const cost = k === c.ph && c.b ? costToComplete(c.b) : stageCost(c, k) * (1 - (c.co || 0)); v = oddsOf(st, c, k, truth) * v * (k === c.ph ? 1 : 1) - cost; if (k > c.ph) v = Math.max(0, v); } return Math.round(v); }
export function pLaunch(st, c, truth = false) { let p = 1; for (let k = c.ph; k < 4; k++) p *= oddsOf(st, c, k, truth); return round3(p); }
/** License terms now: the upfront (× the sector regime, × 1.2 for the pharma veteran) and the royalty share of sales. */
export function licTerms(st, c) { const p = pLaunch(st, c); const v = p * tplOf(c).peak * 12 * Math.min(TR.mult, tplOf(c).life / 12) * 0.75 * 0.55; const k = Math.min(3, c.ph); return { up: r1000(Math.max(0, v * TR.up[k] * SECTOR[T(st).sector].k * vet(st))), roy: round3(TR.roy[k] * vet(st)) }; }
const trailing = (c) => (c.ring && c.ring.length ? c.ring.reduce((a, b) => a + b, 0) / c.ring.length * 12 : 0);
/** A drug's value: 5 × its trailing annual profit (the last 6 months × 2), at most the years left to the cliff (≥ 1); its cost basis until it has 6 months of sales. */
export function drugValue(st, c) { const yrs = clamp((c.cliffM - st.month) / 12, 1, TR.mult); const v = Math.round(trailing(c) * yrs); return r1000(c.ring.length < TR.trail && !c.lic ? Math.max(v, c.spent) : v); }
export const live = (c) => c && (c.s === 'run' || c.s === 'dec');
export const earning = (c) => c && c.s === 'drug' && c.last > 0;
/** The lab's value: the pipeline at cost (the player's own money in it; a partner's half is the partner's), the drugs, the plant. */
export function valueOf(st) { const L = T(st); let v = L.plant ? Math.round(TR.plant * TR.plantKeep) : 0; for (const c of L.slots) { if (!c) continue; if (live(c) && !c.lic) v += c.spent; if (c.s === 'drug') v += drugValue(st, c); } return r1000(v); }
function revalue(st) { for (const a of st.assets) if (a.op && a.op.ck === 'lab') { a.value = valueOf(st); a.debt = 0; } }
function newCand(t, q, ph, spent, j) { return { t, n: TEMPLATES[t].n, q: round3(q), j: round3(j ?? 0.5), rev: 0, ph, s: 'dec', b: null, spent: Math.round(spent || 0), lic: 0, co: 0, roy: 0, rs: 0, seen: 0, dd: 0, launchM: 0, cliffM: 0, ring: [], last: 0, shr: 1, stalled: 0 }; }
const qOf = (r) => round3(-0.1 + 0.2 * r);
function launch(st, c, out, ctx) { const L = T(st); c.s = 'drug'; c.b = null; c.launchM = st.month; c.cliffM = st.month + tplOf(c).life - (L.gen[tplOf(c).area] || 0); L.approved++; ctx.lesson(st, out, 'real_option');
  out.news.push({ kind: 'tr', text: ctx.mentorLine(st, 'approved', { name: c.n }) || `${c.n} אושרה! המכירות יעלו לשיא תוך שנה — ויימשכו עד שהפטנט יפוג.` }); }
function readout(st, c, r, out, ctx) { const L = T(st); const p = oddsOf(st, c, c.ph, true); const k = c.ph;
  if (r < p) { c.rev = (c.rev || 0) + 1; if (k === 3) launch(st, c, out, ctx); else { c.ph = k + 1; c.s = c.lic ? 'run' : 'dec'; c.b = c.lic ? newBuild({ stages: 1, stageMonths: PH[c.ph].m, cost: 0, land: 0, eqReq: 1, permitAt: 0, now: st.month }) : null; if (!c.lic) out.news.push({ kind: 'tr', text: ctx.mentorLine(st, 'readoutWin', { name: c.n, stage: PH[k].n }) || `${c.n}: ${PH[k].n} הצליח. להמשיך, לוותר או להעביר לשותף?` }); } return true; }
  c.s = 'dead'; c.b = null; L.fails++; L.lost += c.lic ? 0 : c.spent; ctx.lesson(st, out, 'sunk_cost');
  out.news.push({ kind: 'tr', text: ctx.mentorLine(st, 'readoutFail', { name: c.n, stage: PH[k].n, amount: ctx.fmtM(c.spent) }) || `${c.n} נכשלה ב${PH[k].n}. ${ctx.fmtM(c.spent)} שהושקעו בה לא יחזרו — וגם לא היו חוזרים אם היית ממשיך.` }); return false; }
const fmtPct = (x) => Math.round(x * 100) + '%';

export const trials = {
  id: ID, draws: DRAWS, uses: ['stages', 'market', 'dd'],
  lessons: ['real_option', 'patent_cliff', 'sunk_cost'],
  mentorKeys: ['approved', 'readoutWin', 'readoutFail', 'cliff', 'stall', 'offerAsk', 'offerBuy', 'offerPass', 'sector'],
  sealed: ['world.trials.slots[].q', 'world.trials.slots[].j', 'world.trials.inits', 'pending.wr', 'pending.item.q', 'pending.item.j'],

  init(st, w, ch, ctx) {
    const rs = []; for (let i = 0; i < DRAWS.init; i++) rs.push(ctx.draw(st)); // exactly 6 'world' draws at init, whoever plays
    const S = (ch && ch.start) || {};
    st.world.trials = { slots: [], sector: 'normal', price: 1, plant: 0, gen: {}, inc: 0, approved: 0, fails: 0, lost: 0, stops: 0, lics: 0, cliffs: 0, bought: 0, evR: 0, inits: rs, hist: [] };
    const L = T(st);
    for (let i = 0; i < SLOTS; i++) { const d = (S.cands || [])[i]; if (!d) { L.slots.push(null); continue; } const c = newCand(d.t, qOf(rs[i]), d.ph, d.spent, frac(rs[i] * 7.13 + 0.17)); if (isSci(st)) c.seen = 1; L.slots.push(c);
      if (d.drug) { c.s = 'drug'; c.ph = 4; c.launchM = st.month - d.drug; c.cliffM = st.month + d.cliffIn; for (let k = 0; k < TR.trail; k++) c.ring.push(Math.round(tplOf(c).peak * TR.margin)); c.last = c.ring[TR.trail - 1]; L.approved++; } }
  },
  defaults(st) { const L = T(st); if (!L) return; if (!Array.isArray(L.slots)) L.slots = []; if (!L.gen) L.gen = {}; if (!Array.isArray(L.hist)) L.hist = []; },

  monthly(st, out, ctx) {
    const L = T(st); const rs = []; for (let i = 0; i < DRAWS.month; i++) rs.push(ctx.draw(st)); // exactly 8 'world' draws every payday
    const m = st.month; const S = SECTOR[L.sector]; L.evR = rs[SLOTS + 1];
    if (rs[SLOTS] < S.exit) { const old = L.sector; L.sector = S.next || (frac(rs[SLOTS] * 17) < 0.5 ? 'bull' : 'winter'); if (old !== L.sector) out.news.push({ kind: 'tr', text: ctx.mentorLine(st, 'sector', { label: SECTOR[L.sector].label }) || `שוק הביוטק: ${SECTOR[L.sector].label}. מחירי העסקאות זזים.` }); }
    for (let i = 0; i < SLOTS; i++) if (L.slots[i] && L.slots[i].s === 'dead') L.slots[i] = null; // a cracked flask stays on the shelf for one payday
    let inc = -TR.ovh - (L.plant ? TR.plantOpex : 0);
    for (let i = 0; i < SLOTS; i++) { const c = L.slots[i]; if (!c) continue;
      if (c.s === 'lab') { if (m >= c.labM) { const t = Math.floor(rs[i] * TEMPLATES.length) % TEMPLATES.length; L.slots[i] = newCand(t, qOf(frac(rs[i] * 7.13 + 0.17)), 0, c.spent, frac(rs[i] * 3.71 + 0.29)); if (isSci(st)) L.slots[i].seen = 1; out.news.push({ kind: 'tr', text: `המעבדה מצאה מולקולה חדשה: ${TEMPLATES[t].n} (${AREAS[TEMPLATES[t].area]}). מוכנה לשלב I.` }); } continue; }
      if (c.s === 'run') { const share = c.lic ? 0 : 1 - c.co; const r = buildMonth(c.b, { month: m, cash: c.lic ? 1e15 : Math.max(0, st.cash), rate: 0 });
        const pay = Math.round(r.equityPaid * share); if (pay > 0) { st.cash -= pay; c.spent += pay; ctx.cashFx(out, -pay, null); }
        if (r.stalled === 'equity') { c.stalled++; out.news.push({ kind: 'tr', text: ctx.mentorLine(st, 'stall', { name: c.n }) || `אין מזומן ל${PH[c.ph].n} של ${c.n}: הניסוי עומד, והזמן רץ.` }); }
        if (r.completed) readout(st, c, rs[i], out, ctx); continue; }
      if (c.s === 'drug') { const D = tplOf(c); const ramp = Math.min(1, (m - c.launchM + 1) / TR.ramp); const post = m >= c.cliffM; if (post && !c.cliffed) { c.cliffed = 1; L.cliffs++; ctx.lesson(st, out, 'patent_cliff'); out.news.push({ kind: 'tr', text: ctx.mentorLine(st, 'cliff', { name: c.n }) || `הפטנט של ${c.n} פג: גנריות נכנסות, המכירות צונחות ב־80%.` }); }
        const sales = D.peak * ramp * c.shr * L.price * (post ? TR.cliff : 1);
        const p = Math.round(c.lic ? sales * c.lic : sales * (TR.margin + (L.plant ? TR.plantUp : 0)) * (1 - c.co) * (1 - c.rs));
        c.last = p; c.ring.push(p); while (c.ring.length > TR.trail) c.ring.shift(); inc += p; }
    }
    L.inc = Math.round(inc); L.hist.push({ m, inc: L.inc, v: valueOf(st) }); while (L.hist.length > 24) L.hist.shift();
    revalue(st);
  },
  asset: {
    create(st, a) { a.op = { ck: 'lab' }; a.debt = 0; a.value = valueOf(st); },
    cf(st, a) { return a.op && a.op.ck === 'lab' ? Math.round(T(st).inc / 10) * 10 : Math.round((a.cf || 0) / 10) * 10; },
  },
  market: {
    create(st, p) { const c = p.card; const L = T(st); const a = c.area;
      if (c.mk === 'compete') for (const x of L.slots) if (x && x.s === 'drug' && tplOf(x).area === a) x.shr = round3(x.shr * TR.comp);
      if (c.mk === 'safety') for (const x of L.slots) if (live(x) && tplOf(x).area === a) { x.q = round3(x.q - 0.08); x.adj = round3((x.adj || 0) - 0.08); } // public: the band moves with it
      if (c.mk === 'fast') for (const x of L.slots) if (x && x.s === 'run' && x.b && tplOf(x).area === a) x.b.prog = Math.min(x.b.stageMonths - 1, x.b.prog + 2);
      if (c.mk === 'generic') { L.gen[a] = 12; for (const x of L.slots) if (x && x.s === 'drug' && tplOf(x).area === a) x.cliffM -= 12; }
      if (c.mk === 'pricing') L.price = round3(Math.max(0.7, L.price * TR.price));
      if (c.mk === 'bull' || c.mk === 'winter') L.sector = c.mk; revalue(st); },
    describe(st, p, ev) { const L = T(st); ev.data.trials = { mk: p.card.mk, area: p.card.area || null, sector: L.sector, price: L.price }; },
  },
  crisis: { create(st, p) { const c = p.card; const L = T(st); if (c.mk !== 'cro') return; const i = Math.floor(L.evR * SLOTS) % SLOTS; const x = L.slots[i]; if (x && x.s === 'run' && x.b) { x.b.delayLeft += 3; p.slot = i; } } },
  tiles: {},
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) { const L = T(st); for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op || a.op.ck !== 'lab') continue;
    m.flasks = L.slots.map((c, i) => (c ? { slot: i, state: c.s, stage: c.ph, fill: c.s === 'run' && c.b ? round3((c.ph + pctDone(c.b)) / 4) : c.s === 'drug' ? 1 : round3(c.ph / 4), cracked: c.s === 'dead', lic: !!c.lic } : null)); m.plant = !!L.plant; } },
  recapHint(st) { const L = T(st); if (!L) return null; if (L.cliffs) return 'בפעם הבאה: צוק הפטנט מגיע בתאריך ידוע. צינור חדש צריך להתחיל שנים לפני.'; if (L.lost > 150000000) return 'בפעם הבאה: מה שכבר הוצא לא חוזר. בכל תוצאה שואלים רק: כמה עוד עולה, ומה הסיכוי מכאן.'; if (L.lics > 3) return 'בפעם הבאה: רישוי לשותף בטוח — אבל הוא לוקח את רוב האפסייד.'; return null; },
  goalValue(st, key) { const L = T(st); if (key === 'productsEarning') return L.slots.filter(earning).length; if (key === 'labValue') return valueOf(st); return 0; },
};

/* ---------------------------------------------------------------- 'V' — a candidate for sale */
trials.tiles.V = {
  safe: 'pass',
  create(st, ctx) { const rs = [ctx.draw(st), ctx.draw(st), ctx.draw(st)]; // exactly 3 'world' draws on every V landing
    const t = Math.floor(rs[0] * TEMPLATES.length) % TEMPLATES.length; const inv = st.charId === 'bioInvestor'; /* the investor's network brings later-stage deals */ const ph = rs[2] < (inv ? 0.15 : 0.35) ? 0 : rs[2] < (inv ? 0.5 : 0.75) ? 1 : 2; return { wr: rs, item: { t, ph, q: qOf(rs[1]), j: round3(frac(rs[1] * 13.7)), k: round3(0.9 + 0.2 * frac(rs[2] * 11)) }, checked: false }; },
  describe(st, p, ev, ctx) {
    const L = T(st); const it = p.item; const c = newCand(it.t, it.q, it.ph, 0, it.j); c.dd = p.checked ? 1 : 0; const D = tplOf(c);
    const price = r1000(Math.max(3000000, rnpv(st, c) * TR.buyK * SECTOR[L.sector].k * it.k * (st.charId === 'bioInvestor' ? TR.inv : 1))); const free = L.slots.indexOf(null); const band = bandOf(st, c);
    ev.tag = 'מולקולה למכירה'; ev.title = `${D.n} — ${AREAS[D.area]}`;
    ev.text = `חברת ביוטק קטנה מוכרת מולקולה לפני ${PH[it.ph].n}. הסיכויים המודפסים: ${D.odds.slice(it.ph).map(fmtPct).join(' / ')}. מכירות בשיא: ${ctx.fmtM(D.peak)} בחודש, פטנט ל־${D.life} חודשים מהאישור.`;
    ev.mentor = ctx.mentorLine(st, 'offerAsk', {}) || 'מה הסיכוי מכאן ועד המדף — וכמה עוד יעלה להגיע לשם?';
    ev.data = { kind: 'candidate', t: it.t, area: D.area, stage: it.ph, odds: D.odds, shift: band, peak: D.peak, life: D.life, price, slot: free, checked: !!p.checked, checkFee: TR.ddFee, pLaunch: pLaunch(st, c), costLeft: [0, 1, 2, 3].filter((k) => k >= it.ph).reduce((s, k) => s + stageCost(c, k), 0), sector: L.sector };
    const can = free >= 0 && st.cash >= price;
    ev.options = [...(p.checked ? [] : [ctx.opt('check', `בדיקת נאותות (${ctx.fmtM(TR.ddFee)})`, st.cash >= TR.ddFee, { kind: 'inspect', preview: { cash: -TR.ddFee, monthly: 0, months: 0, risk: null } })]),
      ctx.opt('buy', `לקנות (${ctx.fmtM(price)})`, can, { kind: 'buy', preview: { cash: -price, monthly: 0, months: PH[it.ph].m, risk: 'sealed:odds' }, reason: free < 0 ? 'אין מקום במעבדה (6 מולקולות)' : can ? undefined : 'אין מספיק מזומן' }),
      ctx.opt('pass', 'לוותר', true, { preview: { cash: 0, monthly: 0, months: 0, risk: null } })];
    const good = can && rnpv(st, c) > price && st.cash - price > 40000000 && ((price <= 0.25 * ctx.netWorth(st) && pLaunch(st, c) >= 0.2) || (price <= 0.45 * ctx.netWorth(st) && pLaunch(st, c) >= 0.45));
    ev.forcePrimary = !p.checked && can && rnpv(st, c) > price * 0.8 && st.cash >= price + TR.ddFee ? 'check' : good ? 'buy' : 'pass';
  },
  choose(st, p, o, params, out, ctx) {
    const L = T(st); const it = p.item;
    if (o.id === 'pass') { out.mentor = ctx.mentorLine(st, 'offerPass', {}) || null; ctx.logDecision(st, 'מולקולה למכירה', 'ויתר'); return true; }
    if (o.id === 'check') { st.cash -= TR.ddFee; ctx.cashFx(out, -TR.ddFee, 'בדיקת נאותות'); p.checked = true; ctx.logDecision(st, 'מולקולה למכירה', 'בדיקה'); return false; }
    const free = L.slots.indexOf(null); if (free < 0) return true;
    const c = newCand(it.t, it.q, it.ph, 0, it.j); c.dd = p.checked ? 1 : 0;
    const price = r1000(Math.max(3000000, rnpv(st, c) * TR.buyK * SECTOR[L.sector].k * it.k * (st.charId === 'bioInvestor' ? TR.inv : 1))); if (st.cash < price) return true;
    st.cash -= price; ctx.cashFx(out, -price, c.n); c.spent = price; L.slots[free] = c; L.bought++; revalue(st); ctx.lesson(st, out, 'real_option');
    out.mentor = ctx.mentorLine(st, 'offerBuy', { name: c.n }) || null; ctx.logDecision(st, 'מולקולה למכירה', 'קנה', price); return true;
  },
  score(st, ev) { return ev.options.filter((o) => o.enabled).map((o) => ({ id: o.id, U: o.primary ? 1 : 0, flags: [], reasons: [] })); },
};

/* ---------------------------------------------------------------- between-roll actions (`Z`) and the panel */
const slotArg = (st, p, want) => { const i = +p; const c = Number.isInteger(i) && i >= 0 && i < SLOTS ? T(st).slots[i] : null; return c && (!want || want(c)) ? c : null; };
trials.act = {
  go(st, p, out) { const c = slotArg(st, p, (x) => x.s === 'dec' && !x.lic); if (!c) return fail(out, 'bad_param'); c.s = 'run'; c.b = newBuild({ stages: 1, stageMonths: PH[c.ph].m, cost: stageCost(c, c.ph), land: 0, eqReq: 1, permitAt: 0, now: st.month }); out.toast = `${c.n}: ${PH[c.ph].n} מתחיל (${PH[c.ph].m} חודשים).`; return true; },
  stop(st, p, out, ctx) { const c = slotArg(st, p, (x) => live(x) && !x.lic); if (!c) return fail(out, 'bad_param'); const L = T(st); const s = r1000(c.spent * TR.salvage); st.cash += s; ctx.cashFx(out, s, 'שאריות'); L.lost += c.spent - s; L.stops++; L.slots[+p] = null; revalue(st);
    ctx.lesson(st, {}, 'sunk_cost'); out.toast = `${c.n} נעצרה. ${ctx.fmtM(s)} חזרו ממכירת הנתונים.`; return true; },
  license(st, p, out, ctx) { const c = slotArg(st, p, (x) => live(x) && !x.lic && !x.co); if (!c) return fail(out, 'bad_param'); const L = T(st); const t = licTerms(st, c); st.cash += t.up; ctx.cashFx(out, t.up, 'מקדמה משותף'); c.lic = t.roy; L.lics++;
    if (c.s === 'run' && c.b) { c.b.cost = 0; c.b.eqReq = 0; } else { c.s = 'run'; c.b = newBuild({ stages: 1, stageMonths: PH[c.ph].m, cost: 0, land: 0, eqReq: 1, permitAt: 0, now: st.month }); } revalue(st); out.toast = `${c.n} עברה לשותף: ${ctx.fmtM(t.up)} עכשיו ו־${Math.round(t.roy * 100)}% מהמכירות אם תאושר.`; return true; },
  partner(st, p, out) { const c = slotArg(st, p, (x) => x.s === 'dec' && !x.lic && !x.co); if (!c) return fail(out, 'bad_param'); c.co = 0.5; out.toast = `${c.n}: שותף מממן חצי מהעלויות — ולוקח חצי מהרווח.`; return true; },
  discover(st, p, out, ctx) { const L = T(st); const i = L.slots.indexOf(null); if (i < 0) return fail(out, 'אין מקום'); if (st.cash < TR.disc) return fail(out, 'אין מספיק מזומן'); st.cash -= TR.disc; ctx.cashFx(out, -TR.disc, 'מחקר'); L.slots[i] = { s: 'lab', labM: st.month + TR.discM, spent: TR.disc, n: 'מחקר', t: 0, ph: 0, q: 0, co: 0, lic: 0, ring: [] }; revalue(st); out.toast = `המעבדה מחפשת מולקולה חדשה (${TR.discM} חודשים).`; return true; },
  royalty(st, p, out, ctx) { const c = slotArg(st, p, (x) => x.s === 'drug' && !x.lic && !x.rs); if (!c) return fail(out, 'bad_param'); const cash = r1000(drugValue(st, c) * TR.roySale * TR.royPx); if (cash <= 0) return fail(out, 'אין מה למכור'); c.rs = TR.roySale; st.cash += cash; ctx.cashFx(out, cash, 'מכירת תמלוגים'); revalue(st); out.toast = `מכרת 30% מהרווח של ${c.n} תמורת ${ctx.fmtM(cash)}.`; return true; },
  plant(st, p, out, ctx) { const L = T(st); if (L.plant) { const v = Math.round(TR.plant * TR.plantKeep); L.plant = 0; st.cash += v; ctx.cashFx(out, v, 'מכירת המפעל'); revalue(st); out.toast = `המפעל נמכר ב־${ctx.fmtM(v)}.`; return true; }
    if (st.cash < TR.plant) return fail(out, 'אין מספיק מזומן'); st.cash -= TR.plant; ctx.cashFx(out, -TR.plant, 'מפעל'); L.plant = 1; revalue(st); out.toast = 'מפעל ייצור משלך: עוד 8% רווח על כל תרופה שלך.'; return true; },
};
function actionList(st, ctx) {
  const L = T(st); const out = []; const reserve = L.slots.reduce((s, c) => s + (c && c.s === 'run' && !c.lic && c.b ? Math.round(costToComplete(c.b) * (1 - c.co)) : 0), 0);
  L.slots.forEach((c, i) => { if (!c || c.s === 'lab' || c.s === 'dead') return; const param = String(i);
    if (c.s === 'dec' && !c.lic) { const go = rnpv(st, c); const t = licTerms(st, c); const lic = t.up + Math.round(pLaunch(st, c) * tplOf(c).peak * 12 * Math.min(TR.mult, tplOf(c).life / 12) * 0.75 * t.roy); const stop = Math.round(c.spent * TR.salvage);
      const cost = Math.round(stageCost(c, c.ph) * (1 - c.co)); const cashOk = st.cash + Math.max(0, L.inc) * PH[c.ph].m - reserve >= cost + 10000000; const half = !c.co && st.cash + Math.max(0, L.inc) * PH[c.ph].m - reserve >= cost / 2 + 10000000 && go / 2 >= lic;
      const best = go >= lic && go > stop && cashOk ? 'go' : half ? 'partner' : lic > stop ? 'license' : 'stop';
      out.push({ id: 'go', param, label: `${c.n}: להמשיך ל${PH[c.ph].n} (${ctx.fmtM(cost)})`, enabled: true, suggested: best === 'go', ev: go, cost, months: PH[c.ph].m, slot: i });
      out.push({ id: 'license', param, label: `${c.n}: להעביר לשותף (${ctx.fmtM(t.up)} + ${Math.round(t.roy * 100)}%)`, enabled: !c.co, suggested: best === 'license' && !c.co, ev: lic, slot: i });
      out.push({ id: 'partner', param, label: `${c.n}: שותף לחצי מהעלויות ולחצי מהרווח`, enabled: !c.co, suggested: best === 'partner', slot: i });
      out.push({ id: 'stop', param, label: `${c.n}: לעצור (${ctx.fmtM(stop)} חוזרים)`, enabled: true, suggested: best === 'stop', ev: stop, slot: i }); }
    if (c.s === 'run' && !c.lic) { const t = licTerms(st, c); const stuck = c.b && c.b.stalls >= 2; out.push({ id: 'license', param, label: `${c.n}: להעביר לשותף באמצע ${PH[c.ph].n} (${ctx.fmtM(t.up)} + ${Math.round(t.roy * 100)}%)`, enabled: !c.co, suggested: stuck && !c.co, slot: i });
      out.push({ id: 'stop', param, label: `${c.n}: לעצור באמצע ${PH[c.ph].n}`, enabled: true, suggested: stuck && !!c.co, slot: i }); }
    if (c.s === 'drug' && !c.lic) out.push({ id: 'royalty', param, label: `${c.n}: למכור 30% מהרווח (${ctx.fmtM(r1000(drugValue(st, c) * TR.roySale * TR.royPx))})`, enabled: !c.rs, suggested: !c.rs && st.cash < 0, slot: i }); });
  const own = L.slots.filter((c) => c && c.s === 'drug' && !c.lic && st.month < c.cliffM - 12).length;
  out.push({ id: 'plant', param: null, label: L.plant ? `למכור את המפעל (${ctx.fmtM(Math.round(TR.plant * TR.plantKeep))})` : `מפעל ייצור (${ctx.fmtM(TR.plant)})`, enabled: L.plant ? true : st.cash >= TR.plant, suggested: L.plant ? st.cash < 0 : own >= 2 && st.cash - reserve >= TR.plant + 40000000 });
  const open = L.slots.indexOf(null); const liveN = L.slots.filter((c) => c && (live(c) || c.s === 'lab')).length;
  out.push({ id: 'discover', param: null, label: `מחקר: מולקולה חדשה (${ctx.fmtM(TR.disc)}, ${TR.discM} חודשים)`, enabled: open >= 0 && st.cash >= TR.disc, suggested: open >= 0 && liveN < SLOTS && st.cash - reserve >= (liveN ? 40000000 : 12000000) && st.month < 62 });
  return out;
}
function indicatorsOf(st, ctx) {
  const L = T(st); const nw = ctx.netWorth(st); const goal = ((ctx.world(st).goal || {}).of || []).find((g) => g.type === 'nw') || {};
  const rows = L.slots.map((c, i) => { if (!c) return { slot: i, empty: true }; if (c.s === 'lab') return { slot: i, state: 'lab', readyM: c.labM, spent: c.spent };
    const D = tplOf(c); return { slot: i, name: c.n, area: D.area, areaName: AREAS[D.area], state: c.s, stage: c.ph, stageName: PH[Math.min(3, c.ph)].n, odds: D.odds, shift: bandOf(st, c), pLaunch: c.s === 'drug' || c.s === 'dead' ? null : pLaunch(st, c), spent: c.spent, costLeft: c.s === 'run' && c.b ? costToComplete(c.b) : null, done: c.s === 'run' && c.b ? round3(pctDone(c.b)) : null,
      stalled: c.stalled, lic: c.lic || 0, co: c.co, roySold: c.rs, peak: D.peak, life: D.life, launchM: c.launchM || null, cliffM: c.cliffM || null, monthly: c.last || 0, value: c.s === 'drug' ? drugValue(st, c) : live(c) && !c.lic ? c.spent : 0 }; });
  return {
    trials: { value: valueOf(st), netWorth: nw, target: goal.target || 0, earning: L.slots.filter(earning).length, inc: L.inc, sector: L.sector, sectorLabel: SECTOR[L.sector].label, price: L.price, plant: !!L.plant, approved: L.approved, fails: L.fails, stops: L.stops, lics: L.lics, cliffs: L.cliffs, lost: L.lost, bought: L.bought },
    panel: { id: 'trials', title: 'המעבדה', gauges: [{ id: 'nw', label: 'שווי נקי מול היעד', value: nw, ref: goal.target || 0, unit: '₪' }, { id: 'earning', label: 'תרופות שמרוויחות', value: L.slots.filter(earning).length, ref: 2, min: 0, max: 6 }, { id: 'inc', label: 'רווח המעבדה החודש', value: L.inc, ref: 0, unit: '₪' }], rows, actions: actionList(st, ctx) },
  };
}
export default trials;
