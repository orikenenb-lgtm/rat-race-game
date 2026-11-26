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
const W9 = (await import('../js/worlds/w9.js')).default; E.registerWorld(W9);     // worlds wave 4: the lazy w9 (tile V, energy decks)
const W10 = (await import('../js/worlds/w10.js')).default; E.registerWorld(W10);  // worlds wave 4: the lazy w10 (tiles W / Y, fund deck, portfolio market)
const ENERGY = await import('../js/worlds/mech/energy.js');
const PORT = await import('../js/worlds/mech/portfolio.js');
const W13 = await E.ensureWorld('w13');   // w13: the lazy world (tile H, the sponsor / facility deck, league news)
const AUC = await import('../js/worlds/mech/auction.js');
const W11 = await E.ensureWorld('w11'), W15 = await E.ensureWorld('w15');   // w11 / w15: the lazy worlds (tiles Z / H, their decks)
const W12 = await E.ensureWorld('w12'), W16 = await E.ensureWorld('w16');
const W14 = await E.ensureWorld('w14'), W17 = await E.ensureWorld('w17'), W18 = await E.ensureWorld('w18'), W19 = await E.ensureWorld('w19'), W20 = await E.ensureWorld('w20');   // the CATALOG-25 A3 / A4 maps (tiles J / V / Z / W / W)   // w12 / w16: the lazy worlds (tiles Z / H, their decks)
const HDM = await import('../js/worlds/mech/holding.js'), HVM = await import('../js/worlds/adapters/harvest.js');
const MNM = await import('../js/worlds/mech/multinational.js');

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
for (const wid of ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11', 'w12', 'w13', 'w14', 'w15', 'w16', 'w17', 'w18', 'w19', 'w20', 'h']) {
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
for (const wid of ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11', 'w12', 'w13', 'w14', 'w15', 'w16', 'w17', 'w18', 'w19', 'w20', 'h']) {
  const w = W(wid);
  for (const [type, deck, kindOf, WORDS] of [['deal', w.deals || [], dealK, { ...T.DEAL_WORDS, ...((T.DEAL_WORDS_W || {})[wid] || {}) }], ['market', w.market || [], mktK, { ...T.MARKET_WORDS, ...((T.MARKET_WORDS_W || {})[wid] || {}) }]]) {
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

/* T-w9 / T-w10: tile V (type 'powerSite'), W ('exchange'), Y ('privateDeal') — the V / Y texts are built from energy.js (SLOT.wait, PPA.share)
   and portfolio.js (PE.calls, STAKE, FIRE.secondary) at game start; the decks are named by their own words (a grid slot, an operating plant, a
   line share, the hydrogen pilot; the funds), the market cards by their mk (w10's freeze is a LIQUIDITY freeze), the crisis tiles by theirs. */
{
  const tV = W9.tiles.V, tW = W10.tiles.W, tY = W10.tiles.Y; const p = (v) => `${Math.round(v * 100)}%`;
  ok(tV && tV.type === 'powerSite' && tW && tW.type === 'exchange' && tY && tY.type === 'privateDeal', 'w9 tile V is powerSite; w10 W is exchange, Y is privateDeal');
  ok(!/\d/.test(T.TILE_TEXT.powerSite.desc) && !/\d/.test(T.TILE_TEXT.privateDeal.desc) && !/\d/.test(T.TILE_TEXT.exchange.desc), 'V / W / Y before prepareWorldText: the number-free wording');
  ok((await T.prepareWorldText(W9)).includes('powerSite') && (await T.prepareWorldText(W10)).includes('privateDeal'), 'prepareWorldText builds the V / Y texts from the modules');
  const v = T.tileText(tV, W9), w = T.tileText(tW, W10), y = T.tileText(tY, W10);
  ok(v.emoji === '⚡' && w.emoji === '📊' && y.emoji === '🔒' && [v, w, y].every((x) => x.short.length <= T.SHORT_MAX), `V ⚡ "${v.short}", W 📊 "${w.short}", Y 🔒 "${y.short}"`);
  ok(v.desc.includes(`${ENERGY.SLOT.wait} חודשים`) && v.desc.includes(p(ENERGY.PPA.share)) && v.desc.includes('חיבור לרשת') && v.desc.includes('שותף') && v.desc.includes('לוותר'), `w9 V text = energy.js constants: ${v.desc}`);
  ok(y.desc.includes(`${PORT.PE.calls} שלבים`) && y.desc.includes(`${PORT.STAKE.lockMin}–${PORT.STAKE.lockMin + PORT.STAKE.lockSpan - 1}`) && y.desc.includes(p(PORT.FIRE.secondary)) && y.desc.includes('לוותר'), `w10 Y text = portfolio.js constants: ${y.desc}`);
  ok(/בין הטלות/.test(w.desc) && /חינם/.test(w.desc), 'w10 W text: the floor (a free look), trading in the panel between rolls');
  ok(ENERGY.energy.tiles.V.safe === 'pass' && PORT.portfolio.tiles.Y.safe === 'pass', 'V / Y: the safe default is pass (named "לוותר")');
  const d9 = T.tileText(Object.values(W9.tiles).find((t) => t.type === 'deal'), W9).desc, d10 = T.tileText(Object.values(W10.tiles).find((t) => t.type === 'deal'), W10).desc;
  ok(/חיבור לרשת/.test(d9) && /תחנה שכבר עובדת/.test(d9) && /פיילוט מימן/.test(d9) && /קרנות/.test(d10), 'w9 deal tile: a slot, an operating plant, the pilot; w10: the funds: ' + d9 + ' | ' + d10);
  const m9 = T.tileText(Object.values(W9.tiles).find((t) => t.type === 'market'), W9).desc, m10 = T.tileText(Object.values(W10.tiles).find((t) => t.type === 'market'), W10).desc;
  ok(/גל חום/.test(m9) && /סופת חול/.test(m9) && /הקפאת נזילות/.test(m10) && !/היתרים/.test(m10) && /קריסה בזק/.test(m10), 'w9 / w10 market tiles name their module shocks (w10 freeze = liquidity)');
  ok(T.tileText(Object.values(W9.tiles).find((t) => t.type === 'crisis'), W9).desc.includes('שנאי'), 'w9 crisis tile: its own wording (a transformer, the neighbours)');
}
/* T-pin */
let pin = ''; try { pin = execFileSync('node', [resolve(ROOT, 'tools/build-edge.mjs'), '--check'], { encoding: 'utf8' }); } catch (e) { pin = 'ERR ' + (e.stdout || '') + (e.stderr || ''); }
ok(/✓ verify-result pins the current engine/.test(pin), 'build-edge --check passes (engine unchanged): ' + pin.trim().slice(0, 120));
for (const f of ['js/engine.js', 'js/life.js', 'js/rng.js', 'js/practice.js', 'js/history.js', 'js/achievements.js', 'js/worlds/common.js', 'js/worlds/w1.js'])
  ok(!/render\/tiles\.js/.test(src(f)), f + ' does not import the render-side tile text');

/* T-saves: no new S.ui keys from this wave (the life helpers weddingAge / burnSeen / lifeSeen were already there) */
const uiKeys = new Set([...game.matchAll(/\bS\.ui\.(\w+)\s*(?:\?\?=|=(?!=))/g)].map((m) => m[1]));
/* T-w13: tile H (type 'transfer'): number-free until prepareWorldText builds it from auction.js (ROUNDS, STEP.raise / jump); ⚽, a short name
   ≤ 10; the deal tile names the sponsors and the club's facilities, the league news tile every mk, the crisis tile its own wording */
{
  const tH = W13.tiles.H; const p = (v) => `${Math.round(v * 100)}%`;
  ok(tH && tH.type === 'transfer' && tH.icon === 'ball' && tH.color === '#dc2626' && tH.ink === '#ffffff', 'w13 tile H is transfer (ball, #dc2626 / #fff)');
  ok(!/\d/.test(T.TILE_TEXT.transfer.desc), 'H before prepareWorldText: the number-free wording');
  ok((await T.prepareWorldText(W13)).includes('transfer'), 'prepareWorldText builds the H text from auction.js');
  const h = T.tileText(tH, W13);
  ok(h.emoji === '⚽' && h.short.length <= T.SHORT_MAX && h.short === 'שוק העברות', `H ⚽ "${h.short}"`);
  ok(h.desc.includes(`עד ${AUC.ROUNDS} סבבים`) && h.desc.includes(p(AUC.STEP.raise - 1)) && h.desc.includes(p(AUC.STEP.jump - 1)) && h.desc.includes('לוותר') && h.desc.length <= 180, `w13 H text = auction.js constants: ${h.desc}`);
  ok(AUC.auction.tiles.H.safe === 'walk', 'H: the safe default is walk (named "לוותר")');
  const d = T.tileText(Object.values(W13.tiles).find((t) => t.type === 'deal'), W13).desc, mk = T.tileText(Object.values(W13.tiles).find((t) => t.type === 'market'), W13).desc, cr = T.tileText(Object.values(W13.tiles).find((t) => t.type === 'crisis'), W13).desc;
  ok(/חסויות/.test(d) && /מתקנים של המועדון/.test(d), 'w13 deal tile: sponsors and the club facilities: ' + d);
  ok(['חוזה טלוויזיה', 'שוק ההעברות רותח', 'מאמן הנוער נחטף', 'ריצה בגביע', 'דרבי מקומי', 'הכוכב רוצה העלאה'].every((x) => mk.includes(x)), 'w13 market tile names every league news card: ' + mk);
  ok(/ביקורת על השכר/.test(cr) && /שערוריית נותן חסות/.test(cr) && cr.length <= 180, 'w13 crisis tile: its own wording: ' + cr);
  ok(W13.board.length === 40 && Object.values(W13.tiles).every((t) => T.tileText(t, W13).short.length <= T.SHORT_MAX), 'w13: 40 tiles, every short name ≤ 10');
}
/* T-w11 / w15: tile Z (acquisition, 🌍 globe, #f59e0b / #3a2400) and tile H (investors, 🚀, #7c3aed / #fff): number-free until prepareWorldText
   builds Z from multinational.js (MN.down, MN.auditFee, SLOTS); the deal / market / crisis tiles name what their decks do */
{
  const tZ = W11.tiles.Z, tH = W15.tiles.H;
  ok(tZ && tZ.type === 'acquisition' && tZ.icon === 'globe' && tZ.color === '#f59e0b' && tZ.ink === '#3a2400' && [...W11.board].filter((c) => c === 'Z').length === 6, 'w11 tile Z: acquisition (globe, amber / dark ink), 6 on the board');
  ok(tH && tH.type === 'investors' && tH.icon === 'rocket' && tH.color === '#7c3aed' && [...W15.board].filter((c) => c === 'H').length === 6, 'w15 tile H: investors (rocket, violet), 6 on the board');
  ok(!/\d/.test(T.TILE_TEXT.acquisition.desc) && !/\d/.test(T.TILE_TEXT.investors.desc), 'Z / H before prepareWorldText: number-free');
  ok((await T.prepareWorldText(W11)).includes('acquisition') && (await T.prepareWorldText(W15)).includes('investors'), 'prepareWorldText builds Z / H');
  const z = T.tileText(tZ, W11), h = T.tileText(tH, W15);
  ok(z.emoji === '🌍' && z.short === 'הצעת רכישה' && h.emoji === '🚀' && h.short.length <= T.SHORT_MAX, `Z 🌍 "${z.short}", H 🚀 "${h.short}"`);
  ok(z.desc.includes(`${Math.round(MNM.MN.down * 100)}%`) && z.desc.includes(`${MNM.MN.auditFee / 1000} אלף`) && z.desc.includes(`עד ${MNM.SLOTS} חברות`) && z.desc.includes('לוותר') && z.desc.length <= 180, 'w11 Z text = multinational.js constants: ' + z.desc);
  ok(MNM.multinational.tiles.Z.safe === 'pass' && (await import('../js/worlds/mech/platform.js')).platform.tiles.H.safe === 'decline', 'Z safe = pass, H safe = decline');
  const tt = (W, type) => T.tileText(Object.values(W.tiles).find((t) => t.type === type), W).desc;
  ok(/בנייני משרדים/.test(tt(W11, 'deal')) && /מחסנים ומרכזי הפצה/.test(tt(W11, 'deal')), 'w11 deal tile: ' + tt(W11, 'deal'));
  ok(['נמל נסגר', 'משבר מטבע', 'מכסים חדשים', 'בחירות', 'פריחה במדינה אחת', 'מנהל כוכב נחטף'].every((x) => tt(W11, 'market').includes(x)) && !/חשמל יקר|שדות סולאריים/.test(tt(W11, 'market')), 'w11 market tile = its own news (tariff / boom in w11 words): ' + tt(W11, 'market'));
  ok(['חנות האפליקציות', 'חודש ויראלי', 'פריצת מידע', 'הבועה', 'מהנדסת מפתח'].every((x) => tt(W15, 'market').includes(x)), 'w15 market tile: ' + tt(W15, 'market'));
  ok(/רגולטור/.test(tt(W11, 'crisis')) && /השרתים נופלים/.test(tt(W15, 'crisis')), 'w11 / w15 crisis tiles: their own wording');
  for (const W of [W11, W15]) ok(W.board.length === 40 && Object.values(W.tiles).every((t) => T.tileText(t, W).short.length <= T.SHORT_MAX), `${W.id}: 40 tiles, every short name ≤ 10`);
}
/* T-w14 / w17 / w18 / w19 / w20: tile J (bankOffer, 🏦), V (candidate, 🧪), Z (policyBook, ☂️), W (boltOn, 🔔), W (mandate, 📊): number-free until
   prepareWorldText builds them from the modules' constants (credit.js REG.min; trials.js TR.ddFee / ddBand, SLOTS; insure.js IN.band / ddBand;
   the bell / funds adapters); safe = pass; the crisis / market / deal tiles name what their decks do */
{
  const SP = [[W14, 'J', 'bankOffer', 'bank', '#475569', 8, '🏦'], [W17, 'V', 'candidate', 'flask', '#0d9488', 6, '🧪'], [W18, 'Z', 'policyBook', 'umbrella', '#312e81', 6, '☂️'], [W19, 'W', 'boltOn', 'bell', '#b45309', 6, '🔔'], [W20, 'W', 'mandate', 'chart', '#0e7490', 6, '📊']];
  for (const [Wd, ch, type, icon, color, n, emoji] of SP) {
    const t = Wd.tiles[ch]; ok(t && t.type === type && t.icon === icon && t.color === color && t.ink === '#ffffff' && [...Wd.board].filter((c) => c === ch).length === n, `${Wd.id} tile ${ch}: ${type} (${icon}, ${color} / white), ${n} on the board`);
    ok(!/\d/.test(T.TILE_TEXT[type].desc), `${Wd.id} ${type} before prepareWorldText: number-free`);
    ok((await T.prepareWorldText(Wd)).includes(type), `prepareWorldText builds ${Wd.id} ${type} (from ${Wd.mech[0].id})`);
    const x = T.tileText(t, Wd); ok(x.emoji === emoji && x.short.length <= T.SHORT_MAX && /לוותר|או לוותר/.test(x.desc) && x.desc.length <= 180, `${Wd.id} ${ch} ${emoji} "${x.short}": ${x.desc}`);
    ok(Wd.mech[0].tiles[ch].safe === 'pass', `${Wd.id} ${ch}: safe = pass`);
    for (const tt of Object.values(Wd.tiles)) ok(T.tileText(tt, Wd).short.length <= T.SHORT_MAX, `${Wd.id}: tile ${tt.type} short name ≤ 10`);
  }
  const CR = await import('../js/worlds/mech/credit.js'), TRm = await import('../js/worlds/adapters/trials.js'), INm = await import('../js/worlds/mech/insure.js');
  ok(T.tileText(W14.tiles.J, W14).desc.includes(`${Math.round(CR.REG.min * 100)}%`), 'w14 J text = credit.js REG.min');
  ok(T.tileText(W17.tiles.V, W17).desc.includes(`${Math.round(TRm.TR.ddFee / 1e6)} מיליון`) && T.tileText(W17.tiles.V, W17).desc.includes(`עד ${TRm.SLOTS} מולקולות`), 'w17 V text = trials.js TR.ddFee / SLOTS');
  ok(T.tileText(W18.tiles.Z, W18).desc.includes(`±${Math.round(INm.IN.band * 100)}%`) && T.tileText(W18.tiles.Z, W18).desc.includes(`±${Math.round(INm.IN.ddBand * 100)}%`), 'w18 Z text = insure.js IN.band / ddBand');
  const tt = (Wd, type) => T.tileText(Object.values(Wd.tiles).find((t) => t.type === type), Wd).desc;
  ok(/מעילה/.test(tt(W14, 'crisis')) && /חברת הניסויים/.test(tt(W17, 'crisis')) && /שיטפון/.test(tt(W18, 'crisis')) && /חטיבה/.test(tt(W19, 'crisis')) && /מערכת המסחר/.test(tt(W20, 'crisis')), 'the five crisis tiles: their own decks in words');
  ok(/בנק ישראל/.test(tt(W14, 'market')) && /בועת ביוטק/.test(tt(W17, 'market')) && /ביטוח משנה/.test(tt(W18, 'market')) && /תום תקופת החסימה/.test(tt(W19, 'market')) && /סחיטת שורט/.test(tt(W20, 'market')) && !/איסור ייצוא/.test(tt(W20, 'market')), 'the five market tiles: their own news (w20 "ban" in its own words)');
}
/* T-w12 / w16: tile Z (division, 👑 crown, #166534 / #fff) and tile H (produce, 📊 bars, #0284c7 / #fff): number-free until prepareWorldText
   builds them from holding.js (HD.down, SLOTS) / adapters/harvest.js (HV.water); the deal / market / crisis tiles name what their decks do */
{
  const tZ = W12.tiles.Z, tH = W16.tiles.H;
  ok(tZ && tZ.type === 'division' && tZ.icon === 'crown' && tZ.color === '#166534' && tZ.ink === '#ffffff' && [...W12.board].filter((c) => c === 'Z').length === 6, 'w12 tile Z: division (crown, deep green / white), 6 on the board');
  ok(tH && tH.type === 'produce' && tH.icon === 'bars' && tH.color === '#0284c7' && [...W16.board].filter((c) => c === 'H').length === 6, 'w16 tile H: produce (bars, irrigation blue), 6 on the board');
  ok(!/\d/.test(T.TILE_TEXT.division.desc) && !/\d/.test(T.TILE_TEXT.produce.desc), 'Z / H before prepareWorldText: number-free');
  ok((await T.prepareWorldText(W12)).includes('division') && (await T.prepareWorldText(W16)).includes('produce'), 'prepareWorldText builds Z / H (the adapter is imported from adapters/)');
  const z = T.tileText(tZ, W12), h = T.tileText(tH, W16);
  ok(z.emoji === '👑' && z.short === 'חטיבה' && h.emoji === '📊' && h.short.length <= T.SHORT_MAX, `Z 👑 "${z.short}", H 📊 "${h.short}"`);
  ok(z.desc.includes(`${Math.round(HDM.HD.down * 100)}%`) && z.desc.includes(`עד ${HDM.SLOTS} חטיבות`) && /בערבות המטה/.test(z.desc) && /מגודרת/.test(z.desc) && z.desc.includes('לוותר') && z.desc.length <= 180, 'w12 Z text = holding.js constants: ' + z.desc);
  ok(h.desc.includes(`${Math.round(HVM.HV.water * 100)}%`) && /חוזה ייצוא/.test(h.desc) && /לסרב/.test(h.desc) && h.desc.length <= 200, 'w16 H text = harvest.js constants: ' + h.desc);
  ok(HDM.holding.tiles.Z.safe === 'pass' && HVM.harvest.tiles.H.safe === 'decline', 'Z safe = pass, H safe = decline');
  const tt = (W, type) => T.tileText(Object.values(W.tiles).find((t) => t.type === type), W).desc;
  ok(/בנייני משרדים/.test(tt(W12, 'deal')) && /מרכזים לוגיסטיים/.test(tt(W12, 'deal')) && /סולאריים/.test(tt(W16, 'deal')) && /צימרים/.test(tt(W16, 'deal')), 'w12 / w16 deal tiles: ' + tt(W12, 'deal') + ' / ' + tt(W16, 'deal'));
  ok(['מיתון רב־מדינתי', 'משבר אנרגיה', 'סוכנות הדירוג', 'בדיקת הגבלים', 'השווקים עולים'].every((x) => tt(W12, 'market').includes(x)) && !/עוד שדות סולאריים/.test(tt(W12, 'market')), 'w12 market tile = its own news (boom / energy in w12 words): ' + tt(W12, 'market'));
  ok(['בצורת', 'איסור ייצוא', 'יבול שיא', 'הדולר מתחזק', 'מענק השקיה', 'מזיק'].every((x) => tt(W16, 'market').includes(x)), 'w16 market tile: ' + tt(W16, 'market'));
  ok(/מאבק ירושה/.test(tt(W12, 'crisis')) && !/רגולטור שבודק את המנהלים/.test(tt(W12, 'crisis')) && /רגולטור/.test(tt(W11, 'crisis')) && /ברד/.test(tt(W16, 'crisis')), 'w12 / w16 crisis tiles: their own wording (w12 shares the name with w11)');
  for (const W of [W12, W16]) ok(W.board.length === 40 && Object.values(W.tiles).every((t) => T.tileText(t, W).short.length <= T.SHORT_MAX), `${W.id}: 40 tiles, every short name ≤ 10`);
}
const KNOWN = ['seq', 'fundWarn', 'weddingAge', 'burnSeen', 'lifeSeen', 'inflReality', 'tl', 'hist', 'pensionHist', 'trackMonth', 'coach', 'firstPayday', 'endSent'];   // endSent (P0b, 6d05559): the win reached the lobby — it must survive a reload, so it IS save data
for (const k of uiKeys) ok(KNOWN.includes(k), 'game.js writes S.ui.' + k + ' (display data must go to rr2-settings, not the save)');

console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
