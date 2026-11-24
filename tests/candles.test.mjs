// Light candle view (CATALOG-25 §3.9, gates L-candle / L-nochange) — the data side, js/candlelog.js. Run: node tests/candles.test.mjs [-v]
//  A  invariants over many sims (w1–w4 × policies × seeds): low ≤ open,close ≤ high, low > 0, finite, o = previous c, months contiguous,
//     the open candle is the current month, last close (open candle's c) === st.prices[tk], rings bounded, no NaN in the view model
//  B  IDX: every closed candle's close is the engine's own payday price (st.life.idxHist tail)
//  C  live = rebuild: a tracker synced at random points during play (as the UI does) ends identical to a fresh rebuild from st.actions
//  D  reference: an independent re-derivation from E.replay(cfg, actions.slice(0, k)) for every k — every print is a price the game
//     really had between two engine calls, nothing else (no separate random series, no future)
//  E  a relaunched coin keeps the old listing's history under its old name (never renamed away), with its wipe recorded
//  F  bounded size at month ~200; G  nothing of this is on the engine's import graph (the engine pin stays — L-nochange)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../js/engine.js';
import '../js/worlds/all.js';
import { play } from '../tools/sim.mjs';
import * as CL from '../js/candlelog.js';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('-v');
let n = 0, fails = 0;
const ok = (c, msg, extra) => { n++; if (!c) { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } else if (VERBOSE) console.log('ok  ', msg); };
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const WORLDS = ['w1', 'w2', 'w3', 'w4'];

/* ---------- A + B: invariants over many simulated games */
let games = 0, candles = 0, relaunches = 0, skips = 0;
const relaunchGames = [];
for (const w of WORLDS) {
  for (const pol of ['random', 'gambler', 'smart', 'saver']) {
    for (let i = 0; i < 10; i++) {
      const seed = 4000 + i * 131 + w.charCodeAt(1) * 7;
      let st;
      try { ({ st } = play(w, undefined, seed, pol, 60)); } catch (e) { ok(false, `${w}/${pol}/${seed} sim ran`, String(e)); continue; }
      games++;
      const b = CL.rebuild(st);
      const tag = `${w}/${pol}/${seed}`;
      ok(!b.diverged, `${tag} the shadow replay agrees with the game (no divergence)`);
      const errs = Object.values(b.series).flatMap((s) => CL.checkSeries(s).map((e) => s.key + ' ' + e));
      ok(errs.length === 0, `${tag} OHLC invariants`, errs.slice(0, 4));
      for (const tk of Object.keys(st.prices)) {
        const s = b.series[b.cur[tk]];
        ok(s && s.open.c === st.prices[tk], `${tag} ${tk}: last close === st.prices`, s && [s.open.c, st.prices[tk]]);
        ok(s && s.open.m === st.month, `${tag} ${tk}: the open candle is the current month (no future candle)`, s && [s.open.m, st.month]);
        ok(s.cand.length <= CL.CAP && s.news.length <= CL.NEWS_CAP, `${tag} ${tk}: bounded rings`);
        candles += s.cand.length + 1; skips += s.cand.filter((c) => c.x).length;
      }
      ok(b.ended.length <= CL.ENDED_CAP, `${tag} ended listings bounded`);
      // B: IDX closes = the engine's payday prices
      const ix = b.series[b.cur.IDX]; const hist = st.life.idxHist || [];
      const nC = Math.min(ix.cand.length, hist.length);
      const closes = ix.cand.slice(-nC).map((c) => c.c), tail = hist.slice(-nC);
      ok(nC > 0 && closes.every((c, j) => c === tail[j]), `${tag} IDX: each month's close is its payday price (life.idxHist)`, { closes: closes.slice(-5), tail: tail.slice(-5) });
      // the view model is all finite numbers
      const vm = CL.viewModel(st, b);
      const bad = [];
      for (const s of vm.list.concat(vm.ended)) {
        for (const f of ['price', 'chg', 'chgPct', 'since', 'sincePct']) if (!fin(s[f])) bad.push(`${s.key}.${f}`);
        if (s.hold) for (const f of ['qty', 'basis', 'value', 'avg', 'pnl', 'pnlPct']) if (!fin(s.hold[f])) bad.push(`${s.key}.hold.${f}`);
        if (!s.symbol || !s.name || !s.sector) bad.push(`${s.key} meta`);
      }
      ok(bad.length === 0, `${tag} view model: no NaN / missing name, symbol or sector`, bad);
      const hold = vm.list.find((s) => s.hold && s.hold.qty > 0);
      if (hold) { const h = st.holdings[hold.tk]; ok(hold.hold.qty === h.qty && hold.hold.basis === Math.round(h.basis) && hold.hold.value === Math.round(h.qty * st.prices[hold.tk]), `${tag} ${hold.tk}: qty / cost / value = the engine's holdings`); }
      if (b.ended.length) { relaunches += b.ended.length; relaunchGames.push({ st, b, tag }); }
    }
  }
}
ok(games >= 150, `ran ${games} games`);
console.log(`A/B: ${games} games, ${candles} candles checked, ${skips} two-payday months, ${relaunches} ended coin listings`);

/* ---------- C: live (incremental, synced at random points as the UI does) = rebuild */
{
  let same = 0, tot = 0;
  for (const w of WORLDS) for (let i = 0; i < 6; i++) {
    let r = (i * 2654435761 + w.charCodeAt(1)) >>> 0; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    const hook = (st) => { if (rnd() < 0.3) CL.syncNow(st); };
    const { st } = play(w, undefined, 9100 + i * 17, i % 2 ? 'random' : 'gambler', 50, { onRoll: hook, onLanding: hook });
    const live = CL.syncNow(st); const fresh = CL.rebuild(st);
    tot++; if (JSON.stringify(live) === JSON.stringify(fresh)) same++;
    else ok(false, `${w}#${i} live book = rebuilt book`, { liveSteps: live.steps, freshSteps: fresh.steps });
  }
  ok(same === tot && tot === 24, `C: live = rebuild on ${same}/${tot} games`);
}

/* ---------- D: independent reference from E.replay prefixes */
function reference(st) {
  const cfg = E.replayConfig(st); const A = st.actions;
  const w = E.getWorld(st.worldId); const ctk = w.crypto && w.crypto.tk;
  const key = (s, tk) => (tk === ctk ? `${tk}#${s.world.coin.gen}` : tk);
  const ser = {}; let prevM = null; let prev = null;
  for (let k = 0; k <= A.length; k++) {
    const s = E.replay(cfg, A.slice(0, k));
    for (const tk of Object.keys(s.prices)) {
      const K = key(s, tk); const p = s.prices[tk];
      if (!ser[K]) { ser[K] = { months: { [s.month]: { o: p, prints: [p] } } }; continue; }
      const S = ser[K];
      const d = s.month - prevM;
      if (d === 0) { S.months[s.month].prints.push(p); continue; }
      // the payday print closes the month that ended; IDX's intermediate paydays are its own payday prices
      const hist = s.life.idxHist || [];
      let last = S.months[prevM].prints.at(-1);
      for (let j = 0; j < d; j++) {
        const pj = tk === 'IDX' && hist.at(-1) === p ? hist[hist.length - d + j] : j === 0 ? p : last;
        S.months[prevM + j].prints.push(pj); last = pj;
        S.months[prevM + j + 1] = { o: pj, prints: [pj] };
      }
      S.months[s.month].prints.push(p);
    }
    prevM = s.month; prev = s;
  }
  void prev;
  const out = {};
  for (const [K, S] of Object.entries(ser)) out[K] = Object.entries(S.months).map(([m, x]) => ({ m: +m, o: x.o, h: Math.max(...x.prints), l: Math.min(...x.prints), c: x.prints.at(-1) }));
  return out;
}
{
  let checked = 0;
  for (const w of WORLDS) {
    const { st } = play(w, undefined, 5150 + w.charCodeAt(1), 'gambler', 16);
    const b = CL.rebuild(st); const ref = reference(st);
    for (const [K, s] of Object.entries(b.series)) {
      const got = s.cand.concat([s.open]).map((c) => ({ m: c.m, o: c.o, h: c.h, l: c.l, c: c.c }));
      const exp = (ref[K] || []).filter((c) => c.m >= got[0].m && (s.endedM == null || c.m <= s.endedM));
      ok(JSON.stringify(got) === JSON.stringify(exp), `D ${w} ${K}: candles = the reference built from E.replay prefixes (${got.length} months)`, { got: got.slice(0, 4), exp: exp.slice(0, 4) });
      checked += got.length;
    }
  }
  ok(checked > 100, `D: ${checked} reference candles compared`);
}

/* ---------- E: a relaunched coin keeps its old history under its old name */
{
  // make sure there is a relaunch to look at (longer w1 games until one shows up)
  for (let i = 0; relaunchGames.filter((g) => g.st.worldId === 'w1').length < 2 && i < 40; i++) {
    const { st } = play('w1', undefined, 7700 + i * 37, i % 2 ? 'gambler' : 'random', 160);
    const b = CL.rebuild(st); if (b.ended.length) relaunchGames.push({ st, b, tag: `w1/long/${i}` });
  }
  const R = relaunchGames.filter((g) => g.st.worldId === 'w1');
  ok(R.length >= 2, `E: found ${R.length} w1 games with a relaunched coin`);
  const C = E.getWorld('w1').crypto;
  let wipedSeen = 0;
  for (const { st, b, tag } of R) {
    for (const K of b.ended) {
      const s = b.series[K]; const gen = +K.split('#')[1];
      ok(s.endedM != null && s.cand.length + 1 > 0, `${tag} ${K}: ended listing kept with its candles`);
      ok(s.symbol === C.names[gen % C.names.length] && s.name === `${C.names[gen % C.names.length]} · קריפטו`, `${tag} ${K}: keeps its OLD name (${s.symbol})`);
      ok(s.open.c === C.fates[0].path.at(-1) && s.dead, `${tag} ${K}: its last close is the crash price (the loss stays visible)`, s.open);
      if (s.wiped) { wipedSeen++; ok(s.wiped.qty > 0 && s.news.some((x) => /נמחקו/.test(x.text)), `${tag} ${K}: the wiped units are recorded`); }
    }
    const cur = b.series[b.cur.MOON]; const g = st.world.coin.gen;
    ok(cur.key === `MOON#${g}` && cur.first === C.launchPrice && cur.symbol === st.world.coin.name, `${tag}: the current coin is a new listing from the launch price`);
    ok(!b.ended.includes(cur.key), `${tag}: the new listing has its own key`);
  }
  if (VERBOSE) console.log('E: wiped listings seen', wipedSeen);
}

/* ---------- F: bounded size on a long game */
{
  const { st } = play('w1', undefined, 31337, 'random', 210);
  const b = CL.rebuild(st);
  const size = JSON.stringify(b).length;
  ok(st.month >= 100, `F: long game reached month ${st.month}`);
  ok(size < 40000, `F: the book stays small at month ${st.month} (${size} bytes)`);
  ok(Object.values(b.series).every((s) => s.cand.length <= CL.CAP), 'F: every ring ≤ CAP');
}

/* ---------- H: the async sync (the page's path) follows the game after every call — a finished sync never sticks */
{
  const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 4242, mode: 'free' });
  const b0 = await CL.sync(st);
  ok(b0.m === st.month && b0.steps === 0, 'H: the first async sync opens the book at the start');
  let months = 0;
  for (let i = 0; i < 30 && !st.over; i++) {
    if (st.phase === 'roll') E.rollDice(st);
    let ev = E.landing(st) || E.currentEvent(st); let g = 0;
    while (ev && g++ < 8) { const o = ev.options.find((x) => x.enabled && ['done', 'pass', 'ok', 'skip', 'pay'].includes(x.id)) || ev.options.find((x) => x.enabled); const r = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}); ev = r.event; }
    const b = await CL.sync(st, { sliceMs: 0.01 });
    if (b.m === st.month && b.series[b.cur.IDX].open.c === st.prices.IDX && b.steps === st.actions.length) months++;
  }
  ok(months === 30, `H: after each of 30 turns the awaited book is current (${months}/30)`);
  ok(JSON.stringify(CL.syncNow(st)) === JSON.stringify(CL.rebuild(st)), 'H: the async book = a rebuild');
}

/* ---------- R: the SVG view draws exactly the view model (no NaN; hollow up / filled down / line flat; text says ▲ / ▼ / —) */
{
  const V = await import('../js/render/candles-lite.js');
  const { st } = play('w1', undefined, 2024, 'gambler', 40);
  const vm = CL.viewModel(st, CL.rebuild(st)); let good = 0, tot = 0;
  for (const s of vm.list.concat(vm.ended)) for (const [n, compact] of [[36, false], [12, true]]) {
    tot++;
    const r = V.svgFor(s, { W: 330, H: 140, n, compact }); const shown = s.cand.slice(-n);
    const groups = [...r.svg.matchAll(/<g class="cdl-c cdl-(up|down|flat)/g)].map((m) => m[1]);
    const want = shown.map((c) => (c.c > c.o ? 'up' : c.c < c.o ? 'down' : 'flat'));
    const texts = shown.map((c) => V.candleText(s, c));
    if (!/NaN|undefined|Infinity/.test(r.svg) && JSON.stringify(groups) === JSON.stringify(want) && texts.every((t, i) => t.includes({ up: '▲ עלה', down: '▼ ירד', flat: '— לא זז' }[want[i]]) && t.includes(`חודש ${shown[i].m}`))) good++;
    else ok(false, `R ${s.key} ${n}: svg / text`, { groups: groups.slice(0, 5), want: want.slice(0, 5) });
  }
  ok(good === tot && tot >= 8, `R: ${good}/${tot} charts draw one shape per candle with the right up / down / flat form`);
  const html = V.fullHtml(vm, vm.list[0].key);
  ok(html.includes(V.EDU) && /aria-pressed="true"/.test(html) && !/NaN|undefined/.test(html), 'R: the full view carries the educational line, a pressed tab, no NaN');
}

/* ---------- M (w10): the ENGINE's candles (market.js) through the same chart component — candlelog.marketSeries converts the engine rows
   [m, o, h, l, c, prints, volume] (agorot) to ₪ exactly; the open candle = the last closed month + 1; svg / text / table draw them; the market
   screen (render/marketview.js) lists every live company + the index, keeps the closed ones with their claim status, and the trade preview is
   the engine's market.preview (spread, commission, tax, total) */
{
  const V = await import('../js/render/candles-lite.js'); const MV = await import('../js/render/marketview.js');
  const MKT = await import('../js/worlds/mech/market.js');
  await E.ensureWorld('w10');
  const pick = (ev) => { const en = ev.options.filter((o) => o.enabled); return (ev.forcePrimary && en.find((o) => o.id === ev.forcePrimary)) || en.find((o) => o.primary) || en.find((o) => ['done', 'pass', 'ok'].includes(o.id)) || en[0]; };
  const st = E.createGame({ worldId: 'w10', charId: 'allocator', seed: 7, mode: 'free' });
  for (let t = 0; t < 200 && !st.over && st.month < 14; t++) { if (st.pending) { let ev = E.currentEvent(st), k = 0; while (ev && k++ < 12) ev = E.choose(st, ev, pick(ev).id, { qty: 1 }).event; }
    E.rollDice(st); let ev = E.landing(st), k = 0; while (ev && k++ < 12 && !st.over) ev = E.choose(st, ev, pick(ev).id, { qty: 1 }).event; }
  const MK = E.metrics(st).worldIndicators.market; let good = 0, tot = 0;
  for (const co of [MK.idx, ...MK.cos]) {
    tot++; const s = CL.marketSeries(co, { news: MK.news, month: st.month }); const live = co.status == null || co.status === 'listed' || co.status === 'halted';
    const rows = co.cand; const closed = s.cand.filter((c) => !c.open);
    const same = closed.length === rows.length && closed.every((c, i) => c.m === rows[i][0] && Math.round(c.o * 100) === rows[i][1] && Math.round(c.h * 100) === rows[i][2] && Math.round(c.l * 100) === rows[i][3] && Math.round(c.c * 100) === rows[i][4] && c.n === rows[i][5] && c.v === rows[i][6]);
    const open = s.cand[s.cand.length - 1]; const openOk = !live || (open.open && open.m === (rows.length ? rows[rows.length - 1][0] + 1 : co.listedM) && Math.round(open.c * 100) === co.open.c);
    const order = s.cand.every((c) => c.l <= Math.min(c.o, c.c) && Math.max(c.o, c.c) <= c.h && c.l > 0);
    const r = V.svgFor(s, { W: 330, H: 140, n: 36 }); const groups = (r.svg.match(/<g class="cdl-c/g) || []).length;
    const txt = V.candleText(s, s.cand[0]);
    if (same && openOk && order && groups === Math.min(36, s.cand.length) && !/NaN|undefined/.test(r.svg) && txt.includes('מחזור') && s.symbol === co.tk && Math.round(s.price * 100) === co.px) good++;
    else ok(false, `M ${co.id}: series = engine rows`, { same, openOk, order, groups, n: s.cand.length, txt });
  }
  ok(good === tot && tot >= 10, `M: ${good}/${tot} market series = the engine's candles (₪ = agorot / 100, open = last + 1, OHLC order, one shape each, volume in the text)`);
  const tb = V.tableHtml(CL.marketSeries(MK.idx, {})); ok(tb.includes('מחזור') && (tb.match(/<tr data-m=/g) || []).length === MK.idx.cand.length + 1, 'M: the month table has a volume column and a row per candle');
  const Mf = { mS: (x) => E.money(Math.round(x), 'short'), mSg: (x) => (x > 0 ? '+' : '') + E.money(Math.round(x), 'short'), ex: (x) => E.fmtM(Math.round(x)) };
  const list = MV.listHtml(MK, Mf, null, st.month); const live = MK.cos.filter((c) => c.status === 'listed' || c.status === 'halted');
  ok((list.match(/data-mco="/g) || []).length === live.length + 1 && list.includes('data-mco="IDX"') && live.every((c) => list.includes(c.tk) && list.includes(MV.pxT(c.px))) && /▲|▼|—/.test(list) && !/NaN|undefined/.test(list), 'M: the list = the index + every live company (symbol, price, ▲ / ▼ / —)');
  const dead = MK.cos.filter((c) => !(c.status === 'listed' || c.status === 'halted')).length + MK.grave.length;
  const cl = MV.closedHtml(MK, Mf, null);
  ok(dead >= 1 && (cl.match(/class="mk-co mk-dead/g) || []).length === dead && /תביעה|קיבלת/.test(cl) && !/NaN|undefined/.test(cl), `M: "נסגרו" keeps every closed company (${dead}) with its claim status`);
  ok(MV.isNewListing({ listedM: 9 }, 12) && !MV.isNewListing({ listedM: 1 }, 3) && !MV.isNewListing({ listedM: 2 }, 12), 'M: a relisting is shown as a new listing for 6 months; the first companies never are');
  const co = live[0]; const pv = MKT.preview(st, co.id, 'b', MKT.qtyFor(st, co.id, 1000000)); const html = MV.previewHtml(pv, co, Mf, st.cash);
  ok(pv.qty > 0 && html.includes(`data-mgo="${co.id}:b:${pv.qty}"`) && html.includes(E.fmtM(pv.spreadCost)) && html.includes(E.fmtM(pv.commission)) && html.includes(E.fmtM(pv.total)) && html.indexOf('עמלה') < html.indexOf('data-mgo'), 'M: the trade preview (spread, commission, total — exact ₪) comes before the confirm, which sends exactly the previewed quantity');
  const H = MK.cos.find((c) => c.held && c.held.qty > 0);
  if (H) { const ps = MKT.preview(st, H.id, 's', H.held.qty); const hs = MV.previewHtml(ps, H, Mf, st.cash); ok(hs.includes('מס רווח הון') && hs.includes(E.fmtM(ps.tax)) && hs.includes('risky'), 'M: a sell preview names the capital-gains tax and its confirm needs a second tap (risky)'); }
  ok(MV.headHtml(MK, null, st.month).includes(V.SIM_NOTE) && MV.detailHtml(MK.idx, CL.marketSeries(MK.idx, {}), MK, Mf, {}).includes(V.SIM_NOTE), 'M: the simulation line is on the screen and on every company');
}

/* ---------- G: the engine graph never reaches the candle files (L-nochange; tools/build-edge.mjs --check pins the bundle) */
{
  const seen = new Set();
  const walk = (f) => { if (seen.has(f)) return; seen.add(f); let src = ''; try { src = readFileSync(f, 'utf8'); } catch (e) { return; }
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) { const sp = m[1] || m[2]; if (sp && sp.startsWith('.')) walk(resolve(dirname(f), sp)); } };
  walk(resolve(ROOT, 'js/engine.js'));
  ok(![...seen].some((f) => /candlelog|candles/.test(f)), 'G: js/engine.js does not import the candle files');
  const src = readFileSync(resolve(ROOT, 'js/candlelog.js'), 'utf8');
  ok(!/Math\.random|Date\.now\(\)\s*[-+*%]/.test(src) && !/\bst\.(prices|holdings|month)\s*=[^=]/.test(src), 'G: the builder draws nothing and never writes the game state');
}

console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
