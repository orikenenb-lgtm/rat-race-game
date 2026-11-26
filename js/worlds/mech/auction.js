// World mechanic `auction` — CATALOG-25 §2.4 (first used by w13 אצטדיון הכוכבים; planned reuse: w21 deals, w23 contracts). A lot is
// bid for against 1–3 rival bidders whose SEALED ceilings are noisy estimates of the lot's sealed true value: the bidder who wins is often
// the one who over-estimated it (the winner's curse). The public sees an estimate (the lot's `value`), the number of rivals and, round by
// round, the price at which a rival outbid you. At most 3 rounds (R-term), then the lot goes to a rival.
//
// Contract (DESIGN §4.2): pure, deterministic, no engine import, only + − × ÷ round / min / max / floor. Draws: exactly 5 'world' draws on
// every auction-tile landing (1 for the lot itself + 1 per rival slot, max 4, unused slots drawn too), 0 at init, 0 per payday.
// The world wires the lot source and the award: world.auction = { tile, rivals: [names], make(st, rs, ctx) → item | null,
// award(st, item, price, out, ctx), budget(st, item, ctx) → the most the guide would pay (₪) }. item = { title, text, value (public
// estimate, ₪), trueValue (sealed), reserve, lo, span (rival ceiling = trueValue × (lo + span × draw)), data (public card numbers) }.
export const ID = 'auction';
export const BIDDERS = 4;
export const DRAWS = Object.freeze({ init: 0, month: 0, landing: Object.freeze({ H: 1 + BIDDERS }) });
export const STEP = Object.freeze({ raise: 1.15, jump: 1.35, outbid: 1.08 });
export const ROUNDS = 3;

const frac = (x) => x - Math.floor(x);
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round2 = (x) => Math.round(x * 100) / 100;
const cfgOf = (ctx, st) => ctx.world(st).auction || {};
function fail(out, msg) { out.ok = false; out.error = msg; return false; }

/** A lot from an item and the 5 landing draws: the rival count (1–3) from draw 0, one sealed ceiling per rival slot from draws 1–4. */
export function newLot(item, rs) {
  const n = 1 + Math.floor(frac(rs[0] * 7919) * 3);
  const bidders = []; for (let i = 0; i < BIDDERS; i++) bidders.push(i < n ? r1000(item.trueValue * (item.lo + item.span * rs[i + 1])) : 0);
  return { n, bidders, price: item.reserve, round: 1, outbid: null };
}
/** The highest rival ceiling (sealed) and its slot. */
export function topRival(lot) { let best = 0, at = -1; for (let i = 0; i < lot.n; i++) if (lot.bidders[i] > best) { best = lot.bidders[i]; at = i; } return { max: best, at }; }
/** Offer `amount`: won when it beats every rival ceiling; else the top rival answers at min(its ceiling, amount × 1.08) — a new round, or
 *  (after round 3, or when the rival's answer is its ceiling) the lot is lost. */
export function offer(lot, amount) {
  const t = topRival(lot);
  if (amount > t.max) return { won: true, price: amount };
  const answer = r1000(Math.min(t.max, Math.max(amount * STEP.outbid, lot.price)));
  if (lot.round >= ROUNDS) return { won: false, lost: true, by: t.at, answer };
  return { won: false, lost: false, by: t.at, answer };
}
/** The three bid levels of a round: the current price, +15 %, +35 % (rounded to ₪1,000). */
export function levels(lot) { return { bid: r1000(lot.price), raise: r1000(lot.price * STEP.raise), jump: r1000(lot.price * STEP.jump) }; }

export const auction = {
  id: ID, draws: DRAWS,
  lessons: ['winners_curse'],
  mentorKeys: ['lotAsk', 'lotWon', 'lotLost', 'lotWalk', 'lotOutbid'],
  /** The rival ceilings and the item's true value are sealed (a room's redacted view). */
  sealed: ['pending.wr', 'pending.lot.bidders', 'pending.item.trueValue', 'pending.item.sealed'],
  tiles: {
    H: {
      safe: 'walk',
      create(st, ctx) {
        const rs = []; for (let i = 0; i < 1 + BIDDERS; i++) rs.push(ctx.draw(st)); // exactly 5 'world' draws on every landing
        const C = cfgOf(ctx, st); const item = C.make ? C.make(st, rs, ctx) : null;
        return { wr: rs, item, lot: item ? newLot(item, rs) : null };
      },
      describe(st, p, ev, ctx) {
        const C = cfgOf(ctx, st); const it = p.item; const lot = p.lot;
        ev.tag = C.tag || 'מכירה פומבית';
        if (!it || !lot) { ev.title = C.tag || 'מכירה פומבית'; ev.text = 'אין היום משהו שמתאים לך.'; ev.options = [ctx.opt('walk', 'המשך', true, { primary: true })]; ev.auto = true; ev.toastText = ev.text; return; }
        const L = levels(lot); const names = C.rivals || []; const by = lot.outbid != null ? names[lot.outbid % Math.max(1, names.length)] || 'מועדון מתחרה' : null;
        ev.title = it.title;
        ev.text = `${it.text} ${lot.round === 1 ? `עוד ${lot.n === 1 ? 'מועדון אחד מתמודד' : lot.n + ' מועדונים מתמודדים'} על ${it.title}. המחיר הפותח ${ctx.fmtM(lot.price)}.` : `${by} הציע ${ctx.fmtM(lot.price)}. סבב ${lot.round} מתוך ${ROUNDS}.`}`;
        ev.mentor = lot.round === 1 ? ctx.mentorLine(st, 'lotAsk', { value: ctx.fmtM(it.value) }) || `ההערכה: ${ctx.fmtM(it.value)}. מי שמנצח במכירה הוא לרוב מי שהעריך הכי ביוקר.` : ctx.mentorLine(st, 'lotOutbid', { by: by || '', price: ctx.fmtM(lot.price) }) || null;
        const budget = C.budget ? Math.max(0, Math.round(C.budget(st, it, ctx))) : it.value;
        ev.data = { ...(it.data || {}), value: it.value, reserve: it.reserve, price: lot.price, round: lot.round, rounds: ROUNDS, rivals: lot.n, outbidBy: by, levels: L, budget,
          note: 'הערכת השווי היא ציבורית. כל מועדון מעריך בעצמו, ומי שמעריך הכי ביוקר — זוכה. הצעה מעל השווי היא הפסד ידוע מראש.' };
        const mk = (id, amt, label) => { const F = ctx.loanFor(st, amt); return ctx.opt(id, `${label} ${ctx.fmtM(amt)}`, F.ok, { kind: 'bid', amount: amt, loanAmount: F.need, preview: { cash: -amt, monthly: (it.data && it.data.wage) ? -it.data.wage : 0, months: (it.data && it.data.months) || 0, risk: amt > it.value ? 'over' : null }, reason: F.ok ? undefined : 'הבנק לא נותן הלוואה כזו' }); };
        ev.options = [mk('bid', L.bid, lot.round === 1 ? 'להציע את מחיר הפתיחה:' : 'להשוות ולהציע:'), mk('raise', L.raise, 'להעלות ל־'), mk('jump', L.jump, 'הצעה קופצת:'), ctx.opt('walk', 'לוותר וללכת', true)];
        // the guide: the highest level within the estimate and the budget; else walk (never chase a rival past the public estimate)
        const cap = Math.min(it.value, budget); const pick = ['jump', 'raise', 'bid'].find((id) => { const o = ev.options.find((x) => x.id === id); return o.enabled && o.amount <= cap && !o.loanAmount; }) || 'walk'; // the highest level within the cap: say your maximum once
        ev.options.find((o) => o.id === pick).primary = true; ev.forcePrimary = pick;
      },
      choose(st, p, o, params, out, ctx) {
        const C = cfgOf(ctx, st); const it = p.item; const lot = p.lot;
        if (o.id === 'walk' || !it || !lot) { out.mentor = ctx.mentorLine(st, 'lotWalk', {}) || null; ctx.logDecision(st, C.tag || 'מכירה פומבית', 'ויתר'); return true; }
        const amt = levels(lot)[o.id]; if (!amt) return true;
        const r = offer(lot, amt);
        if (r.won) {
          const F = ctx.loanFor(st, amt); if (!F.ok) { out.mentor = 'הבנק לא נתן הלוואה.'; return true; }
          if (F.need) { st.loans += F.need; st.cash += F.need; st.stats.loansTaken += F.need; }
          st.cash -= amt; ctx.cashFx(out, -amt, `${it.title} ${ctx.fmtM(amt)}`); ctx.sound(out, 'buy');
          if (C.award) C.award(st, it, amt, out, ctx);
          const W = st.world.auc || (st.world.auc = { won: 0, lost: 0, paid: 0, over: 0, overSum: 0 }); W.won++; W.paid += amt; if (amt > it.trueValue) { W.over++; W.overSum += amt - it.trueValue; }
          if (amt > it.value) ctx.lesson(st, out, 'winners_curse');
          out.mentor = ctx.mentorLine(st, 'lotWon', { price: ctx.fmtM(amt) }) || `זכית ב־${ctx.fmtM(amt)}.`;
          ctx.logDecision(st, C.tag || 'מכירה פומבית', 'זכה', amt); return true;
        }
        lot.outbid = r.by; lot.price = r.answer;
        if (r.lost) { const W = st.world.auc || (st.world.auc = { won: 0, lost: 0, paid: 0, over: 0, overSum: 0 }); W.lost++;
          out.mentor = ctx.mentorLine(st, 'lotLost', { price: ctx.fmtM(r.answer) }) || `מועדון אחר לקח אותו ב־${ctx.fmtM(r.answer)}.`; ctx.lesson(st, out, 'winners_curse'); ctx.logDecision(st, C.tag || 'מכירה פומבית', 'הפסיד'); return true; }
        lot.round++; return false; // the event stays open for the next round
      },
      score(st, ev, ctx) {
        const d = ev.data || {}; const E = Math.max(1, ctx.expenses(st));
        return ev.options.filter((o) => o.enabled).map((o) => ({ id: o.id, U: round2(o.id === 'walk' ? 0 : ((d.value || 0) - (o.amount || 0)) / E / 12), flags: (o.amount || 0) > (d.value || 0) ? ['over'] : [], reasons: [] }));
      },
    },
  },
  indicators(st) { const W = st.world.auc || { won: 0, lost: 0, paid: 0, over: 0, overSum: 0 }; return { auction: { won: W.won, lost: W.lost, paid: W.paid } }; },
};
export default auction;
