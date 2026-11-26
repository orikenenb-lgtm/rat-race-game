// World mechanic `platform` — w15 מגדלי הענן (CATALOG-25 §1.4 w15, §2.2, §2.4). An app: users bought through 3 marketing channels with
// saturation, monthly cohorts with a SEALED true retention (each month of data narrows the shown range), ARPU, burn and runway, a
// network-effect threshold, a rival platform's share. The company is valued every month at the tech-sector multiple of the market REGIME
// (the `market` module's regime table and transition weights, reused as-is: growth / bubble / recession / recovery / high volatility /
// sector crisis) × ARR — never at "the last round". The distinct rule: raising money sells % of the company at TODAY's multiple: a bubble
// lets you raise cheap, a winter forces a down round with a ratchet for the earlier investors.
//
// Contract (DESIGN §4.2): pure, deterministic, no engine import, only + − × ÷ and Math.round / min / max / floor / abs. Fixed 'world' draws:
// init 4 (the first regime · the product's sealed quality · a jitter · the rival's start), payday 4 (the regime · noise · 2 for the new
// cohort: its true retention and the shown range's jitter), 'H' landing 2 (the investor meeting: kind + terms). st.cash is the company's
// cash (the founder's salary is the engine's); the company asset's value = stake × multiple × ARR; the goal reads stakeValue = stake ×
// (multiple × ARR + cash − venture debt), or the proceeds once the company is sold.
import { REGIMES } from './market.js';

export const ID = 'platform';
export const RING = 24;
export const DRAWS = Object.freeze({ init: 4, month: 4, landing: Object.freeze({ H: 2 }) });
/** The tech multiple of ARR per regime (TUNE). */
export const MULT = Object.freeze({ growth: 7, bubble: 11, recession: 3.5, recovery: 5, highVol: 4.5, sectorCrisis: 3 });
export const WINTER = Object.freeze(['recession', 'sectorCrisis', 'highVol']);
export const CHANNELS = Object.freeze([Object.freeze({ id: 'search', n: 'חיפוש ממומן', cac: 14, sat: 4000000 }), Object.freeze({ id: 'social', n: 'רשתות חברתיות', cac: 10, sat: 3000000 }),
  Object.freeze({ id: 'tv', n: 'פרסום בטלוויזיה', cac: 22, sat: 8000000 })]);
export const LEVELS = Object.freeze([0, 500000, 1500000, 4000000]);
export const PF = Object.freeze({ net: 2000000, netCac: 0.8, netRet: 0.005, arpuUp: 0.005, tam: 8000000, capEvery: 18, server: 0.8, organic: 0.008, raise: Object.freeze({ s: 0.08, m: 0.15, l: 0.25 }), raiseEvery: 6, winterCut: 0.7, bubbleUp: 1.15,
  bridge: 0.8, crunch: 0.4, crunchPct: 0.25, freeze: 3, debt: 20000000, debtPct: 0.01, covenant: 6, penalty: 0.03, cutOpex: 0.3, cutRet: 0.01, cutMonths: 6, coreRet: 0.97, rival0: 0.25 });

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;
const round4 = (x) => Math.round(x * 10000) / 10000;
const P = (st) => st.world.pf;
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
function wpick(entries, v) { const tot = entries.reduce((s, [, w]) => s + w, 0); let acc = 0; for (const [k, w] of entries) { acc += w / tot; if (v < acc) return k; } return entries[entries.length - 1][0]; }
export const usersOf = (st) => { const F = P(st); return Math.round(F.core + F.coh.reduce((s, c) => s + c.n, 0)); };
export const mrrOf = (st) => Math.round(usersOf(st) * P(st).arpu);
export const multOf = (st) => MULT[P(st).regime] || 6;
export const evOf = (st) => r1000(multOf(st) * 12 * mrrOf(st));
const live = (st) => !P(st).sold;
export const stakeValue = (st) => { const F = P(st); return F.sold ? F.proceeds : r1000(F.stake * Math.max(0, evOf(st) + st.cash - F.debt)); };
const netOn = (st) => usersOf(st) >= PF.net;
/** Effective CAC of a channel at a spend level: saturation, the rival's share, the network effect, the character, events. */
/** The marketing team's capacity: the highest spend level it can run (1 at the start, +1 every 18 months; +1 for the big-tech executive). */
export const capOf = (st) => Math.min(LEVELS.length - 1, 1 + Math.floor((st.month - 1) / PF.capEvery) + (st.charId === 'bigTechExec' ? 1 : 0));
export function cacOf(st, ch, spend) { const F = P(st); const C = CHANNELS.find((x) => x.id === ch); return round2(C.cac * (1 + spend / C.sat) * (1 + 2 * usersOf(st) / PF.tam) * (1 + F.rival) * (netOn(st) ? PF.netCac : 1) * (st.charId === 'bigTechExec' ? 0.85 : 1) * (F.cacUntil >= st.month ? F.cacMult : 1)); }
export const spendOf = (st) => CHANNELS.reduce((s, c) => s + LEVELS[P(st).lvl[c.id] || 0], 0);
export const costOf = (st) => { const F = P(st); return Math.round(F.opex * (F.cutUntil >= st.month ? 1 - PF.cutOpex : 1) + spendOf(st) + usersOf(st) * PF.server + F.debt * PF.debtPct); };
export const cfOf = (st) => (live(st) ? Math.round((mrrOf(st) - costOf(st)) / 10) * 10 : 0);
/** Runway in months (99 when cash flow is ≥ 0). */
export const runwayOf = (st) => { const cf = cfOf(st); return !live(st) || cf >= 0 ? 99 : Math.max(0, Math.floor(st.cash / -cf * 10) / 10); };
/** The shown retention of a cohort: a range that narrows with every month of data (width 0.06 → ~0.01). */
function shown(c, m) { const age = Math.max(0, m - c.m); const w = 0.03 / (1 + age / 2); const lo = round3(clamp(c.ret - w * 2 * c.j, 0.5, 0.995)); return { lo, hi: round3(clamp(lo + 2 * w, 0.5, 0.995)) }; }
/** Retention the guide plans with: the low end of the newest cohorts with ≥ 3 months of data (else the start estimate). */
export function retEst(st) { const F = P(st); const xs = F.coh.filter((c) => st.month - c.m >= 3).slice(-3); if (!xs.length) return F.ret0; return round3(xs.reduce((s, c) => s + shown(c, st.month).lo, 0) / xs.length); }
export const ltvOf = (st) => { const F = P(st); return Math.round((F.arpu - PF.server) / Math.max(0.01, 1 - retEst(st))); };
function sellShares(st, pct, priceMult, out, ctx, label) { const F = P(st); const pre = Math.max(1, (evOf(st) + st.cash - F.debt) * priceMult); const amt = r1000(pre * pct / (1 - pct)); const post = pre + amt;
  if (F.lastPost && pre < F.lastPost) { const ratchet = round4(0.5 * (1 - pre / F.lastPost) * (1 - F.stake)); F.stake = round4(F.stake * (1 - ratchet)); F.ratchets++; }
  F.stake = round4(F.stake * (1 - pct)); F.lastPost = post; F.raised += amt; F.rounds.push({ m: st.month, amt, post: Math.round(post), stake: F.stake, regime: F.regime }); while (F.rounds.length > 12) F.rounds.shift();
  st.cash += amt; ctx.cashFx(out, amt, `${label} ${ctx.fmtM(amt)}`); ctx.lesson(st, out, 'dilution'); return amt; }

export const platform = {
  id: ID, draws: DRAWS, uses: ['market'],
  lessons: ['ltv_cac', 'dilution'],
  mentorKeys: ['raised', 'crunch', 'netOn', 'offer'],
  sealed: ['world.pf.q', 'world.pf.coh[].ret', 'world.pf.coh[].j', 'world.pf.inits', 'pending.wr', 'pending.item.sealed'],

  init(st, w, ch, ctx) {
    const rs = []; for (let i = 0; i < DRAWS.init; i++) rs.push(ctx.draw(st)); // exactly 4 'world' draws at init, whoever plays
    const S = (ch && ch.start) || {}; const regime = wpick([['growth', 50], ['recovery', 20], ['highVol', 10], ['recession', 20]], rs[0]); const q = round3(rs[1]);
    st.world.pf = { regime, rMin: REGIMES[regime].min, q, arpu: S.arpu || 6, opex: S.opex || 2500000, stake: S.stake ?? 0.7, lvl: { search: S.lvl ?? 1, social: S.lvl ?? 1, tv: 0 }, core: 0, coh: [], ret0: 0.9,
      rival: round3(PF.rival0 * (0.6 + 0.8 * rs[3])), debt: 0, raised: 0, lastPost: S.lastPost || 0, rounds: [], ratchets: 0, lastRaise: -99, crunches: 0, breaches: 0, cutUntil: 0, retAdd: [], cacUntil: 0, cacMult: 1, sold: 0, proceeds: 0,
      netOnAt: 0, pivots: 0, inits: rs, hist: [] };
    const F = st.world.pf; const n = S.users || 400000; const r = round3(clamp(0.88 + 0.08 * q, 0.7, 0.985));
    F.core = Math.round(n * 0.6); for (let i = 0; i < 4; i++) F.coh.push({ m: 1 - 3 * (4 - i), size: Math.round(n * 0.1), n: Math.round(n * 0.1), ret: r, j: frac(rs[2] * (7 + i * 13)) });
  },
  defaults(st) { const F = P(st); if (!F) return; for (const k of ['coh', 'rounds', 'retAdd', 'hist']) if (!Array.isArray(F[k])) F[k] = []; },

  monthly(st, out, ctx) {
    const F = P(st); const rs = []; for (let i = 0; i < DRAWS.month; i++) rs.push(ctx.draw(st)); // exactly 4 'world' draws every payday
    const m = st.month; const old = F.regime; const T = REGIMES[F.regime];
    if (F.rMin > 0) F.rMin--; else if (rs[0] < T.exit) { F.regime = wpick(Object.entries(T.next), rs[0] / T.exit); F.rMin = REGIMES[F.regime].min; }
    if (F.regime !== old) out.news.push({ kind: 'pf', text: `מצב השוק השתנה: ${REGIMES[F.regime].label}. מכפיל ההכנסות של חברות טכנולוגיה: ${MULT[F.regime]}×${F.regime === 'bubble' ? ' — זמן טוב לגייס.' : WINTER.includes(F.regime) ? ' — חורף: כסף יקר.' : '.'}` });
    if (!live(st)) return;
    const add = F.retAdd.filter((x) => x.until >= m).reduce((s, x) => s + x.d, 0) - (F.cutUntil >= m ? PF.cutRet : 0); F.retAdd = F.retAdd.filter((x) => x.until >= m);
    for (const c of F.coh) c.n = Math.round(c.n * clamp(c.ret + add + (netOn(st) ? PF.netRet : 0), 0.5, 0.995));
    F.core = Math.round(F.core * clamp(PF.coreRet + add, 0.5, 0.995));
    let fresh = Math.round(usersOf(st) * PF.organic * (1 + (rs[1] - 0.5)));
    for (const C of CHANNELS) { const s = LEVELS[F.lvl[C.id] || 0]; if (s) fresh += Math.round(s / cacOf(st, C.id, s)); }
    const ret = round3(clamp(0.86 + 0.08 * F.q + 0.04 * (rs[2] - 0.5), 0.7, 0.985));
    F.coh.push({ m, size: fresh, n: fresh, ret, j: rs[3] }); while (F.coh.length > RING) { const o = F.coh.shift(); F.core += o.n; }
    F.rival = round3(clamp(F.rival + 0.004 * (rs[1] - 0.4), 0.05, 0.8)); F.arpu = round3(F.arpu * (1 + PF.arpuUp)); // the product monetises better with time
    if (netOn(st) && !F.netOnAt) { F.netOnAt = m; out.news.push({ kind: 'pf', text: ctx.mentorLine(st, 'netOn', {}) || 'עברת שני מיליון משתמשים: אפקט הרשת. גיוס משתמשים זול ב־20%, והם נשארים יותר.' }); }
    if (F.debt && runwayOf(st) < PF.covenant) { F.breaches++; F.stake = round4(F.stake * (1 - PF.penalty)); out.news.push({ kind: 'pf', text: `הפרת תנאי ההלוואה (פחות מ־${PF.covenant} חודשי מזומן): המלווה לקח ${Math.round(PF.penalty * 100)}% מהחברה.` }); }
    if (st.cash < 0) { F.crunches++; F.crunchAt = st.stats.paydays; F.frozen = m + PF.freeze - 1; for (const C of CHANNELS) F.lvl[C.id] = 0; sellShares(st, PF.crunchPct, PF.crunch, out, ctx, 'גיוס חירום במחיר נמוך'); out.news.push({ kind: 'pf', text: ctx.mentorLine(st, 'crunch', {}) || 'נגמר הכסף. המשקיעים הקיימים הכניסו כסף חירום — במחיר נמוך, עם רבע מהחברה שלך, ובתנאי שהפרסום נעצר לשלושה חודשים.' }); ctx.ensureCash(st, out, 'platform'); }
    F.hist.push({ m, users: usersOf(st), mrr: mrrOf(st), cf: cfOf(st), mult: multOf(st) }); while (F.hist.length > 24) F.hist.shift();
    revalue(st);
  },
  asset: {
    create(st, a) { a.op = { ck: 'app' }; a.debt = 0; a.value = live(st) ? r1000(P(st).stake * evOf(st)) : 0; },
    cf(st, a) { return a.op && a.op.ck === 'app' ? cfOf(st) : Math.round((a.cf || 0) / 10) * 10; },
  },
  liability(st) { return P(st).debt || 0; },
  market: {
    create(st, p) { const c = p.card; const F = P(st); const m = st.month; if (!live(st)) return;
      if (c.mk === 'appstore') { F.cacUntil = m + 5; F.cacMult = 1.2; }
      if (c.mk === 'viral') { const n = Math.round(usersOf(st) * 0.06); F.coh.push({ m, size: n, n, ret: round3(clamp(0.8 + 0.1 * F.q, 0.7, 0.98)), j: 0.5 }); while (F.coh.length > RING) { const o = F.coh.shift(); F.core += o.n; } p.n = n; }
      if (c.mk === 'breach') { for (const x of F.coh) x.n = Math.round(x.n * 0.9); F.core = Math.round(F.core * 0.9); }
      if (c.mk === 'rivalRound') F.rival = round3(clamp(F.rival + 0.1, 0.05, 0.8));
      if (c.mk === 'pop') { if (F.regime === 'bubble' || F.regime === 'growth') { F.regime = 'recession'; F.rMin = REGIMES.recession.min; } }
      if (c.mk === 'copy') F.retAdd.push({ d: -0.01, until: m + 5 });
      if (c.mk === 'engineer') F.retAdd.push({ d: -0.005, until: m + 3 });
      revalue(st);
    },
    describe(st, p, ev) { ev.data.pf = { mk: p.card.mk, users: usersOf(st), newUsers: p.n || 0, regime: P(st).regime, mult: multOf(st) }; },
  },
  crisis: { create(st, p) { const c = p.card; const F = P(st); if (!live(st)) return; if (c.mk === 'outage') { st.cash -= 2000000; p.hit = 2000000; } if (c.mk === 'churn') F.retAdd.push({ d: -0.02, until: st.month + 1 }); } },
  tiles: {
    H: {
      safe: 'decline',
      create(st, ctx) {
        const rs = []; for (let i = 0; i < DRAWS.landing.H; i++) rs.push(ctx.draw(st)); // exactly 2 'world' draws on every landing
        const F = P(st); if (!live(st)) return { wr: rs, item: null };
        const buyout = rs[0] < 0.35; const k = buyout ? round2(1.0 + 0.6 * rs[1]) : round2(0.8 + 0.45 * rs[1]); const pct = buyout ? 1 : [0.12, 0.18, 0.25][Math.floor(frac(rs[0] * 97) * 3)];
        return { wr: rs, item: { kind: buyout ? 'buyout' : 'term', k, pct, ev: evOf(st), at: st.month } };
      },
      describe(st, p, ev, ctx) {
        const F = P(st); const it = p.item; ev.tag = 'פגישה עם משקיעים';
        if (!it) { ev.title = 'פגישה עם משקיעים'; ev.text = 'החברה כבר נמכרה.'; ev.options = [ctx.opt('decline', 'המשך', true, { primary: true })]; ev.auto = true; return; }
        const pre = Math.max(1, evOf(st) + st.cash - F.debt);
        if (it.kind === 'buyout') { const price = r1000(it.k * evOf(st)); const mine = r1000(F.stake * (price + st.cash - F.debt));
          ev.title = 'הצעת רכישה מענקית'; ev.text = `ענקית טכנולוגיה מציעה לקנות את כל החברה ב־${ctx.fmtM(price)} (פי ${it.k} מהשווי היום). החלק שלך: ${ctx.fmtM(mine)} במזומן — וזהו, החברה כבר לא שלך.`;
          ev.data = { kind: 'buyout', price, mine, k: it.k, ev: evOf(st), stake: F.stake, stakeValue: stakeValue(st), regime: F.regime, mult: multOf(st), note: 'מחיר קבוע עכשיו, מול שווי שזז עם השוק. בחורף ההצעה נראית טובה; בבועה — פחות.' };
          ev.options = [ctx.opt('accept', `למכור ב־${ctx.fmtM(price)}`, true, { kind: 'sell', amount: mine, preview: { cash: mine, monthly: -cfOf(st), months: 0, risk: null } }), ctx.opt('decline', 'לסרב', true, { preview: { cash: 0, monthly: 0, months: 0, risk: null } })];
          const pick = mine >= 800000000 || (WINTER.includes(F.regime) && runwayOf(st) < 4) ? 'accept' : 'decline'; ev.options.find((o) => o.id === pick).primary = true; ev.forcePrimary = pick; return; }
        const amt = r1000(pre * it.k * it.pct / (1 - it.pct)); const after = round4(F.stake * (1 - it.pct));
        ev.title = 'הצעת השקעה'; ev.text = `קרן מציעה ${ctx.fmtM(amt)} תמורת ${Math.round(it.pct * 100)}% מהחברה (שווי לפני הכסף: ${ctx.fmtM(r1000(pre * it.k))}, פי ${it.k} מהשווי לפי השוק). החלק שלך יירד ל־${Math.round(after * 100)}%.`;
        ev.data = { kind: 'term', amount: amt, pct: it.pct, k: it.k, pre: r1000(pre * it.k), stake: F.stake, stakeAfter: after, runway: runwayOf(st), regime: F.regime, mult: multOf(st), note: 'כסף קונה זמן — ומוכר חתיכה ממך. השאלה כמה זמן אתה צריך, ובאיזה מחיר.' };
        ev.options = [ctx.opt('accept', `לקחת ${ctx.fmtM(amt)}`, true, { kind: 'raise', amount: amt, preview: { cash: amt, monthly: 0, months: 0, risk: null } }), ctx.opt('decline', 'לסרב', true, { preview: { cash: 0, monthly: 0, months: 0, risk: null } })];
        const need = runwayOf(st) < 9; const pick = need && it.k >= (WINTER.includes(F.regime) ? 0.8 : 0.95) ? 'accept' : 'decline'; ev.options.find((o) => o.id === pick).primary = true; ev.forcePrimary = pick;
      },
      choose(st, p, o, params, out, ctx) {
        const F = P(st); const it = p.item; if (!it || o.id === 'decline') { ctx.logDecision(st, 'פגישה עם משקיעים', 'סירב'); return true; }
        if (it.kind === 'buyout') { const price = r1000(it.k * evOf(st)); const mine = r1000(F.stake * (price + st.cash - F.debt)); st.cash = mine; F.debt = 0; F.sold = st.month; F.proceeds = mine;
          for (const a of st.assets) if (a.op && a.op.ck === 'app') { a.value = 0; } ctx.cashFx(out, mine, '+' + ctx.fmtM(mine)); out.mentor = ctx.mentorLine(st, 'offer', { amount: ctx.fmtM(mine) }) || `מכרת. ${ctx.fmtM(mine)} במזומן — בלי סיכון, ובלי עלייה.`; ctx.logDecision(st, 'פגישה עם משקיעים', 'מכר', mine); return true; }
        sellShares(st, it.pct, it.k, out, ctx, 'השקעה'); F.lastRaise = st.month; ctx.logDecision(st, 'פגישה עם משקיעים', 'גייס'); revalue(st); return true;
      },
    },
  },
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) { const F = P(st); for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op || a.op.ck !== 'app') continue;
    m.users = usersOf(st); m.runway = runwayOf(st); m.net = netOn(st); m.regime = F.regime; m.sold = !!F.sold; m.stake = F.stake; } },
  recapHint(st) { const F = P(st); if (!F) return null; if (F.crunches) return 'בפעם הבאה: לשמור שנה של מזומן. מי שנגמר לו הכסף מגייס בכל מחיר.'; if (F.stake < 0.25 && !F.sold) return 'בפעם הבאה: לגייס רק כמה שצריך, ובזמן הנכון. כל סבב מוכר חתיכה ממך.'; if (F.sold && F.proceeds < 800000000) return 'בפעם הבאה: הצעה ראשונה היא לא תמיד הטובה. מחיר קבוע עכשיו — מול חברה שעוד גדלה.'; return null; },
  goalValue(st, key) { if (key === 'stakeValue') return stakeValue(st); if (key === 'liqMonths') return runwayOf(st); if (key === 'liquid') return Math.max(0, st.cash); if (key === 'fixedMonth') return live(st) ? costOf(st) : 0; if (key === 'lastEvent:crunch') return P(st).crunchAt || 0; return 0; },
};
function revalue(st) { for (const a of st.assets) if (a.op && a.op.ck === 'app') { a.value = live(st) ? r1000(P(st).stake * evOf(st)) : 0; a.debt = 0; } }

platform.act = {
  spend(st, p, out) { const F = P(st); const [ch, l] = String(p || '').split(':'); const lv = +l; if (!live(st) || !CHANNELS.some((c) => c.id === ch) || !(lv >= 0 && lv < LEVELS.length) || Math.floor(lv) !== lv) return fail(out, 'bad_param'); if (lv > capOf(st)) return fail(out, 'צוות השיווק עוד קטן מדי לתקציב כזה'); if (lv > 0 && F.frozen >= st.month) return fail(out, 'המשקיעים של גיוס החירום הקפיאו את הפרסום');
    F.lvl[ch] = lv; out.toast = `${CHANNELS.find((c) => c.id === ch).n}: ${LEVELS[lv] ? (LEVELS[lv] / 1e6) + ' מיליון ₪ בחודש' : 'בלי פרסום'}.`; return true; },
  raise(st, p, out, ctx) { const F = P(st); if (!live(st) || !PF.raise[p]) return fail(out, 'bad_param'); if (st.month - F.lastRaise < PF.raiseEvery) return fail(out, 'סבב גיוס אחד בחצי שנה');
    const k = F.regime === 'bubble' ? PF.bubbleUp : WINTER.includes(F.regime) ? PF.winterCut : 1; sellShares(st, PF.raise[p], k, out, ctx, 'סבב גיוס'); F.lastRaise = st.month; revalue(st);
    out.toast = ctx.mentorLine(st, 'raised', {}) || `גייסת. החלק שלך עכשיו ${Math.round(F.stake * 100)}%.`; return true; },
  bridge(st, p, out, ctx) { const F = P(st); if (!live(st)) return fail(out, 'bad_param'); if (st.month - F.lastRaise < 3) return fail(out, 'גייסת לא מזמן'); sellShares(st, PF.raise.s, PF.bridge, out, ctx, 'הלוואת גישור מהמשקיעים'); F.lastRaise = st.month; revalue(st); return true; },
  debt(st, p, out, ctx) { const F = P(st); if (!live(st) || F.debt) return fail(out, F.debt ? 'כבר יש הלוואה' : 'bad_param'); if (runwayOf(st) < PF.covenant) return fail(out, `המלווה דורש לפחות ${PF.covenant} חודשי מזומן`);
    F.debt = PF.debt; st.cash += PF.debt; ctx.cashFx(out, PF.debt, '+' + ctx.fmtM(PF.debt)); out.toast = `הלוואת מיזם: ${ctx.fmtM(PF.debt)} ב־1% לחודש. תנאי: לפחות ${PF.covenant} חודשי מזומן, אחרת המלווה לוקח חלק מהחברה.`; return true; },
  repayDebt(st, p, out, ctx) { const F = P(st); if (!F.debt || st.cash < F.debt) return fail(out, 'אין מה להחזיר'); st.cash -= F.debt; ctx.cashFx(out, -F.debt, null); F.debt = 0; return true; },
  cut(st, p, out) { const F = P(st); if (!live(st) || F.cutUntil >= st.month) return fail(out, 'כבר קיצצת'); F.cutUntil = st.month + PF.cutMonths - 1; if (st.life) st.life.happiness = clamp(st.life.happiness - 5, 0, 100);
    out.toast = 'קיצוץ: 30% פחות הוצאות קבועות לחצי שנה. הצוות עצוב, והמוצר משתפר לאט יותר (נטישה +1%).'; return true; },
  pivot(st, p, out) { const F = P(st); if (!live(st) || F.pivots >= 1) return fail(out, 'אפשר לשנות כיוון פעם אחת'); F.pivots++; F.q = round3(frac(F.q * 7.31 + 0.37)); for (const c of F.coh) c.n = Math.round(c.n * 0.6); F.core = Math.round(F.core * 0.6);
    out.toast = 'שינוי כיוון: 40% מהמשתמשים עזבו, והמוצר החדש — עוד לא ידוע כמה טוב הוא. הכסף נשאר.'; return true; },
};
function actionList(st, ctx) {
  const F = P(st); const out = []; if (!live(st)) return out; const rw = runwayOf(st); const ltv = ltvOf(st); const winter = WINTER.includes(F.regime); const canRaise = st.month - F.lastRaise >= PF.raiseEvery;
  for (const C of CHANNELS) { const cur = F.lvl[C.id] || 0;
    let best = 0; for (let l = 1; l <= capOf(st); l++) { const s = LEVELS[l]; if (ltv >= 1.6 * cacOf(st, C.id, s) && rw >= 9 && st.cash > 6 * (costOf(st) - spendOf(st) + s - mrrOf(st))) best = l; }
    if (rw < 6) best = Math.min(best, cur > 0 ? cur - 1 : 0);
    for (let l = 0; l < LEVELS.length; l++) if (l !== cur) out.push({ id: 'spend', param: `${C.id}:${l}`, label: `${C.n}: ${LEVELS[l] ? ctx.fmtM(LEVELS[l]) + ' בחודש' : 'לעצור'} (עלות למשתמש ${l ? '₪' + Math.round(cacOf(st, C.id, LEVELS[l])) : '—'})`, enabled: l <= capOf(st) && !(l > 0 && F.frozen >= st.month), suggested: l === best && !(l > 0 && F.frozen >= st.month),
      cac: l ? cacOf(st, C.id, LEVELS[l]) : null, preview: { cash: 0, monthly: LEVELS[cur] - LEVELS[l], months: 0, risk: null } }); }
  for (const [sz, pct] of Object.entries(PF.raise)) { const k = F.regime === 'bubble' ? PF.bubbleUp : winter ? PF.winterCut : 1; const amt = r1000(Math.max(1, (evOf(st) + st.cash - F.debt) * k) * pct / (1 - pct));
    const sug = canRaise && ((sz === 'm' && rw < 9 && !winter) || (sz === 's' && rw < 6 && winter) || (sz === 'm' && F.regime === 'bubble' && rw < 18));
    out.push({ id: 'raise', param: sz, label: `סבב גיוס: ${ctx.fmtM(amt)} תמורת ${Math.round(pct * 100)}%${winter ? ' (חורף: מחיר נמוך)' : F.regime === 'bubble' ? ' (בועה: מחיר גבוה)' : ''}`, enabled: canRaise, suggested: sug, amount: amt, stakeAfter: round4(F.stake * (1 - pct)), preview: { cash: amt, monthly: 0, months: 0, risk: winter ? 'dilution' : null } }); }
  out.push({ id: 'bridge', param: null, label: 'גישור מהמשקיעים הקיימים (−20% במחיר)', enabled: st.month - F.lastRaise >= 3, suggested: rw < 4 && !canRaise && st.month - F.lastRaise >= 3, preview: { cash: 0, monthly: 0, months: 0, risk: 'dilution' } });
  out.push({ id: 'debt', param: null, label: `הלוואת מיזם ${ctx.fmtM(PF.debt)} (1% לחודש, תנאי: ${PF.covenant} חודשי מזומן)`, enabled: !F.debt && rw >= PF.covenant, suggested: false, preview: { cash: PF.debt, monthly: -PF.debt * PF.debtPct, months: 0, risk: 'covenant' } });
  if (F.debt) out.push({ id: 'repayDebt', param: null, label: `להחזיר את הלוואת המיזם (${ctx.fmtM(F.debt)})`, enabled: st.cash >= F.debt, suggested: st.cash >= F.debt + 12 * Math.max(0, -cfOf(st)) + 10000000, preview: { cash: -F.debt, monthly: F.debt * PF.debtPct, months: 0, risk: null } });
  out.push({ id: 'cut', param: null, label: 'לקצץ 30% מההוצאות הקבועות לחצי שנה', enabled: F.cutUntil < st.month, suggested: F.cutUntil < st.month && rw < 6 && !canRaise, preview: { cash: 0, monthly: Math.round(F.opex * PF.cutOpex), months: PF.cutMonths, risk: null } });
  out.push({ id: 'pivot', param: null, label: 'לשנות כיוון (40% מהמשתמשים עוזבים)', enabled: F.pivots < 1, suggested: F.pivots < 1 && st.month >= 9 && st.month <= 36 && F.coh.filter((c) => st.month - c.m >= 3).length >= 3 && F.coh.slice(-6).every((c) => shown(c, st.month).hi < 0.885), preview: { cash: 0, monthly: 0, months: 0, risk: 'unknown' } });
  return out;
}
function indicatorsOf(st, ctx) {
  const F = P(st); const rows = F.coh.slice(-12).map((c) => ({ m: c.m, size: c.size, users: c.n, ...shown(c, st.month), months: st.month - c.m }));
  const ch = CHANNELS.map((C) => ({ id: C.id, name: C.n, level: F.lvl[C.id] || 0, spend: LEVELS[F.lvl[C.id] || 0], cac: cacOf(st, C.id, LEVELS[Math.max(1, F.lvl[C.id] || 0)]) }));
  const ltv = ltvOf(st);
  return {
    platform: { cap: capOf(st), users: usersOf(st), tam: PF.tam, mrr: mrrOf(st), arr: mrrOf(st) * 12, arpu: F.arpu, cf: cfOf(st), cost: live(st) ? costOf(st) : 0, runway: runwayOf(st), regime: F.regime, regimeLabel: REGIMES[F.regime].label, mult: multOf(st), ev: evOf(st), stake: F.stake,
      stakeValue: stakeValue(st), debt: F.debt, raised: F.raised, rounds: F.rounds.slice(), ratchets: F.ratchets, crunches: F.crunches, breaches: F.breaches, net: netOn(st), netAt: PF.net, rival: F.rival, ltv, cac: ch, retEst: retEst(st), sold: !!F.sold, proceeds: F.proceeds, hist: F.hist.slice(-12) },
    panel: {
      id: 'platform', title: 'האפליקציה והגיוסים',
      gauges: [{ id: 'runway', label: 'חודשי מזומן (runway)', value: Math.min(runwayOf(st), 36), ref: 12, max: 36 }, { id: 'ltvCac', label: 'שווי לקוח מול עלות גיוס', value: round2(ltv / Math.max(1, Math.min(...ch.map((c) => c.cac)))), ref: 3, max: 8 },
        { id: 'stake', label: 'החלק שלך בחברה', value: F.stake, ref: 0.5, max: 1 }, { id: 'users', label: 'משתמשים מול סף אפקט הרשת', value: usersOf(st), ref: PF.net, max: PF.net * 3 }],
      table: ch, rows, actions: actionList(st, ctx),
    },
  };
}
export default platform;
