// Rule adapter `league` — w13 אצטדיון הכוכבים (CATALOG-25 §1.4 / §2.2; docs/full-upgrade/worlds/w13-stadium.md). A football club in a fictional
// 3-tier league of 8 clubs: the final rank pays on a cliff (top 2 go up a tier: revenue ×1.6; the bottom 2 go down: ×0.6), wages are locked
// in contracts, players carry a BOOK value (fee − straight-line amortisation over the contract) and a MARKET value (rating × age curve).
// Net worth counts the book (hype does not count); selling above book realises the gain. Players are bought in the `auction` module.
//
// Contract: a mech-contract object (DESIGN §4.2) that owns no subsystem of its own; all state lives in st.world.league (V-adapter). Pure,
// deterministic, only + − × ÷ round / min / max / floor. Fixed 'world' draws: 18 at init (one per starting-squad slot: sealed potential and
// injury-proneness), 6 every payday (4 fixtures, one per match of the round — drawn in window months too — + 2 injury draws: whether and who).
// The season calendar (the `season` profile "league" of the catalog) is this adapter's: 12 months = summer window, 5 rounds, winter window,
// 5 rounds; the season ends after round 10. The w5 `season` module itself is hotel-specific and is not attached (see the world doc).
import { ID as AUCTION } from '../mech/auction.js';

export const ID = 'league';
export const SQUAD = 18;
export const DRAWS = Object.freeze({ init: SQUAD, month: 6, landing: Object.freeze({}) });
export const DIVS = Object.freeze([Object.freeze({ n: 'הדרג השלישי', m: 0.6, tv: 0.45, base: 50 }), Object.freeze({ n: 'הדרג השני', m: 1.0, tv: 1, base: 58 }), Object.freeze({ n: 'הדרג הראשון', m: 1.6, tv: 2.0, base: 66 })]);
const OFFS = Object.freeze([-7, -5, -2, 0, 2, 5, 8]);
export const REV = Object.freeze({ seats: 20000, price: 150, tv: 6500000, merch: 1200000, ops: 3500000, opsDiv: 500000, prize: Object.freeze([12e6, 8e6, 5e6, 3e6, 2e6, 1e6, 0, 0]) });
export const PAY = Object.freeze({ wage: 0.06, minWage: 20000, sellWindow: 1, sellForced: 0.9, injP: 0.3, minSquad: 15 });
/** Financial fair play: the season-end check (wages > 80 % of the 12-month revenue → a fine of 4 % of it); the FFP audit card checks 75 %. */
export const FFP = Object.freeze({ season: 0.8, audit: 0.75, fine: 0.04 });
export const BUILD = Object.freeze({ expand: 50000000, seats: 0.4, stageMonths: 3, during: 0.85, train: 25000000, trainUp: 150000, acad: 15000000, acadUp: 100000, naming: 0.08, namingMonths: 36, namingNow: 0.7, owner: 10000000, ownerHappy: 4, cut: 0.15 });
const NAMES = Object.freeze([
  ['שועלי העמק', 'גלי החוף', 'ברקי הנגב', 'תמרי הערבה', 'בזי המדבר', 'יעלי המכתש', 'אדומי המכרות'],
  ['נשרי ההר', 'כרישי המפרץ', 'אריות השפלה', 'זאבי הגליל', 'דולפיני הנמל', 'פרשי הגבעה', 'אלוני השרון'],
  ['כוכבי הצפון', 'סערת הדרום', 'נמרי הרכס', 'ינשופי הלילה', 'צבאי הבקעה', 'קרני האור', 'חומות העיר']]);
const FIRST = Object.freeze(['אלון', 'בועז', 'גיל', 'דור', 'הדר', 'זיו', 'חן', 'טל', 'יואב', 'כפיר', 'ליאם', 'מתן', 'נדב', 'עידו', 'פלג', 'צחי', 'רון', 'שי', 'תום', 'יונתן', 'עומר', 'ניר', 'אביב', 'שגיא']);
const LAST = Object.freeze(['ברק־אור', 'גפני', 'הררי', 'ולדמן', 'זהרי', 'חרמוני', 'יערי', 'כרמי', 'לוטם', 'מגני', 'נחשוני', 'סלעי', 'פזי', 'צורי', 'קדמי', 'רימוני', 'שחמי', 'תבורי', 'ארבלי', 'גלעדי', 'אלמוגי', 'נווה־טל', 'בר־שקד']);
export const playerName = (id) => FIRST[(id * 7) % FIRST.length] + ' ' + LAST[(id * 13 + Math.floor(id / FIRST.length)) % LAST.length];
export const clubNames = () => NAMES.flat();

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;
const LG = (st) => st.world.league;
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
/** Price of a rating (before age): ₪400k × ((r − 35) / 5)². */
export const PV = (r) => { const q = Math.max(0, (r - 35) / 5); return 400000 * q * q; };
export const ageF = (a) => (a <= 21 ? 1.3 : a <= 24 ? 1.2 : a <= 28 ? 1 : a <= 30 ? 0.75 : a <= 32 ? 0.5 : 0.3);
export const wageFor = (r) => Math.max(PAY.minWage, r1000(PV(r) * PAY.wage));
const feeMult = (st) => (LG(st).feeUntil >= st.month ? 1.2 : 1);
export const mv = (st, p) => r1000(PV(p.r) * ageF(p.age) * feeMult(st));
export const book = (st, p) => (p.fee ? r1000(p.fee * Math.max(0, p.until - st.month) / Math.max(1, p.amort)) : 0);
const avail = (st, p) => !(p.out >= st.month) && !(p.loan >= st.month);
const ranked = (st) => LG(st).squad.filter((p) => avail(st, p)).sort((a, b) => b.r - a.r || a.id - b.id);
/** Team strength: the mean rating of the best 11 available players (a missing place counts as 35). */
export function strength(st) { const xs = ranked(st).slice(0, 11).map((p) => p.r); while (xs.length < 11) xs.push(35); return round1(xs.reduce((s, x) => s + x, 0) / 11); }
export const wagesOf = (st) => LG(st).squad.reduce((s, p) => s + (p.loan >= st.month ? 0 : p.wage), 0);
export const squadBook = (st) => LG(st).squad.reduce((s, p) => s + book(st, p), 0);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);
export function ratio12(st) { const L = LG(st); const r = sum(L.rev12); return r > 0 ? round2(sum(L.wage12) / r) : 0; }
const isWindow = (m) => (m - 1) % 12 === 0 || (m - 1) % 12 === 6;
const fanAdj = (st) => sum((LG(st).fans || []).filter((f) => f.until >= st.month).map((f) => f.d));
const sponsors = (st) => st.assets.filter((a) => a.op && a.op.ck === 'sponsor');
function potRange(st, pot, r, u) { const w = st.charId === 'coachOwner' ? 5 : 15; const lo = Math.max(r, Math.round(pot - w * u)); return { lo, hi: Math.max(lo, Math.round(pot - w * u + 2 * w)) }; }
function newPlayer(st, o, d) { // d = a draw in [0,1): the sealed potential and injury-proneness
  const L = LG(st); const id = L.pid++; const pot = o.age <= 23 ? Math.min(92, o.r + 4 + 22 * d) : o.age <= 27 ? o.r + 4 * d : o.r;
  return { id, n: playerName(id), age: o.age, r: o.r, pot: round1(pot), ...potRange(st, pot, o.r, 2 * frac(d * 31)), inj: round2(0.02 + 0.08 * frac(d * 97)), gr: round2(0.4 + frac(d * 53)), out: 0, loan: 0, wage: o.wage ?? wageFor(o.r),
    fee: o.fee || 0, amort: o.amort || 36, until: o.until || st.month + 36, since: st.month, acad: !!o.acad };
}
/** One fixture: 3 / 1 / 0 points from relative strength, home edge and one draw. */
function result(sa, sb, home, r) { const d = (sa - sb) / 12 + (home ? 0.05 : -0.05); const pw = clamp(0.4 + 0.45 * d, 0.05, 0.88); const pd = clamp(0.27 - 0.15 * Math.abs(d), 0.08, 0.27); return r < pw ? [3, 0] : r < pw + pd ? [1, 1] : [0, 3]; }
function newTable(st, div, rs) { return NAMES[div].map((n, i) => ({ n, s: round1(DIVS[div].base + OFFS[i] + (frac(rs[i % rs.length] * (13 + i * 7)) - 0.5) * 4), pts: 0 })); }
/** The table now: us + the 7 rivals, sorted (points, then strength). */
export function table(st) { const L = LG(st); return [{ n: ctxName(st), s: strength(st), pts: L.pts, us: true }, ...L.opp.map((o) => ({ ...o, us: false }))].sort((a, b) => b.pts - a.pts || b.s - a.s || (a.us ? -1 : 1)); }
const ctxName = (st) => LG(st).club || 'הכוכבים';
export const rankOf = (st) => table(st).findIndex((x) => x.us) + 1;
/** The expected monthly revenue of the club at the current tier (an average month: 10 of 12 have matches). */
function expRev(st, div = LG(st).div) { const L = LG(st); const D = DIVS[div]; return Math.round((L.seats * 2 * REV.price * 0.62 * 10 / 12 + REV.merch) * D.m + REV.tv * L.tvMult * D.tv); }
function monthMoney(st) {
  const L = LG(st); const m = st.month; const D = DIVS[L.div].m; const form = sum(L.form.slice(-3));
  const fill = clamp(0.55 + 0.04 * (form - 4) + fanAdj(st), 0.25, 1); const cap = L.seats * (L.build ? BUILD.during : 1);
  const gate = isWindow(m) ? 0 : Math.round(cap * 2 * REV.price * fill * D); const share = L.naming && L.naming.mode === 'share' && L.naming.until >= m ? Math.round(gate * BUILD.naming) : 0;
  const tv = Math.round(REV.tv * L.tvMult * DIVS[L.div].tv); const merch = Math.round(REV.merch * D * (0.8 + 0.4 * fill)); const rev = gate + tv + merch + share;
  const wages = wagesOf(st); const ops = REV.ops + REV.opsDiv * L.div + (L.train ? BUILD.trainUp : 0) + (L.acad ? BUILD.acadUp : 0);
  return { fill: round2(fill), gate, tv, merch, share, rev, wages, ops, cf: Math.round((rev - wages - ops) / 10) * 10 };
}
/** The club at book: the squad's book + the stadium works and facilities at cost. */
export function clubValue(st) { const L = LG(st); return r1000(squadBook(st) + L.built * BUILD.expand + (L.build ? L.build.paid : 0) + (L.train ? BUILD.train : 0) + (L.acad ? BUILD.acad : 0)); }
function revalue(st) { for (const a of st.assets) if (a.op && a.op.ck === 'club') { a.value = clubValue(st); a.debt = 0; } }

export const league = {
  id: ID, uses: [AUCTION, 'season'], draws: DRAWS,
  lessons: ['rank_cliff', 'book_value'],
  mentorKeys: ['promoted', 'relegated', 'stayed', 'sold', 'wageHigh'],
  sealed: ['world.league.squad[].pot', 'world.league.squad[].inj', 'world.league.squad[].gr', 'world.league.inits'],

  init(st, w, ch, ctx) {
    const rs = []; for (let i = 0; i < SQUAD; i++) rs.push(ctx.draw(st)); // exactly 18 'world' draws at init, whoever plays
    const S = (ch && ch.start) || {}; const div = S.div ?? 1;
    st.world.league = { div, season: 1, round: 0, pts: 0, form: [], opp: [], squad: [], pid: 1, rev12: [], wage12: [], seats: REV.seats, fans: [], naming: null, build: null, built: 0, train: 0, acad: 0, tvMult: 1, feeUntil: 0, coachUntil: 0,
      cutSeason: 0, owner: 0, forced: 0, ffp: 0, sold: 0, soldGain: 0, hist: [], starAt: 0, club: S.club || 'הכוכבים', inits: rs, last: null };
    const L = st.world.league; L.opp = newTable(st, div, rs);
    (S.squad || []).forEach((x, i) => { const [age, r, bk, left, acad] = x; const amort = 36; const fee = bk && left ? Math.round(bk * amort / left) : 0;
      L.squad.push(newPlayer(st, { age, r, fee, amort, until: 1 + (left || 24), acad: !!acad, wage: Math.round(wageFor(r) * (S.wageMult || 1) / 1000) * 1000 }, rs[i % SQUAD])); });
    L.last = { ...monthMoney(st), gate: 0 }; L.last.rev = L.last.tv + L.last.merch; L.last.cf = L.last.rev - L.last.wages - L.last.ops;
  },
  defaults(st) { const L = LG(st); if (!L) return; if (!Array.isArray(L.fans)) L.fans = []; if (!Array.isArray(L.hist)) L.hist = []; },

  monthly(st, out, ctx) {
    const L = LG(st); const rs = []; for (let i = 0; i < 6; i++) rs.push(ctx.draw(st)); // exactly 6 'world' draws every payday
    const m = st.month; const mi = (m - 1) % 12; const win = isWindow(m);
    // players: growth (young toward the sealed potential, faster with a training ground; a poached coach stops it), decline after 30, returns
    for (const p of L.squad) {
      const g = L.coachUntil >= m ? 0 : (p.age <= 23 ? 0.5 * (L.train ? 1.5 : 1) : p.age <= 28 ? 0.15 : 0) * (p.gr ?? 1); // gr: the player's sealed pace (0.4–1.4)
      if (p.r < p.pot && g) p.r = round1(Math.min(p.pot, p.r + g)); if (p.age >= 31) p.r = round1(Math.max(30, p.r - 0.25));
      if (p.loan && p.loan < m) p.loan = 0;
    }
    for (const p of L.squad.filter((x) => x.until <= m)) { L.squad.splice(L.squad.indexOf(p), 1); out.news.push({ kind: 'league', text: `החוזה של ${p.n} נגמר והוא עזב בלי תמורה.` }); }
    if (win && L.squad.length < PAY.minSquad) { let n = 0; while (L.squad.length < PAY.minSquad) { L.squad.push(newPlayer(st, { age: 30, r: 45, until: m + 12, amort: 12 }, 0)); n++; } // the league's rule: free agents at the minimum fill the squad
      out.news.push({ kind: 'league', text: `הסגל קטן מדי: ${n} שחקנים חופשיים הצטרפו בשכר מינימום לשנה.` }); }
    // an injury (2 draws, always): whether, then who — weighted by the sealed proneness of the available players
    if (rs[4] < PAY.injP) { const fit = L.squad.filter((p) => avail(st, p)); const tot = sum(fit.map((p) => p.inj)); let acc = 0; const pick = rs[5] * tot;
      for (const p of fit) { acc += p.inj; if (acc >= pick) { p.out = m + Math.floor(frac(rs[5] * 977) * 3); out.news.push({ kind: 'league', text: `${p.n} נפצע${p.out > m ? ` ויחזור בעוד ${p.out - m + 1} חודשים` : ' ויחזור בחודש הבא'}.` }); break; } } }
    // the round: our match and the 3 other fixtures (one draw each)
    if (!win && L.round < 10) {
      const k = L.round; const o = k % 7; const others = L.opp.map((_, i) => i).filter((i) => i !== o); const rot = others.map((_, i) => others[(i + k) % 6]);
      const [a, b] = result(strength(st), L.opp[o].s, k % 2 === 0, rs[0]); L.pts += a; L.opp[o].pts += b; L.form.push(a); while (L.form.length > 3) L.form.shift();
      for (let j = 0; j < 3; j++) { const [x, y] = result(L.opp[rot[j]].s, L.opp[rot[5 - j]].s, true, rs[1 + j]); L.opp[rot[j]].pts += x; L.opp[rot[5 - j]].pts += y; }
      L.round++; out.news.push({ kind: 'league', text: `מחזור ${L.round}: ${a === 3 ? 'ניצחון' : a === 1 ? 'תיקו' : 'הפסד'} מול ${L.opp[o].n}. ${ctxName(st)} במקום ${rankOf(st)}.` });
    }
    // this month's money (paid at the next payday through the club's cash flow); the 12-month wage ring counts the sponsors as revenue
    L.last = monthMoney(st); const sp = sum(sponsors(st).map((a) => Math.max(0, ctx.assetCf(st, a))));
    L.rev12.push(L.last.rev + sp); L.wage12.push(L.last.wages); while (L.rev12.length > 12) L.rev12.shift(); while (L.wage12.length > 12) L.wage12.shift();
    if (L.rev12.length >= 6 && ratio12(st) > 0.8) out.news.push({ kind: 'league', text: ctx.mentorLine(st, 'wageHigh', { pct: String(Math.round(ratio12(st) * 100)) }) || `השכר אוכל ${Math.round(ratio12(st) * 100)}% מההכנסות. חוזים נעולים לא מתכווצים כשההכנסה יורדת.` });
    if (L.build && m >= L.build.at) { if (L.build.stage === 1) { const c = r1000(BUILD.expand / 2); st.cash -= c; L.build.paid += c; ctx.cashFx(out, -c, `שלב ב׳ ביציע ${ctx.fmtM(c)}`); L.build = { ...L.build, stage: 2, at: m + BUILD.stageMonths }; }
      else { L.built++; L.seats = Math.round(L.seats * (1 + BUILD.seats)); L.build = null; out.news.push({ kind: 'league', text: `היציע החדש נפתח: ${L.seats} מקומות.` }); } }
    if (mi === 11 && L.round >= 10) seasonEnd(st, out, ctx, rs);
    if (win && st.charId === 'localTycoon' && st.month > 1 && L.starAt < m - 5) { st.life.happiness = clamp(st.life.happiness - 5, 0, 100); out.news.push({ kind: 'league', text: 'האוהדים שרים נגדך ביציע: "איפה הכוכב?" חלון העברות בלי כוכב חדש עולה במצב הרוח.' }); }
    if (st.cash < 0) ctx.ensureCash(st, out, 'league');
    revalue(st);
  },
  asset: {
    create(st, a, card) { const op = JSON.parse(JSON.stringify(card.op)); a.op = op; if (op.ck === 'sponsor') { op.until = st.month + ((op.gen && op.gen.months) || op.months || 24); a.value = 0; } if (op.ck === 'club') { a.value = clubValue(st); a.debt = 0; } },
    cf(st, a) { const o = a.op; if (o.ck === 'club') return LG(st).last ? LG(st).last.cf : 0; if (o.ck === 'sponsor') return o.until >= st.month ? Math.round((a.cf || 0) / 10) * 10 : 0; return Math.round((a.cf || 0) / 10) * 10; },
  },
  deal: { describe(st, p, ev) { const c = p.card; if (!c.op) return; ev.data.league = { ck: c.op.ck, months: (c.op.gen && c.op.gen.months) || c.op.months || null, wageRatio: ratio12(st), note: c.op.ck === 'sponsor' ? 'חסות: כסף כל חודש עד סוף החוזה. שערורייה אצל נותן החסות — והחוזה נגמר.' : 'נכס של המועדון: הכנסה קבועה מהאוהדים.' }; } },
  market: {
    create(st, p, ctx) {
      const c = p.card; const L = LG(st); const m = st.month; const D = DIVS[L.div].m;
      if (c.mk === 'tv') L.tvMult = round2(L.tvMult * (1 + c.add));
      if (c.mk === 'fees') L.feeUntil = m + (c.months || 6);
      if (c.mk === 'coach') L.coachUntil = m + (c.months || 6);
      if (c.mk === 'cup') { const amt = r1000(c.amt * D); st.cash += amt; p.amount = amt; L.fans.push({ d: 0.05, until: m + 2 }); }
      if (c.mk === 'derby') L.fans.push({ d: c.fan || 0.1, until: m });
      if (c.mk === 'star') { const s = ranked(st)[0]; if (s) { s.wage = r1000(s.wage * (1 + c.add)); p.hit = s.id; } }
      void ctx;
    },
    describe(st, p, ev, ctx) { const c = p.card; const L = LG(st); ev.data.league = { mk: c.mk, amount: p.amount || 0, tvMult: L.tvMult, div: L.div, star: p.hit ? (L.squad.find((x) => x.id === p.hit) || {}).n || null : null };
      if (p.amount) { ev.toastText = `${c.n}: ${ctx.fmtM(p.amount)}`; } },
  },
  crisis: {
    create(st, p) {
      const c = p.card; const L = LG(st); const m = st.month;
      if (c.mk === 'ffp') { if (L.rev12.length >= 6 && ratio12(st) > FFP.audit) { const fine = r1000(sum(L.rev12) * FFP.fine); st.cash -= fine; L.ffp++; L.ffpAt = st.stats.paydays; p.hit = fine; } }
      if (c.mk === 'scandal') { const s = sponsors(st).filter((a) => a.op.until >= m).sort((x, y) => y.cf - x.cf || x.id - y.id)[0]; if (s) { s.op.until = m - 1; p.hit = s.id; } }
      if (c.mk === 'protest') L.fans.push({ d: -0.2, until: m + 1 });
      if (c.mk === 'roof') { const amt = r1000(c.amt * (1 + L.built)); st.cash -= amt; p.hit = amt; }
    },
  },
  tiles: {},
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out) { const L = LG(st); for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op) continue;
    if (a.op.ck === 'club') { m.seats = L.seats; m.stage = L.build ? L.build.stage : 0; m.expanded = L.built; m.fill = L.last ? L.last.fill : 0.6; m.div = L.div; m.rank = rankOf(st); m.floodlights = true; m.training = !!L.train; m.academy = !!L.acad; }
    if (a.op.ck === 'sponsor') m.expired = a.op.until < st.month; } },
  recapHint(st) { const L = LG(st); if (!L) return null; if (L.ffp || ratio12(st) > 0.75) return 'בפעם הבאה: שכר שאפשר לשאת. חוזים נעולים לשנים — וההכנסה תלויה במקום בטבלה.'; if (L.div <= 1 && L.hist.every((h) => h.rank > 2)) return 'בפעם הבאה: עלייה לדרג הראשון שווה פי 1.6 בהכנסות. לפעמים שווה לשלם בשבילה — אם השכר לא נועל אותך.'; if (!L.sold) return 'בפעם הבאה: לקנות צעירים ולמכור בשיא. הרווח נרשם רק במכירה.'; return null; },
  goalValue(st, key) { if (key === 'wageRatio12') return LG(st).rev12.length ? ratio12(st) : 1; if (key === 'lastEvent:ffp') return LG(st).ffpAt || 0; if (key === 'squadBook') return squadBook(st); return 0; },
};
function seasonEnd(st, out, ctx, rs) {
  const L = LG(st); const rank = rankOf(st); const D = DIVS[L.div].m; const prize = r1000(REV.prize[rank - 1] * D); const was = L.div;
  if (prize) { st.cash += prize; ctx.cashFx(out, prize, `פרס על מקום ${rank} ${ctx.fmtM(prize)}`); }
  if (L.rev12.length >= 6 && ratio12(st) > FFP.season) { const fine = r1000(sum(L.rev12) * FFP.fine); st.cash -= fine; L.ffp++; L.ffpAt = st.stats.paydays; ctx.cashFx(out, -fine, `קנס יציבות פיננסית ${ctx.fmtM(fine)}`);
    out.news.push({ kind: 'league', text: `ביקורת סוף העונה: השכר הוא ${Math.round(ratio12(st) * 100)}% מההכנסות (מעל ${Math.round(FFP.season * 100)}%). קנס של ${ctx.fmtM(fine)}.` }); }
  if (rank <= 2 && L.div < 2) L.div++; else if (rank >= 7 && L.div > 0) L.div--;
  L.hist.push({ season: L.season, div: was, rank, pts: L.pts }); while (L.hist.length > 12) L.hist.shift();
  const key = L.div > was ? 'promoted' : L.div < was ? 'relegated' : 'stayed'; if (key === 'promoted') ctx.fireTrigger(st, 'league:promoted');
  out.news.push({ kind: 'league', text: ctx.mentorLine(st, key, { rank: String(rank), div: DIVS[L.div].n }) || `סוף העונה: מקום ${rank}. ${key === 'promoted' ? `עלייה ל${DIVS[L.div].n} — ההכנסות קופצות פי 1.6.` : key === 'relegated' ? `ירידה ל${DIVS[L.div].n} — ההכנסות צונחות, והשכר נשאר.` : `נשארים ב${DIVS[L.div].n}.`}` });
  ctx.lesson(st, out, 'rank_cliff');
  L.opp = newTable(st, L.div, rs); L.pts = 0; L.round = 0; L.form = []; L.season++;
  for (const p of L.squad) p.age++;
  const intake = (st.charId === 'academyDirector' ? 1 : 0) + (L.acad ? 1 : 0);
  for (let i = 0; i < intake; i++) { const d = frac(rs[i] * 7.31 + rs[5]); const p = newPlayer(st, { age: 17, r: 44 + Math.floor(d * 9), wage: PAY.minWage, acad: true, until: st.month + 36 }, d); L.squad.push(p); out.news.push({ kind: 'league', text: `מהאקדמיה עלה ${p.n} (17). פוטנציאל ${p.lo}–${p.hi}.` }); }
}

/* ---------------------------------------------------------------- the transfer market's lot source (wired by the world: world.auction) */
export function lotOf(st, rs, ctx) {
  const pool = (ctx.world(st).auction || {}).pool || []; if (!pool.length) return null;
  const T = pool[Math.floor(frac(rs[0] * 13) * pool.length)]; const age = T.age[0] + Math.floor(frac(rs[0] * 101) * (T.age[1] - T.age[0] + 1)); const r = round1(T.r[0] + (T.r[1] - T.r[0]) * frac(rs[0] * 211));
  const d = frac(rs[0] * 307); const pot = age <= 23 ? Math.min(92, r + 4 + 22 * d) : age <= 27 ? r + 4 * d : r; const inj = round2(0.02 + 0.08 * frac(rs[0] * 97)); const sh = potRange(st, pot, r, 2 * frac(rs[0] * 31));
  const est = (pp) => r + (age <= 23 ? Math.min(6, Math.max(0, pp - r)) : 0); const k = ageF(age) * feeMult(st);
  const value = r1000(PV(est((sh.lo + sh.hi) / 2)) * k); const trueValue = r1000(PV(est(pot)) * k * (1.12 - 2 * inj)); const months = age <= 29 ? 36 : 24; const wage = r1000(wageFor(r) * (T.wageMult || 1));
  const better = ranked(st).filter((p) => p.r >= r).length + 1;
  return { title: `${playerName(LG(st).pid)} (${age})`, text: `${T.d} דירוג ${r}, פוטנציאל ${sh.lo}–${sh.hi}. שכר ${ctx.fmtM(wage)} בחודש ל־${months} חודשים.`, value, trueValue, reserve: r1000(value * 0.8), lo: 0.8, span: 0.5,
    sealed: { pot: round1(pot), inj, gr: round2(0.4 + frac(rs[0] * 53)) }, data: { band: T.band, age, r, potLo: sh.lo, potHi: sh.hi, wage, months, mv: value, squadRank: better, wageRatio: ratio12(st) } };
}
export function awardLot(st, it, price, out, ctx) {
  const L = LG(st); const D = it.data; const p = newPlayer(st, { age: D.age, r: D.r, wage: D.wage, fee: price, amort: D.months, until: st.month + D.months }, 0.5);
  p.pot = it.sealed.pot; p.inj = it.sealed.inj; p.gr = it.sealed.gr; p.lo = D.potLo; p.hi = D.potHi; L.squad.push(p); if (p.r >= 75) L.starAt = st.month;
  out.news.push({ kind: 'league', text: `${p.n} חתם ל־${D.months} חודשים. בספרים: ${ctx.fmtM(price)}, יורד כל חודש עד סוף החוזה.` }); ctx.lesson(st, out, 'book_value'); revalue(st);
}
/** The most the guide pays for a lot: only a player who would start (top 11 with his rating in a year), only while the 12-month wage
 *  ratio with his wage stays ≤ 66 % of the expected revenue, and only with 2 months of the club's costs left in cash. */
export function lotBudget(st, it, ctx) {
  const L = LG(st); const D = it.data; const top = ranked(st); const eleventh = top.length >= 11 ? top[10].r : 35;
  const r1 = D.r + (D.age <= 23 ? Math.min(6, Math.max(0, (D.potLo + D.potHi) / 2 - D.r)) : 0); const sp = sum(sponsors(st).map((a) => a.cf || 0)); const w = wagesOf(st) + D.wage;
  const now = w / Math.max(1, expRev(st) + sp); const up = w / Math.max(1, expRev(st, Math.min(2, L.div + 1)) + sp);
  const push = L.div < 2 && L.round <= 6 && rankOf(st) <= 4 && up <= 0.62; // the promotion push: affordable at the next tier's revenue
  if (r1 < eleventh + (D.age <= 23 ? 0 : 3) || D.age >= 32 || !(now <= 0.72 || push)) return 0; // a youngster who will start once he grows is worth a place
  const res = 2 * (wagesOf(st) + REV.ops + REV.opsDiv * L.div); void ctx; return Math.max(0, Math.min(st.cash - res, r1000(it.value * GUIDE_SHADE)));
}
/** The guide bids at most 92 % of the public estimate (shading for the winner's curse). */
export const GUIDE_SHADE = 0.92;
/* ---------------------------------------------------------------- between-roll actions (`Z`) and the panel */
const findP = (st, id) => LG(st).squad.find((p) => p.id === +String(id || '').replace(/^p/, '')) || null;
league.act = {
  sell(st, p, out, ctx) { const L = LG(st); const x = findP(st, p); if (!x) return fail(out, 'bad_param'); if (L.squad.length <= PAY.minSquad) return fail(out, `צריך לפחות ${PAY.minSquad} שחקנים בסגל`);
    const forced = !isWindow(st.month); const price = r1000(mv(st, x) * (forced ? PAY.sellForced : PAY.sellWindow)); const bk = book(st, x); L.squad.splice(L.squad.indexOf(x), 1); st.cash += price; L.sold++; L.soldGain += price - bk; if (forced) L.forced++;
    ctx.cashFx(out, price, '+' + ctx.fmtM(price)); ctx.lesson(st, out, 'book_value'); revalue(st); ctx.logDecision(st, 'מכירת שחקן', forced ? 'מחוץ לחלון' : 'בחלון', price);
    out.toast = ctx.mentorLine(st, 'sold', { name: x.n, price: ctx.fmtM(price), gain: ctx.sgn(price - bk) }) || `${x.n} נמכר ב־${ctx.fmtM(price)} (${ctx.sgn(price - bk)} מול הספרים)${forced ? ' — מחוץ לחלון, 10% הנחה' : ''}.`; return true; },
  loanOut(st, p, out) { const x = findP(st, p); if (!x || x.loan >= st.month) return fail(out, 'bad_param'); x.loan = st.month + 5 - ((st.month - 1) % 6); out.toast = `${x.n} יצא להשאלה עד החלון הבא. המועדון השני משלם את השכר שלו.`; return true; },
  renew(st, p, out) { const x = findP(st, p); if (!x || x.until - st.month > 6) return fail(out, 'אפשר לחדש רק חצי שנה לפני הסוף'); const w = Math.max(x.wage, wageFor(x.r)); x.amort = 36; x.fee = book(st, x); x.until = st.month + 36; x.since = st.month; x.wage = w; out.toast = `${x.n} חתם מחדש ל־36 חודשים. שכר: ${Math.round(w / 1000)} אלף ₪ בחודש.`; revalue(st); return true; },
  expand(st, p, out, ctx) { const L = LG(st); if (L.build || L.built >= 2) return fail(out, L.build ? 'כבר בונים' : 'האצטדיון כבר גדול'); const c = r1000(BUILD.expand / 2); if (st.cash < c) return fail(out, 'אין מספיק מזומן');
    st.cash -= c; L.build = { stage: 1, at: st.month + BUILD.stageMonths, paid: c }; ctx.cashFx(out, -c, `שלב א׳ ביציע ${ctx.fmtM(c)}`); revalue(st); out.toast = `מתחילים להרחיב את היציע: 2 שלבים של ${BUILD.stageMonths} חודשים. בזמן הבנייה 15% פחות מקומות.`; return true; },
  train(st, p, out, ctx) { const L = LG(st); if (L.train) return fail(out, 'כבר יש מתחם אימונים'); if (st.cash < BUILD.train) return fail(out, 'אין מספיק מזומן'); st.cash -= BUILD.train; L.train = 1; ctx.cashFx(out, -BUILD.train, null); revalue(st); out.toast = 'מתחם אימונים חדש: צעירים משתפרים פי 1.5 מהר יותר.'; return true; },
  academy(st, p, out, ctx) { const L = LG(st); if (L.acad) return fail(out, 'כבר שדרגת את האקדמיה'); if (st.cash < BUILD.acad) return fail(out, 'אין מספיק מזומן'); st.cash -= BUILD.acad; L.acad = 1; ctx.cashFx(out, -BUILD.acad, null); revalue(st); out.toast = 'האקדמיה שודרגה: שחקן צעיר נוסף בכל סוף עונה.'; return true; },
  naming(st, p, out, ctx) { const L = LG(st); if (L.naming && L.naming.until >= st.month) return fail(out, 'כבר יש חוזה שם'); if (!['now', 'share'].includes(p)) return fail(out, 'bad_param');
    const gate = L.seats * 2 * REV.price * 0.62 * DIVS[L.div].m * 10 / 12; const lump = r1000(gate * BUILD.naming * BUILD.namingMonths * BUILD.namingNow);
    L.naming = { mode: p, until: st.month + BUILD.namingMonths - 1, lump: p === 'now' ? lump : 0 }; if (p === 'now') { st.cash += lump; ctx.cashFx(out, lump, '+' + ctx.fmtM(lump)); }
    out.toast = p === 'now' ? `מכרת את שם האצטדיון ל־3 שנים: ${ctx.fmtM(lump)} עכשיו.` : 'מכרת את שם האצטדיון ל־3 שנים: 8% מהכרטיסים בכל חודש.'; return true; },
  ownerLoan(st, p, out, ctx) { const L = LG(st); L.owner += BUILD.owner; st.cash += BUILD.owner; st.life.happiness = clamp(st.life.happiness - BUILD.ownerHappy, 0, 100); ctx.cashFx(out, BUILD.owner, '+' + ctx.fmtM(BUILD.owner)); out.toast = `הלוואת בעלים: ${ctx.fmtM(BUILD.owner)} מהכיס שלך — חוב של המועדון אליך, ולילות בלי שינה.`; return true; },
  ownerRepay(st, p, out, ctx) { const L = LG(st); const amt = Math.min(L.owner, BUILD.owner); if (amt <= 0 || st.cash < amt) return fail(out, 'אין מה להחזיר'); L.owner -= amt; st.cash -= amt; ctx.cashFx(out, -amt, null); return true; },
  wageCut(st, p, out) { const L = LG(st); if (L.cutSeason === L.season) return fail(out, 'כבר הייתה הסכמה העונה'); const star = ranked(st)[0]; if (!star) return fail(out, 'bad_param');
    L.squad.splice(L.squad.indexOf(star), 1); for (const x of L.squad) x.wage = r1000(x.wage * (1 - BUILD.cut)); L.cutSeason = L.season; revalue(st); out.toast = `השחקנים הסכימו לקיצוץ של 15% בשכר — ו${star.n}, הכוכב, עזב בלי תמורה.`; return true; },
};
league.liability = (st) => LG(st).owner || 0;
function actionList(st, ctx) {
  const L = LG(st); const out = []; const win = isWindow(st.month); const top = ranked(st); const res = 2 * (wagesOf(st) + REV.ops + REV.opsDiv * L.div); const ratio = wagesOf(st) / Math.max(1, expRev(st)); const rankIx = new Map(top.map((p, i) => [p.id, i]));
  for (const x of L.squad) { const v = mv(st, x); const bk = book(st, x); const i = rankIx.has(x.id) ? rankIx.get(x.id) : 99; const price = r1000(v * (win ? 1 : PAY.sellForced));
    const sug = L.squad.length > 16 && ((win && i >= 6 && x.age >= 25 && bk > 0 && v >= 1.5 * bk) || (win && i >= 8 && x.age >= 27 && v >= 1.3 * bk && v > 0) || (win && x.age >= 30 && i >= 11) || (ratio > 0.68 && i >= 11 && x.wage >= 150000) || (st.cash < 0 && i >= 11));
    out.push({ id: 'sell', param: 'p' + x.id, label: `למכור את ${x.n} (${ctx.fmtM(price)}${win ? '' : ' · מחוץ לחלון −10%'})`, enabled: L.squad.length > PAY.minSquad, price, book: bk, suggested: sug });
    if (x.until - st.month <= 6) out.push({ id: 'renew', param: 'p' + x.id, label: `לחדש חוזה ל${x.n} (שכר ${ctx.fmtM(Math.max(x.wage, wageFor(x.r)))})`, enabled: true, suggested: x.until - st.month <= 3 && x.age <= 30 && i < 13 });
    if (!(x.loan >= st.month)) out.push({ id: 'loanOut', param: 'p' + x.id, label: `להשאיל את ${x.n} עד החלון הבא`, enabled: true, suggested: ratio > 0.65 && i >= 16 && x.wage >= 100000 && x.age >= 20 }); }
  out.push({ id: 'expand', param: null, label: `להרחיב את היציע (+40% מקומות · ${ctx.fmtM(BUILD.expand)} בשני שלבים)`, enabled: !L.build && L.built < 2, suggested: !L.build && L.built < 1 && L.div >= 1 && st.cash >= BUILD.expand * 0.6 + res * 2 });
  out.push({ id: 'train', param: null, label: `מתחם אימונים (${ctx.fmtM(BUILD.train)})`, enabled: !L.train, suggested: !L.train && st.cash >= BUILD.train + res * 2 && L.squad.filter((x) => x.age <= 23).length >= 3 });
  out.push({ id: 'academy', param: null, label: `לשדרג את האקדמיה (${ctx.fmtM(BUILD.acad)})`, enabled: !L.acad, suggested: !L.acad && st.cash >= BUILD.acad + res * 2 });
  const freeName = !(L.naming && L.naming.until >= st.month);
  out.push({ id: 'naming', param: 'now', label: 'למכור את שם האצטדיון: כסף עכשיו', enabled: freeName, suggested: freeName && st.cash < res });
  out.push({ id: 'naming', param: 'share', label: 'למכור את שם האצטדיון: 8% מהכרטיסים ל־3 שנים', enabled: freeName, suggested: freeName && st.cash >= res });
  out.push({ id: 'ownerLoan', param: null, label: `הלוואת בעלים (${ctx.fmtM(BUILD.owner)}, מצב רוח −${BUILD.ownerHappy})`, enabled: true, suggested: st.cash < 0 });
  if (L.owner > 0) out.push({ id: 'ownerRepay', param: null, label: `להחזיר הלוואת בעלים (${ctx.fmtM(Math.min(L.owner, BUILD.owner))})`, enabled: st.cash >= Math.min(L.owner, BUILD.owner), suggested: st.cash >= res * 3 + BUILD.owner });
  out.push({ id: 'wageCut', param: null, label: 'קיצוץ שכר של 15% (הכוכב עוזב)', enabled: L.cutSeason !== L.season, suggested: L.cutSeason !== L.season && L.rev12.length >= 6 && ratio12(st) > 0.8 });
  return out;
}
function indicatorsOf(st, ctx) {
  const L = LG(st); const tb = table(st); const rk = rankOf(st); const top = ranked(st); const rankIx = new Map(top.map((p, i) => [p.id, i])); const mi = (st.month - 1) % 12;
  const rows = L.squad.slice().sort((a, b) => b.r - a.r || a.id - b.id).map((x) => ({ pid: 'p' + x.id, name: x.n, age: x.age, rating: x.r, potLo: x.lo, potHi: x.hi, mv: mv(st, x), book: book(st, x), wage: x.wage, until: x.until, monthsLeft: x.until - st.month,
    injured: x.out >= st.month, loaned: x.loan >= st.month, academy: x.acad, starter: rankIx.has(x.id) && rankIx.get(x.id) < 11 }));
  const D = DIVS[L.div]; const r12 = ratio12(st);
  return {
    league: { div: L.div, divName: D.n, mult: D.m, season: L.season, round: L.round, rounds: 10, window: isWindow(st.month), monthOfSeason: mi + 1, rank: rk, pts: L.pts, strength: strength(st), divBase: D.base, wageRatio: r12, wageRatioTarget: 0.7,
      wages: wagesOf(st), revenue: L.last ? L.last.rev : 0, last: L.last, squadBook: squadBook(st), squadMv: sum(L.squad.map((x) => mv(st, x))), seats: L.seats, build: L.build ? { stage: L.build.stage, at: L.build.at } : null, built: L.built, train: !!L.train, academy: !!L.acad,
      naming: L.naming, ownerLoan: L.owner, forcedSales: L.forced, ffp: L.ffp, sold: L.sold, soldGain: L.soldGain, hist: L.hist.slice(), payoff: { up: L.div < 2 ? round2(expRev(st, L.div + 1) / expRev(st)) : null, stay: 1, down: L.div > 0 ? round2(expRev(st, L.div - 1) / expRev(st)) : null, upTo: 2, downFrom: 7 }, prize: REV.prize.map((x) => Math.round(x * D.m)) },
    panel: {
      id: 'league', title: 'המועדון והטבלה',
      gauges: [{ id: 'wageRatio', label: 'שכר מול הכנסות (12 חודשים)', value: r12, ref: 0.7, max: 1.2, cmp: 'le' }, { id: 'rank', label: `מקום ב${D.n}`, value: rk, ref: 2, min: 1, max: 8 },
        { id: 'strength', label: 'כוח הקבוצה מול הממוצע בדרג', value: strength(st), ref: D.base }, { id: 'fill', label: 'תפוסה ביציע', value: L.last ? L.last.fill : 0, ref: 0.62, max: 1 }],
      table: tb.map((x, i) => ({ pos: i + 1, name: x.n, pts: x.pts, us: x.us, zone: i < 2 && L.div < 2 ? 'up' : i >= 6 && L.div > 0 ? 'down' : null })),
      rows, actions: actionList(st, ctx),
    },
  };
}
export default league;
