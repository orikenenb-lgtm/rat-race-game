// Light candle view — the DATA side (docs/full-upgrade/worlds/CATALOG-25.md §3.9 / §3.4). UI lane, no engine change.
//
// What a candle is: 1 candle = 1 game month of ONE listing (a ticker; a crypto coin's every launch is its own listing).
//   o  = the previous candle's close (the listing price in the month it listed)
//   h/l/c / n = every price print the player could see between engine calls in that month (h = max, l = min, c = the last print,
//      n = how many times the price changed). A print is a change of st.prices[tk] observed after an engine step.
//   b / s = the player's own buy / sell quantity in that month (explicit trades only: 'c' buy/sell, 'I').
//   x = 1: a month the pawn passed without a turn (two paydays in one roll) — no price was tradeable in it; IDX still gets its
//      real payday close from life.idxHist, any other ticker stays flat in it.
// The month's payday move belongs to the month that ends (§3.4 "close at payday"): the observation that advances st.month is
// the closing print of the old month, and the new month opens at that price (o = previous c).
//
// Where the data comes from (rebuild mode, used always): a SHADOW game = E.createGame(E.replayConfig(st)) stepped through
// st.actions with the same calls E.replay() makes, sampling st.prices after every step. Prices change only inside engine steps,
// so this is exact, and live = rebuild by construction (the shadow only advances by the actions the live game logged).
// Nothing is written to the save: on resume the book is rebuilt from st.actions (the catalog keeps saves / engine.bundle.json
// unchanged). Bounded: CAP closed candles per listing (+ the open one), NEWS_CAP news lines per listing, ENDED_CAP old listings.
// If the shadow ever disagrees with the live game (a room's redacted state, an action this file does not know), the book is
// marked `diverged` and from then on only observes the live state (honest "partial" history) — it never invents a price.
import * as E from './engine.js';

export const CAP = 36;          // closed candles kept per listing (3 game years)
export const NEWS_CAP = 12;     // news lines kept per listing
export const ENDED_CAP = 6;     // old (relaunched / dead) listings kept
const SLICE_MS = 8;             // async rebuild: yield to the page every ~8 ms

/* ------------------------------------------------------------------ ticker meta (UI words; the worlds define no sectors) */
const KIND_SECTOR = { index: 'קרן מדד · כל השוק', crypto: 'מטבע דיגיטלי', bond: 'אג"ח ממשלתי · רגיש לריבית', gold: 'סחורה · זהב', usd: 'מטבע חוץ · דולר', stock: 'מניה · ענף כללי' };
/** {name, symbol, sector, kind, unit} of a ticker in this game (a crypto coin: its current name). */
export function tickerMeta(st, tk, coinName = null) {
  const w = E.getWorld(st.worldId); const t = (w.tickers || {})[tk] || {};
  const kind = t.kind || 'stock';
  const crypto = !!(w.crypto && w.crypto.tk === tk);
  const cn = crypto ? (coinName || (st.world && st.world.coin && st.world.coin.name) || tk) : null;
  const raw = String(t.name || tk);
  const parts = raw.split(' · ');
  const name = crypto ? `${cn} · קריפטו` : raw;
  const symbol = crypto ? cn : (parts.length > 1 && /^[A-Z]{2,6}$/.test(parts[0]) ? parts[0] : tk);
  const sector = t.sector || KIND_SECTOR[crypto ? 'crypto' : kind] || KIND_SECTOR.stock;
  return { tk, name, symbol, sector, kind: crypto ? 'crypto' : kind, unit: t.unit || (crypto ? 'יחידות' : 'מניות'), generic: !t.sector };
}

/* ------------------------------------------------------------------ the book (pure; no DOM) */
const fin = (p) => typeof p === 'number' && Number.isFinite(p);
function listing(st, tk) {
  const w = E.getWorld(st.worldId);
  if (w.crypto && w.crypto.tk === tk && st.world && st.world.coin) return { key: `${tk}#${st.world.coin.gen}`, gen: st.world.coin.gen, coin: st.world.coin.name, alive: !!st.world.coin.alive };
  return { key: tk, gen: null, coin: null, alive: true };
}
function newSeries(st, tk, L, m, p) {
  const meta = tickerMeta(st, tk, L.coin);
  return { key: L.key, tk, gen: L.gen, name: meta.name, symbol: meta.symbol, sector: meta.sector, kind: meta.kind, unit: meta.unit, generic: meta.generic,
    listedM: m, endedM: null, first: p, dead: !L.alive, wiped: null, cand: [], open: { m, o: p, h: p, l: p, c: p, n: 0 }, news: [] };
}
function print(s, p) { const o = s.open; if (p > o.h) o.h = p; if (p < o.l) o.l = p; if (p !== o.c) o.n++; o.c = p; }
function closeMonth(s, skip) {
  const o = s.open; const c = { m: o.m, o: o.o, h: o.h, l: o.l, c: o.c, n: o.n };
  if (o.b) c.b = o.b; if (o.s) c.s = o.s; if (o.x) c.x = 1;
  s.cand.push(c); if (s.cand.length > CAP) s.cand.shift();
  s.open = { m: o.m + 1, o: o.c, h: o.c, l: o.c, c: o.c, n: 0 };
  if (skip) s.open.x = 1;
}
function addNews(s, m, p0, p1, text) {
  if (!text) return;
  s.news.push({ m, p0, p1, text: String(text).replace(/\s+/g, ' ').trim().slice(0, 110) }); if (s.news.length > NEWS_CAP) s.news.shift();
}
const isTrade = (a) => !!a && ((a[0] === 'c' && (a[1] === 'buy' || a[1] === 'sell')) || a[0] === 'I');

/** A new book from a game state (its current prices open the first candles). */
export function newBook(st) {
  const b = { v: 1, m: st.month, series: {}, cur: {}, ended: [], q: {}, diverged: false, partialFrom: null, steps: 0 };
  for (const tk of Object.keys(st.prices || {})) {
    const p = st.prices[tk]; if (!fin(p)) continue;
    const L = listing(st, tk); const s = newSeries(st, tk, L, st.month, p);
    b.series[L.key] = s; b.cur[tk] = L.key; b.q[tk] = (st.holdings[tk] && st.holdings[tk].qty) || 0;
  }
  return b;
}

/** the words for a price move, from what the step returned (engine texts only; never a sealed value) */
function newsText(info, tk, kind) {
  const a = info.act || []; const ev = info.ev;
  const evT = (e) => (e && (e.title || e.toastText) ? String(e.title || e.toastText) : '');
  if (a[0] === 'r') {
    const nd = ((info.out && info.out.news) || []).find((x) => x.kind === 'indexDrop');
    if (tk === 'IDX') return nd ? nd.text : 'יום משכורת: התנועה החודשית של המדד';
    return kind === 'usd' || kind === 'gold' ? 'יום משכורת: התנועה החודשית של הדולר' : 'יום משכורת: שינוי חודשי';
  }
  if (a[0] === 'l') return evT(ev) || 'משבצת על הלוח';
  if (a[0] === 'c') return evT(info.prevEv) || 'החלטה בכרטיס';
  if (a[0] === 'live') return 'שינוי מחיר';
  return 'פעולה במשחק';
}

/**
 * Observe the state after one engine step. info = {act, out, ev, prevEv} (what that step returned; act = the logged action).
 * Pure on (book, st); mutates the book only.
 */
export function observe(book, st, info = {}) {
  const k = Math.max(0, (st.month | 0) - (book.m | 0));
  const trade = isTrade(info.act);
  const idxTail = k > 0 && st.life && Array.isArray(st.life.idxHist) && st.life.idxHist.length >= k ? st.life.idxHist.slice(-k) : null;
  for (const tk of Object.keys(st.prices || {})) {
    const p = st.prices[tk]; if (!fin(p)) continue;
    const L = listing(st, tk);
    let s = book.series[book.cur[tk]];
    if (s && s.key !== L.key) {          // a relaunched coin: the old listing ends under its own name (its loss is never renamed away)
      s.endedM = book.m;
      const wp = info.ev && info.ev.data && info.ev.data.wiped;
      if (wp && wp.qty) { s.wiped = { qty: wp.qty, value: wp.value, m: book.m }; addNews(s, book.m, s.open.c, s.open.c, `המטבע ${s.symbol} מת — ${wp.qty.toLocaleString('en-US')} יחידות נמחקו כשהושק מטבע חדש`); }
      book.ended.push(s.key); if (book.ended.length > ENDED_CAP) { const gone = book.ended.shift(); delete book.series[gone]; }
      s = null;
    }
    if (!s) { s = newSeries(st, tk, L, st.month, p); book.series[L.key] = s; book.cur[tk] = L.key; if (info.act && info.act[0] === 'l') addNews(s, st.month, p, p, `הושק: ${(info.ev && info.ev.title) || s.name}`); book.q[tk] = (st.holdings[tk] && st.holdings[tk].qty) || 0; continue; }
    const before = s.open.c;
    if (k === 0) { if (p !== before) print(s, p); }
    else {
      const idx = tk === 'IDX' && idxTail && idxTail[k - 1] === p ? idxTail : null;
      for (let j = 0; j < k; j++) {
        const pj = idx ? idx[j] : j === 0 ? p : s.open.c;   // IDX: its real close at every payday; else the observed price closes the played month
        if (pj !== s.open.c) print(s, pj);
        closeMonth(s, j < k - 1);
      }
      if (p !== s.open.c) print(s, p);
    }
    if (p !== before) addNews(s, k ? book.m : st.month, before, p, newsText(info, tk, s.kind));
    s.dead = !L.alive;
    const q = (st.holdings[tk] && st.holdings[tk].qty) || 0;
    if (trade) { const d = q - (book.q[tk] || 0); if (d > 0) s.open.b = (s.open.b || 0) + d; else if (d < 0) s.open.s = (s.open.s || 0) - d; }
    book.q[tk] = q;
  }
  book.m = st.month; book.steps++;
  return book;
}

/* ------------------------------------------------------------------ the shadow replay (exactly the calls of E.replay) */
const STEP = {
  r: (st) => E.rollDice(st), l: (st) => E.landing(st),
  c: (st, a) => E.choose(st, null, a[1], a.length > 2 ? { qty: a[2] } : {}),
  L: (st, a) => E.takeLoan(st, a[1] || undefined), R: (st, a) => E.repayLoan(st, a[1] || undefined), C: (st) => E.payCredit(st),
  P: (st, a) => E.setPlan(st, a[1]), A: (st, a) => E.setAutoInvest(st, a[1]), I: (st, a) => E.invest(st, a[1], a[2]),
  S: (st, a) => E.moveSavings(st, a[1]), T: (st, a) => E.setSideReport(st, a[1]), F: (st, a) => E.setFocus(st, a[1], a[2] ?? 0),
  H: (st) => E.requestHint(st), M: (st, a) => E.setMentorLevel(st, a[1]), Q: (st, a) => E.resolveStory(st, a[1], a[2]),
  K: (st, a) => E.answerPractice(st, a[1], a[2]), W: (st) => E.continueAfterWin(st), X: (st) => E.retire(st),
  Z: (st, a) => E.worldAction(st, a[1], a.length > 2 ? a[2] : null),
};
/** one logged action on the shadow → {ret} ; throws on an unknown / impossible action (like replayStep) */
function stepOne(sh, a) {
  const f = STEP[a && a[0]]; if (!f) throw new Error('unknown action ' + JSON.stringify(a));
  const ret = f(sh, a);
  if (ret && ret.ok === false && a[0] !== 'r' && a[0] !== 'l') throw new Error('impossible action ' + JSON.stringify(a));
  return ret;
}
const samePrices = (a, b) => { const ka = Object.keys(a.prices || {}), kb = Object.keys(b.prices || {}); return ka.length === kb.length && ka.every((k) => a.prices[k] === b.prices[k]); };
const agrees = (sh, st) => sh.month === st.month && sh.cash === st.cash && samePrices(sh, st);

/** A tracker for one live game: {st, sh (shadow), k (actions applied), book, lastEv, lastA (JSON of the last applied action)}. */
function newTracker(st) {
  let sh = null; let book;
  try { sh = E.createGame(E.replayConfig(st)); book = newBook(sh); } catch (e) { sh = null; book = newBook(st); book.diverged = true; book.partialFrom = st.month; }
  return { st, sh, k: 0, book, lastEv: null, lastA: null, busy: null };
}
function diverge(T, st) { T.sh = null; T.book.diverged = true; if (T.book.partialFrom == null) T.book.partialFrom = st.month; }
/** apply up to `budget` ms of new actions; → true when caught up */
function advance(T, st, budgetMs = Infinity) {
  const acts = st.actions || [];
  if (!T.sh) { observe(T.book, st, { act: ['live'] }); T.k = acts.length; return true; }
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  while (T.k < acts.length) {
    const a = acts[T.k];
    let ret;
    try { ret = stepOne(T.sh, a); } catch (e) { diverge(T, st); observe(T.book, st, { act: ['live'] }); T.k = acts.length; return true; }
    const prevEv = T.lastEv;
    T.lastEv = a[0] === 'l' ? ret : a[0] === 'c' ? (ret && ret.event) || null : a[0] === 'r' ? null : T.lastEv;
    observe(T.book, T.sh, { act: a, out: a[0] === 'r' ? ret : (ret && ret.news ? ret : null), ev: a[0] === 'l' ? ret : (ret && ret.event) || null, prevEv });
    T.k++; T.lastA = JSON.stringify(a);
    if (now() - t0 > budgetMs && T.k < acts.length) return false;
  }
  if (!agrees(T.sh, st)) { diverge(T, st); observe(T.book, st, { act: ['live'] }); }
  return true;
}
const TRACK = new WeakMap();
function trackerFor(st) {
  let T = TRACK.get(st);
  const acts = st.actions || [];
  // a shorter log, or a different action at the last applied index (a rewind / reload into the same object) → rebuild
  if (T && (acts.length < T.k || (T.k && JSON.stringify(acts[T.k - 1]) !== T.lastA))) T = null;
  if (!T) { T = newTracker(st); TRACK.set(st, T); }
  return T;
}
/** Bring the book up to date synchronously (Node tests, small games). → book */
export function syncNow(st) { const T = trackerFor(st); advance(T, st); return T.book; }
/** Bring the book up to date without blocking the page (yields every ~8 ms). → Promise<book> */
export function sync(st, { sliceMs = SLICE_MS, wait = (f) => setTimeout(f, 0) } = {}) {
  const T = trackerFor(st);
  if (T.busy) return T.busy;
  let res; const p = new Promise((r) => { res = r; });
  T.busy = p;   // set BEFORE the first slice: a slice that finishes at once clears it (else a resolved promise would stick)
  const go = () => { let done = true; try { done = advance(T, st, sliceMs); } catch (e) { console.warn('candles', e); done = true; } if (done) { if (T.busy === p) T.busy = null; res(T.book); } else wait(go); };
  go();
  return p;
}
/** Rebuild from scratch (no cache): createGame(replayConfig(st)) + every action. → book (Node tests: rebuild = incremental). */
export function rebuild(st) { const T = newTracker(st); advance(T, st); return T.book; }

/* ------------------------------------------------------------------ the view model (book + live holdings; the UI computes nothing else) */
const r2 = (x) => Math.round(x * 100) / 100;
function seriesView(s, st, live) {
  const cand = s.cand.concat([{ ...s.open, open: true }]).map((c) => ({ ...c }));
  if (!live) cand[cand.length - 1].open = false;   // an ended listing: its last candle is closed
  const last = cand[cand.length - 1];
  const prevClose = cand.length > 1 ? cand[cand.length - 2].c : s.first;
  const price = live ? st.prices[s.tk] : last.c;
  const h = live ? st.holdings[s.tk] : null;
  const qty = h ? h.qty || 0 : 0, basis = h ? Math.round(h.basis || 0) : 0, value = Math.round(qty * price);
  const flat = cand.filter((c) => c.h === c.l).length;
  return { key: s.key, tk: s.tk, name: s.name, symbol: s.symbol, sector: s.sector, generic: s.generic, kind: s.kind, unit: s.unit, live,
    listedM: s.listedM, endedM: s.endedM, dead: s.dead, wiped: s.wiped, first: s.first,
    price, chg: r2(price - prevClose), chgPct: prevClose ? r2((price / prevClose - 1) * 100) : 0,
    since: r2(price - s.first), sincePct: s.first ? r2((price / s.first - 1) * 100) : 0,
    cand, news: s.news.slice().reverse(), flatShare: cand.length ? flat / cand.length : 0,
    hold: live ? { qty, basis, value, avg: qty ? r2(basis / qty) : 0, pnl: value - basis, pnlPct: basis ? r2((value / basis - 1) * 100) : 0 } : null };
}
/** → {month, list:[current listings], ended:[old listings, newest first], diverged, partialFrom} */
export function viewModel(st, book) {
  const list = Object.keys(book.cur).filter((tk) => st.prices && fin(st.prices[tk])).map((tk) => seriesView(book.series[book.cur[tk]], st, true));
  const ended = book.ended.slice().reverse().map((k) => book.series[k]).filter(Boolean).map((s) => seriesView(s, st, false));
  return { month: st.month, list, ended, diverged: !!book.diverged, partialFrom: book.partialFrom };
}
/* ------------------------------------------------------------------ w10: the ENGINE's candles (market.js) in the same series shape
   The market module keeps real monthly candles per company (st.mkt.cos[id].cand rows [month, o, h, l, c, prints, volume] + the open
   candle {o, h, l, c, n, v}; prices in integer agorot). This only converts them for the one chart component (candles-lite.js): ₪ = agorot
   / 100 (exact), the open candle's month = the last closed one + 1. No replay shadow, nothing computed beyond the shape. */
const ag = (x) => Math.round(+x || 0) / 100;
/** engine row → candle {m, o, h, l, c, n, v} (₪) */
export const rowCandle = (r) => ({ m: r[0], o: ag(r[1]), h: ag(r[2]), l: ag(r[3]), c: ag(r[4]), n: r[5] || 0, v: r[6] || 0 });
/**
 * A company (worldIndicators.market.cos[] / idx / a grave entry) → a candles-lite series. opts: {news: market.news[] (this company's lines
 * become the candle news), live (default: listed / halted), month (fallback month of an open candle without history)}.
 */
export function marketSeries(co, { news = [], live = null, month = null } = {}) {
  const cand = (co.cand || []).map(rowCandle);
  const isLive = live != null ? live : co.status == null ? true : co.status === 'listed' || co.status === 'halted';
  if (isLive && co.open) { const last = cand[cand.length - 1]; cand.push({ m: last ? last.m + 1 : (co.listedM ?? month ?? 1), o: ag(co.open.o), h: ag(co.open.h), l: ag(co.open.l), c: ag(co.open.c), n: co.open.n || 0, v: co.open.v || 0, open: true }); }
  const lastC = cand[cand.length - 1]; const prevClose = cand.length > 1 ? cand[cand.length - 2].c : (lastC ? lastC.o : 0);
  const price = co.px != null ? ag(co.px) : co.endPx != null ? ag(co.endPx) : lastC ? lastC.c : 0;
  const first = cand.length ? cand[0].o : price;
  const r2x = (x) => Math.round(x * 100) / 100;
  const own = (news || []).filter((x) => x && x.coId === co.id);
  const evs = (co.ev || []).map((e) => ({ m: e.m, p0: 0, p1: 0, text: `${e.label}${e.pct ? ` (${e.pct > 0 ? '+' : '−'}${Math.round(Math.abs(e.pct) * 100)}%)` : ''}` }));
  const flat = cand.filter((c) => c.h === c.l).length;
  const H = co.held;
  return { key: co.id, tk: co.id, name: co.name, symbol: co.tk, sector: co.sectorLabel || co.sector || '', generic: false, kind: co.id === 'IDX' ? 'index' : 'stock', unit: co.id === 'IDX' ? 'יחידות' : 'מניות', live: isLive,
    listedM: co.listedM ?? (cand[0] ? cand[0].m : 1), endedM: co.endedM ?? null, dead: false, wiped: null, first,
    price, chg: r2x(price - prevClose), chgPct: prevClose ? r2x((price / prevClose - 1) * 100) : 0, since: r2x(price - first), sincePct: first ? r2x((price / first - 1) * 100) : 0,
    cand, news: [...own.map((x) => ({ m: x.m, p0: 0, p1: 0, text: x.text })), ...evs].sort((a, b) => b.m - a.m), flatShare: cand.length ? flat / cand.length : 0,
    hold: H ? { qty: H.qty, basis: H.basis, value: H.value, avg: H.qty ? r2x(H.basis / H.qty) : 0, pnl: H.pnl, pnlPct: H.basis ? r2x((H.value / H.basis - 1) * 100) : 0 } : null };
}
/** The invariants of one series (tests + a debug guard): low ≤ open,close ≤ high, positive, integers of the price grid, o = previous c. */
export function checkSeries(s) {
  const errs = []; const all = s.cand.concat([s.open]);
  all.forEach((c, i) => {
    for (const f of ['o', 'h', 'l', 'c']) if (!fin(c[f])) errs.push(`m${c.m} ${f} not finite`);
    if (!(c.l <= Math.min(c.o, c.c) && Math.max(c.o, c.c) <= c.h && c.l <= c.h)) errs.push(`m${c.m} OHLC order ${JSON.stringify(c)}`);
    if (!(c.l > 0)) errs.push(`m${c.m} low ≤ 0`);
    if (i && all[i - 1].m + 1 !== c.m) errs.push(`m${c.m} month gap after ${all[i - 1].m}`);
    if (i && all[i - 1].c !== c.o) errs.push(`m${c.m} open ≠ previous close`);
  });
  if (s.cand.length > CAP) errs.push('ring over cap');
  if (s.news.length > NEWS_CAP) errs.push('news over cap');
  return errs;
}
