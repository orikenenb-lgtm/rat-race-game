// World mechanic `projects` — w8 מטרופולין הנדל"ן (docs/full-upgrade/worlds/w8-metropolis.md). Staged development: equity first, presales
// unlock the construction loan, sealed delays, capitalised interest; unfinished buildings count at cost.
//
// Contract (DESIGN §4.2): one object of optional hooks; pure and deterministic; NO engine import (helpers arrive in ctx); only + − × ÷ and
// Math.round / min / max / floor. Draws come ONLY from the `world` stream through ctx.draw, with FIXED counts declared in `draws`
// (tests/w8.test.mjs asserts them): 12 at init (the sealed fate of up to 3 starting projects / plots, 4 each — every character draws 12),
// 1 per payday (the month's buyer absorption), 4 per 'Q' (land) landing (permit months, overrun, build delay, contractor failure).
// The build itself is the shared staged-build core (mech/stages.js — reused by w9). This file adds what is real estate: units sold on paper
// (presales: a 20 % deposit now, the rest at completion; the loan draws only once presales reach the threshold), buyer demand that falls with
// the interest rate and the cycle, the contractor tier, the plan at completion (sell the remaining units or hold them as rentals), plots,
// the combination deal, and the recovery tools (partner, mezzanine, pause, sell to a rival).
import { newBuild, buildMonth, stageCost, monthCost, equityGap, costToComplete, pctDone, valueAtCost } from './stages.js';

export const ID = 'projects';
export const DRAWS = Object.freeze({ init: 12, month: 1, landing: Object.freeze({ Q: 4 }) });

export const PRESALE = Object.freeze({ req: 0.3, deposit: 0.2, base: 0.85, slope: 0.1, absorb: 0.07, targets: Object.freeze([0, 0.3, 0.4, 0.6, 1]) });
export const DEM = Object.freeze({ exp: 1.08, slow: 1.0, rec: 0.86, recov: 0.95 });
const RATE = Object.freeze({ start: 4.5, ref: 4.5, demand: 0.05, min: 1.5, max: 9, loan: 0.5 }); // annual policy rate %; construction loan = 0.5 %/mo + rate ÷ 12
export const CONTRACTOR = Object.freeze({ cheap: Object.freeze({ cost: 1, over: 0.35, failP: 0.35, label: 'קבלן זול' }), reliable: Object.freeze({ cost: 1.08, over: 0.08, failP: 0, label: 'קבלן אמין' }) });
const FAIL = Object.freeze({ cost: 0.2, months: 3 });
const PERMIT = Object.freeze({ min: 1, span: 7, devMult: 0.75, conMult: 1.15 }); // months 1–8 (sealed), the developer × 0.75, the contractor × 1.15
const DELAY = Object.freeze({ max: 6 });
const CHECK = Object.freeze({ fee: 150000, band: 2 });
const HOLD = Object.freeze({ rentYield: 0.0028, cap: 0.05, capRate: 0.5, mortgage: 0.5, spread: 1.5 }); // rent a month = 0.28 % of list; cap 5 %; half the loans stay as a mortgage
const SELL_RIVAL = 0.65;
const BANK = Object.freeze({ runs: 3 });
const HOLDING = Object.freeze({ land: 0.003, standby: 0.15 }); // a month: 0.3 % of the land while it waits for a permit; 15 % of the stage's month while the site stands
const PLOT_FAST = 0.8;
const PARTNER = 0.4;
const MEZZ = Object.freeze({ share: 0.1, add: 0.6 });
const COMBO = 0.7; // the developer's share of the units in a combination deal (the landowner keeps 30 %, builds nothing, pays nothing)
export const LAND_LTV = 0.5; // the bank finances half the land with the project (its interest is capitalised like the construction loan)
const CHAR = Object.freeze({ devPresale: 0.03, conCost: 0.85, conOver: 0.5, conPresale: -0.03 });
export const MAX_PROJECTS = 6;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r10 = (x) => Math.round(x / 10) * 10;
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;

const W = (st) => st.world;
const PJ = (st) => st.world.proj;
const projs = (st) => st.assets.filter((a) => a.op && a.op.ck === 'proj');
const rentals = (st) => st.assets.filter((a) => a.op && a.op.ck === 'rent');
const plots = (st) => st.assets.filter((a) => a.op && a.op.ck === 'plot');
const phaseOf = (st) => (st.econ && st.econ.phase) || 'slow';
const isDev = (st) => st.charId === 'developer';
const isCon = (st) => st.charId === 'contractor';
const isOwner = (st) => st.charId === 'landowner';
const findA = (st, id, ck) => { const n = +String(id || '').replace(/^a/, ''); return st.assets.find((x) => x.id === n && x.op && (!ck || x.op.ck === ck)) || null; };
function fail(out, msg) { out.ok = false; out.error = msg; return false; }

/** Monthly construction-loan rate (%), all-in. */
export const loanRate = (st) => round3(RATE.loan + PJ(st).rate / 12);
/** Buyer demand now: the cycle × the rate (each point above 4.5 % costs 5 %) × shocks. */
export function demandOf(st, month = st.month) {
  const P = PJ(st); let d = (DEM[phaseOf(st)] || 1) * (1 - RATE.demand * (P.rate - RATE.ref));
  for (const s of P.shocks) if (s.t === 'demand' && s.from <= month && s.until >= month) d *= s.v;
  return round3(clamp(d, 0.6, 1.3));
}
const charPresale = (st) => (isDev(st) ? CHAR.devPresale : isCon(st) ? CHAR.conPresale : 0);
/** Price of one unit sold on paper now (cheaper early: 85 % of list at the start, +10 % across the build) × demand × the character. */
export function presalePrice(st, a) { const o = a.op; return r1000(o.list * (PRESALE.base + PRESALE.slope * pctDone(o.sb)) * demandOf(st) * (1 + charPresale(st))); }
/** Price of a unit sold at completion. */
export const finalPrice = (st, a) => r1000(a.op.list * demandOf(st) * (1 + charPresale(st)));
const gateOf = (o) => (o.noPresale ? true : o.presold >= PRESALE.req * o.units - 1e-9);
/** Projected profit if completed on the public plan at today's demand (no sealed overrun, no delay): the card's and the panel's estimate. */
export function projected(st, a) {
  const o = a.op; const b = o.sb; const left = costToComplete(b);
  const unsold = o.units - o.presold - (o.comboUnits || 0);
  const rev = o.presoldRev + unsold * finalPrice(st, a);
  const months = Math.max(0, (b.phase === 'permit' ? Math.max(0, b.permitAt - st.month) : 0) + (b.stages - b.stage) * b.stageMonths - b.prog);
  const intr = Math.round((b.loan + left * 0.5) * loanRate(st) / 100 * months);
  return Math.round((rev - (b.land + b.spent + left) - b.interest - intr) * (1 - (o.partner || 0)) * (o.combo ? 1 - o.combo : 1));
}
function revalue(st, a) {
  const o = a.op;
  if (o.ck === 'proj') { a.value = r1000((valueAtCost(o.sb) + (o.sb.escrow || 0)) * (1 - (o.partner || 0))); a.debt = Math.round((o.sb.loan + (o.mezz || 0) + o.deposits) * (1 - (o.partner || 0))); }
  if (o.ck === 'rent') { const cap = Math.max(0.03, HOLD.cap + (PJ(st).rate - RATE.ref) / 100 * HOLD.capRate); a.value = r1000(o.noi * 12 / cap); }
}
const revalueAll = (st) => { for (const a of st.assets) if (a.op) revalue(st, a); };

/* ---------------------------------------------------------------- sealed fate (4 draws → a build record) */
function permitMonths(st, r) { let m = PERMIT.min + Math.floor(r * (PERMIT.span + 1)); if (isDev(st)) m = Math.round(m * PERMIT.devMult); if (isCon(st)) m = Math.round(m * PERMIT.conMult); return Math.max(1, m); }
function fateFrom(st, rs, site, tier) {
  const T = CONTRACTOR[tier]; const over = round3(rs[1] * T.over * (isCon(st) ? CHAR.conOver : 1));
  const failAt = rs[3] < T.failP ? Math.min(site.stages - 1, Math.floor(rs[3] / Math.max(1e-9, T.failP) * site.stages)) : -1;
  return { permit: permitMonths(st, rs[0]) + (site.permitAdd || 0), over, delay: Math.floor(rs[2] * (DELAY.max + 1)), delayAt: Math.min(site.stages - 1, Math.floor(((rs[2] * 977) % 1) * site.stages)), failAt };
}
/** Plan cost by tier and character (the contractor builds at −10 %). */
const planCost = (st, site, tier) => Math.round(site.cost * CONTRACTOR[tier].cost * (isCon(st) ? CHAR.conCost : 1));
function makeProject(st, site, tier, fate, extra = {}) {
  const sb = newBuild({ now: st.month, permitAt: st.month + (site.permitDone ? 0 : fate.permit), stages: site.stages, stageMonths: site.stageMonths, cost: planCost(st, site, tier), land: site.land, eqReq: site.eqReq,
    overrun: fate.over, delayAt: fate.delayAt, delay: fate.delay, failAt: fate.failAt, failCost: FAIL.cost, failMonths: FAIL.months, ...extra.sb });
  return { ck: 'proj', pk: site.pk, units: site.units, list: site.list, sb, presold: 0, presoldRev: 0, deposits: 0, target: 0, tier, plan: site.plan || 'sell', noPresale: !!site.noPresale, rentUnit: Math.round(site.list * HOLD.rentYield),
    permitShown: site.permitDone ? null : { lo: Math.max(1, fate.permit - (extra.checked ? CHECK.band : 99)), hi: fate.permit + (extra.checked ? CHECK.band : 99) }, partner: 0, mezz: 0, combo: 0, ...extra.op };
}

/* ---------------------------------------------------------------- the module */
export const projects = {
  id: ID, draws: DRAWS,
  lessons: ['staged_finance', 'presales', 'capitalised_interest', 'wip_at_cost', 'rate_demand'],
  mentorKeys: ['landAsk', 'landBuy', 'landPass', 'checked', 'permitIn', 'stalledEquity', 'stalledGate', 'delayed', 'contractorFail', 'completed', 'held'],
  sealed: ['pending.wr', 'pending.fate', 'assets[].op.sb.permitAt', 'assets[].op.sb.overrun', 'assets[].op.sb.delay', 'assets[].op.sb.delayAt', 'assets[].op.sb.failAt'],

  init(st, w, ch, ctx) {
    const rs = []; for (let i = 0; i < 12; i++) rs.push(ctx.draw(st)); // exactly 12 'world' draws at init, whoever plays
    W(st).proj = { rate: RATE.start, shocks: [], absorb: 1, stalls: 0, stallMonths: 0, completed: 0, profit: 0, squeeze: 0, fates: rs };
  },
  defaults(st) { const P = PJ(st); if (!P) return; if (!Array.isArray(P.shocks)) P.shocks = []; },

  monthly(st, out, ctx) {
    const P = PJ(st); const r = ctx.draw(st); // exactly 1 'world' draw every payday
    P.absorb = round3(0.7 + 0.6 * r);
    const rate = loanRate(st);
    for (const a of projs(st).slice()) {
      const o = a.op; const b = o.sb;
      // presales toward the target (the month's buyers are limited: absorption × demand)
      if (!o.noPresale && b.phase !== 'done' && o.presold < o.target * o.units) {
        const cap = Math.max(1, Math.round(o.units * PRESALE.absorb * demandOf(st) * P.absorb));
        const n = Math.min(cap, Math.ceil(o.target * o.units - o.presold), o.units - o.presold - (o.comboUnits || 0));
        if (n > 0) { const pr = presalePrice(st, a); const dep = Math.round(n * pr * PRESALE.deposit); o.presold += n; o.presoldRev += n * pr; o.deposits += dep; b.escrow = (b.escrow || 0) + dep; ctx.lesson(st, out, 'presales'); // the deposits go to the project's escrow (they pay stages before the loan), never to the owner's cash
          out.news.push({ kind: 'proj', text: `${a.n}: נמכרו ${n} דירות על הנייר. המקדמות (${ctx.fmtM(dep)}) נכנסות לחשבון הליווי של הפרויקט.`, assetId: 'a' + a.id }); }
      }
      b.gateOk = gateOf(o); b.selfFund = !!o.selfFund;
      const share = 1 - (o.partner || 0);
      const m = buildMonth(b, { month: st.month, cash: Math.max(0, st.cash) / share, rate });
      if (o.mezz) { const i = Math.round(o.mezz * (rate + MEZZ.add) / 100); o.mezz += i; }
      if (m.equityPaid) { const pay = Math.round(m.equityPaid * share); st.cash -= pay; ctx.cashFx(out, -pay, `הון עצמי ל${a.n} ${ctx.fmtM(pay)}`); ctx.lesson(st, out, 'staged_finance'); }
      if (m.interest) ctx.lesson(st, out, 'capitalised_interest');
      if (m.permitNow) { o.permitShown = null; out.news.push({ kind: 'proj', text: ctx.mentorLine(st, 'permitIn', { name: a.n }) || `${a.n}: ההיתר הגיע. מתחילים לבנות.`, assetId: 'a' + a.id }); }
      if (m.stalled === 'equity') { P.stalls++; out.news.push({ kind: 'proj', text: ctx.mentorLine(st, 'stalledEquity', { name: a.n }) || `${a.n} עומד: אין מזומן להון העצמי של השלב. הריבית ממשיכה לרוץ.`, assetId: 'a' + a.id }); }
      if (m.stalled === 'gate') { P.stalls++; out.news.push({ kind: 'proj', text: ctx.mentorLine(st, 'stalledGate', { name: a.n, pct: String(Math.round(PRESALE.req * 100)) }) || `${a.n} עומד: הבנק משחרר את הלוואת הבנייה רק אחרי ${Math.round(PRESALE.req * 100)}% מכירות מוקדמות.`, assetId: 'a' + a.id }); ctx.lesson(st, out, 'presales'); }
      if (m.stalled) P.stallMonths++;
      // holding costs in cash: land waiting for its permit pays property tax and fees; a stalled site pays the contractor's standby
      const hold = b.phase === 'permit' || m.stalled === 'permit' ? Math.round(b.land * HOLDING.land * share) : (m.stalled === 'equity' || m.stalled === 'gate' || m.stalled === 'paused') ? Math.round(monthCost(b) * HOLDING.standby * share) : 0;
      if (hold > 0) { st.cash -= hold; P.holding = (P.holding || 0) + hold; ctx.cashFx(out, -hold, `${b.phase === 'permit' ? 'מס ואגרות על הקרקע' : 'דמי המתנה לקבלן'} ${ctx.fmtM(hold)}`); }
      // a project stuck for money (equity call or the presale gate) BANK.runs months in a row: the bank calls the construction loan and a
      // rival developer buys the project at 65 % of its cost — the loss of an over-stretched developer (spec: "a rival buys your stalled project")
      if (m.stalled === 'equity' || m.stalled === 'gate') o.stallRun = (o.stallRun || 0) + 1; else if (m.progressed) o.stallRun = 0;
      if ((o.stallRun || 0) >= BANK.runs) { revalue(st, a); const offer = r1000(a.value * SELL_RIVAL); const net = offer - a.debt; st.cash += net; st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); P.forced = (P.forced || 0) + 1;
        ctx.cashFx(out, net, ctx.sgn(net)); out.news.push({ kind: 'proj', text: `הבנק קרא להלוואה של ${a.n}: ${BANK.runs} חודשים בלי כסף להמשיך. יזם מתחרה קנה אותו ב־${ctx.fmtM(offer)} — ${ctx.fmtM(net)} אחרי החובות.` }); ctx.lesson(st, out, 'staged_finance'); continue; }
      if (m.delayNow) out.news.push({ kind: 'proj', text: ctx.mentorLine(st, 'delayed', { name: a.n, months: String(b.delay) }) || `${a.n}: עיכוב של ${b.delay} חודשים באתר. הריבית רצה.`, assetId: 'a' + a.id });
      if (m.failedNow) out.news.push({ kind: 'proj', text: ctx.mentorLine(st, 'contractorFail', { name: a.n }) || `הקבלן של ${a.n} פשט רגל. קבלן חדש: ${Math.round(FAIL.cost * 100)}% יותר על השלבים שנשארו, וחודשיים בלי עבודה.`, assetId: 'a' + a.id });
      if (m.completed) complete(st, a, out, ctx);
    }
    // rentals: the mortgage rate follows the policy rate (their cf is the asset cash flow)
    P.shocks = P.shocks.filter((s) => s.until >= st.month);
    if (st.cash < 0) ctx.ensureCash(st, out, 'proj');
    revalueAll(st);
    if (projs(st).some((a) => a.op.sb.phase !== 'done' && a.op.sb.spent > 0) && st.stats.paydays >= 2) ctx.lesson(st, out, 'wip_at_cost');
  },

  asset: {
    create(st, a, card, ctx) {
      const op = JSON.parse(JSON.stringify(card.op)); a.op = op; a.cf = 0;
      const P = PJ(st);
      if (op.ck === 'proj' && !op.sb) { // a project from the character or the deck: a character's fate is its 4 init draws (fateIdx); a deck project's
        const site = op.site; // fate is public on the card (a distressed tower's overrun is already known) — no draw outside the declared counts
        const rs = op.fateIdx != null && P ? P.fates.slice(op.fateIdx * 4, op.fateIdx * 4 + 4) : (op.fate || [0.5, 0, 0, 0.99]);
        const f = fateFrom(st, rs, site, op.tier || 'reliable'); const pr = makeProject(st, site, op.tier || 'reliable', f, { sb: site.sb || {}, op: site.opx || {} });
        delete op.site; delete op.fate; delete op.fateIdx; Object.assign(op, pr);
      }
      if (op.ck === 'plot' && op.fateIdx != null && P) { op.fate = P.fates.slice(op.fateIdx * 4, op.fateIdx * 4 + 4); delete op.fateIdx; }
      revalue(st, a); void ctx;
    },
    cf(st, a, ctx) {
      const o = a.op;
      if (o.ck === 'rent') return r10(o.noi - Math.round(a.debt * (PJ(st).rate + HOLD.spread) / 1200)); // a held block: rent − the mortgage interest (policy rate + spread)
      return 0; // a project pays nothing until completion; its interest is capitalised into the loan
    },
  },
  deal: {
    describe(st, p, ev, ctx) {
      const c = p.card; if (!c.op) return;
      if (c.op.ck === 'proj' && c.op.site) { const s = c.op.site; ev.data.proj = { pk: s.pk, units: s.units, list: s.list, stages: s.stages, stageMonths: s.stageMonths, cost: s.cost, eqReq: s.eqReq, noPresale: !!s.noPresale, done: s.sb ? s.sb.stage || 0 : 0,
        note: s.noPresale ? 'בניין משרדים: אין מכירות מוקדמות. הבנק מממן נגד הון עצמי גבוה, ואחרי הסיום — שכירות.' : 'הפרויקט נמכר עם השלבים שכבר נבנו. ההון העצמי, ההיתר והקבלן — כמו בכל פרויקט.' }; }
      if (projs(st).length >= MAX_PROJECTS) for (const x of ev.options) if (x.kind === 'buy') { x.enabled = false; x.reason = 'יותר מדי פרויקטים פתוחים'; }
      void ctx;
    },
  },
  market: {
    create(st, p) {
      const c = p.card; const P = PJ(st); const m = st.month;
      if (c.mk === 'rate') P.rate = round2(clamp(P.rate + c.dr, RATE.min, RATE.max));
      if (c.mk === 'freeze') for (const a of projs(st)) if (a.op.sb.phase === 'permit') { a.op.sb.permitAt += c.months; if (a.op.permitShown) { a.op.permitShown.lo += c.months; a.op.permitShown.hi += c.months; } }
      if (c.mk === 'steel') for (const a of projs(st)) if (a.op.sb.phase === 'build') a.op.sb.overrun = round3(a.op.sb.overrun + c.pct);
      if (c.mk === 'crane') { const a = projs(st).find((x) => x.op.sb.phase === 'build' && !x.op.sb.external); if (a) { a.op.sb.delayLeft += 1; p.hit = [a.id]; } }
      if (c.mk === 'strike') for (const a of projs(st)) if (a.op.sb.phase === 'build' && !a.op.sb.external) a.op.sb.delayLeft += 1;
      if (c.mk === 'foreign') P.shocks.push({ t: 'demand', v: 1 + c.add, from: m, until: m + c.months - 1, n: c.n });
      if (c.mk === 'lottery') P.shocks.push({ t: 'demand', v: 1 - c.cut, from: m, until: m + c.months - 1, n: c.n });
    },
    describe(st, p, ev) { const c = p.card; ev.data.proj = { mk: c.mk, months: c.months || null, rate: PJ(st).rate }; if (!projs(st).length && !rentals(st).length && c.mk !== 'rate') { ev.auto = true; ev.toastText = c.n; } },
  },
  crisis: {
    create(st, p) {
      const c = p.card;
      if (c.mk === 'conBust') { const a = projs(st).find((x) => x.op.tier === 'cheap' && x.op.sb.phase === 'build' && !x.op.sb.failed); if (a) { a.op.sb.failed = true; a.op.sb.delayLeft += FAIL.months; p.hit = [a.id]; } }
    },
  },
  tiles: {},
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) {
    for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op) continue;
      if (a.op.ck === 'proj') { const b = a.op.sb; const pc = pctDone(b); m.pct = round2(pc); m.stage = b.phase === 'permit' ? 0 : pc < 0.17 ? 1 : pc < 0.85 ? 2 : pc < 1 ? 3 : 4; m.floors = Math.round(pc * (a.op.floors || 20));
        m.stalled = !!(b.paused || b.delayLeft > 0 || a.op.lastStall === st.month); m.tarp = m.stalled; m.craneOn = b.phase === 'build' && !m.stalled; m.permit = b.phase === 'permit'; m.presold = round2(a.op.presold / a.op.units); }
      if (a.op.ck === 'rent') { m.stage = 5; m.lights = true; }
      if (a.op.ck === 'plot') { m.stage = 0; m.fence = true; } }
  },
  recapHint(st) {
    const P = PJ(st); if (!P) return null;
    if (!projs(st).length && !P.completed && !rentals(st).length) return 'בפעם הבאה: פרויקט. במטרופולין השווי נבנה מבניינים שנגמרים — לא מהמשכורת.';
    if (P.stallMonths >= 6) return 'בפעם הבאה: הון עצמי בצד ומכירות מוקדמות לפני שהשלב מתחיל. כל חודש שפרויקט עומד — הריבית ממשיכה לרוץ.';
    return null;
  },
  goalValue(st, key) { if (key === 'stallMonths') return PJ(st).stallMonths || 0; return 0; },
};

/** Completion: presale balances + the remaining units (sold at today's price, or held as rentals), the loans repaid. */
function complete(st, a, out, ctx) {
  const o = a.op; const b = o.sb; const P = PJ(st); const share = 1 - (o.partner || 0);
  const unsold = o.units - o.presold - (o.comboUnits || 0);
  const bal = Math.round(o.presoldRev * (1 - PRESALE.deposit));
  const debt = b.loan + (o.mezz || 0) - (b.escrow || 0); // leftover escrow (deposits not spent on the build) settles the loans first
  if (o.plan === 'hold' && unsold > 0) {
    const gross = bal; // the presold units pay their balance; the rest becomes a rental block
    const cashNet = Math.round((gross - debt * (1 - HOLD.mortgage)) * share * (o.combo ? 1 - o.combo : 1));
    st.cash += cashNet; ctx.cashFx(out, cashNet, ctx.sgn(cashNet));
    o.ck = 'rent'; o.noi = Math.round(unsold * o.rentUnit * share); a.debt = Math.round(debt * HOLD.mortgage * share); delete o.sb; o.units = unsold; revalue(st, a);
    P.completed++; out.news.push({ kind: 'proj', text: ctx.mentorLine(st, 'held', { name: a.n, units: String(unsold) }) || `${a.n} הושלם. ${unsold} דירות נשארו אצלך להשכרה.`, assetId: 'a' + a.id });
  } else {
    const rev = bal + unsold * finalPrice(st, a);
    const net = Math.round((rev - debt) * share * (o.combo ? 1 - o.combo : 1));
    st.cash += net; P.completed++; P.profit += Math.round(net + (o.deposits - b.equity) * share);
    st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); ctx.cashFx(out, net, ctx.sgn(net)); ctx.sound(out, 'coin');
    out.news.push({ kind: 'proj', text: ctx.mentorLine(st, 'completed', { name: a.n, net: ctx.fmtM(net) }) || `${a.n} הושלם ונמסר לקונים: ${ctx.fmtM(net)} אחרי החזר ההלוואות.`, assetId: 'a' + a.id });
  }
  ctx.lesson(st, out, 'wip_at_cost');
}

/* ---------------------------------------------------------------- 'Q' — a plot of land for a project */
projects.tiles.Q = {
  safe: 'pass',
  create(st, ctx) {
    const rs = [ctx.draw(st), ctx.draw(st), ctx.draw(st), ctx.draw(st)]; // exactly 4 'world' draws on every Q landing, whatever is chosen
    const sites = ctx.world(st).sites || []; const s = sites[Math.min(sites.length - 1, Math.floor(((rs[0] * 7919) % 1) * sites.length))];
    return { wr: rs, site: JSON.parse(JSON.stringify(s)), checked: false };
  },
  describe(st, p, ev, ctx) {
    const s = p.site; const I = landInfo(st, p, ctx);
    ev.tag = 'קרקע לפרויקט'; ev.title = s.n;
    ev.text = `${s.d} ${s.units} יחידות, מחיר מחירון ${ctx.fmtM(s.list)} ליחידה. קרקע ${ctx.fmtM(s.land)} (הבנק מממן חצי), בנייה ${ctx.fmtM(s.cost)} ב־${s.stages} שלבים. היתר: ${I.permitTxt}.`;
    ev.mentor = ctx.mentorLine(st, 'landAsk', {}) || 'בפרויקט ארוך הכסף נגמר לפני שהבניין נגמר. כמה הון עצמי תצטרך, ומתי?';
    ev.data = { pk: s.pk, units: s.units, list: s.list, land: s.land, down: I.down, landLoan: s.land - I.down, cost: { cheap: I.cost.cheap, reliable: I.cost.reliable }, stages: s.stages, stageMonths: s.stageMonths, eqReq: s.eqReq, equityNeed: I.eqNeed, permit: I.permit, checked: !!p.checked,
      noPresale: !!s.noPresale, presaleReq: PRESALE.req, margin: I.margin, months: I.months, rate: PJ(st).rate, demand: demandOf(st), active: projs(st).length, cashAfter: I.cashAfter, nextCalls: I.calls, checkFee: CHECK.fee,
      contractors: { cheap: { overrun: [0, round2(CONTRACTOR.cheap.over * (isCon(st) ? CHAR.conOver : 1))], failP: CONTRACTOR.cheap.failP }, reliable: { overrun: [0, round2(CONTRACTOR.reliable.over * (isCon(st) ? CHAR.conOver : 1))], failP: 0, extra: CONTRACTOR.reliable.cost - 1 } },
      note: 'קודם הון עצמי (כולל הקרקע), ורק אחר כך הבנק. הלוואת הבנייה משתחררת רק אחרי שמכרת 30% מהדירות על הנייר. הריבית על ההלוואה מצטברת לחוב, וכל חודש עיכוב מוסיף אותה.' };
    const full = projs(st).length >= MAX_PROJECTS; const L = ctx.loanFor(st, I.down);
    if (I.cashAfter < I.calls) ev.data.warning = `אחרי המקדמה על הקרקע יישארו ${ctx.fmtM(Math.max(0, I.cashAfter))}, וההון העצמי של השלבים הראשונים הוא בערך ${ctx.fmtM(I.calls)}. פרויקט שעומד — הריבית שלו רצה.`;
    ev.options = [
      ...(p.checked || s.permitDone ? [] : [ctx.opt('check', `בדיקת תב"ע (${ctx.fmtM(CHECK.fee)}): טווח ההיתר ±${CHECK.band} חודשים`, st.cash >= CHECK.fee, { kind: 'inspect', reason: st.cash >= CHECK.fee ? undefined : 'אין מספיק מזומן' })]),
      ctx.opt('reliable', `לקנות — קבלן אמין (+${Math.round((CONTRACTOR.reliable.cost - 1) * 100)}% עלות, חריגה עד ${Math.round(CONTRACTOR.reliable.over * 100)}%)`, !full && L.ok, { kind: 'land', net: I.margin.reliable, loanAmount: L.need, reason: full ? 'יותר מדי פרויקטים פתוחים' : !L.ok ? 'הבנק לא נותן הלוואה כזו' : undefined }),
      ctx.opt('cheap', `לקנות — קבלן זול (חריגה עד ${Math.round(CONTRACTOR.cheap.over * (isCon(st) ? CHAR.conOver : 1) * 100)}%, סיכון שיפשוט רגל)`, !full && L.ok, { kind: 'land', net: I.margin.cheap, loanAmount: L.need, reason: full ? 'יותר מדי פרויקטים פתוחים' : !L.ok ? 'הבנק לא נותן הלוואה כזו' : undefined }),
      ctx.opt('pass', 'לוותר', true),
    ];
    // the guide (w8 spec, as tuned): a permit check first; at most 3 open projects; cash for 40 % of every open equity call; the reliable contractor
    let pick = 'pass'; const open = projs(st).filter((a) => a.op.sb.phase !== 'done').length;
    const ok = !full && L.need === 0 && open < 3 && I.margin.reliable > 0 && I.cashAfter >= I.calls * 0.4;
    if (ok && !p.checked && !s.permitDone && st.cash >= CHECK.fee + I.down) pick = 'check';
    else if (ok) pick = I.margin.cheap > I.margin.reliable * 1.15 && I.cashAfter >= 1.5 * I.calls ? 'cheap' : 'reliable'; // the cheap contractor only when it is clearly cheaper AND there is cash for its surprises
    const po = ev.options.find((o) => o.id === pick && o.enabled) || ev.options.find((o) => o.id === 'pass'); po.primary = true; ev.forcePrimary = po.id;
  },
  choose(st, p, o, params, out, ctx) {
    const s = p.site;
    if (o.id === 'pass') { out.mentor = ctx.mentorLine(st, 'landPass', {}) || null; ctx.logDecision(st, 'קרקע לפרויקט', 'ויתר'); return true; }
    if (o.id === 'check') { if (st.cash < CHECK.fee) return true; st.cash -= CHECK.fee; ctx.cashFx(out, -CHECK.fee, `בדיקת תב"ע ${ctx.fmtM(CHECK.fee)}`); p.checked = true; const I = landInfo(st, p, ctx);
      out.mentor = ctx.mentorLine(st, 'checked', { lo: String(I.permit.lo), hi: String(I.permit.hi) }) || `בדיקת התב"ע: ההיתר צפוי בעוד ${I.permit.lo}–${I.permit.hi} חודשים.`; ctx.logDecision(st, 'קרקע לפרויקט', 'בדיקת תב"ע'); return false; }
    const tier = o.id === 'cheap' ? 'cheap' : 'reliable';
    const fate = fateFrom(st, p.wr, s, tier);
    const lend = r1000(s.land * LAND_LTV); const down = s.land - lend;
    const op = makeProject(st, s, tier, fate, { checked: !!p.checked, sb: { loan: lend, equity: down } });
    const a = ctx.buy(st, { k: s.pk, n: s.name || s.n, cost: s.land, down, value: s.land, op }, out, { label: 'קרקע לפרויקט' });
    if (!a) { out.mentor = 'הבנק לא נתן הלוואה לקרקע.'; return true; }
    revalue(st, a);
    out.mentor = ctx.mentorLine(st, 'landBuy', {}) || 'קנית קרקע. עכשיו מחכים להיתר — ואחריו כל שלב צריך הון עצמי, עד שמגיעים ל־30% מכירות והבנק נכנס.';
    ctx.lesson(st, out, 'staged_finance'); ctx.logDecision(st, 'קרקע לפרויקט', tier === 'cheap' ? 'קבלן זול' : 'קבלן אמין', s.land);
    return true;
  },
  score(st, ev, ctx) {
    const d = ev.data || {}; const E = Math.max(1, ctx.expenses(st));
    return ev.options.filter((o) => o.enabled).map((o) => ({ id: o.id, U: round2(o.id === 'check' ? 0.5 : o.id === 'reliable' || o.id === 'cheap' ? ((o.net || 0) / Math.max(12, d.months || 24) - ((d.cashAfter ?? 0) < (d.nextCalls ?? 0) ? 4 * E : 0)) / E : 0), flags: [], reasons: [] }));
  },
};
/** The land card's public numbers. */
function landInfo(st, p, ctx) {
  const s = p.site; const cost = { cheap: planCost(st, s, 'cheap'), reliable: planCost(st, s, 'reliable') };
  const pr = (isDev(st) ? PERMIT.devMult : isCon(st) ? PERMIT.conMult : 1);
  let permit;
  if (s.permitDone) permit = { lo: 0, hi: 0 };
  else if (p.checked) { const f = permitMonths(st, p.wr[0]) + (s.permitAdd || 0); permit = { lo: Math.max(1, f - CHECK.band), hi: f + CHECK.band }; }
  else permit = { lo: Math.max(1, Math.round(PERMIT.min * pr)) + (s.permitAdd || 0), hi: Math.round((PERMIT.min + PERMIT.span) * pr) + (s.permitAdd || 0) };
  const permitTxt = s.permitDone ? 'מאושר' : `${permit.lo}–${permit.hi} חודשים`;
  const months = Math.round((permit.lo + permit.hi) / 2) + s.stages * s.stageMonths;
  const rev = s.units * s.list * demandOf(st) * (1 + charPresale(st)) * 0.97; // a mix of presales (cheaper) and units at completion
  const intr = (t) => Math.round(cost[t] * (1 - s.eqReq) * 0.5 * loanRate(st) / 100 * s.stages * s.stageMonths);
  const margin = { cheap: Math.round(rev - s.land - cost.cheap * (1 + CONTRACTOR.cheap.over * 0.5) * (1 + CONTRACTOR.cheap.failP * FAIL.cost * 0.5) - intr('cheap')), reliable: Math.round(rev - s.land - cost.reliable * (1 + CONTRACTOR.reliable.over * 0.5) - intr('reliable')) };
  const down = s.land - r1000(s.land * LAND_LTV);
  const eqNeed = Math.max(0, Math.round(s.eqReq * (s.land + cost.reliable) - down));
  let calls = eqNeed; for (const a of projs(st)) calls += equityGap(a.op.sb);
  const cashAfter = Math.round(st.cash - down);
  void ctx; return { cost, permit, permitTxt, months, margin, eqNeed, calls, cashAfter, down };
}

/* ---------------------------------------------------------------- between-roll actions (`Z`) */
projects.act = {
  presale(st, p, out, ctx) { const [id, v] = String(p || '').split(':'); const a = findA(st, id, 'proj'); const t = +v / 100; if (!a || !PRESALE.targets.includes(t)) return fail(out, 'bad_param'); if (a.op.noPresale) return fail(out, 'אין מכירות מוקדמות בפרויקט הזה');
    if (a.op.target === t) return fail(out, 'כבר כך'); a.op.target = t; ctx.lesson(st, out, 'presales'); out.toast = `${a.n}: יעד מכירות מוקדמות ${Math.round(t * 100)}%`; return true; },
  plan(st, p, out) { const [id, v] = String(p || '').split(':'); const a = findA(st, id, 'proj'); if (!a || !['sell', 'hold'].includes(v)) return fail(out, 'bad_param'); if (a.op.plan === v) return fail(out, 'כבר כך'); a.op.plan = v; out.toast = v === 'hold' ? `${a.n}: הדירות שלא נמכרו יישארו להשכרה` : `${a.n}: כל הדירות יימכרו בסיום`; return true; },
  pause(st, p, out) { const a = findA(st, p, 'proj'); if (!a || a.op.sb.phase === 'done') return fail(out, 'bad_param'); a.op.sb.paused = !a.op.sb.paused; out.toast = a.op.sb.paused ? `${a.n}: העבודה הושהתה — הריבית ממשיכה לרוץ.` : `${a.n}: העבודה חוזרת.`; return true; },
  selfFund(st, p, out) { const a = findA(st, p, 'proj'); if (!a || a.op.noPresale) return fail(out, 'bad_param'); a.op.selfFund = !a.op.selfFund; out.toast = a.op.selfFund ? `${a.n}: תממן שלבים מההון שלך עד שהבנק ייכנס.` : `${a.n}: מחכים לבנק.`; return true; },
  partner(st, p, out, ctx) { const a = findA(st, p, 'proj'); if (!a || a.op.partner) return fail(out, a ? 'כבר יש שותף' : 'bad_param');
    const book = Math.max(0, a.value - a.debt); const cash = r1000(book * PARTNER); a.op.partner = PARTNER; st.cash += cash; revalue(st, a); ctx.cashFx(out, cash, '+' + ctx.fmtM(cash)); ctx.ensureCash(st, out, 'proj');
    out.toast = `שותף הון נכנס ל${a.n}: ${ctx.fmtM(cash)} עכשיו, והוא מממן ${Math.round(PARTNER * 100)}% מההון העצמי מעכשיו — ומקבל ${Math.round(PARTNER * 100)}% מהרווח.`; return true; },
  mezz(st, p, out, ctx) { const a = findA(st, p, 'proj'); if (!a || a.op.mezz) return fail(out, a ? 'כבר יש' : 'bad_param'); if (a.op.sb.phase === 'done') return fail(out, 'bad_param');
    const amt = r1000(a.op.sb.cost * MEZZ.share); a.op.mezz = amt; st.cash += amt; revalue(st, a); ctx.cashFx(out, amt, '+' + ctx.fmtM(amt)); ctx.lesson(st, out, 'capitalised_interest');
    out.toast = `הלוואת מזנין ל${a.n}: ${ctx.fmtM(amt)} עכשיו, בריבית יקרה שמצטברת לחוב.`; return true; },
  sellProj(st, p, out, ctx) { const a = findA(st, p, 'proj'); if (!a) return fail(out, 'bad_param'); const offer = r1000(a.value * SELL_RIVAL); const net = offer - a.debt;
    st.cash += net; st.stats.sold++; st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); ctx.cashFx(out, net, ctx.sgn(net)); ctx.ensureCash(st, out, 'sell');
    out.toast = `מכרת את ${a.n} ליזם מתחרה ב־${ctx.fmtM(offer)} (${Math.round(SELL_RIVAL * 100)}% מהעלות): ${ctx.fmtM(net)} אחרי החובות.`; ctx.lesson(st, out, 'wip_at_cost'); return true; },
  sellPlot(st, p, out, ctx) { const a = findA(st, p, 'plot'); if (!a) return fail(out, 'bad_param'); const net = r1000(a.value * PLOT_FAST) - a.debt; st.cash += net; st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); ctx.cashFx(out, net, ctx.sgn(net));
    out.toast = `מכרת את ${a.n} מהר: ${ctx.fmtM(net)} (${Math.round((1 - PLOT_FAST) * 100)}% פחות מהשווי).`; return true; },
  sellRent(st, p, out, ctx) { const a = findA(st, p, 'rent'); if (!a) return fail(out, 'bad_param'); const net = a.value - a.debt; st.cash += net; st.stats.sold++; st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); ctx.cashFx(out, net, ctx.sgn(net)); ctx.ensureCash(st, out, 'sell');
    out.toast = `מכרת את ${a.n}: ${ctx.fmtM(net)} אחרי המשכנתא.`; return true; },
  develop(st, p, out, ctx) { const [id, t] = String(p || '').split(':'); const a = findA(st, id, 'plot'); if (!a || !['cheap', 'reliable', 'combo'].includes(t)) return fail(out, 'bad_param'); if (projs(st).length >= MAX_PROJECTS) return fail(out, 'יותר מדי פרויקטים פתוחים');
    if (t === 'combo' && !isOwner(st)) return fail(out, 'קומבינציה — רק לבעלי הקרקע');
    const s = a.op.site; const rs = a.op.fate; const fate = fateFrom(st, rs, s, t === 'combo' ? 'reliable' : t);
    const op = makeProject(st, { ...s, land: a.value }, t === 'combo' ? 'reliable' : t, fate, { checked: !!a.op.checked });
    if (t === 'combo') { op.combo = COMBO; op.sb.external = true; op.sb.eqReq = 0; op.comboUnits = 0; op.target = 0; op.noPresale = true; }
    a.op = op; a.k = s.pk; revalue(st, a); ctx.lesson(st, out, 'staged_finance');
    out.toast = t === 'combo' ? `${a.n}: עסקת קומבינציה — יזם בונה ומקבל ${Math.round(COMBO * 100)}% מהדירות; ${Math.round((1 - COMBO) * 100)}% שלך, בלי לשלם על הבנייה.` : `${a.n}: מתחילים בתהליך ההיתר.`; return true; },
};

/** The guide's suggestions (public numbers only). */
function actionList(st, ctx) {
  const out = []; const E0 = ctx.expenses(st);
  for (const a of projs(st)) {
    const o = a.op; const b = o.sb; if (b.phase === 'done') continue;
    if (!o.noPresale) for (const t of PRESALE.targets) out.push({ id: 'presale', param: `${a.id}:${Math.round(t * 100)}`, assetId: 'a' + a.id, label: `${a.n}: יעד מכירות מוקדמות ${Math.round(t * 100)}%`, enabled: o.target !== t, current: o.target === t, suggested: o.target !== t && t === 0.4 && o.target < 0.4 });
    out.push({ id: 'plan', param: `${a.id}:${o.plan === 'sell' ? 'hold' : 'sell'}`, assetId: 'a' + a.id, label: o.plan === 'sell' ? `${a.n}: להשאיר את הדירות שלא נמכרו להשכרה` : `${a.n}: למכור את כל הדירות בסיום`, enabled: true, suggested: false });
    const gap = equityGap(b); const short = b.phase === 'build' && gap > 0 && st.cash < monthCost(b);
    out.push({ id: 'pause', param: String(a.id), assetId: 'a' + a.id, label: b.paused ? `${a.n}: להמשיך לבנות` : `${a.n}: להשהות את העבודה (הריבית ממשיכה)`, enabled: true, suggested: !!b.paused && st.cash > monthCost(b) * 2 + E0 * 2 });
    if (!o.noPresale && !gateOf(o) && b.phase === 'build') out.push({ id: 'selfFund', param: String(a.id), assetId: 'a' + a.id, label: o.selfFund ? `${a.n}: לחכות לבנק` : `${a.n}: לממן שלבים מההון שלך עד שהבנק נכנס`, enabled: true, suggested: !o.selfFund && st.cash >= monthCost(b) * 4 + E0 * 3 });
    if (!o.partner) out.push({ id: 'partner', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: להכניס שותף הון (${Math.round(PARTNER * 100)}% מהרווח)`, enabled: a.value > a.debt, suggested: short && st.cash + 0 < monthCost(b) && a.value > a.debt });
    if (!o.mezz) out.push({ id: 'mezz', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: הלוואת מזנין (${ctx.fmtM(r1000(b.cost * MEZZ.share))}, ריבית יקרה)`, enabled: true, suggested: false });
    out.push({ id: 'sellProj', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: למכור ליזם מתחרה (${ctx.fmtM(r1000(a.value * SELL_RIVAL))})`, enabled: true, suggested: false });
  }
  let callsOpen = 0; for (const a of projs(st)) callsOpen += equityGap(a.op.sb);
  for (const a of plots(st)) { const s = a.op.site; const need = Math.max(0, Math.round(s.eqReq * (a.value + planCost(st, s, 'reliable')) - a.value)); const nOpen = projs(st).filter((x) => x.op.sb.phase !== 'done').length;
    const canBuild = st.cash >= need + callsOpen + E0 * 3;
    out.push({ id: 'develop', param: `${a.id}:reliable`, assetId: 'a' + a.id, label: `${a.n}: להתחיל פרויקט (קבלן אמין · הון עצמי בערך ${ctx.fmtM(need)})`, enabled: projs(st).length < MAX_PROJECTS, need, suggested: nOpen < 3 && canBuild });
    out.push({ id: 'develop', param: `${a.id}:cheap`, assetId: 'a' + a.id, label: `${a.n}: להתחיל פרויקט (קבלן זול)`, enabled: projs(st).length < MAX_PROJECTS, suggested: false });
    if (isOwner(st)) out.push({ id: 'develop', param: `${a.id}:combo`, assetId: 'a' + a.id, label: `${a.n}: קומבינציה — יזם בונה ומקבל ${Math.round(COMBO * 100)}% מהדירות, ${Math.round((1 - COMBO) * 100)}% נשארות לך`, enabled: projs(st).length < MAX_PROJECTS, suggested: !canBuild && nOpen < 4 });
    out.push({ id: 'sellPlot', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: למכור מהר (${ctx.fmtM(r1000(a.value * PLOT_FAST))})`, enabled: true, suggested: false }); }
  for (const a of rentals(st)) out.push({ id: 'sellRent', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: למכור את הבניין המושכר (${ctx.fmtM(a.value - a.debt)} אחרי המשכנתא)`, enabled: true, suggested: false });
  return out;
}
function indicatorsOf(st, ctx) {
  const P = PJ(st); const E0 = ctx.expenses(st);
  const rows = projs(st).map((a) => {
    const o = a.op; const b = o.sb;
    return { assetId: 'a' + a.id, name: a.n, pk: o.pk, phase: b.phase, units: o.units, presold: o.presold, presoldPct: round2(o.presold / o.units), target: o.target, gate: gateOf(o), gateReq: PRESALE.req, noPresale: !!o.noPresale, tier: o.tier, plan: o.plan,
      stage: b.stage, stages: b.stages, prog: b.prog, stageMonths: b.stageMonths, pct: round2(pctDone(b)), permit: b.phase === 'permit' ? o.permitShown : null, paused: !!b.paused, delayed: b.delayLeft > 0,
      stageCost: monthCost({ ...b, overrun: 0, failed: b.failed }) * b.stageMonths, monthCost: b.phase === 'build' ? monthCost({ ...b, overrun: 0 }) : 0, equityGap: equityGap(b), loan: b.loan, mezz: o.mezz || 0, deposits: o.deposits, interest: b.interest,
      value: a.value, debt: a.debt, projected: projected(st, a), partner: o.partner || 0, combo: o.combo || 0, failed: !!b.failed, selfFund: !!o.selfFund, stallMonths: b.stallMonths, stallRun: o.stallRun || 0, callIn: BANK.runs };
  });
  // the equity-call calendar: each open project's equity still owed, by the month its next stage would need it (public plan)
  const calls = rows.filter((r) => r.equityGap > 0).map((r) => ({ assetId: r.assetId, name: r.name, amount: r.equityGap, from: r.phase === 'permit' && r.permit ? st.month + r.permit.lo : st.month }));
  const callSum = calls.reduce((s, x) => s + x.amount, 0);
  const runway = callSum > 0 ? round2(Math.max(0, st.cash + (st.savings || 0)) / callSum) : null;
  const rent = rentals(st).map((a) => ({ assetId: 'a' + a.id, name: a.n, units: a.op.units, noi: a.op.noi, value: a.value, debt: a.debt }));
  return {
    proj: { open: rows.filter((r) => r.phase !== 'done').length, rate: P.rate, loanRate: loanRate(st), demand: demandOf(st), equityCalls: callSum, runway, stalls: P.stalls, stallMonths: P.stallMonths, forcedSales: P.forced || 0, holdingPaid: P.holding || 0, completed: P.completed, profit: P.profit,
      plots: plots(st).map((a) => ({ assetId: 'a' + a.id, name: a.n, value: a.value })), rentals: rent, shocks: P.shocks.map((s) => ({ t: s.t, v: s.v, until: s.until, n: s.n || '' })) },
    panel: {
      id: 'proj', title: 'הפרויקטים',
      gauges: [{ id: 'runway', label: 'מזומן מול ההון העצמי שעוד צריך', value: runway, ref: 1.2 }, { id: 'rate', label: 'ריבית במשק (%)', value: P.rate, ref: RATE.ref }, { id: 'demand', label: 'ביקוש לדירות', value: demandOf(st), min: 0.6, max: 1.3, ref: 1 }],
      gantt: rows.map((r) => ({ assetId: r.assetId, name: r.name, phase: r.phase, pct: r.pct, stage: r.stage, stages: r.stages, permit: r.permit, paused: r.paused, delayed: r.delayed, gate: r.gate })),
      calls, rows, rentals: rent,
      actions: actionList(st, ctx),
    },
  };
}
export default projects;
