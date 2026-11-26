// World mechanic `multinational` — w11 התאגיד הבינלאומי (docs/full-upgrade/worlds/w11-multinational.md; CATALOG-25 §1.1 / §1.2 / §2.1). A group
// of up to 6 subsidiaries in 5 countries and 5 currencies. The scarce resource is the owner's attention: at most 2 subsidiaries can be run by
// the owner (3 for the CEO, +1 with a regional HQ); every other one is delegated to a country manager whose competence and integrity are
// SEALED at hire. Results and audits reveal them slowly; fraud is a hazard of (1 − integrity). Each subsidiary buys from a supplier country:
// a disruption there runs every dependent subsidiary at 60 % (90 % with a second source). FX: one index per currency (the w3 drift / revert
// model generalised to N currencies), hedgeable per currency; profits sent home pay a withholding tax, cash kept abroad stays FX-exposed.
//
// Contract (DESIGN §4.2): pure, deterministic, no engine import, only + − × ÷ and Math.round / min / max / floor / abs. Fixed 'world' draws:
// init 18 (per sub slot: quality, competence, integrity — whoever plays), payday 14 (5 FX · 6 fraud, one per sub slot, empty slots too ·
// 1 supply disruption · 2 for the month's manager candidate), 'Z' landing 4 (template / size / price · quality · competence · integrity).
// A sub's NET-WORTH value = 32 × its trailing 12-month local profit (the purchase estimate fills the months not yet seen) × the FX rate it
// is booked at: the truth shows up in the value only as the months are earned — never at the purchase.
export const ID = 'multinational';
export const SLOTS = 6;
export const DRAWS = Object.freeze({ init: SLOTS * 3, month: 5 + SLOTS + 1 + 2, landing: Object.freeze({ Z: 4 }) });
export const COUNTRIES = Object.freeze([
  Object.freeze({ id: 'eu', n: 'אירופה', ccy: 'יורו', wht: 0.05, vol: 0.016, tr: 0, ph: 0 }), Object.freeze({ id: 'us', n: 'ארה״ב', ccy: 'דולר', wht: 0.08, vol: 0.02, tr: 0.001, ph: 7 }),
  Object.freeze({ id: 'in', n: 'הודו', ccy: 'רופי', wht: 0.15, vol: 0.03, tr: -0.006, ph: 13 }), Object.freeze({ id: 'br', n: 'ברזיל', ccy: 'ריאל', wht: 0.12, vol: 0.038, tr: -0.007, ph: 18 }),
  Object.freeze({ id: 'vn', n: 'וייטנאם', ccy: 'דונג', wht: 0.10, vol: 0.026, tr: -0.004, ph: 4 })]);
export const CIDS = Object.freeze(COUNTRIES.map((c) => c.id));
/** Subsidiary templates (fictional names; tools/validate-worlds.mjs N-fict): country, kind, supplier country, base profit ₪/month at FX 1. */
export const TEMPLATES = Object.freeze([
  Object.freeze({ n: 'מפעל חוף הדלתא', c: 'vn', kind: 'factory', sup: 'in', base: 2000000, d: 'מפעל הרכבה ליד הנמל. החלקים מגיעים מהודו.' }),
  Object.freeze({ n: 'רשת אור־מרקט', c: 'eu', kind: 'retail', sup: 'vn', base: 1600000, d: 'רשת חנויות בערים בינוניות. הסחורה מווייטנאם.' }),
  Object.freeze({ n: 'ענן סיגמא', c: 'us', kind: 'software', sup: 'in', base: 2400000, d: 'תוכנה לעסקים, מנויים חודשיים. צוות הפיתוח בהודו.' }),
  Object.freeze({ n: 'הפצת סרה־ורדה', c: 'br', kind: 'distribution', sup: 'us', base: 1400000, d: 'הפצה לחנויות בכל הארץ. המותגים מארה״ב.' }),
  Object.freeze({ n: 'שירותי קוראל־טק', c: 'in', kind: 'services', sup: 'us', base: 1200000, d: 'מוקד שירות ותמיכה. הלקוחות והמערכות מארה״ב.' }),
  Object.freeze({ n: 'מתכת אלפין', c: 'eu', kind: 'factory', sup: 'br', base: 1800000, d: 'מפעל מתכת. חומר הגלם מברזיל.' }),
  Object.freeze({ n: 'רכיבי לוטוס', c: 'vn', kind: 'factory', sup: 'eu', base: 2200000, d: 'רכיבים לאלקטרוניקה. המכונות והחלפים מאירופה.' }),
  Object.freeze({ n: 'שרשרת פרייריה', c: 'us', kind: 'retail', sup: 'vn', base: 1900000, d: 'חנויות לבית ולגן. כל המלאי מווייטנאם.' })]);
export const MN = Object.freeze({ mult: 32, grow: 0.003, slots: 2, mgrLo: 0.55, mgrSpan: 0.7, auditDrag: 0.85, auditCut: 0.4, gapF: 0.7, gapMonths: 2, sever: 6, fraudP: 0.06, auditMonths: 12, auditFee: 500000,
  wage0: 150000, wageSpan: 200000, selfF: 1.1, disP: 0.12, disMonths: 2, disF: 0.6, dualF: 0.9, expF: 0.8, dualCost: 0.04, hubCost: 0.02, hedgeCost: 0.005, sellAt: 0.8,
  hq: 12000000, hqMonthly: 400000, down: 0.35, debtPct: 0.006, amort: 0.01, growCost: 3, growUp: 0.1, growEvery: 6, erp: 8000000, hub: 10000000, revert: 0.06, fxLo: 0.55, fxHi: 1.6, crisis: 0.75, maxSize: [0.7, 1.6] });

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const r1000 = (x) => Math.round(x / 1000) * 1000;
const r100k = (x) => Math.round(x / 100000) * 100000;
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;
const MNS = (st) => st.world.mn;
const CO = (id) => COUNTRIES.find((c) => c.id === id) || COUNTRIES[0];
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
/** A shown range [lo, hi] of width 2w that contains the truth; u ∈ [0, 2) places it (from a sealed jitter). */
function range(x, w, u, a = 0, b = 1) { const lo = clamp(round2(x - w * u), a, b); return { lo, hi: clamp(round2(lo + 2 * w), a, b) }; }
/** Triangle wave in [−1, 1] with period 24 months (country business cycles out of phase). */
const tri = (m) => { const x = frac(m / 24); return 1 - 4 * Math.abs(x - 0.5); };
export const slotsOf = (st) => MN.slots + (st.charId === 'ceo' ? 1 : 0) + (MNS(st).hq ? 1 : 0);
export const selfCount = (st) => MNS(st).subs.filter((s) => s.self).length;
/** The rate a country's profits and values are booked at: the hedged rate (rolling toward spot by 1/12 a month) or spot. */
export const rateOf = (st, c) => { const M = MNS(st); const h = M.hedge[c]; return h ? h.rate : M.fx[c]; };
const subAsset = (st, s) => st.assets.find((a) => a.id === s.sid) || null;
export const subOf = (st, sid) => MNS(st).subs.find((s) => s.sid === +String(sid || '').replace(/^s/, '')) || null;
const effOf = (st, s) => (s.self ? MN.selfF : s.mgr ? (s.mgr.gap >= st.month ? MN.gapF : (MN.mgrLo + MN.mgrSpan * s.mgr.comp) * (s.mgr.drag >= st.month ? MN.auditDrag : 1)) : MN.gapF);
function supplyOf(st, s) { const M = MNS(st); if (!(M.dis[s.sup] >= st.month)) return 1; return s.dual ? MN.dualF : st.charId === 'oldExporter' ? MN.expF : MN.disF; }
function modOf(st, s) { let f = 1; for (const x of MNS(st).mods) if (x.until >= st.month && (x.c === s.c || x.c === '*' || x.sup === s.sup)) f *= x.f; return f; }
const cycOf = (st, c) => 1 + 0.08 * tri(st.month + MNS(st).ph[c]);
/** Expected local profit a month (the public estimate for a month not yet seen, else the trailing average). */
const avgLocal = (s) => { const n = s.h.length; let x = 0; for (const v of s.h) x += v; return (x + (12 - n) * s.est) / 12; };
export const subValue = (st, s) => r1000(MN.mult * avgLocal(s) * rateOf(st, s.c));
const wageOf = (cm) => r1000(MN.wage0 + MN.wageSpan * cm);
function mgrFrom(comp, integ, j, known) { const cr = known ? { lo: comp, hi: comp } : range(comp, 0.25, 2 * frac(j * 31)); const ir = known ? { lo: integ, hi: integ } : range(integ, 0.3, 2 * frac(j * 57));
  return { comp: round3(comp), integ: round3(integ), cLo: cr.lo, cHi: cr.hi, iLo: ir.lo, iHi: ir.hi, wage: wageOf((cr.lo + cr.hi) / 2), gap: 0, aud: 0, known: !!known }; }
function newSub(st, spec) { const M = MNS(st); const used = new Set(M.subs.map((s) => s.slot)); let slot = 0; while (used.has(slot)) slot++;
  const t = TEMPLATES[spec.t]; return { sid: 0, slot, t: spec.t, n: t.n, c: t.c, kind: t.kind, sup: t.sup, est: spec.est, base: spec.base, lo: spec.lo, hi: spec.hi, h: [], self: !!spec.self, dual: false, mgr: spec.mgr || null, at: st.month, paid: spec.paid || 0, frauds: 0 }; }
export function fixedMonth(st) { const M = MNS(st); return M.subs.reduce((x, s) => x + (s.mgr && !s.self ? s.mgr.wage : 0), 0) + (M.hq ? MN.hqMonthly : 0); }
/** This month's local profit, the costs in ₪ (manager, second source, hedge) and the ₪ profit at the booked rate. */
function subCf(st, s) { const M = MNS(st); const fxU = rateOf(st, s.c); const local = s.base * effOf(st, s) * supplyOf(st, s) * modOf(st, s) * cycOf(st, s.c);
  const cost = (s.mgr && !s.self ? s.mgr.wage : 0) + (s.dual ? s.base * (M.hub ? MN.hubCost : MN.dualCost) : 0) + (M.hedge[s.c] ? local * fxU * MN.hedgeCost : 0);
  return { local, cost, cf: Math.round((local * fxU - cost) / 10) * 10 }; }
/** The acquisition loan of a sub (65 % of the price, on the sub): 0.6 % interest + 1 % of the original principal a month, paid from its profit. */
const debtPay = (a) => { const i = Math.round(a.debt * MN.debtPct); const p = Math.min(a.debt, Math.round((a.cost - a.down) * MN.amort)); return { interest: i, principal: p, total: i + p }; };
const remit = (s, cf) => (cf > 0 ? Math.round(cf * (1 - CO(s.c).wht) / 10) * 10 : cf);
const reserveOf = (st, ctx) => 3 * (fixedMonth(st) + Math.round(st.loans * ctx.loanPct(st) / 100)) + 2000000;
function revalue(st) { for (const s of MNS(st).subs) { const a = subAsset(st, s); if (a) a.value = subValue(st, s); } }

export const multinational = {
  id: ID, draws: DRAWS,
  lessons: ['trust_verify', 'supply_chain', 'trapped_cash'],
  mentorKeys: ['fraud', 'disrupted', 'audited', 'acqAsk', 'acqDd'],
  sealed: ['world.mn.subs[].base', 'world.mn.subs[].mgr.comp', 'world.mn.subs[].mgr.integ', 'world.mn.cand.comp', 'world.mn.cand.integ', 'world.mn.inits', 'pending.item.sealed', 'pending.wr'],

  init(st, w, ch, ctx) {
    const rs = []; for (let i = 0; i < DRAWS.init; i++) rs.push(ctx.draw(st)); // exactly 18 'world' draws at init, whoever plays
    const fx = {}; const ph = {}; for (const c of COUNTRIES) { fx[c.id] = 1; ph[c.id] = c.ph; }
    st.world.mn = { fx, ph, anc: { ...fx }, hedge: {}, keep: {}, local: {}, dis: {}, mods: [], subs: [], cand: null, hq: 0, erp: 0, hub: 0, frauds: 0, fraudAt: 0, fraudLoss: 0, audits: 0, sold: 0, disN: 0, inits: rs, start: [] };
    const M = st.world.mn; const S = (ch && ch.start) || {};
    (S.subs || []).forEach((x, i) => { const t = TEMPLATES[x.t]; const est = r1000(t.base * x.size); const q = 0.9 + 0.2 * rs[3 * i]; const comp = rs[3 * i + 1]; const integ = 0.3 + 0.7 * rs[3 * i + 2];
      const sub = newSub(st, { t: x.t, est, base: Math.round(est * q), lo: r1000(est * 0.9), hi: r1000(est * 1.1), self: !!x.self, mgr: x.self ? null : mgrFrom(x.comp ?? comp, x.integ ?? integ, rs[3 * i], !!x.known) });
      M.subs.push(sub); M.start.push(sub); });
  },
  defaults(st) { const M = MNS(st); if (!M) return; if (!M.anc) M.anc = Object.fromEntries(CIDS.map((c) => [c, 1])); for (const k of ['hedge', 'keep', 'local', 'dis']) if (!M[k] || typeof M[k] !== 'object') M[k] = {}; if (!Array.isArray(M.mods)) M.mods = []; if (!Array.isArray(M.start)) M.start = []; },

  monthly(st, out, ctx) {
    const M = MNS(st); const rs = []; for (let i = 0; i < DRAWS.month; i++) rs.push(ctx.draw(st)); // exactly 14 'world' draws every payday
    const m = st.month;
    COUNTRIES.forEach((c, i) => { const f = M.fx[c.id]; const an = M.anc[c.id] = round3(M.anc[c.id] * (1 + c.tr)); M.fx[c.id] = round3(clamp(f + MN.revert * (an - f) + c.vol * 3.4 * (rs[i] - 0.5), MN.fxLo, MN.fxHi));
      const h = M.hedge[c.id]; if (h) h.rate = round3(h.rate + (M.fx[c.id] - h.rate) / 12); });
    const dz = rs[5 + SLOTS]; if (dz < MN.disP) { const c = CIDS[Math.floor(frac(dz * 977) * CIDS.length)]; M.dis[c] = m + MN.disMonths - 1; M.disN++; const hit = M.subs.filter((s) => s.sup === c);
      out.news.push({ kind: 'mn', text: (ctx.mentorLine(st, 'disrupted', { c: CO(c).n }) || `שיבוש בשרשרת האספקה ב${CO(c).n}: חודשיים של עיכובים בנמל.`) + (hit.length ? ` ${hit.length === 1 ? 'חברה אחת שלך תלויה' : hit.length + ' חברות שלך תלויות'} בספק משם.` : '') }); if (hit.length) ctx.lesson(st, out, 'supply_chain'); }
    M.mods = M.mods.filter((x) => x.until >= m);
    const cc = rs[12], ci = rs[13]; M.cand = mgrFrom(cc, 0.3 + 0.7 * ci, frac(cc * 7 + ci * 3), false);
    for (const s of M.subs) {
      const a = subAsset(st, s); const fxU = rateOf(st, s.c); const { local, cost, cf } = subCf(st, s);
      s.last = { local: Math.round(local), cf, eff: round2(effOf(st, s)), supply: supplyOf(st, s) };
      s.h.push(Math.round(local - cost / Math.max(0.01, fxU))); while (s.h.length > 12) s.h.shift();
      // fraud (1 fixed draw per sub SLOT, empty slots too): a managed sub's (1 − integrity) × 5 % a month, halved for 12 months after an audit, × 0.7 with the ERP
      const r = rs[5 + s.slot];
      if (s.mgr && !s.self && r < (1 - s.mgr.integ) * MN.fraudP * (s.mgr.aud && m - s.mgr.aud < MN.auditMonths ? MN.auditCut : 1) * (M.erp ? 0.7 : 1)) {
        const loss = r1000(Math.max(local * fxU, 300000) * (4 + Math.floor(frac(r * 977) * 5))); s.h.push(-Math.round(loss / Math.max(0.01, fxU) / 4)); /* 4–8 months of profit; the books show it */ st.cash -= loss; M.frauds++; s.frauds++; M.fraudAt = st.stats.paydays; M.fraudLoss += loss;
        s.mgr.iHi = Math.min(s.mgr.iHi, round2(s.mgr.integ + 0.1)); s.mgr.iLo = Math.min(s.mgr.iLo, s.mgr.iHi); if (st.life) st.life.happiness = clamp(st.life.happiness - 3, 0, 100);
        ctx.cashFx(out, -loss, `הונאה ב${s.n} ${ctx.fmtM(loss)}`); ctx.lesson(st, out, 'trust_verify');
        out.news.push({ kind: 'mn', text: ctx.mentorLine(st, 'fraud', { name: s.n, amount: ctx.fmtM(loss) }) || `נמצאה הונאה ב${s.n}: ${ctx.fmtM(loss)} נעלמו. מנהל שאף אחד לא בדק.` }); }
      if (M.keep[s.c]) { M.local[s.c] = Math.round((M.local[s.c] || 0) + cf / Math.max(0.01, M.fx[s.c])); if (a) a.op.cf = 0; }
      else if (a) a.op.cf = remit(s, cf);
      if (a && a.debt > 0) { const d = debtPay(a); a.op.cf -= d.total; a.debt -= d.principal; s.debtPaid = (s.debtPaid || 0) + d.principal; }
      s.base = Math.round(s.base * (1 + MN.grow)); s.est = Math.round(s.est * (1 + MN.grow));
    }
    if (M.hq) { st.cash -= MN.hqMonthly; ctx.cashFx(out, -MN.hqMonthly, `המטה האזורי ${ctx.fmtM(MN.hqMonthly)}`); }
    const n = selfCount(st); if (n >= 3 && st.life && typeof st.life.energy === 'number') st.life.energy = clamp(st.life.energy - 3 * (n - 2), 0, 100); // burnout: every self-run sub beyond 2
    if (st.cash < 0) ctx.ensureCash(st, out, 'multinational');
    revalue(st);
  },
  asset: {
    create(st, a, card) { const op = card.op || {}; const M = MNS(st); let s = null;
      if (op.start != null) s = M.start[op.start] || null; else if (op.make) { s = newSub(st, op.make); M.subs.push(s); }
      a.op = { ck: 'sub', cf: 0 }; if (s) { s.sid = a.id; a.n = s.n; a.value = subValue(st, s); if (!M.keep[s.c]) a.op.cf = remit(s, subCf(st, s).cf) - debtPay(a).total; } },
    cf(st, a) { return a.op && a.op.ck === 'sub' ? a.op.cf || 0 : Math.round((a.cf || 0) / 10) * 10; },
  },
  worth(st) { const M = MNS(st); let v = 0; for (const c of CIDS) v += (M.local[c] || 0) * M.fx[c]; return Math.round(v); },
  market: {
    create(st, p) { const c = p.card; const M = MNS(st); const m = st.month; const pick = CIDS[m % CIDS.length];
      if (c.mk === 'port') { M.dis[pick] = m + MN.disMonths - 1; p.c = pick; }
      if (c.mk === 'fxcrisis') { const top = CIDS.slice().sort((x, y) => M.fx[y] - M.fx[x] || CIDS.indexOf(x) - CIDS.indexOf(y))[0]; M.fx[top] = round3(Math.max(MN.fxLo, M.fx[top] * MN.crisis)); p.c = top; }
      if (c.mk === 'tariff') { M.mods.push({ sup: pick, f: 0.85, until: m + 5 }); p.c = pick; }
      if (c.mk === 'election') { M.ph[pick] = (M.ph[pick] + 12) % 24; p.c = pick; }
      if (c.mk === 'shipping') { M.mods.push({ c: '*', f: 0.92, until: m + 2 }); }
      if (c.mk === 'boom') { const b = CIDS[(m + 2) % CIDS.length]; M.mods.push({ c: b, f: 1.12, until: m + 5 }); p.c = b; }
      if (c.mk === 'poach') { const s = M.subs.filter((x) => x.mgr && !x.self).sort((x, y) => y.mgr.comp - x.mgr.comp || x.slot - y.slot)[0]; if (s) { s.mgr = null; p.hit = s.sid; } }
    },
    describe(st, p, ev) { const c = p.card; ev.data.mn = { mk: c.mk, country: p.c || null, countryName: p.c ? CO(p.c).n : null, hit: p.hit ? (subOf(st, p.hit) || {}).n || null : null }; },
  },
  crisis: {
    create(st, p) { const c = p.card; const M = MNS(st); const m = st.month;
      if (c.mk === 'fine') { let tot = 0; for (const s of M.subs) if (s.mgr && !s.self && s.mgr.integ < 0.5) { const f = r1000(2 * Math.max(0, (s.last ? s.last.cf : 0))); tot += f; s.mgr.iHi = Math.min(s.mgr.iHi, 0.5); s.mgr.iLo = Math.min(s.mgr.iLo, 0.5); }
        if (tot) { st.cash -= tot; p.hit = tot; } }
      if (c.mk === 'strike') { const k = CIDS[(m + 3) % CIDS.length]; M.mods.push({ c: k, f: 0.7, until: m + 1 }); p.c = k; }
    },
  },
  tiles: {
    Z: {
      safe: 'pass',
      create(st, ctx) {
        const rs = []; for (let i = 0; i < DRAWS.landing.Z; i++) rs.push(ctx.draw(st)); // exactly 4 'world' draws on every landing
        const M = MNS(st); const ti = Math.floor(frac(rs[0] * 13) * TEMPLATES.length); const t = TEMPLATES[ti]; const size = (MN.maxSize[0] + (MN.maxSize[1] - MN.maxSize[0]) * frac(rs[0] * 101)) * (1 + st.month / 60); // bigger deals as the years pass (I6)
        const est = r1000(t.base * size); const q = 0.55 + 0.7 * rs[1]; const base = Math.round(est * q); const fx = M.fx[t.c];
        const price = r100k(MN.mult * est * fx * (st.charId === 'pe' ? 0.9 : 1) * (0.95 + 0.2 * frac(rs[0] * 211)));
        const br = range(base / est, 0.25, 2 * frac(rs[1] * 31), 0.3, 2);
        return { wr: rs, item: { t: ti, est, price, lo: r1000(est * br.lo), hi: r1000(est * br.hi), dd: false, sealed: { base, comp: round3(0.85 * rs[2]), integ: round3(0.2 + 0.8 * rs[3]), j: rs[1] } } };
      },
      describe(st, p, ev, ctx) {
        const M = MNS(st); const it = p.item; const t = TEMPLATES[it.t]; const C = CO(t.c); const fx = M.fx[t.c]; const down = r100k(it.price * MN.down); const mg = mgrFrom(it.sealed.comp, it.sealed.integ, it.sealed.j, false);
        const mr = it.dd ? { cLo: it.cLo, cHi: it.cHi, iLo: it.iLo, iHi: it.iHi } : { cLo: mg.cLo, cHi: mg.cHi, iLo: mg.iLo, iHi: mg.iHi }; const wage = mg.wage;
        const fair = (b) => r100k(MN.mult * b * (MN.mgrLo + MN.mgrSpan * (mr.cLo + mr.cHi) / 2) * fx - MN.mult * wage);
        const local = M.local[t.c] || 0; const fee = MN.auditFee * (st.charId === 'pe' ? 0.5 : 1) * (M.erp ? 0.5 : 1); const full = M.subs.length >= SLOTS;
        const budget = Math.max(0, st.cash + Math.round(local * fx) + Math.max(0, ctx.loanCap(st) - st.loans) - reserveOf(st, ctx));
        ev.tag = 'הצעת רכישה'; ev.title = `${t.n} · ${C.n}`;
        ev.text = `${t.d} רווח של ${ctx.fmtM(r1000(it.lo * fx))}–${ctx.fmtM(r1000(it.hi * fx))} בחודש לפני שכר המנהל. המחיר: ${ctx.fmtM(it.price)} (ה${C.ccy} ב־${Math.round(fx * 100)}% מהממוצע).`;
        ev.mentor = it.dd ? ctx.mentorLine(st, 'acqDd', {}) || 'הבדיקה צמצמה את הטווח. עכשיו השאלה פשוטה: המחיר מתחת לשווי — או לא?' : ctx.mentorLine(st, 'acqAsk', {}) || 'טווח רחב: אף אחד לא יודע כמה החברה באמת מרוויחה, ומי המנהל שמגיע איתה. בדיקה עולה כסף — ניחוש עולה יותר.';
        ev.data = { country: t.c, countryName: C.n, ccy: C.ccy, fx, wht: C.wht, kind: t.kind, supplier: t.sup, supplierName: CO(t.sup).n, est: it.est, lo: it.lo, hi: it.hi, loNis: r1000(it.lo * fx), hiNis: r1000(it.hi * fx), price: it.price, down, acqLoan: it.price - down, loanMonthly: Math.round((it.price - down) * (MN.debtPct + MN.amort)),
          fairLo: fair(it.lo), fairHi: fair(it.hi), mgr: { ...mr, wage }, dd: it.dd, fee, localCash: Math.round(local * fx), slotsFree: SLOTS - M.subs.length, budget,
          note: 'השווי בספרים: 32 חודשי רווח לפי מה שהחברה תרוויח בפועל — לא לפי המחיר ששילמת. מנהל שלא נבדק יכול להיות מצוין, או לגנוב.' };
        const F = ctx.loanFor(st, Math.max(0, down - Math.round(local * fx)));
        const loanM = Math.round((it.price - down) * (MN.debtPct + MN.amort));
        ev.options = [ctx.opt('buy', `לקנות ב־${ctx.fmtM(it.price)} (${ctx.fmtM(down)} עכשיו, השאר הלוואה על החברה)`, !full && F.ok, { kind: 'buy', amount: down, price: it.price, acqLoan: it.price - down, loanAmount: F.need, reason: full ? 'אפשר להחזיק עד 6 חברות־בנות' : F.ok ? undefined : 'הבנק לא נותן הלוואה כזו',
          preview: { cash: -down, monthly: r1000((it.lo + it.hi) / 2 * fx * (1 - C.wht)) - wage - loanM, months: 0, risk: it.dd ? null : 'unknown' } }),
          ctx.opt('dd', `לבדוק קודם (${ctx.fmtM(fee)})`, !it.dd && st.cash >= fee, { kind: 'inspect', amount: fee, preview: { cash: -fee, monthly: 0, months: 0, risk: null } }), ctx.opt('pass', 'לוותר', true, { preview: { cash: 0, monthly: 0, months: 0, risk: null } })];
        const fits = !full && F.ok && !F.need && down <= budget;
        const pick = !fits ? 'pass' : !it.dd ? (st.cash >= fee ? 'dd' : 'pass') : fair((it.lo + it.hi) / 2) >= it.price && fair(it.lo) >= it.price * 0.85 ? 'buy' : 'pass';
        ev.options.find((o) => o.id === pick).primary = true; ev.forcePrimary = pick;
      },
      choose(st, p, o, params, out, ctx) {
        const M = MNS(st); const it = p.item; const t = TEMPLATES[it.t];
        if (o.id === 'pass') { ctx.logDecision(st, 'הצעת רכישה', 'ויתר'); return true; }
        if (o.id === 'dd') { const fee = MN.auditFee * (st.charId === 'pe' ? 0.5 : 1) * (M.erp ? 0.5 : 1); if (it.dd || st.cash < fee) return true; st.cash -= fee; ctx.cashFx(out, -fee, `בדיקת נאותות ${ctx.fmtM(fee)}`); it.dd = true; M.audits++;
          const b = range(it.sealed.base / it.est, 0.06, 2 * frac(it.sealed.j * 71), 0.3, 2); it.lo = r1000(it.est * b.lo); it.hi = r1000(it.est * b.hi);
          const cr = range(it.sealed.comp, 0.1, 2 * frac(it.sealed.j * 43)); const ir = range(it.sealed.integ, 0.15, 2 * frac(it.sealed.j * 89)); it.cLo = cr.lo; it.cHi = cr.hi; it.iLo = ir.lo; it.iHi = ir.hi;
          ctx.logDecision(st, 'הצעת רכישה', 'בדק'); return false; } // the card stays open: buy or pass
        if (M.subs.length >= SLOTS) return true;
        const fx = M.fx[t.c]; const down = r100k(it.price * MN.down); const loc = Math.min(Math.round((M.local[t.c] || 0) * fx), down); if (loc > 0) { M.local[t.c] = Math.round((M.local[t.c] || 0) - loc / fx); st.cash += loc; }
        const mg = mgrFrom(it.sealed.comp, it.sealed.integ, it.sealed.j, false); if (it.dd) Object.assign(mg, { cLo: it.cLo, cHi: it.cHi, iLo: it.iLo, iHi: it.iHi, aud: st.month });
        const card = { k: 'sub', n: t.n, d: t.d, cost: it.price, down, value: it.price, cf: 0, op: { ck: 'sub', make: { t: it.t, est: it.est, base: it.sealed.base, lo: it.lo, hi: it.hi, mgr: mg, paid: it.price } } };
        const a = ctx.buy(st, card, out, { label: t.n }); if (!a) { if (loc > 0) { st.cash -= loc; M.local[t.c] = Math.round((M.local[t.c] || 0) + loc / fx); } out.mentor = 'הבנק לא נתן הלוואה.'; return true; }
        ctx.logDecision(st, 'הצעת רכישה', 'קנה', it.price); return true;
      },
    },
  },
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) { const M = MNS(st); for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; const s = a ? M.subs.find((x) => x.sid === a.id) : null; if (!s) continue;
    m.country = s.c; m.kind2 = s.kind; m.self = s.self; m.managed = !!(s.mgr && !s.self); m.trust = s.mgr ? round2((s.mgr.iLo + s.mgr.iHi) / 2) : null; m.audited = !!(s.mgr && s.mgr.aud); m.disrupted = M.dis[s.sup] >= st.month; m.dual = s.dual; m.hedged = !!M.hedge[s.c]; m.supplier = s.sup; } },
  recapHint(st) { const M = MNS(st); if (!M) return null; if (M.frauds >= 2) return 'בפעם הבאה: לבדוק מנהלים. ביקורת עולה חצי מיליון — הונאה עולה חודשים של רווח.'; if (M.disN && M.subs.filter((s) => !s.dual).length >= 3) return 'בפעם הבאה: ספק שני. כשכל החברות קונות מאותו נמל, שיבוש אחד פוגע בכולן.'; if (selfCount(st) <= 1 && M.subs.length >= 3) return 'בפעם הבאה: לנהל בעצמך את החברות הגדולות. הקשב שלך הוא המשאב הכי יקר.'; return null; },
  goalValue(st, key) { const M = MNS(st); if (key === 'lastEvent:fraud') return M.fraudAt || 0; if (key === 'frauds') return M.frauds; return 0; },
};

const RES = (st, ctx) => reserveOf(st, ctx);
/** Investing in a sub: 4 months of its local profit (at today's rate) for +10 % profit (payback ≈ 40 months), once in 6 months. */
const growCost = (st, s) => r100k(MN.growCost * s.est * MNS(st).fx[s.c]);
multinational.act = {
  self(st, p, out, ctx) { const s = subOf(st, p); if (!s || s.self) return fail(out, 'bad_param'); if (selfCount(st) >= slotsOf(st)) return fail(out, 'אין לך עוד קשב פנוי');
    const sev = s.mgr ? MN.sever * s.mgr.wage : 0; if (st.cash < sev) return fail(out, 'אין מספיק מזומן לפיצויים'); st.cash -= sev; if (sev) ctx.cashFx(out, -sev, `פיצויים ${ctx.fmtM(sev)}`);
    s.mgr = null; s.self = true; out.toast = `את ${s.n} אתה מנהל עכשיו בעצמך.${sev ? ` המנהל קיבל ${ctx.fmtM(sev)} פיצויים.` : ''}`; return true; },
  hire(st, p, out, ctx) { const M = MNS(st); const s = subOf(st, p); if (!s || !M.cand) return fail(out, M.cand ? 'bad_param' : 'אין מועמד החודש'); const sev = s.mgr && !s.self ? MN.sever * s.mgr.wage : 0;
    if (st.cash < sev) return fail(out, 'אין מספיק מזומן לפיצויים'); st.cash -= sev; if (sev) ctx.cashFx(out, -sev, `פיצויים ${ctx.fmtM(sev)}`);
    s.mgr = { ...M.cand, gap: st.month + MN.gapMonths - 1 }; s.self = false; M.cand = null; out.toast = `מנהל חדש ל${s.n}. חודשיים של חפיפה — ואחר כך נראה מה הוא שווה.`; return true; },
  audit(st, p, out, ctx) { const M = MNS(st); const s = subOf(st, p); if (!s || !s.mgr || s.self) return fail(out, 'bad_param'); const fee = MN.auditFee * (st.charId === 'pe' ? 0.5 : 1) * (M.erp ? 0.5 : 1);
    if (st.cash < fee) return fail(out, 'אין מספיק מזומן'); st.cash -= fee; ctx.cashFx(out, -fee, `ביקורת ${ctx.fmtM(fee)}`); M.audits++;
    const j = frac(s.mgr.comp * 17 + s.mgr.integ * 29 + st.month * 0.137); const cr = range(s.mgr.comp, 0.1, 2 * frac(j * 31)); const ir = range(s.mgr.integ, 0.15, 2 * frac(j * 57));
    const again = s.mgr.aud && st.month - s.mgr.aud < 6; Object.assign(s.mgr, { drag: again ? st.month + 1 : s.mgr.drag || 0, cLo: Math.max(cr.lo, Math.min(s.mgr.cLo, cr.hi)), cHi: Math.min(cr.hi, Math.max(s.mgr.cHi, cr.lo)), iLo: Math.max(ir.lo, Math.min(s.mgr.iLo, ir.hi)), iHi: Math.min(ir.hi, Math.max(s.mgr.iHi, ir.lo)), aud: st.month });
    ctx.lesson(st, out, 'trust_verify'); out.toast = ctx.mentorLine(st, 'audited', { name: s.n }) || `הביקורת ב${s.n} הסתיימה: יכולת ${Math.round(s.mgr.cLo * 100)}–${Math.round(s.mgr.cHi * 100)}, יושרה ${Math.round(s.mgr.iLo * 100)}–${Math.round(s.mgr.iHi * 100)}.`; return true; },
  dual(st, p, out) { const s = subOf(st, p); if (!s) return fail(out, 'bad_param'); s.dual = !s.dual; out.toast = s.dual ? `${s.n} קונה עכשיו גם מספק שני: יקר יותר כל חודש, אבל שיבוש בנמל אחד כבר לא עוצר אותה.` : `${s.n} חזרה לספק אחד.`; return true; },
  hedge(st, p, out) { const M = MNS(st); if (!CIDS.includes(p)) return fail(out, 'bad_param'); if (M.hedge[p]) delete M.hedge[p]; else M.hedge[p] = { rate: M.fx[p], at: st.month }; revalue(st);
    out.toast = M.hedge[p] ? `גידור ל${CO(p).ccy}: השער ננעל ב־${Math.round(M.fx[p] * 100)}% וזז לאט (1/12 בחודש). עולה 0.5% מהרווח משם.` : `הגידור ל${CO(p).ccy} בוטל.`; return true; },
  keep(st, p, out) { const M = MNS(st); if (!CIDS.includes(p)) return fail(out, 'bad_param'); M.keep[p] = !M.keep[p]; out.toast = M.keep[p] ? `הרווח מ${CO(p).n} נשאר שם: בלי מס במקור, אבל חשוף לשער.` : `הרווח מ${CO(p).n} מועבר הביתה (מס במקור ${Math.round(CO(p).wht * 100)}%).`; return true; },
  repat(st, p, out, ctx) { const M = MNS(st); if (!CIDS.includes(p) || !(M.local[p] > 0)) return fail(out, 'אין כסף להעביר'); const gross = Math.round(M.local[p] * M.fx[p]); const net = Math.round(gross * (1 - CO(p).wht));
    M.local[p] = 0; st.cash += net; ctx.cashFx(out, net, '+' + ctx.fmtM(net)); ctx.lesson(st, out, 'trapped_cash'); out.toast = `${ctx.fmtM(net)} הגיעו הביתה מ${CO(p).n} (מס במקור ${ctx.fmtM(gross - net)}).`; return true; },
  sell(st, p, out, ctx) { const M = MNS(st); const s = subOf(st, p); if (!s) return fail(out, 'bad_param'); const a = subAsset(st, s); const v = Math.round(subValue(st, s) * MN.sellAt / 1000) * 1000;
    const debt = a ? a.debt : 0; M.subs.splice(M.subs.indexOf(s), 1); if (a) { st.assets.splice(st.assets.indexOf(a), 1); out.despawn.push('a' + a.id); } st.cash += v - debt; M.sold++; ctx.cashFx(out, v - debt, ctx.sgn(v - debt)); out.toast = `${s.n} נמכרה למתחרה ב־${ctx.fmtM(v)} (80% מהשווי)${debt ? `; ${ctx.fmtM(debt)} החזירו את ההלוואה שעליה` : ''}.`; return true; },
  grow(st, p, out, ctx) { const s = subOf(st, p); if (!s) return fail(out, 'bad_param'); if (s.grew && st.month - s.grew < MN.growEvery) return fail(out, 'השקעה אחת בחצי שנה'); const c = growCost(st, s);
    if (st.cash < c) return fail(out, 'אין מספיק מזומן'); st.cash -= c; s.grew = st.month; s.base = Math.round(s.base * (1 + MN.growUp)); s.est = Math.round(s.est * (1 + MN.growUp)); s.paid += c; ctx.cashFx(out, -c, `השקעה ב${s.n} ${ctx.fmtM(c)}`);
    out.toast = `${ctx.fmtM(c)} הושקעו ב${s.n}: הרווח צפוי לעלות ב־10% — אם המנהל שם יודע לנצל את זה.`; return true; },
  hq(st, p, out, ctx) { const M = MNS(st); if (M.hq) return fail(out, 'כבר יש מטה'); if (st.cash < MN.hq) return fail(out, 'אין מספיק מזומן'); st.cash -= MN.hq; M.hq = st.month; ctx.cashFx(out, -MN.hq, null); out.toast = `מטה אזורי: עוד חברה אחת שאפשר לנהל בעצמך. עולה ${ctx.fmtM(MN.hqMonthly)} בחודש.`; return true; },
  erp(st, p, out, ctx) { const M = MNS(st); if (M.erp) return fail(out, 'כבר יש מערכת'); if (st.cash < MN.erp) return fail(out, 'אין מספיק מזומן'); st.cash -= MN.erp; M.erp = st.month; ctx.cashFx(out, -MN.erp, null); out.toast = 'מערכת ERP: ביקורות בחצי מחיר והונאות קשות יותר (−30%).'; return true; },
  hub(st, p, out, ctx) { const M = MNS(st); if (M.hub) return fail(out, 'כבר יש מרכז'); if (st.cash < MN.hub) return fail(out, 'אין מספיק מזומן'); st.cash -= MN.hub; M.hub = st.month; ctx.cashFx(out, -MN.hub, null); out.toast = 'מרכז לוגיסטי: ספק שני עולה 2% במקום 4%.'; return true; },
};
function actionList(st, ctx) {
  const M = MNS(st); const out = []; const res = RES(st, ctx); const fee = MN.auditFee * (st.charId === 'pe' ? 0.5 : 1) * (M.erp ? 0.5 : 1); const free = slotsOf(st) - selfCount(st);
  const tot = M.subs.reduce((x, s) => x + Math.max(0, s.last ? s.last.cf : s.est), 0) || 1; const share = (c) => M.subs.filter((s) => s.c === c).reduce((x, s) => x + Math.max(0, s.last ? s.last.cf : s.est), 0) / tot;
  const bySize = M.subs.slice().sort((a, b) => b.est - a.est || a.slot - b.slot); const supN = (c) => M.subs.filter((s) => s.sup === c).length; let freeLeft = free;
  for (const s of bySize) {
    const g = s.mgr; const mid = g ? (g.cLo + g.cHi) / 2 : 0; const sev = g && !s.self ? MN.sever * g.wage : 0; const audOld = g && !s.self && (!g.aud || st.month - g.aud >= MN.auditMonths);
    if (!s.self) { const sug = freeLeft > 0 && st.cash >= sev + res && (!g || mid < 0.8 || g.iHi < 0.5); if (sug) freeLeft--; // free attention: run the biggest subs yourself
      out.push({ id: 'self', param: 's' + s.sid, label: `לנהל בעצמך את ${s.n}${sev ? ` (פיצויים ${ctx.fmtM(sev)})` : ''}`, enabled: free > 0 && st.cash >= sev, suggested: sug, preview: { cash: -sev, monthly: g ? g.wage : 0, months: 0, risk: null } }); }
    if (M.cand) out.push({ id: 'hire', param: 's' + s.sid, label: `למנות את המועמד ל${s.n} (שכר ${ctx.fmtM(M.cand.wage)})`, enabled: st.cash >= sev, preview: { cash: -sev, monthly: -M.cand.wage, months: 0, risk: 'unknown' },
      suggested: !s.self && freeLeft <= 0 && st.cash >= sev + res && M.cand.iLo >= 0.5 && (!g || g.iHi <= 0.45 || (M.cand.cLo + M.cand.cHi) / 2 - mid >= 0.3) });
    if (g && !s.self) out.push({ id: 'audit', param: 's' + s.sid, label: `ביקורת ב${s.n} (${ctx.fmtM(fee)})`, enabled: st.cash >= fee, suggested: audOld && st.cash >= fee + res && (g.iHi - g.iLo > 0.31 || g.iLo < 0.55), preview: { cash: -fee, monthly: 0, months: 0, risk: null } });
    out.push({ id: 'dual', param: 's' + s.sid, label: s.dual ? `לחזור לספק אחד ב${s.n}` : `ספק שני ל${s.n} (+${M.hub ? 2 : 4}% עלות)`, enabled: true, suggested: !s.dual && (supN(s.sup) >= 2 || s.est >= 1800000), preview: { cash: 0, monthly: -Math.round(s.base * (M.hub ? MN.hubCost : MN.dualCost)), months: 0, risk: null } });
    const gc = growCost(st, s); const canGrow = !(s.grew && st.month - s.grew < MN.growEvery);
    out.push({ id: 'grow', param: 's' + s.sid, label: `להשקיע ${ctx.fmtM(gc)} בצמיחה של ${s.n} (+10% רווח)`, enabled: canGrow && st.cash >= gc, suggested: canGrow && st.cash >= gc + 2 * res && (s.self || (g && g.cLo >= 0.4)), preview: { cash: -gc, monthly: Math.round(s.est * MN.growUp * MNS(st).fx[s.c]), months: 25, risk: null } });
    out.push({ id: 'sell', param: 's' + s.sid, label: `למכור את ${s.n} (${ctx.fmtM(Math.round(subValue(st, s) * MN.sellAt / 1000) * 1000)})`, enabled: true, suggested: st.cash < 0 && s === bySize[bySize.length - 1], preview: { cash: Math.round(subValue(st, s) * MN.sellAt), monthly: -(s.last ? s.last.cf : 0), months: 0, risk: null } });
  }
  for (const c of COUNTRIES) { const sh = share(c.id); const has = M.subs.some((s) => s.c === c.id);
    if (has || M.hedge[c.id]) out.push({ id: 'hedge', param: c.id, label: M.hedge[c.id] ? `לבטל גידור ל${c.ccy}` : `לגדר את ה${c.ccy} (0.5% מהרווח)`, enabled: true, suggested: M.hedge[c.id] ? sh < 0.1 || (c.tr >= 0 && M.fx[c.id] <= M.anc[c.id] * 0.97) : sh >= 0.15 && (c.tr < 0 || M.fx[c.id] >= M.anc[c.id] * 1.03), preview: { cash: 0, monthly: 0, months: 0, risk: null } });
    if (has) out.push({ id: 'keep', param: c.id, label: M.keep[c.id] ? `להעביר הביתה את הרווח מ${c.n}` : `להשאיר את הרווח ב${c.n} (בלי מס במקור)`, enabled: true, suggested: false, preview: { cash: 0, monthly: 0, months: 0, risk: null } });
    if ((M.local[c.id] || 0) > 0) out.push({ id: 'repat', param: c.id, label: `להעביר הביתה ${ctx.fmtM(Math.round(M.local[c.id] * M.fx[c.id]))} מ${c.n} (מס ${Math.round(c.wht * 100)}%)`, enabled: true, suggested: M.local[c.id] * M.fx[c.id] >= 5000000, preview: { cash: Math.round(M.local[c.id] * M.fx[c.id] * (1 - c.wht)), monthly: 0, months: 0, risk: null } }); }
  const managed = M.subs.filter((s) => s.mgr && !s.self).length;
  out.push({ id: 'hq', param: null, label: `מטה אזורי (${ctx.fmtM(MN.hq)} + ${ctx.fmtM(MN.hqMonthly)} בחודש, עוד קשב אחד)`, enabled: !M.hq && st.cash >= MN.hq, suggested: !M.hq && M.subs.length >= 5 && free <= 0 && st.cash >= MN.hq + 2 * res, preview: { cash: -MN.hq, monthly: -MN.hqMonthly, months: 0, risk: null } });
  out.push({ id: 'erp', param: null, label: `מערכת ERP (${ctx.fmtM(MN.erp)}: ביקורת בחצי, הונאות −30%)`, enabled: !M.erp && st.cash >= MN.erp, suggested: !M.erp && managed >= 3 && st.cash >= MN.erp + 2 * res, preview: { cash: -MN.erp, monthly: 0, months: 0, risk: null } });
  out.push({ id: 'hub', param: null, label: `מרכז לוגיסטי (${ctx.fmtM(MN.hub)}: ספק שני ב־2%)`, enabled: !M.hub && st.cash >= MN.hub, suggested: !M.hub && M.subs.filter((s) => s.dual).length >= 3 && st.cash >= MN.hub + 2 * res, preview: { cash: -MN.hub, monthly: 0, months: 0, risk: null } });
  return out;
}
function indicatorsOf(st, ctx) {
  const M = MNS(st); const tot = M.subs.reduce((x, s) => x + Math.max(0, s.last ? s.last.cf : 0), 0); const hedgedCf = M.subs.filter((s) => M.hedge[s.c]).reduce((x, s) => x + Math.max(0, s.last ? s.last.cf : 0), 0);
  const mg = M.subs.filter((s) => s.mgr && !s.self); const trust = mg.length ? round2(mg.reduce((x, s) => x + (s.mgr.iLo + s.mgr.iHi) / 2, 0) / mg.length) : 1;
  const rows = M.subs.slice().sort((a, b) => a.slot - b.slot).map((s) => ({ sid: 's' + s.sid, assetId: 'a' + s.sid, name: s.n, country: s.c, kind: s.kind, supplier: s.sup, self: s.self, dual: s.dual, cf: s.last ? s.last.cf : 0, eff: s.last ? s.last.eff : null,
    value: subValue(st, s), paid: s.paid, disrupted: M.dis[s.sup] >= st.month, frauds: s.frauds, mgr: s.mgr && !s.self ? { cLo: s.mgr.cLo, cHi: s.mgr.cHi, iLo: s.mgr.iLo, iHi: s.mgr.iHi, wage: s.mgr.wage, audited: s.mgr.aud || 0, gap: s.mgr.gap >= st.month, known: s.mgr.known } : null }));
  const table = COUNTRIES.map((c) => ({ id: c.id, name: c.n, ccy: c.ccy, fx: M.fx[c.id], fxChg: round3(M.fx[c.id] - 1), hedged: M.hedge[c.id] ? M.hedge[c.id].rate : null, keep: !!M.keep[c.id], local: Math.round((M.local[c.id] || 0) * M.fx[c.id]), wht: c.wht,
    disrupted: M.dis[c.id] >= st.month, subs: M.subs.filter((s) => s.c === c.id).length, links: M.subs.filter((s) => s.sup === c.id).length }));
  return {
    multinational: { slots: slotsOf(st), used: selfCount(st), subs: M.subs.length, maxSubs: SLOTS, frauds: M.frauds, fraudLoss: M.fraudLoss, audits: M.audits, disruptions: M.disN, sold: M.sold, hq: !!M.hq, erp: !!M.erp, hub: !!M.hub,
      hedgedShare: tot ? round2(hedgedCf / tot) : 0, trust, cand: M.cand ? { cLo: M.cand.cLo, cHi: M.cand.cHi, iLo: M.cand.iLo, iHi: M.cand.iHi, wage: M.cand.wage } : null, fixedMonth: fixedMonth(st), localCash: multinational.worth(st) },
    panel: {
      id: 'multinational', title: 'המפה והחברות־הבנות',
      gauges: [{ id: 'attention', label: 'קשב: חברות שאתה מנהל בעצמך', value: selfCount(st), ref: slotsOf(st), min: 0, max: slotsOf(st) }, { id: 'trust', label: 'אמון ממוצע במנהלים (לפי מה שנבדק)', value: trust, ref: 0.6, max: 1 },
        { id: 'hedged', label: 'רווח מגודר מול מטבע', value: tot ? round2(hedgedCf / tot) : 0, ref: 0.5, max: 1 }, { id: 'frauds', label: 'הונאות שנמצאו', value: M.frauds, ref: 0, min: 0, max: 6, cmp: 'le' }],
      table, rows, actions: actionList(st, ctx),
    },
  };
}
export default multinational;
