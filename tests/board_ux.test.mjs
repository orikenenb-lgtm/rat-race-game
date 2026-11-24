// 3D upgrade wave 1 (team ג) — Node checks for the board UX layer. Run: node tests/board_ux.test.mjs
//  T-opt   : SCENE_OPTIONAL (markTile, onTilePick, cityKeys, homeView) is exported by null.js and board2d.js and callable before
//            init; SCENE_API itself is unchanged (48). (wave 3a, review MINOR-5: the scene.js / game.js source-regex checks are gone —
//            markers, the watchdog and the camera are behaviour-tested in tests/board_ux_e2e.py on a real page.)
//  T-deck  : (wave 3a, review MAJOR-2) the market / deal tile text of every world names only effects whose card kind exists in that
//            world's own deck, and every card kind of the deck is named.
//  T-tiles : every tile of every world has a short name ≤ 10 chars (never "…") and a one-line description; the steps / "אתה כאן" text.
//  T-pin   : the engine files stay pinned (tools/build-edge.mjs --check) and no pinned file imports the render layer.
//  T-saves : the wave adds nothing to S.ui (no display data in saves: no new S.ui.<key> writes in game.js).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const src = (f) => readFileSync(resolve(ROOT, f), 'utf8');

const nul = await import('../js/render/null.js');
const b2d = await import('../js/render/board2d.js');
const T = await import('../js/render/tiles.js');
const E = await import('../js/engine.js');
const W5 = (await import('../js/worlds/w5.js')).default; E.registerWorld(W5);   // worlds wave 1: the lazy w5 (its tiles, decks, tile N)
const SEASON = await import('../js/worlds/mech/season.js');
const W6 = (await import('../js/worlds/w6.js')).default; E.registerWorld(W6);   // worlds wave 2: the lazy w6 (its tiles, decks, tile C)
const PLANT = await import('../js/worlds/mech/plant.js');
const W7 = (await import('../js/worlds/w7.js')).default; E.registerWorld(W7);   // worlds wave 3: the lazy w7 (tile R, chain decks)
const W8 = (await import('../js/worlds/w8.js')).default; E.registerWorld(W8);   // worlds wave 3: the lazy w8 (tile Q, project decks)
const CHAIN = await import('../js/worlds/mech/chain.js');
const PROJ = await import('../js/worlds/mech/projects.js');

/* T-opt */
const OPT = nul.SCENE_OPTIONAL;
ok(Array.isArray(OPT) && Object.isFrozen(OPT), 'SCENE_OPTIONAL frozen');
for (const f of ['markTile', 'onTilePick', 'cityKeys', 'homeView']) ok(OPT.includes(f), 'SCENE_OPTIONAL has ' + f);
ok(nul.SCENE_API.length === 48 && OPT.every((f) => !nul.SCENE_API.includes(f)), 'SCENE_API unchanged (48) and disjoint from SCENE_OPTIONAL');
const game = src('js/game.js');
for (const f of OPT) {
  ok(typeof nul[f] === 'function', 'null.js exports ' + f);
  ok(typeof b2d[f] === 'function', 'board2d.js exports ' + f);
}
ok(nul.cityKeys().length === 0 && typeof nul.onTilePick(() => {}) === 'function' && nul.markTile('dest', 3) === undefined, 'null scene: no-op defaults');
ok(typeof b2d.onTilePick(() => {}) === 'function' && b2d.cityKeys().length === 0 && b2d.markTile('current', 2) === undefined, 'board2d: callable before init (no DOM at import)');

const W = (id) => E.getWorld(id);
/* T-tiles */
const types = new Set();
for (const wid of ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'h']) {
  let tiles; try { tiles = E.boardInfo(wid); } catch (e) { tiles = null; }
  ok(tiles && tiles.length === 40, `${wid}: 40 tiles`);
  for (const t of tiles || []) {
    const x = T.tileText(t); types.add(t.type);
    ok(x.short && x.short.length <= T.SHORT_MAX, `${wid}[${t.index}] short ≤ ${T.SHORT_MAX}: "${x.short}"`);
    ok(!/…|\.\.\./.test(x.short + x.name), `${wid}[${t.index}] no ellipsis`);
    ok(x.desc && x.desc.length >= 20 && x.desc.length <= 160, `${wid}[${t.index}] one-line description (${t.type})`);
    const xw = T.tileText(t, W(wid)); ok(xw.desc && xw.desc.length >= 20 && xw.desc.length <= 180 && xw.short === x.short, `${wid}[${t.index}] per-world description (${t.type}, ${xw.desc.length})`);
    ok(x.name === t.name, `${wid}[${t.index}] the full name is the world data name`);
    ok(x.emoji && x.emoji !== '⭐', `${wid}[${t.index}] has an icon (${t.icon})`);
  }
}
for (const ty of types) ok(T.TILE_TEXT[ty], 'TILE_TEXT covers type ' + ty);
ok(T.tileText({ type: 'crisis', name: 'פיטורים' }).desc.includes('פיטורים'), 'a world override name gets its own description');
ok(T.tileText({ type: 'edu', name: 'לימודים וקריירה' }).short === 'לימודים', 'long data names get the short word');
ok(T.stepsTo(38, 2, 40) === 4 && T.stepsTo(5, 5, 40) === 0 && T.stepsTo(10, 3, 40) === 33, 'stepsTo wraps the ring');
ok(T.whereText(0) === 'אתה כאן' && T.whereText(1) === 'עוד צעד אחד' && T.whereText(7) === 'עוד 7 צעדים', 'where text');
const sh = T.tileSheet({ type: 'deal', name: 'הזדמנות', icon: 'trend' }, 12, 0, 40);
ok(sh.where === 'עוד 12 צעדים' && sh.index === 12 && sh.emoji === '📈' && !sh.here, 'tileSheet data');
ok(T.landedText({ type: 'payday', name: 'יום משכורת' }) === 'נחתת על יום משכורת', 'landing text');

/* T-deck (MAJOR-2): words ↔ the world's own cards */
const dealK = (c) => T.dealKind(c), mktK = (c) => T.marketKind(c);
for (const wid of ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'h']) {
  const w = W(wid);
  for (const [type, deck, kindOf, WORDS] of [['deal', w.deals || [], dealK, { ...T.DEAL_WORDS, ...((T.DEAL_WORDS_W || {})[wid] || {}) }], ['market', w.market || [], mktK, T.MARKET_WORDS]]) {
    const tile = Object.values(w.tiles).find((t) => t.type === type); if (!tile) continue;
    const desc = T.tileText(tile, w).desc;
    const have = new Set(deck.map(kindOf));
    for (const [k, v] of Object.entries(WORDS)) {
      const word = typeof v === 'string' ? v : v.t;
      if (tile.name === 'כותרות') continue;   // the history market tile is the real-headline card (its own text)
      const named = desc.includes(word) && !Object.entries(WORDS).some(([k2, v2]) => k2 !== k && (typeof v2 === 'string' ? v2 : v2.t).includes(word) && desc.includes(typeof v2 === 'string' ? v2 : v2.t) && have.has(k2));
      if (named) ok(have.has(k), `${wid} ${type}: "${word}" is named and the deck has a "${k}" card`);
    }
    if (tile.name !== 'כותרות') for (const k of have) ok(WORDS[k] && desc.includes(typeof WORDS[k] === 'string' ? WORDS[k] : WORDS[k].t), `${wid} ${type}: deck kind "${k}" is named in the tile text`);
    if (type === 'market' && tile.name !== 'כותרות') ok(/לקנות או למכור|קונים או מוכרים/.test(desc) === [...have].some((k) => WORDS[k] && WORDS[k].trade), `${wid} market: "buy or sell" only when a card lets you trade`);
  }
}
// the review's concrete false claims are gone
ok(!/ריבית|הדולר/.test(T.tileText(Object.values(W('w1').tiles).find((t) => t.type === 'market'), W('w1')).desc), 'w1 market: no rate / dollar (the w1 deck has neither)');
ok(!/דירות/.test(T.tileText(Object.values(W('w3').tiles).find((t) => t.type === 'deal'), W('w3')).desc), 'w3 deal: no apartments');
ok(!/מניות|קריפטו/.test(T.tileText(Object.values(W('h').tiles).find((t) => t.type === 'deal'), W('h')).desc), 'h deal: no shares / crypto (filtered deck)');
ok(T.tileText({ type: 'deal', name: 'הזדמנות' }).desc === T.TILE_TEXT.deal.desc, 'no world → the shared wording (makes no deck claim)');
/* T-w5: tile N (type 'allot') — the text is built from the module's real constants (js/worlds/mech/season.js ALLOT); a balance change
   that moves a number fails here. */
{
  const A = SEASON.ALLOT; const tN = W5.tiles.N;
  ok(!/\d/.test(T.tileText(tN, W5).desc), 'w5 N before prepareWorldText: the number-free wording (no copied numbers)');
  ok(JSON.stringify(await T.prepareWorldText(W5)) === '["allot"]', 'prepareWorldText(w5) builds the allot text from season.js');
  const x = T.tileText(tN, W5);
  ok(tN.type === 'allot' && x.emoji === '✈️' && x.short.length <= T.SHORT_MAX, `w5 N: type allot, ✈️, short "${x.short}"`);
  ok(x.desc.includes(`${A.months} חודשים`) && x.desc.includes(`${Math.round(A.disc * 100)}% הנחה`) && x.desc.includes(`${Math.round(A.counterDisc * 100)}% הנחה`) && (A.upfront === 0.5 ? x.desc.includes('חצי') : x.desc.includes(Math.round(A.upfront * 100) + '%')),
    `w5 N text = ALLOT {months ${A.months}, disc ${A.disc}, counter ${A.counterDisc}, upfront ${A.upfront}}: ${x.desc}`);
  ok(SEASON.season.tiles.N.safe === 'decline' && x.desc.includes('לוותר'), 'w5 N: the safe default (decline) is named');
  ok(T.tileText(Object.values(W5.tiles).find((t) => t.type === 'crisis'), W5).desc.includes('שפל בתיירות'), 'w5 crisis tile: the tourism slump wording');
}
/* T-w6: tile C (type 'contract') — the text is built from plant.js CONTRACT (months, volume range, price, counter price); a balance change
   that moves a number fails here. The w6 decks are named by their own words (lines, industry shocks), never by apartments. */
{
  const C = PLANT.CONTRACT; const tC = W6.tiles.C;
  ok(tC && tC.type === 'contract', 'w6 tile C has type contract');
  ok(!/\d/.test(T.TILE_TEXT.contract.desc), 'w6 C before prepareWorldText: the number-free wording (no copied numbers)');
  ok((await T.prepareWorldText(W6)).includes('contract'), 'prepareWorldText(w6) builds the contract text from plant.js');
  const x = T.tileText(tC, W6); const p = (v) => `${Math.round(v * 100)}%`;
  ok(x.emoji === '📝' && x.short.length <= T.SHORT_MAX, `w6 C: 📝, short "${x.short}"`);
  ok(x.desc.includes(`${C.months} חודשים`) && x.desc.includes(`${p(C.volMin)}–${p(C.volMin + C.volSpan)}`) && x.desc.includes(`${p(1 - C.price)} פחות`) && x.desc.includes(`${p(1 - C.counterPrice)} הנחה`),
    `w6 C text = CONTRACT {months ${C.months}, vol ${C.volMin}+${C.volSpan}, price ${C.price}, counter ${C.counterPrice}}: ${x.desc}`);
  ok(PLANT.plant.tiles.C.safe === 'decline' && x.desc.includes('לוותר'), 'w6 C: the safe default (decline) is named');
  const deal = T.tileText(Object.values(W6.tiles).find((t) => t.type === 'deal'), W6).desc;
  ok(/קווי CNC/.test(deal) && /מפעלי מזון/.test(deal) && !/דירות/.test(deal), 'w6 deal tile: production lines, no apartments: ' + deal);
  const mk = T.tileText(Object.values(W6.tiles).find((t) => t.type === 'market'), W6).desc;
  ok(/ביקורת בטיחות/.test(mk) && /הזמנת יצוא/.test(mk), 'w6 market tile: the industry shocks (mk cards) are named: ' + mk);
  ok(T.tileText(Object.values(W6.tiles).find((t) => t.type === 'crisis'), W6).desc.includes('משבר בתעשייה'), 'w6 crisis tile: the industry crisis wording');
  ok(T.marketKind({ mk: 'inspect' }) === 'mk:inspect' && T.marketKind({ k: 'price', mk: 'x' }) === 'price', 'marketKind: k first, then mk:');
}
/* T-w7 / T-w8: tile R (type 'site') and tile Q (type 'land') — the text is built from chain.js (RAMP, ROYALTY) / projects.js (LAND_LTV,
   PRESALE, CONTRACTOR) at game start; a balance change that moves a number fails here. The decks are named by their own words (branches,
   a DC, e-commerce, a leased commercial building; a stalled project, plots, a rented building) — never "קווי אריזה" for w7's rival chain. */
{
  const tR = W7.tiles.R, tQ = W8.tiles.Q; const p = (v) => `${Math.round(v * 100)}%`;
  ok(tR && tR.type === 'site' && tQ && tQ.type === 'land', 'w7 tile R is type site, w8 tile Q is type land');
  ok(!/\d/.test(T.TILE_TEXT.site.desc) && !/\d/.test(T.TILE_TEXT.land.desc), 'R / Q before prepareWorldText: the number-free wording');
  ok((await T.prepareWorldText(W7)).includes('site') && (await T.prepareWorldText(W8)).includes('land'), 'prepareWorldText builds the R / Q texts from the modules');
  const r = T.tileText(tR, W7), q = T.tileText(tQ, W8);
  ok(r.emoji === '🏪' && r.short.length <= T.SHORT_MAX && q.emoji === '🏗️' && q.short.length <= T.SHORT_MAX, `R: 🏪 "${r.short}", Q: 🏗️ "${q.short}"`);
  ok(r.desc.includes(p(CHAIN.RAMP[0])) && r.desc.includes(p(CHAIN.ROYALTY.pct)) && r.desc.includes('סקר מיקום') && r.desc.includes('לוותר'), `w7 R text = chain.js {RAMP[0] ${CHAIN.RAMP[0]}, royalty ${CHAIN.ROYALTY.pct}}: ${r.desc}`);
  ok(q.desc.includes(p(PROJ.LAND_LTV)) && q.desc.includes(p(PROJ.PRESALE.req)) && q.desc.includes(p(PROJ.CONTRACTOR.reliable.cost - 1)) && q.desc.includes(p(PROJ.CONTRACTOR.cheap.over)) && q.desc.includes('לוותר'), `w8 Q text = projects.js constants: ${q.desc}`);
  ok(CHAIN.chain.tiles.R.safe === 'pass' && PROJ.projects.tiles.Q.safe === 'pass', 'R / Q: the safe default is pass (named "לוותר")');
  const d7 = T.tileText(Object.values(W7.tiles).find((t) => t.type === 'deal'), W7).desc, d8 = T.tileText(Object.values(W8.tiles).find((t) => t.type === 'deal'), W8).desc;
  ok(/סניפים/.test(d7) && /מרכז הפצה/.test(d7) && /מבנה מסחרי מושכר/.test(d7) && !/קווי אריזה|יבואנים/.test(d7), 'w7 deal tile: branches, a DC, a leased building — no packing lines / importers: ' + d7);
  ok(/פרויקט תקוע/.test(d8) && /מגרשים/.test(d8) && /בניין מושכר/.test(d8), 'w8 deal tile: a stalled project, plots, a rented building: ' + d8);
  const m7 = T.tileText(Object.values(W7.tiles).find((t) => t.type === 'market'), W7).desc, m8 = T.tileText(Object.values(W8.tiles).find((t) => t.type === 'market'), W8).desc;
  ok(/ספק מעלה מחירים/.test(m7) && /רשת מתחרה/.test(m7) && /הריבית במשק זזה/.test(m8) && /הקפאת היתרים/.test(m8), 'w7 / w8 market tiles name their module shocks');
  ok(T.tileText(Object.values(W7.tiles).find((t) => t.type === 'crisis'), W7).desc.includes('משבר בקמעונאות') && T.tileText(Object.values(W8.tiles).find((t) => t.type === 'crisis'), W8).desc.includes('משבר בבנייה'), 'w7 / w8 crisis tiles: their own wording');
  ok(T.dealKind({ k: 'pack', op: { ck: 'branch' } }) === 'ck:branch' && T.dealKind({ k: 'warehouse' }) === 'warehouse', 'dealKind: module cards by op.ck, plain cards by k');
}

/* T-pin */
let pin = ''; try { pin = execFileSync('node', [resolve(ROOT, 'tools/build-edge.mjs'), '--check'], { encoding: 'utf8' }); } catch (e) { pin = 'ERR ' + (e.stdout || '') + (e.stderr || ''); }
ok(/✓ verify-result pins the current engine/.test(pin), 'build-edge --check passes (engine unchanged): ' + pin.trim().slice(0, 120));
for (const f of ['js/engine.js', 'js/life.js', 'js/rng.js', 'js/practice.js', 'js/history.js', 'js/achievements.js', 'js/worlds/common.js', 'js/worlds/w1.js'])
  ok(!/render\/tiles\.js/.test(src(f)), f + ' does not import the render-side tile text');

/* T-saves: no new S.ui keys from this wave (the life helpers weddingAge / burnSeen / lifeSeen were already there) */
const uiKeys = new Set([...game.matchAll(/\bS\.ui\.(\w+)\s*(?:\?\?=|=(?!=))/g)].map((m) => m[1]));
const KNOWN = ['seq', 'fundWarn', 'weddingAge', 'burnSeen', 'lifeSeen', 'inflReality', 'tl', 'hist', 'pensionHist', 'trackMonth', 'coach', 'firstPayday'];
for (const k of uiKeys) ok(KNOWN.includes(k), 'game.js writes S.ui.' + k + ' (display data must go to rr2-settings, not the save)');

console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
