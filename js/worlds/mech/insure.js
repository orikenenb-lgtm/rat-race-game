// World mechanic `insure` — w18 חוף הסערות (CATALOG-25 §1.4 w18, §2.4; docs/full-upgrade/worlds/w18-storms.md). You run an insurer: five
// lines (car, coastal home, inland home, health, business interruption) priced against the market rate, a float invested in two liquidity
// classes, long-tail claims reserves with a sealed adequacy, reinsurance (quota share, excess-of-loss layers, a cat bond) and a solvency ratio
// the regulator watches. The distinct rule — an inverted cash cycle and a correlated tail: premiums arrive first, so growth FEELS profitable;
// the reserves booked for it may be short (revealed over 24 months), and a storm in the storm season (August–October, the `season` calendar
// idea) hits every coastal policy at once — on the same payday the risky part of the float falls.
//
// Contract (DESIGN §4.2): pure, deterministic, no engine import; only + − × ÷ and Math.round / min / max / floor / abs. Fixed 'world' draws:
// init 6 (the reserve adequacy · one sealed loss-ratio quality per line), every payday 8 (one claims draw per line · the storm · the float ·
// an event target), 'Z' landing 3 (the line, its sealed quality, size + price). `uses`: `portfolio` (the float's two liquidity classes and the
// forced sale) and `season` (the storm months) are re-implemented here — portfolio margins a loan and season is hotel-specific (w16 did the
// same). The insurer is one engine asset ('ins': value = your stake × the insurer's equity); its balance sheet lives in st.world.ins.
export const ID = 'insure';
export const LINES = Object.freeze(['car', 'coast', 'inland', 'health', 'bi']);
export const DRAWS = Object.freeze({ init: 1 + LINES.length, month: LINES.length + 3, landing: Object.freeze({ Z: 3 }) });
/** Lines (TUNE): market loss ratio, share of claims that is long-tail (reserved), storm weight (a storm costs weight × annual premium × severity). */
export const LN = Object.freeze({
  car: Object.freeze({ n: 'רכב', lr: 0.66, tail: 0.45, cat: 0.05 }),
  coast: Object.freeze({ n: 'דירות בחוף', lr: 0.39, tail: 0.1, cat: 0.6 }),
  inland: Object.freeze({ n: 'דירות בפנים הארץ', lr: 0.53, tail: 0.1, cat: 0.2 }),
  health: Object.freeze({ n: 'בריאות', lr: 0.73, tail: 0.2, cat: 0 }),
  bi: Object.freeze({ n: 'אובדן הכנסות לעסקים', lr: 0.47, tail: 0.5, cat: 0.3 }),
});
export const PRICES = Object.freeze([-0.1, -0.05, 0, 0.05, 0.1, 0.15]);
/** The previous management chased volume: car and coastal homes start 15 % under the market, inland homes and health 10 %, with no storm reinsurance. */
export const START_REL = Object.freeze({ car: -0.15, coast: -0.15, inland: -0.1, health: -0.1 });
export const RISK = Object.freeze({ low: 0.1, mid: 0.3, high: 0.5 });
/** TUNE: expenses, adverse selection (claims per policy × (1 + up × rel) above the market, (1 − down × rel) below), volume response, renewal speed,
 *  market growth, storm odds per storm month and severity, XoL retention / layer size (in storm-base units) and rates on line, the quota share,
 *  the float, the solvency formula, raise / dividend. */
export const IN = Object.freeze({ er: 0.2, fixed: 1000000, selUp: 0.6, selDown: 1.2, vol: 3, volMin: 0.3, volMax: 1.6, renew: 0.15, grow: 0.005,
  storm: Object.freeze([8, 9, 10]), pStorm: 0.2, sev0: 0.3, sev: 1.2, ret: 0.4, layer: 0.4, rol: Object.freeze([0.51, 0.29, 0.065]), hard: 1.6, hardM: 12, bond: 0.2, bondM: 36,
  qs: 0.3, comm: 0.22, runoff: 24, liq: 0.003, mu: 0.006, sig: 0.1, crash: 0.025, crashHit: 0.18, stormHit: 0.06, hair: 0.04, rebal: 0.2,
  reqP: 0.15, reqR: 0.1, reqC: 0.5, reqK: 0.1, pml: 1.4, regMin: 1, forceQs: 0.8, ban: 12, raise: 0.2, disc: 0.15, raiseEvery: 6, div: 0.25, seasoning: 12,
  inherit: 0.12, ddFee: 1500000, band: 0.12, ddBand: 0.03, bookPx: 0.12 });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round3 = (x) => Math.round(x * 1000) / 1000;
const I = (st) => st.world.ins;
const isAct = (st) => st.charId === 'actuary';
const isMut = (st) => st.charId === 'mutualChair';
const pk = (st) => (st.charId === 'topBroker' ? 0.95 : 1);
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
const selOf = (rel) => (rel >= 0 ? 1 + IN.selUp * rel : 1 - IN.selDown * rel);
const volOf = (rel) => clamp(1 - IN.vol * rel, IN.volMin, IN.volMax);
/** Annual gross premium of a line (its exposure at the market rate × your price). */
export const premOf = (st, k) => { const l = I(st).lines[k]; return Math.round(l.x * (1 + l.rel) * pk(st)); };
export const gwp = (st) => LINES.reduce((s, k) => s + premOf(st, k), 0);
/** The storm base: Σ storm weight × annual exposure — a storm costs base × severity (0.3–1.5). */
export const catBase = (st) => Math.round(LINES.reduce((s, k) => s + I(st).lines[k].x * LN[k].cat, 0));
/** The XoL recovery on a storm of `loss`: layer i covers [ret + i·layer, ret + (i+1)·layer] × the storm base. */
export function xolPays(st, loss) { const B = catBase(st); let p = 0; for (let i = 0; i < I(st).xol; i++) { const lo = (IN.ret + i * IN.layer) * B; p += clamp(loss - lo, 0, IN.layer * B); } return Math.round(p); }
const bondPays = (st, loss) => { const S = I(st); if (!(S.bondUntil > st.month)) return 0; const lo = IN.ret * S.bondB; return Math.round(clamp(loss - lo, 0, IN.layer * S.bondB)); };
/** The yearly price of the XoL layers now (hardened for 12 months after a storm or a reinsurance spike). */
export const xolCost = (st, n = I(st).xol) => { const B = catBase(st); let c = 0; for (let i = 0; i < n; i++) c += IN.rol[i] * IN.layer * B; return Math.round(c * (I(st).hardUntil > st.month ? IN.hard : 1)); };
/** The loss ratio a player can know: the market one blended into the sealed truth as the book seasons (12 months), or the truth (the actuary / due diligence). */
export function lrShown(st, k) { const l = I(st).lines[k]; const t = LN[k].lr * l.q; if (isAct(st)) return round3(t); const w = Math.min(1, (st.month - I(st).m0) / IN.seasoning); return round3(LN[k].lr + (t - LN[k].lr) * w); }
export const eqOf = (st) => I(st).inv - I(st).res;
export const ownerEquity = (st) => r1000(Math.max(0, eqOf(st)) * I(st).stake);
function netPml(st) { const L = catBase(st) * IN.pml; return Math.max(0, L - xolPays(st, L) - bondPays(st, L)) * (1 - I(st).qs); }
export const required = (st) => { const S = I(st); return Math.round((IN.reqP * gwp(st) * (1 - S.qs) + IN.reqR * S.res + IN.reqC * netPml(st) + IN.reqK * S.rk) * (S.regRule > st.month ? 1.15 : 1)); };
export const solvency = (st) => { const r = required(st); return r > 0 ? round3(eqOf(st) / r) : 9; };
/** The 12-month combined ratio (claims incl. reserve development and storms + expenses + reinsurance) ÷ net earned premium; 9 with no premium. */
export const combined12 = (st) => { const h = I(st).ring; const p = h.reduce((s, x) => s + x.p, 0); const c = h.reduce((s, x) => s + x.c, 0); return p > 0 ? round3(c / p) : 9; };
export const inStorm = (st, ctx) => IN.storm.includes(ctx.calOf(st));
function revalue(st) { for (const a of st.assets) if (a.op && a.op.ck === 'ins') { a.value = ownerEquity(st); a.debt = 0; } }
/** Pay `amt` out of the float: the liquid class first, then the risky class sold at a 4 % haircut (a forced sale). */
function payOut(st, amt) { const S = I(st); S.inv -= amt; const liq = S.inv - S.rk; if (liq < 0 && S.rk > 0) { const sell = Math.min(S.rk, Math.round(-liq / (1 - IN.hair))); S.rk -= sell; S.inv -= Math.round(sell * IN.hair); S.forced++; } }
function storm(st, sev, w, out, ctx, label) {
  const S = I(st); const B = Math.round(LINES.reduce((s, k) => s + S.lines[k].x * LN[k].cat * (w ? w[k] || 0 : 1), 0)); const gross = Math.round(B * sev);
  const rec = w ? 0 : xolPays(st, gross) + bondPays(st, gross); const net = Math.round((gross - rec) * (1 - S.qs)); payOut(st, net);
  S.cats++; S.catLoss += net; if (!w) { S.hardUntil = st.month + IN.hardM; S.rk = Math.round(S.rk * (1 - IN.stormHit)); S.inv -= Math.round(S.rk * IN.stormHit / (1 - IN.stormHit)); }
  ctx.lesson(st, out, 'correlated_tail');
  out.news.push({ kind: 'ins', text: ctx.mentorLine(st, 'stormHit', { label, amount: ctx.fmtM(gross), net: ctx.fmtM(net) }) || `${label}: נזק של ${ctx.fmtM(gross)} לבתים ולעסקים שביטחת. אחרי ביטוח המשנה: ${ctx.fmtM(net)} יוצאים מהקופה.` });
  return net;
}

export const insure = {
  id: ID, draws: DRAWS, uses: ['portfolio', 'season'],
  lessons: ['correlated_tail', 'combined_ratio'],
  mentorKeys: ['stormHit', 'stormSeason', 'regulator', 'hard', 'crash', 'offerAsk', 'offerBuy', 'offerPass'],
  sealed: ['world.ins.adq', 'world.ins.lines.car.q', 'world.ins.lines.coast.q', 'world.ins.lines.inland.q', 'world.ins.lines.health.q', 'world.ins.lines.bi.q', 'world.ins.resT', 'pending.wr', 'pending.item.q'],

  init(st, w, ch, ctx) {
    const rs = []; for (let i = 0; i < DRAWS.init; i++) rs.push(ctx.draw(st)); // exactly 6 'world' draws at init, whoever plays
    const S0 = (ch && ch.start) || {}; const G = S0.gwp || 1e9; const mix = S0.mix || { car: 0.3, coast: 0.15, inland: 0.2, health: 0.2, bi: 0.15 };
    const lines = {}; LINES.forEach((k, i) => { const x = r1000(G * (mix[k] || 0)); const r0 = (S0.rel || START_REL)[k] || 0; lines[k] = { x, base: x, rel: r0, nrel: r0, q: round3(0.92 + 0.16 * rs[1 + i]), stop: 0, mix: 1, last: 0 }; });
    const eq = S0.equity || 400e6; const res = r1000(G * 0.3); const adq = round3(0.94 + 0.2 * rs[0]);
    st.world.ins = { lines, m0: st.month, inv: eq + res, res, resT: Math.round(res * (adq + IN.inherit)), adq, rk: Math.round((eq + res) * RISK.mid), risk: 'mid', stake: 1, qs: 0, xol: S0.xol ?? 0, hardUntil: 0, bondUntil: 0, bondB: 0, regRule: 0,
      ring: [], p12: [], last: null, regAt: 0, regs: 0, ban: 0, cats: 0, catLoss: 0, forced: 0, raised: 0, raiseAt: -99, divAt: -99, insolv: 0, bought: 0, evR: 0, hit: 0 };
  },
  defaults(st) { const S = I(st); if (!S) return; if (!Array.isArray(S.ring)) S.ring = []; if (!Array.isArray(S.p12)) S.p12 = []; },

  monthly(st, out, ctx) {
    const S = I(st); const rs = []; for (let i = 0; i < DRAWS.month; i++) rs.push(ctx.draw(st)); // exactly 8 'world' draws every payday
    const pays = st.stats.paydays; S.evR = rs[LINES.length + 2]; const ban = S.ban >= pays;
    // 1. renewals: exposure moves 15 % a month toward the market's demand at your price (the market itself grows 0.5 % a month); the risk mix follows
    for (const k of LINES) { const l = S.lines[k]; if (isMut(st)) l.rel = l.nrel; l.base = r1000(l.base * (1 + IN.grow)); const tgt = l.stop ? 0 : l.base * volOf(l.rel) * (ban ? 0.7 : 1) * (st.charId === 'topBroker' ? 1.4 : 1);
      l.x = r1000(l.x + (tgt - l.x) * IN.renew); l.mix = round3(l.mix + (selOf(l.rel) - l.mix) * IN.renew); }
    // 2. premiums in, attritional claims (one draw per line): paid now, or reserved at the booked estimate (the true cost × the sealed adequacy)
    const qs = S.qs; let gp = 0, paid = 0, booked = 0, bookedT = 0;
    LINES.forEach((k, i) => { const l = S.lines[k]; const p = premOf(st, k) / 12; const a = l.x / 12 * LN[k].lr * l.q * l.mix * (0.6 + 0.8 * rs[i]); gp += p; paid += a * (1 - LN[k].tail); booked += a * LN[k].tail; l.last = Math.round(a); });
    const under = LINES.reduce((s, k) => s + Math.max(0, -S.lines[k].rel) * S.lines[k].x, 0) / Math.max(1, LINES.reduce((s, k) => s + S.lines[k].x, 0));
    const adqNow = S.adq + under * 2; bookedT = booked * adqNow; // growth bought with a low price is reserved short
    gp = Math.round(gp); const ceded = Math.round(gp * qs); const comm = Math.round(ceded * IN.comm); const exp = Math.round(gp * IN.er + IN.fixed);
    const npaid = Math.round(paid * (1 - qs)); const nbook = Math.round(booked * (1 - qs)); const nbookT = Math.round(bookedT * (1 - qs));
    const reinsM = Math.round(xolCost(st) / 12);
    S.inv += gp - ceded + comm - exp - reinsM; payOut(st, npaid); S.res += nbook; S.resT += nbookT;
    // 3. the reserves run off over 24 months: the true cost is paid, the booked one released — the difference is the reserve's development
    const payT = Math.round(S.resT / IN.runoff), payB = Math.round(S.res / IN.runoff); S.resT -= payT; S.res -= payB; payOut(st, payT); const dev = payT - payB;
    // 4. the storm (live only in the storm months; 1 draw) — every coastal policy at once, and the risky float falls the same payday
    let cat = 0; const season = inStorm(st, ctx); if (season && rs[LINES.length] < IN.pStorm) cat = storm(st, IN.sev0 + IN.sev * frac(rs[LINES.length] * 97.31), null, out, ctx, 'סערה בחוף');
    else if (season && ctx.calOf(st) === IN.storm[0]) out.news.push({ kind: 'ins', text: ctx.mentorLine(st, 'stormSeason', {}) || 'עונת הסערות התחילה. כמה מהחוף מבוטח אצלך — ומי מבטח אותך?' });
    // 5. the float (1 draw): the liquid class earns 0.3 % a month; the risky class 0.6 % ± 5 %, or a crash (−18 %) on 2.5 % of paydays
    const rf = rs[LINES.length + 1]; const rr = rf < IN.crash ? -IN.crashHit : IN.mu + (rf - 0.5) * IN.sig; const ret = Math.round((S.inv - S.rk) * IN.liq + S.rk * rr); S.inv += ret; S.rk = Math.max(0, Math.round(S.rk * (1 + rr)));
    if (rf < IN.crash) out.news.push({ kind: 'ins', text: ctx.mentorLine(st, 'crash', {}) || 'קריסה בשוק ההון: החלק המסוכן של כספי הפוליסות ירד ב־18%.' });
    S.rk = Math.max(0, Math.round(S.rk + (Math.max(0, S.inv) * RISK[S.risk] - S.rk) * IN.rebal));
    // 6. the month's result and the 12-month combined ratio
    const np = gp - ceded; const cost = npaid + nbook + dev + cat + exp - comm + reinsM + (S.xc || 0); S.xc = 0; /* xc: floods and fraud since the last payday */ const profit = np - cost + ret; S.ring.push({ p: np, c: cost }); while (S.ring.length > 12) S.ring.shift();
    S.p12.push(profit); while (S.p12.length > 12) S.p12.shift(); S.last = { gp, np, paid: npaid, booked: nbook, dev, cat, exp: exp - comm, reins: reinsM, ret, profit };
    if (combined12(st) > 1 && S.ring.length >= 6) ctx.lesson(st, out, 'combined_ratio');
    // 7. capital: equity ≤ 0 → the regulator takes the insurer; solvency < 1 → a 12-payday ban on dividends and growth; < 0.8 → a forced quota share
    const sv = solvency(st);
    if (eqOf(st) <= 0) { st.flags.bankrupt = true; S.insolv = 1; out.news.push({ kind: 'ins', text: 'ההון של חברת הביטוח נמחק. המפקח על הביטוח מינה מנהל מיוחד.' }); }
    else if (sv < IN.regMin) { if (S.regAt !== pays) S.regs++; S.regAt = pays; S.ban = pays + IN.ban; S.insolv = 1; if (sv < IN.forceQs && !S.qs) S.qs = IN.qs;
      out.news.push({ kind: 'ins', text: ctx.mentorLine(st, 'regulator', { pct: String(Math.round(sv * 100)) }) || `המפקח נכנס: כושר פירעון ${Math.round(sv * 100)}% (מתחת ל־100%). שנה בלי דיבידנד ובלי צמיחה${sv < IN.forceQs ? ', וחובה להעביר 30% מהסיכון למבטח משנה' : ''}.` }); }
    revalue(st);
  },
  asset: {
    create(st, a, card) { a.op = JSON.parse(JSON.stringify(card.op)); if (a.op.ck === 'ins') { a.value = ownerEquity(st); a.debt = 0; } },
    cf() { return 0; }, // the insurer keeps its profit (equity); dividends are paid by Z:dividend
  },
  market: {
    create(st, p) { const c = p.card; const S = I(st);
      if (c.mk === 'court') { const add = r1000(S.res * (c.pct || 0.08)); S.res += add; S.resT += Math.round(add * S.adq); }
      if (c.mk === 'spike') S.hardUntil = Math.max(S.hardUntil, st.month + IN.hardM);
      if (c.mk === 'rule') S.regRule = st.month + 24;
      if (c.mk === 'crash') { const h = Math.round(S.rk * (c.pct || 0.15)); S.rk -= h; S.inv -= h; }
      if (c.mk === 'grow') { const l = S.lines[c.line]; if (l) l.base = r1000(l.base * 1.1); }
      revalue(st); },
    describe(st, p, ev) { const S = I(st); ev.data.insure = { mk: p.card.mk, line: p.card.line || null, solvency: solvency(st), hard: S.hardUntil > st.month }; },
  },
  crisis: {
    create(st, p, ctx) { const c = p.card; const S = I(st);
      if (c.mk === 'flood') S.xc = (S.xc || 0) + (p.hit = storm(st, c.sev || 0.6, { inland: 1, bi: 0.5 }, { news: [] }, ctx, 'שיטפון בפנים הארץ')); // the card's own text tells the story
      if (c.mk === 'fraud') { const k = LINES[Math.floor(S.evR * LINES.length) % LINES.length]; const amt = r1000(premOf(st, k) * (c.pct || 0.04)); payOut(st, amt); S.xc = (S.xc || 0) + amt; p.hit = amt; p.line = k; }
      revalue(st); },
  },
  tiles: {},
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) { const S = I(st); for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op || a.op.ck !== 'ins') continue;
    m.lines = LINES.map((k) => ({ line: k, prem: premOf(st, k), rel: S.lines[k].rel, stop: !!S.lines[k].stop })); m.solvency = solvency(st); m.xol = S.xol; m.qs = S.qs; m.bond = S.bondUntil > st.month; m.stormSeason = IN.storm.includes(((st.month - 1) % 12) + 1); m.cats = S.cats; } },
  recapHint(st) { const S = I(st); if (!S) return null; if (S.cats && S.xol === 0) return 'בפעם הבאה: סערה פוגעת בכל החוף ביחד. ביטוח משנה על הזנב — לפני עונת הסערות, כשהוא זול.'; if (S.regs) return 'בפעם הבאה: פרמיה שנכנסת היום היא לא רווח. מחיר נמוך מביא לקוחות — ותביעות שמגיעות אחר כך.'; if (combined12(st) > 1) return 'בפעם הבאה: יחס משולב מעל 100% אומר שהביטוח עצמו מפסיד. ריבית על הכסף לא מכסה את זה לאורך זמן.'; return null; },
  goalValue(st, key) { const S = I(st); if (key === 'solvency') return solvency(st); if (key === 'combined12') return combined12(st); if (key === 'equity') return ownerEquity(st); if (key === 'lastEvent:regulator') return S.regAt || 0; return 0; },
};

/* ---------------------------------------------------------------- 'Z' — a book of policies for sale */
const bookPrice = (st, it) => r1000(it.size * IN.bookPx * it.pf);
insure.tiles.Z = {
  safe: 'pass',
  create(st, ctx) { const rs = [ctx.draw(st), ctx.draw(st), ctx.draw(st)]; // exactly 3 'world' draws on every Z landing
    const k = LINES[Math.floor(rs[0] * LINES.length) % LINES.length]; return { wr: rs, item: { k, q: round3(0.85 + 0.35 * rs[1]), j: round3(frac(rs[1] * 13.7)), size: r1000(gwp(st) * (0.08 + 0.12 * rs[2])), pf: round3(0.9 + 0.3 * frac(rs[2] * 11)) }, checked: false }; },
  describe(st, p, ev, ctx) {
    const it = p.item; const S = I(st); const k = it.k; const price = bookPrice(st, it);
    const w = p.checked ? IN.ddBand : IN.band; const lo = round3(it.q - 2 * w * it.j); const band = isAct(st) ? { lo: it.q, hi: it.q } : p.checked ? { lo, hi: round3(lo + 2 * w) } : { lo: round3(1 - IN.band), hi: round3(1 + IN.band) };
    const mid = (band.lo + band.hi) / 2; const lr = round3(LN[k].lr * mid); const prof = Math.round(it.size * (1 - IN.er - lr * S.lines[k].mix - 0.45 * LN[k].cat));
    ev.tag = 'תיק פוליסות למכירה'; ev.title = `תיק ${LN[k].n} למכירה`;
    ev.text = `מבטח קטן מוכר תיק ${LN[k].n}: פרמיה שנתית ${ctx.fmtM(it.size)}. יחס התביעות המשוער: ${Math.round(lr * 100)}%. המחיר: ${ctx.fmtM(price)}.`;
    ev.mentor = ctx.mentorLine(st, 'offerAsk', {}) || 'כמה מהפרמיה תחזור כתביעות — ומה זה עושה לכושר הפירעון?';
    const after = round3(eqOf(st) - price) / Math.max(1, required(st) + IN.reqP * it.size + IN.reqC * IN.pml * it.size * LN[k].cat);
    ev.data = { kind: 'book', line: k, size: it.size, price, lrMult: band, lr, yearProfit: prof, checked: !!p.checked, checkFee: IN.ddFee, solvency: solvency(st), solvencyAfter: round3(after), storm: LN[k].cat };
    const can = eqOf(st) - price > 0 && S.ban < st.stats.paydays;
    ev.options = [...(p.checked || isAct(st) ? [] : [ctx.opt('check', `בדיקת נאותות (${ctx.fmtM(IN.ddFee)})`, true, { kind: 'inspect', preview: { cash: 0, monthly: 0, months: 0, risk: null }, note: 'מקופת החברה' })]),
      ctx.opt('buy', `לקנות (${ctx.fmtM(price)})`, can, { kind: 'buy', preview: { cash: 0, monthly: 0, months: 12, risk: 'sealed:lr' }, note: 'מקופת החברה', reason: can ? undefined : 'המפקח אסר צמיחה' }),
      ctx.opt('pass', 'לוותר', true, { preview: { cash: 0, monthly: 0, months: 0, risk: null } })];
    const good = can && prof * 3 > price && after >= 1.3;
    ev.forcePrimary = !p.checked && !isAct(st) && can && prof * 3 > price * 0.8 && after >= 1.3 ? 'check' : good ? 'buy' : 'pass';
  },
  choose(st, p, o, params, out, ctx) {
    const S = I(st); const it = p.item; const k = it.k;
    if (o.id === 'pass') { out.mentor = ctx.mentorLine(st, 'offerPass', {}) || null; ctx.logDecision(st, 'תיק פוליסות', 'ויתר'); return true; }
    if (o.id === 'check') { S.inv -= IN.ddFee; p.checked = true; revalue(st); ctx.logDecision(st, 'תיק פוליסות', 'בדיקה'); return false; }
    const price = bookPrice(st, it); if (eqOf(st) - price <= 0) return true;
    const l = S.lines[k]; l.q = round3((l.q * l.x + it.q * it.size) / Math.max(1, l.x + it.size)); l.x += it.size; l.base += it.size; payOut(st, price); S.bought++; revalue(st); ctx.lesson(st, out, 'combined_ratio');
    out.mentor = ctx.mentorLine(st, 'offerBuy', {}) || null; ctx.logDecision(st, 'תיק פוליסות', 'קנה', price); return true;
  },
  score(st, ev) { return ev.options.filter((o) => o.enabled).map((o) => ({ id: o.id, U: o.primary ? 1 : 0, flags: [], reasons: [] })); },
};

/* ---------------------------------------------------------------- between-roll actions (`Z`) and the panel */
/** The guide's price for a line: the level with the best expected yearly underwriting result at the known loss ratio, net of the capital it ties up
 *  (dearer capital when solvency is thin). Sunk premiums and the float's income never enter it. */
export function bestPrice(st, k) { const S = I(st); const lr = lrShown(st, k); const lam = solvency(st) < 1.35 ? 0.35 : 0.06; let best = 0, bv = -Infinity;
  for (const r of PRICES) { const v = volOf(r) * ((1 + r) * pk(st) * (1 - IN.er) - lr * selOf(r) - 0.45 * LN[k].cat - lam * (IN.reqP * (1 + r) + IN.reqC * IN.pml * LN[k].cat)); if (v > bv + 1e-9) { bv = v; best = r; } } void S; return best; }
/** The guide's XoL depth: the fewest layers with which the biggest storm (severity 1.5) costs at most 60 % of equity. */
export function bestXol(st) { const S = I(st); const L = catBase(st) * (IN.sev0 + IN.sev); for (let n = 0; n <= 3; n++) { const net = (L - (n ? xolPaysN(st, L, n) : 0) - bondPays(st, L)) * (1 - S.qs); if (net <= 0.6 * Math.max(0, eqOf(st))) return n; } return 3; }
function xolPaysN(st, loss, n) { const B = catBase(st); let p = 0; for (let i = 0; i < n; i++) p += clamp(loss - (IN.ret + i * IN.layer) * B, 0, IN.layer * B); return p; }
insure.act = {
  price(st, p, out) { const [k, d] = String(p || '').split(':'); const v = +d; if (!LINES.includes(k) || !PRICES.includes(v)) return fail(out, 'bad_param'); const l = I(st).lines[k]; if ((isMut(st) ? l.nrel : l.rel) === v) return fail(out, 'כבר כך');
    l.nrel = v; if (!isMut(st)) l.rel = v; out.toast = `${LN[k].n}: מחיר ${v > 0 ? '+' : ''}${Math.round(v * 100)}% מול השוק${isMut(st) ? ' (מהחודש הבא — האסיפה צריכה לאשר)' : ''}`; return true; },
  runoff(st, p, out) { if (!LINES.includes(p)) return fail(out, 'bad_param'); const l = I(st).lines[p]; l.stop = l.stop ? 0 : 1; out.toast = l.stop ? `${LN[p].n}: לא מחדשים פוליסות (התיק נסגר בהדרגה)` : `${LN[p].n}: חוזרים למכור`; return true; },
  qs(st, p, out) { const S = I(st); if (S.qs && solvency(st) < IN.forceQs + 0.1) return fail(out, 'המפקח דורש את ביטוח המשנה'); S.qs = S.qs ? 0 : IN.qs; out.toast = S.qs ? 'ביטוח משנה יחסי: 30% מהפרמיות ומהתביעות עוברים למבטח המשנה' : 'ביטוח המשנה היחסי בוטל'; revalue(st); return true; },
  xol(st, p, out) { const n = +p; if (![0, 1, 2, 3].includes(n) || String(n) !== String(p)) return fail(out, 'bad_param'); const S = I(st); if (S.xol === n) return fail(out, 'כבר כך'); S.xol = n; out.toast = n ? `ביטוח משנה לסערות: ${n} שכבות (${Math.round(xolCost(st) / 1e6)} מיליון בשנה)` : 'בלי ביטוח משנה לסערות'; return true; },
  risk(st, p, out) { if (!RISK[p]) return fail(out, 'bad_param'); const S = I(st); if (S.risk === p) return fail(out, 'כבר כך'); S.risk = p; out.toast = `כספי הפוליסות: ${Math.round(RISK[p] * 100)}% בהשקעות מסוכנות`; return true; },
  catbond(st, p, out, ctx) { const S = I(st); if (S.bondUntil > st.month) return fail(out, 'כבר יש'); const B = catBase(st); const cost = r1000(IN.bond * IN.layer * B * IN.bondM / 12); if (eqOf(st) - cost <= 0) return fail(out, 'אין הון');
    S.bondUntil = st.month + IN.bondM; S.bondB = B; payOut(st, cost); revalue(st); out.toast = `אג"ח קטסטרופה: כיסוי לשלוש שנים במחיר קבוע (${ctx.fmtM(cost)})`; return true; },
  raise(st, p, out, ctx) { const S = I(st); const pays = st.stats.paydays; if (pays - S.raiseAt < IN.raiseEvery) return fail(out, 'גיוס אחד לחצי שנה'); const E = eqOf(st); if (E <= 0) return fail(out, 'אין הון'); const add = r1000(E * IN.raise); const d = isMut(st) ? 0 : IN.disc;
    S.stake = Math.round(S.stake * E / (E + add / (1 - d)) * 1e6) / 1e6; S.inv += add; S.raised++; S.raiseAt = pays; revalue(st); out.toast = `גייסת ${ctx.fmtM(add)}${d ? ` בהנחה של ${Math.round(d * 100)}%: החלק שלך ירד ל־${Math.round(S.stake * 100)}%` : ' מבעלי הפוליסות'}`; return true; },
  dividend(st, p, out, ctx) { const S = I(st); if (isMut(st)) return fail(out, 'בחברה הדדית אין דיבידנד'); if (S.ban >= st.stats.paydays) return fail(out, 'המפקח אסר דיבידנד'); if (st.stats.paydays - S.divAt < 12) return fail(out, 'פעם בשנה');
    const amt = r1000(Math.max(0, S.p12.reduce((a, b) => a + b, 0)) * IN.div * S.stake); if (amt < 1e6) return fail(out, 'אין רווח'); payOut(st, Math.round(amt / S.stake)); st.cash += amt; ctx.cashFx(out, amt, 'דיבידנד'); S.divAt = st.stats.paydays; revalue(st); out.toast = `דיבידנד: ${ctx.fmtM(amt)}`; return true; },
};
function actionList(st, ctx) {
  const S = I(st); const out = []; const sv = solvency(st); const pays = st.stats.paydays; const cal = ctx.calOf(st);
  for (const k of LINES) { const l = S.lines[k]; const cur = isMut(st) ? l.nrel : l.rel; const b = l.stop ? cur : bestPrice(st, k);
    for (const r of PRICES) if (r !== cur) out.push({ id: 'price', param: `${k}:${r}`, label: `${LN[k].n}: מחיר ${r > 0 ? '+' : ''}${Math.round(r * 100)}%`, enabled: true, suggested: r === b, line: k, rel: r });
    const lr = lrShown(st, k); out.push({ id: 'runoff', param: k, label: l.stop ? `${LN[k].n}: לחזור למכור` : `${LN[k].n}: להפסיק לחדש (תיק בסגירה)`, enabled: true, suggested: l.stop ? lr * selOf(0.15) / 1.15 + IN.er < 0.95 : lr * selOf(0.15) / (1.15 * pk(st)) + IN.er + 0.45 * LN[k].cat > 1.05, line: k }); }
  const bx = bestXol(st); for (let n = 0; n <= 3; n++) if (n !== S.xol) out.push({ id: 'xol', param: String(n), label: n ? `ביטוח משנה לסערות: ${n} שכבות (${ctx.fmtM(xolCost(st, n))} בשנה)` : 'בלי ביטוח משנה לסערות', enabled: true, suggested: n === bx, layers: n, cost: xolCost(st, n) });
  out.push({ id: 'qs', param: null, label: S.qs ? 'לבטל את ביטוח המשנה היחסי (30%)' : 'ביטוח משנה יחסי: 30% מהסיכון', enabled: !(S.qs && sv < IN.forceQs + 0.1), suggested: S.qs ? sv > 1.7 : sv < 1.15 });
  const rk = sv < 1.3 || (cal >= 7 && cal <= 9) ? 'low' : 'mid'; for (const r of Object.keys(RISK)) if (r !== S.risk) out.push({ id: 'risk', param: r, label: `השקעת כספי הפוליסות: ${Math.round(RISK[r] * 100)}% מסוכן`, enabled: true, suggested: r === rk });
  const bond = S.bondUntil > st.month; out.push({ id: 'catbond', param: null, label: `אג"ח קטסטרופה (3 שנים, ${ctx.fmtM(r1000(IN.bond * IN.layer * catBase(st) * IN.bondM / 12))})`, enabled: !bond && eqOf(st) > 0, suggested: !bond && S.hardUntil > st.month && S.xol > 0 && sv >= 1.2 });
  out.push({ id: 'raise', param: null, label: `גיוס הון (${ctx.fmtM(r1000(Math.max(0, eqOf(st)) * IN.raise))}${isMut(st) ? '' : ', בהנחה של 15%'})`, enabled: pays - S.raiseAt >= IN.raiseEvery && eqOf(st) > 0, suggested: pays - S.raiseAt >= IN.raiseEvery && sv < 1.05 && eqOf(st) > 0 });
  if (!isMut(st)) { const amt = r1000(Math.max(0, S.p12.reduce((a, b) => a + b, 0)) * IN.div * S.stake); out.push({ id: 'dividend', param: null, label: `דיבידנד (${ctx.fmtM(amt)})`, enabled: S.ban < pays && pays - S.divAt >= 12 && amt >= 1e6, suggested: S.ban < pays && pays - S.divAt >= 12 && amt >= 1e6 && st.cash < 0 }); }
  return out;
}
function indicatorsOf(st, ctx) {
  const S = I(st); const nw = ctx.netWorth(st); const goal = ((ctx.world(st).goal || {}).of || []).find((g) => g.type === 'nw') || {}; const sv = solvency(st); const cr = combined12(st);
  const rows = LINES.map((k) => { const l = S.lines[k]; return { line: k, name: LN[k].n, prem: premOf(st, k), rel: l.rel, next: l.nrel, stop: !!l.stop, lr: lrShown(st, k), lrMarket: LN[k].lr, tail: LN[k].tail, storm: LN[k].cat, claims: l.last, best: bestPrice(st, k) }; });
  return {
    insure: { equity: ownerEquity(st), stake: S.stake, netWorth: nw, target: goal.target || 0, solvency: sv, required: required(st), combined12: cr, gwp: gwp(st), float: S.inv, risky: S.rk, risk: S.risk, reserves: S.res, qs: S.qs, xol: S.xol, xolCost: xolCost(st), catBase: catBase(st),
      hard: S.hardUntil > st.month, bond: S.bondUntil > st.month ? S.bondUntil : 0, stormSeason: inStorm(st, ctx), cats: S.cats, catLoss: S.catLoss, regs: S.regs, ban: S.ban >= st.stats.paydays, forced: S.forced, raised: S.raised, bought: S.bought, last: S.last, insolvent: S.insolv },
    panel: { id: 'insure', title: 'חברת הביטוח', gauges: [{ id: 'nw', label: 'שווי נקי מול היעד', value: nw, ref: goal.target || 0, unit: '₪' }, { id: 'solvency', label: 'כושר פירעון', value: sv, ref: 1.2, min: 0, max: 3 },
      { id: 'combined', label: 'יחס משולב (12 חודשים)', value: cr, ref: 1, min: 0.6, max: 1.4, cmp: 'le' }], rows, actions: actionList(st, ctx) },
  };
}
export default insure;
