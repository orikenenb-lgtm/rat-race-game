// T5 part B (rendering lane) — Node tests, no browser. Run: node tests/render_vocab.test.mjs
//  A-8 motion ceilings · label colours ≥ 4.5:1 on the pill · §12 level strings · CHAR_STYLE distinct per world ·
//  CITY_EMOJI covers every model · §5.2 stage-kit table · A-44 renderer parity · quality tiers / DPR caps (A-29) ·
//  governor (A-33 unit) · asset-info accessor reads metrics only (A-22 data side) · fixture city.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };

const V = await import('../js/render/vocab.js');
const Q = await import('../js/render/quality.js');
const AI = await import('../js/render/assetinfo.js');
const nul = await import('../js/render/null.js');
const b2d = await import('../js/render/board2d.js');
const E = await import('../js/engine.js');

// A-8
for (const [k, v] of Object.entries(V.MOTION)) ok(v <= V.MOTION.tmax || V.MOTION_EXCEPTIONS.includes(k), `MOTION.${k}=${v} > tmax and not an exception`);
ok(V.MOTION.dice <= 1200 && V.MOTION.celebrate <= 1200 && V.MOTION.confetti <= 2400, 'exception ceilings');
ok(V.MOTION.hop + V.MOTION.hopSquash + 6 * V.MOTION.hop + V.MOTION.dice <= 2600, '7-tile turn budget ≤ 2600 ms (A-9 normal)');

// label colours on #fffaf0 ≥ 4.5 (WCAG)
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = (hex) => { const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
for (const [k, c] of Object.entries(V.LABEL_COLORS)) ok(cr(c, '#fffaf0') >= 4.5, `label ${k} ${c} contrast ${cr(c, '#fffaf0').toFixed(2)}`);
ok(V.labelColor('gold') === '#8a5a00' && V.labelColor('#db2777') === '#be185d' && V.labelColor('#123456') === '#123456', 'labelColor names / aliases / raw');

// §12 strings
ok(V.levelText({ kind: 'biz', n: 0 }) === 'בהתחלה · עוד לא יציב', 'T5-L0');
ok(V.levelText({ kind: 'biz', n: 2 }) === 'שלב 2 מתוך 3 · צומח', 'T5-L1');
ok(V.levelText({ kind: 'upgrade', n: 1, of: 2 }) === 'שדרוגים: 1 מתוך 2', 'T5-L2');
ok(V.levelHint({ kind: 'biz', n: 0 }) === 'כדי להתייצב: רווח ממוצע חיובי לאורך 3 חודשים.', 'T5-H0');
ok(V.levelHint({ kind: 'biz', n: 3 }) === 'זה השלב הכי גבוה. העסק מכניס גם כשאתה לא שם.', 'T5-H3');
ok(V.levelHint({ kind: 'upgrade', n: 1, of: 2 }) === 'אפשר לשדרג במשבצת "שדרוג" בלוח.' && V.levelHint({ kind: 'upgrade', n: 2, of: 2 }) === '', 'T5-HU');
ok(V.pipsText({ kind: 'biz', n: 1 }) === '●○○' && V.pipsText({ kind: 'upgrade', n: 2, of: 2 }) === '●●', 'pips');
ok(V.levelText({ kind: 'biz' }) === '' && V.normLevel({ kind: 'biz' }) === null && V.normLevel(null) === null, 'A-16: biz without stage → no level');
ok(V.cardName('עגלת קפה', 'עסק', { kind: 'biz', n: 1, activity: { busy: true } }) === 'עגלת קפה · עסק, שלב 1 מתוך 3 · יציב, יש תור', 'T5-C2');
ok(V.activityOf({ kind: 'biz', n: 1, activity: { busy: true, breakdown: true } }) === 'breakdown' && V.activityOf({ kind: 'biz', n: 1, trouble: true, activity: { busy: true } }) === 'trouble', 'trouble beats activity');
ok(JSON.stringify(V.STAGE_LABELS) === JSON.stringify(['התחלה', 'יציב', 'צומח', 'מותג']), 'STAGE_LABELS = T3 §6.8');
for (const s of Object.values(V.ACTIVITY_TEXT)) ok(s.length <= 120 && !/[a-z]/i.test(s), 'activity text Hebrew ≤ 120: ' + s);

// §5.2 kit table (A-12 3D parts)
const P = (n) => V.kitParts({ kind: 'biz', n, activity: { busy: true } });
ok(P(0).scaffold && P(0).cone && !P(0).sign && P(0).scale === 0.8, 'stage 0: scaffold + cone, ×0.8, no sign');
ok(P(1).sign && !P(1).annex && !P(1).scaffold, 'stage 1: sign');
ok(P(2).sign && P(2).annex && P(2).people === 3 && !P(2).flag, 'stage 2: annex + queue of 3 while busy');
ok(P(3).flag && P(3).glow && P(3).annex && P(3).people === 5 && P(3).scale === 1.12 && P(3).signBig, 'stage 3: flag, glow, crowd 5, ×1.12');
ok(V.kitParts({ kind: 'upgrade', n: 1, of: 2 }).band && !V.kitParts({ kind: 'upgrade', n: 1, of: 2 }).dome && V.kitParts({ kind: 'upgrade', n: 2, of: 2 }).dome, 'upgrade: band, dome');
ok(!V.kitParts(null).sign && V.kitParts(null).scale === 1, 'plain: nothing');

// characters + world identity + emoji coverage
const worlds = ['w1', 'w2', 'w3', 'w4', 'h'].map((id) => E.getWorld(id));
let chars = 0;
for (const w of worlds) {
  const cs = (w.characters || []).map((c) => c.id); if (w.id === 'h') continue;
  for (const c of cs) { chars++; ok(!!V.CHAR_STYLE[c], `CHAR_STYLE has ${w.id}/${c}`); }
  ok(new Set(cs.map((c) => V.CHAR_STYLE[c])).size === cs.length, `character colours distinct in ${w.id}`);
  const st = V.worldStyle(w); ok(st && st.rim && st.caption && st.motif, `WORLD_STYLE ${w.id}`);
  ok(st.board.toLowerCase() === String(w.theme.board).toLowerCase() || w.id === 'h', `${w.id} board colour = theme`);
  for (const m of [...Object.values(w.models || {}), ...Object.values(w.tickers || {}).map((t) => t.model)].filter(Boolean)) ok(V.CITY_EMOJI[m], `CITY_EMOJI ${w.id}/${m}`);
}
ok(chars === 13, '13 characters (' + chars + ')');
ok(V.worldStyle({ id: 'w1', mechanic: 'history' }).motif === 'news' && V.worldStyle('zz').caption === 'התיק שלך', 'worldStyle h / fallback');
for (const m of ['home_family', 'university', 'pension', 'index_fund', 'side_hustle', 'wedding', 'hospital']) ok(V.cityEmoji('life/' + m) !== '🏠' || m === 'home_family', 'life emoji ' + m);

// A-44 parity: scene.js (static), board2d.js, null.js export every SCENE_API name
const API = nul.SCENE_API; const sceneSrc = readFileSync(resolve(ROOT, 'js/scene.js'), 'utf8');
for (const f of API) {
  if (f === 'kind') continue;
  ok(new RegExp(`export (async )?function ${f}\\b`).test(sceneSrc), 'scene.js exports ' + f);
  ok(typeof b2d[f] === 'function', 'board2d.js exports ' + f);
  ok(typeof nul[f] === 'function', 'null.js exports ' + f);
}
ok(typeof nul.onPick(() => {}) === 'function' && nul.pickAt(1, 1) === null && b2d.getQuality() === 'high', 'null/2D defaults');
b2d.setQuality('low'); ok(b2d.getQuality() === 'low' && b2d.perfStats().tier === 'low', '2D stores the tier');
// scene.js reads reduced motion only through setMotion (game.js wires motion.js) and has no game rules
ok(!/from '\.\/engine\.js'/.test(sceneSrc), 'scene.js does not import the engine (R-1)');

// quality tiers (A-29)
ok(Q.autoTier({ lowPower: true, hq: false }) === 'low' && Q.autoTier({ hq: true, lowPower: true }) === 'high', 'software → low, ?hq → high');
ok(Q.autoTier({ hq: false, deviceMemory: 2, cores: 8, coarse: false }) === 'low' && Q.autoTier({ hq: false, deviceMemory: 4, cores: 8, coarse: true }) === 'mid' && Q.autoTier({ hq: false, deviceMemory: 8, cores: 8, coarse: true }) === 'high' && Q.autoTier({ hq: false, deviceMemory: 8, cores: 8, coarse: false }) === 'high', 'detection table');
ok(Q.resolveTier({ hq: false, pref: 'mid', lowPower: true }) === 'mid', 'saved pref overrides detection');
ok(Q.tierDpr('high', { dpr: 3, coarse: true }) === 1.75 && Q.tierDpr('mid', { dpr: 3, coarse: true }) === 1.5 && Q.tierDpr('low', { dpr: 3, coarse: true }) === 1, 'A-29 phone DPR 3 → 1.75 / 1.5 / 1');
ok(Q.tierDpr('high', { dpr: 2 }) === 2 && Q.tierDpr('mid', { dpr: 2 }) === 1.5 && Q.tierDpr('low', { dpr: 2 }) === 1 && Q.tierDpr('high', { dpr: 2, lowPower: true }) === 0.6, 'A-29 desktop DPR 2 → 2 / 1.5 / 1; software 0.6');
ok(Q.TIER_CONFIG.low.shadows === 'off' && Q.TIER_CONFIG.low.confetti === 0 && Q.TIER_CONFIG.high.labels === 4 && Q.TIER_CONFIG.mid.labels === 3 && Q.TIER_CONFIG.low.labels === 2, 'tier table');
// governor (A-33 unit): 90 × 50 ms → one step high→mid, none within 30 s, never up
const g = Q.makeGovernor({ tier: 'high' }); let steps = [];
for (let i = 0; i < 90; i++) { const r = g.step(50, 1000 + i); if (r) steps.push(r); }
for (let i = 0; i < 90; i++) { const r = g.step(50, 5000 + i); if (r) steps.push(r); }
ok(steps.join() === 'mid', 'governor: one step within 30 s (' + steps.join() + ')');
for (let i = 0; i < 90; i++) { const r = g.step(50, 40000 + i); if (r) steps.push(r); }
for (let i = 0; i < 90; i++) { const r = g.step(10, 80000 + i); if (r) steps.push(r); }
for (let i = 0; i < 90; i++) { const r = g.step(60, 120000 + i); if (r) steps.push(r); }
ok(steps.join() === 'mid,low', 'governor: ≤ 2 steps, never up (' + steps.join() + ')');
ok(Q.makeGovernor({ disabled: true }).step(80, 0) === null, 'governor disabled on software GL');
{ const g2 = Q.makeGovernor({ tier: 'high' }); g2.disabled = true; let r = null; for (let i = 0; i < 90; i++) r = r || g2.step(60, i);
  ok(r === null && g2.disabled, 'M-3 an explicit player choice disarms the governor');
  g2.disabled = false; for (let i = 0; i < 90; i++) r = r || g2.step(60, 100000 + i); ok(r === 'mid', "M-3 'auto' re-arms it"); }
// M-3: the scene registers lowPower → every caller (lobby "עכשיו", setQualityPref) resolves the tier the scene renders
Q.setEnv({ lowPower: true, coarse: false, hq: false });
ok(Q.resolveTier({ pref: 'auto' }) === 'low' && Q.resolveTier({ pref: 'mid' }) === 'mid', 'M-3 resolveTier uses the registered env (software GL → low)');
Q.setEnv({ lowPower: false });
// m-6: 12 px floor in the 2D board styles (stability.css): no font-size or max()/font shorthand below 12 px
{ const css = readFileSync(resolve(ROOT, 'css/stability.css'), 'utf8'); const small = [];
  for (const m of css.matchAll(/font(?:-size)?:\s*(?:max\()?(\d+(?:\.\d+)?)px/g)) if (+m[1] < 12) small.push(m[0]);
  ok(!small.length, 'stability.css has no font size below 12 px: ' + small.join(', ')); }

// asset info: reads metrics() only
const st = E.createGame({ worldId: 'w1', charId: 'dev', seed: 7, mode: 'free' });
const m = E.metrics(st);
ok(AI.assetInfo('a999', m) === null && AI.assetInfo('', m) === null, 'unknown key → null');
const fake = { assets: [{ id: 'a3', name: 'עגלת קפה', kindLabel: 'עסק', cf: 420, value: 30000, debt: 10000, equity: 20000, business: { type: 'coffee', manager: false, incomeKind: 'active', ownerEnergy: 6, headline: 'חודש טוב' } }], holdings: [{ ticker: 'X', name: 'מניה', model: 'stock', qty: 5, value: 500, unit: 'מניות' }], angels: [] };
const ai = AI.assetInfo('a3', fake, { level: { kind: 'biz', n: 1, type: 'coffee', activity: { busy: true } } });
ok(ai.title === 'עגלת קפה' && ai.rows.find((r) => r.id === 'cf').value === 420 && ai.rows.find((r) => r.id === 'equity').value === 20000, 'asset rows = metrics values');
ok(ai.rows.some((r) => r.label === 'סוג הכנסה' && r.value === 'פעילה (אתה עובד בעסק)') && ai.rows.some((r) => r.label === 'בחודש שעבר'), 'business rows (T5-I2/I3)');
ok(ai.levelText === 'שלב 1 מתוך 3 · יציב' && ai.activity.text === 'יש תור', 'level + activity');
ok(AI.assetInfo('h:stock', fake).rows.length === 2 && AI.assetInfo('L:home', fake).type === 'life', 'holding / life');

// fixture city (?fx=levels)
const fx = V.fixtureCity(E.getWorld('w2'), 24);
ok(fx.length === 24 && fx[0].level.n === 0 && fx[3].level.n === 3 && fx[4].level.kind === 'upgrade' && fx[5].level.n === 2 && fx[6].level === null, 'fixture mixed levels');
ok(fx.every((x) => x.model), 'fixture models');
ok(V.fixtureCount('?fx=levels') === 24 && V.fixtureCount('?a=1&fx=levels:12') === 12 && V.fixtureCount('') === 0, 'fixtureCount');

/* worlds wave 1 — w5: identity, character colours, model emoji, the occupancy level kind, procedural stand-ins (no GLB) */
{
  const w5 = await E.ensureWorld('w5');
  const st = V.WORLD_STYLE.w5;
  ok(st && st.decor === 'palms' && st.sky[0] === '#ffd6a5' && st.sky[1] === '#48cae4' && st.accent === '#ff7a59' && st.edge === '#9a3412' && st.motif && st.caption, 'WORLD_STYLE.w5 = the w5 doc (sky, coral, ink, palms)');
  const lab = (hex) => { const n = parseInt(hex.slice(1), 16); const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => f(x / 255));
    const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); const X = h((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), Y = h(r * 0.2126 + g * 0.7152 + b * 0.0722), Z = h((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
  const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  for (const id of ['w1', 'w2', 'w3', 'w4', 'h']) ok(dE(st.board, V.WORLD_STYLE[id].board) >= 10, `w5 board ΔE ≥ 10 from ${id} (${dE(st.board, V.WORLD_STYLE[id].board).toFixed(1)})`);
  const cs = w5.characters.map((c) => c.id);
  ok(cs.every((c) => V.CHAR_STYLE[c]) && new Set(cs.map((c) => V.CHAR_STYLE[c])).size === cs.length, 'CHAR_STYLE: hotelier / restaurateur / promoter, distinct');
  for (const m of new Set(Object.values(w5.models).filter(Boolean))) ok(V.CITY_EMOJI[m], 'CITY_EMOJI w5/' + m);
  const L = V.normLevel({ kind: 'occ', n: 7, occ: 0.72 });
  ok(L && L.kind === 'occ' && L.n === 7 && L.pct === 72 && V.levelText(L) === 'תפוסה 72%' && V.pipsText(L) === '▮▮▮▮▯', 'occ level: decile → "תפוסה 72%" and 5 window pips');
  ok(V.levelText({ kind: 'occ', closed: true }) === 'סגור עכשיו' && V.pipsText({ kind: 'occ', closed: true }) === '🔒' && V.levelText({ kind: 'occ', n: 4, wing: true }).includes('אגף סגור'), 'occ level: closed asset / closed wing');
  ok(V.kitParts({ kind: 'occ', n: 3 }).windows === 3 && V.kitParts({ kind: 'occ', n: 3 }).scale === 1 && !V.kitParts({ kind: 'occ', n: 3 }).sign, 'occ level: windows only (no stage kit)');
  const sSrc = readFileSync(resolve(ROOT, 'js/render/standins3d.js'), 'utf8');
  for (const m of new Set(Object.values(w5.models).filter(Boolean))) ok(new RegExp(`\\b${m}\\(\\)`).test(sSrc), `standins3d builds ${m} (no .glb is ever requested)`);
  ok(!/\.glb['"`]/.test(sSrc) && !/import\(|fetch\(|Loader/.test(sSrc), 'standins3d requests no file (no .glb URL, no loader)');
}
/* worlds wave 2 — w6: identity (ΔE ≥ 10 from every world), character colours, model emoji, the 'plant' level kind (pips + light + states),
   procedural stand-ins for every w6 model key (warehouse only in w6: w3 keeps its real warehouse.glb), the 2D card states */
{
  const w6 = await E.ensureWorld('w6');
  const st = V.WORLD_STYLE.w6;
  ok(st && st.decor === 'stacks' && st.sky[0] === '#cfd8dc' && st.sky[1] === '#f5f0e6' && st.accent === '#f97316' && st.edge === '#4b5563' && st.accentInk[0] === '#9a3412' && st.motif && st.caption, 'WORLD_STYLE.w6 = the w6 doc (haze sky, steel edge, safety orange, ink, stacks)');
  const lab = (hex) => { const n = parseInt(hex.slice(1), 16); const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => f(x / 255));
    const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); const X = h((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), Y = h(r * 0.2126 + g * 0.7152 + b * 0.0722), Z = h((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
  const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  for (const id of ['w1', 'w2', 'w3', 'w4', 'w5', 'h']) ok(dE(st.board, V.WORLD_STYLE[id].board) >= 10, `w6 board ΔE ≥ 10 from ${id} (${dE(st.board, V.WORLD_STYLE[id].board).toFixed(1)})`);
  ok(new Set(Object.values(V.WORLD_STYLE).map((x) => x.caption)).size === Object.keys(V.WORLD_STYLE).length - 1, 'every world caption distinct (w1 / h share "התיק שלך")');
  const cs = w6.characters.map((c) => c.id);
  ok(cs.every((c) => V.CHAR_STYLE[c]) && new Set(cs.map((c) => V.CHAR_STYLE[c])).size === cs.length, 'CHAR_STYLE: opseng / heir / trader, distinct');
  for (const m of new Set(Object.values(w6.models).filter(Boolean))) ok(V.CITY_EMOJI[m], 'CITY_EMOJI w6/' + m);
  // the plant level kind (plant.js cityModels fields as game.js passes them)
  const L = V.normLevel({ kind: 'plant', n: 2, light: 'amber', cond: 58.4, running: true, util: 0.741, shift: 2, hazard: 'mid' });
  ok(L && L.kind === 'plant' && L.n === 2 && L.of === 3 && L.light === 'amber' && L.cond === 58 && L.running && L.shift === 2 && L.hazard === 'mid', 'plant level: normalised (pips 2/3, amber, cond 58, running, 2 shifts)');
  ok(JSON.stringify(V.normLevel(L)) === JSON.stringify(L), 'plant level: normLevel is idempotent');
  ok(V.levelText(L) === 'מצב 58 · שחוק · ניצולת 74% · 2 משמרות' && V.pipsText(L) === '●●○', `plant level text "${V.levelText(L)}" + pips ●●○`);
  const dn = V.normLevel({ kind: 'plant', n: 1, light: 'red', cond: 22, down: true, running: false, util: 0 });
  ok(dn.down && !dn.running && V.activityOf(dn) === 'breakdown' && V.levelText(dn).includes('בתקלה') && V.cardName('קו CNC', 'קו CNC', dn).includes('תקלה בציוד'), 'plant down: 🔧 activity (3D badge, 2D badge, accessible name) + "בתקלה"');
  const pe = V.normLevel({ kind: 'plant', n: 3, light: 'green', cond: 100, pending: true, running: false });
  ok(pe.pending && !pe.running && V.pipsText(pe) === '⏳' && V.levelText(pe).includes('בדרך'), 'plant ordered: ⏳, "בדרך"');
  const mb = V.normLevel({ kind: 'plant', n: 2, light: 'amber', cond: 50, mothball: true, running: true, util: 0.5 });
  ok(mb.mothball && !mb.running && V.levelText(mb).includes('מושבת'), 'plant mothballed: not running, "מושבת"');
  ok(V.levelText({ kind: 'plant', n: 3, light: 'green', cond: 90, util: 0, running: false }).includes('עומד בלי הזמנות'), 'plant idle: "עומד בלי הזמנות"');
  const kp = V.kitParts(L); ok(kp.light === 'amber' && kp.pips === 2 && kp.conveyor === true && !kp.sign && !kp.scaffold && kp.scale === 1, 'plant level: model parts only (no stage kit)');
  ok(V.kitParts(dn).conveyor === false && V.kitParts(pe).pending && V.kitParts(mb).mothball, 'plant level: conveyor stops when down / ordered / mothballed');
  ok(V.levelHint(L).includes('תחזוקה') && V.levelHint(dn).includes('תקלה') && V.levelHint(pe).includes('חצי שנה'), 'plant level hints');
  // stand-ins: every w6 model key is procedural; w6's warehouse only in the w6 folder (w3 has assets/w3/warehouse.glb)
  const sSrc = readFileSync(resolve(ROOT, 'js/render/standins3d.js'), 'utf8');
  for (const m of new Set(Object.values(w6.models).filter(Boolean))) ok(m === 'warehouse' ? /DIR_BUILD = Object\.freeze\(\{ w6: Object\.freeze\(\{ warehouse:/.test(sSrc) : new RegExp(`\\b${m}\\(\\)`).test(sSrc), `standins3d builds ${m} (no .glb is ever requested)`);
  ok(/lamp/.test(sSrc) && /stepBelt/.test(sSrc) && /scaff/.test(sSrc) && /shutter/.test(sSrc), 'standins3d: lamp, conveyor step, scaffold, shutter');
}
/* worlds wave 3 — w7 / w8: identity (ΔE ≥ 10 from every world), character colours, model emoji, the 'branch' / 'stock' / 'mgr' (w7) and
   'build' (w8) level kinds (text, pips, states, idempotent, model parts only), stand-ins for every model key (w7's warehouse dir-scoped:
   w3 keeps its real warehouse.glb), the w3 crane borrowed for the w8 background, the engine's cityModels → game.js levelOf fields */
{
  const lab = (hex) => { const n = parseInt(hex.slice(1), 16); const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => f(x / 255));
    const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); const X = h((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), Y = h(r * 0.2126 + g * 0.7152 + b * 0.0722), Z = h((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
  const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const sSrc = readFileSync(resolve(ROOT, 'js/render/standins3d.js'), 'utf8');
  const doc = { w7: { sky: ['#2b2d42', '#ef8354'], accent: '#e63946', ink: '#9b1c24', decor: 'storefronts' }, w8: { sky: ['#fde68a', '#93c5fd'], accent: '#eab308', ink: '#854d0e', decor: 'cranes' } };
  for (const wid of ['w7', 'w8']) {
    const w = await E.ensureWorld(wid); const st = V.WORLD_STYLE[wid]; const D = doc[wid];
    ok(st && st.sky[0] === D.sky[0] && st.sky[1] === D.sky[1] && st.accent === D.accent && st.accentInk[0] === D.ink && st.decor === D.decor && st.motif && st.caption, `WORLD_STYLE.${wid} = the ${wid} doc (sky, accent, ink, decor)`);
    for (const id of Object.keys(V.WORLD_STYLE)) if (id !== wid) ok(dE(st.board, V.WORLD_STYLE[id].board) >= 10, `${wid} board ΔE ≥ 10 from ${id} (${dE(st.board, V.WORLD_STYLE[id].board).toFixed(1)})`);
    const cs = w.characters.map((c) => c.id);
    ok(cs.every((c) => V.CHAR_STYLE[c]) && new Set(cs.map((c) => V.CHAR_STYLE[c])).size === cs.length, `CHAR_STYLE: ${cs.join(' / ')}, distinct`);
    for (const m of new Set(Object.values(w.models).filter(Boolean))) {
      ok(V.CITY_EMOJI[m], `CITY_EMOJI ${wid}/${m}`);
      ok(m === 'warehouse' ? /w7: Object\.freeze\(\{ warehouse: warehouse7 \}\)/.test(sSrc) : new RegExp(`\\b${m}[:(]`).test(sSrc) || new RegExp(`${m}: [a-zA-Z]+`).test(sSrc), `standins3d builds ${wid}/${m} (no .glb is ever requested)`);
    }
    // the engine's own city pieces at the start → the game's level objects (the same mapping game.js levelOf uses)
    const ch = w.characters[0].id; const g = E.createGame({ worldId: wid, charId: ch, seed: 7, mode: 'free' });
    const cm = E.cityModels(g);
    if (wid === 'w7') {
      const br = cm.filter((m) => m.lights != null && 'franchise' in m);
      ok(br.length === 3 && br.every((m) => Number.isInteger(m.stage) && m.stage >= 0 && m.stage <= 4 && typeof m.own === 'boolean' && typeof m.fitout === 'boolean' && typeof m.flicker === 'boolean' && typeof m.stockout === 'boolean'), 'w7 cityModels: every branch has stage / own / fitout / flicker / stockout (the fields game.js reads)', br);
      ok(cm.some((m) => m.kind === 'inventory' && m.model === 'stock_pallets'), 'w7 cityModels: the stock pool (stock_pallets)');
    } else {
      const pj = cm.filter((m) => m.pct != null || m.fence || m.stage === 5);
      ok(pj.length >= 1 && pj.every((m) => m.fence || (Number.isFinite(m.pct) && Number.isInteger(m.stage) && typeof m.stalled === 'boolean' && typeof m.craneOn === 'boolean' && typeof m.permit === 'boolean' && Number.isFinite(m.presold))), 'w8 cityModels: every site has pct / stage / stalled / craneOn / permit / presold (the fields game.js reads)', pj);
    }
  }
  // w7 level kinds
  const B = V.normLevel({ kind: 'branch', n: 2, own: true, flicker: true });
  ok(B && B.kind === 'branch' && B.n === 2 && B.of === 4 && B.own && B.flicker && !B.fitout && JSON.stringify(V.normLevel(B)) === JSON.stringify(B), 'branch level: normalised, idempotent');
  ok(V.levelText(B) === 'שלב 2 מתוך 4 · בהרצה · מעבר ליכולת הניהול' && V.pipsText(B) === '●●○○', `branch text "${V.levelText(B)}" + pips ●●○○`);
  const F = V.normLevel({ kind: 'branch', n: 3, own: false, flicker: true, stockout: true });
  ok(!F.own && !F.flicker && !F.stockout && V.levelText(F).includes('זכיינות'), 'a franchise never flickers or runs out (no span, no stock of yours), "זכיינות"');
  const Fo = V.normLevel({ kind: 'branch', n: 2, own: true, fitout: true, flicker: true });
  ok(Fo.fitout && Fo.n === 0 && !Fo.flicker && V.pipsText(Fo) === '🚧' && V.levelText(Fo).includes('בשיפוץ') && V.levelHint(Fo).includes('שיפוץ'), 'fit-out: stage 0, 🚧, "בשיפוץ", no flicker');
  const So = V.normLevel({ kind: 'branch', n: 4, own: true, stockout: true });
  ok(V.activityOf(So) === 'stockout' && V.cardName('החנות', 'סניף רחוב', So).includes('המלאי אזל'), 'stock-out: the 📭 activity (3D badge, 2D badge, accessible name)');
  const kb = V.kitParts(B); ok(kb.lights === 2 && kb.flicker && !kb.sign && !kb.scaffold && kb.scale === 1, 'branch level: model parts only (no stage kit)');
  const St = V.normLevel({ kind: 'stock', cover: 1.44 }); ok(St.kind === 'stock' && St.n === 2 && V.levelText(St).includes('1.4') && V.pipsText(St) === '▮▮▯▯' && V.kitParts(St).pallets === 2, 'stock level: 1.44 months → 2 pallet stacks');
  ok(V.normLevel({ kind: 'stock', cover: 0.3 }).short && V.activityOf({ kind: 'stock', cover: 0.3 }) === 'stockout', 'stock almost out → 📭');
  ok(V.levelText({ kind: 'mgr' }).includes('מנהל אזור') && V.pipsText({ kind: 'mgr' }) === '' && V.kitParts({ kind: 'mgr' }).links === 6, 'manager level: "מנהל אזור", 6 links, no pips');
  // w8 level kind
  const Bu = V.normLevel({ kind: 'build', n: 2, pct: 0.5, floors: 10, stalled: true, crane: true, presold: 0.33 });
  ok(Bu.kind === 'build' && Bu.n === 2 && Bu.pct === 0.5 && Bu.stalled && !Bu.crane && Bu.presold === 0.33 && JSON.stringify(V.normLevel(Bu)) === JSON.stringify(Bu), 'build level: normalised (a stalled site has no working crane), idempotent');
  ok(V.levelText(Bu) === 'בבנייה: 50% · שלב 2 מתוך 4 · העבודה עומדת · 33% נמכרו על הנייר' && V.pipsText(Bu) === '●●○○', `build text "${V.levelText(Bu)}"`);
  const Pm = V.normLevel({ kind: 'build', n: 0, pct: 0, permit: true, crane: true }); ok(Pm.permit && !Pm.crane && Pm.n === 0 && V.pipsText(Pm) === '📋' && V.levelText(Pm).includes('היתר'), 'permit: 📋, no crane, "ממתין להיתר"');
  const Pl = V.normLevel({ kind: 'build', plot: true, pct: 0.7 }); ok(Pl.plot && Pl.pct === 0 && V.pipsText(Pl) === '🚧' && V.levelText(Pl).includes('מגרש'), 'plot: 🚧, "מגרש"');
  const Re = V.normLevel({ kind: 'build', rental: true, n: 5 }); ok(Re.rental && Re.n === 4 && Re.pct === 1 && V.pipsText(Re) === '🔑' && V.levelText(Re).includes('מושכר'), 'rental: 🔑, "מושכר"');
  const kp = V.kitParts(Bu); ok(kp.tarp && kp.pct === 0.5 && kp.presold === 0.33 && !kp.sign && !kp.scaffold, 'build level: model parts only (tarp, %, presale)');
  // stand-ins: states drawn by paintBranch / paintStock / paintBuild; motion steps only in stepShop / stepCrane (scene.js runs them in its updaters)
  ok(/export function paintBranch/.test(sSrc) && /export function stepShop/.test(sSrc) && /export function paintBuild/.test(sSrc) && /export function stepCrane/.test(sSrc) && /export function paintStock/.test(sSrc), 'standins3d: paintBranch / stepShop / paintStock / paintBuild / stepCrane');
  ok(!/\.glb['"`]/.test(sSrc) && !/import\(|fetch\(|Loader/.test(sSrc), 'standins3d requests no file');
  const scn = readFileSync(resolve(ROOT, 'js/scene.js'), 'utf8');
  ok(/cranes: 'w3\/crane'/.test(scn) && /keep\.has\(url\)/.test(scn), "w8's background crane is w3's crane.glb (kept when w8 releases the other worlds' models)");
  ok(/updaters\.add\(\(t\) => \{ for \(const it of city\.values\(\)\) stepShop/.test(scn) && /stepCrane\(it\.obj/.test(scn), 'flicker / crane steps run only inside scene updaters (never under reduced motion, never on the low tier)');
}

/* worlds wave 4 — w9 / w10: identity (the docs, ΔE ≥ 10), character colours, model emoji + a procedural stand-in for every model key (no .glb),
   the 'energy' (w9) and 'hold' (w10) level kinds (text, pips, states, idempotent, model parts only), w4's turbine borrowed and kept, motion
   only in the updaters, the engine's cityModels fields game.js reads */
{
  const lab = (hex) => { const n = parseInt(hex.slice(1), 16); const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => f(x / 255));
    const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); const X = h((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), Y = h(r * 0.2126 + g * 0.7152 + b * 0.0722), Z = h((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
  const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const sSrc = readFileSync(resolve(ROOT, 'js/render/standins3d.js'), 'utf8') + readFileSync(resolve(ROOT, 'js/render/standins910.js'), 'utf8');
  const doc = { w9: { sky: ['#fef3c7', '#fbbf24'], board: '#e9c46a', accent: '#06b6d4', ink: '#155e75', decor: 'solar' }, w10: { sky: ['#0f172a', '#3b82f6'], board: '#1e293b', accent: '#d4af37', ink: '#7a5a0a', decor: 'towers' } };
  for (const wid of ['w9', 'w10']) {
    const w = await E.ensureWorld(wid); const st = V.WORLD_STYLE[wid]; const D = doc[wid];
    ok(st && st.sky[0] === D.sky[0] && st.sky[1] === D.sky[1] && st.board === D.board && st.accent === D.accent && st.accentInk[0] === D.ink && st.decor === D.decor && st.motif && st.caption, `WORLD_STYLE.${wid} = the ${wid} doc (sky, board, accent, ink, decor)`);
    for (const id of Object.keys(V.WORLD_STYLE)) if (id !== wid) ok(dE(st.board, V.WORLD_STYLE[id].board) >= 10, `${wid} board ΔE ≥ 10 from ${id} (${dE(st.board, V.WORLD_STYLE[id].board).toFixed(1)})`);
    const cs = w.characters.map((c) => c.id);
    ok(cs.every((c) => V.CHAR_STYLE[c]) && new Set(cs.map((c) => V.CHAR_STYLE[c])).size === cs.length, `CHAR_STYLE: ${cs.join(' / ')}, distinct`);
    for (const m of new Set(Object.values(w.models).filter(Boolean))) {
      ok(V.CITY_EMOJI[m], `CITY_EMOJI ${wid}/${m}`);
      ok(new RegExp(`\\b${m}[:(]`).test(sSrc) || new RegExp(`${m}: [a-zA-Z]+`).test(sSrc), `standins build ${wid}/${m} (no .glb is ever requested)`);
    }
  }
  { const g = E.createGame({ worldId: 'w9', charId: 'gridEng', seed: 7, mode: 'free' }); const cm = E.cityModels(g).filter((m) => m.tech != null);
    ok(cm.length >= 1 && cm.every((m) => Number.isInteger(m.stage) && typeof m.unconnected === 'boolean' && typeof m.stalled === 'boolean' && Number.isFinite(m.pct) && m.units >= 1), 'w9 cityModels: every project has tech / stage / pct / unconnected / stalled / units (the fields game.js reads)', cm);
    const k = E.cityModels(E.createGame({ worldId: 'w9', charId: 'kibbutz', seed: 7, mode: 'free' })).filter((m) => m.tech === 'site');
    ok(k.length === 2 && k.every((m) => m.fence && m.stage === 0), 'w9 cityModels: the kibbutz\'s two plots (tech site, fence)'); }
  { const g = E.createGame({ worldId: 'w10', charId: 'allocator', seed: 7, mode: 'free' }); const cm = E.cityModels(g).filter((m) => m.cls != null);
    ok(['daily', 'monthly', 'locked'].every((c) => cm.some((m) => m.cls === c)) && cm.every((m) => Number.isFinite(m.value)), 'w10 cityModels: daily / monthly / locked blocks with a value (the fields game.js reads)', cm);
    ok(cm.some((m) => m.key === 'mkt:daily' && m.model === 'glass_tower' && typeof m.call === 'boolean'), 'w10 cityModels: mkt:daily is the glass tower with its call flag'); }
  // w9 level kind
  const Bu = V.normLevel({ kind: 'energy', tech: 'solar', n: 2, pct: 0.5, units: 4, unconnected: true, stalled: true, crane: true });
  ok(Bu.kind === 'energy' && Bu.n === 2 && Bu.pct === 0.5 && Bu.unconnected && Bu.stalled && !Bu.crane && JSON.stringify(V.normLevel(Bu)) === JSON.stringify(Bu), 'energy build level: normalised (stalled → no working crane), idempotent');
  ok(V.levelText(Bu) === 'בבנייה: 50% · שלב 2 מתוך 3 · העבודה עומדת · בלי חיבור לרשת' && V.pipsText(Bu) === '●●○', `energy build text "${V.levelText(Bu)}" + pips ●●○`);
  const Op = V.normLevel({ kind: 'energy', tech: 'wind', n: 4, output: 0.82, offtake: 'ppa', stake: 0.51, unconnected: true, stalled: true });
  ok(Op.n === 4 && !Op.unconnected && !Op.stalled && Op.output === 0.82 && Op.offtake === 'ppa' && V.levelText(Op) === 'מחוברת ומייצרת · תפוקה 82% מהרגיל · חוזה PPA · 51% שלך' && V.pipsText(Op) === '▮▮▯', `operating plant "${V.levelText(Op)}"`);
  const Dn = V.normLevel({ kind: 'energy', tech: 'solar', n: 4, output: 1, down: true }); ok(Dn.down && Dn.output === 0 && V.activityOf(Dn) === 'breakdown' && V.pipsText(Dn) === '⛔', 'a plant down this month: no output, 🔧 activity, ⛔');
  const Sl = V.normLevel({ kind: 'energy', tech: 'slot', n: 0 }); ok(Sl.slot && Sl.unconnected && V.pipsText(Sl) === '🔌' && V.levelText(Sl).includes('חיבור פנוי'), 'a free grid slot: 🔌, "חיבור פנוי לרשת"');
  const Pl = V.normLevel({ kind: 'energy', tech: 'site', fence: true, n: 3, pct: 0.7 }); ok(Pl.plot && Pl.n === 0 && Pl.pct === 0 && V.pipsText(Pl) === '🏜️' && V.levelText(Pl).includes('קרקע'), 'the kibbutz\'s plot: 🏜️, "קרקע לפרויקט"');
  const H2 = V.normLevel({ kind: 'energy', tech: 'h2', n: 5 }); ok(H2.failed && V.levelText(H2).includes('נסגר') && V.pipsText(H2) === '✖', 'a failed hydrogen pilot: ✖, "נסגר"');
  const kp = V.kitParts(Bu); ok(kp.cable && kp.stalled && kp.units === 4 && kp.pct === 0.5 && !kp.sign && !kp.scaffold, 'energy level: model parts only (cable, rows, barrier)');
  // w10 level kind
  const Ho = V.normLevel({ kind: 'hold', cls: 'daily', value: 40e6, call: true }); ok(Ho.kind === 'hold' && Ho.cls === 'daily' && Ho.call && Ho.n >= 1 && Ho.n <= 6 && !Ho.trouble && JSON.stringify(V.normLevel(Ho)) === JSON.stringify(Ho), 'hold level: normalised, idempotent, a call is named (never "העסק בבעיה")');
  ok(V.levelText(Ho) === 'נזיל תוך יומיים · קריאת מרווח' && V.cardName('מניות', 'השקעה', Ho) === 'מניות · השקעה, נזיל תוך יומיים · קריאת מרווח', `hold text "${V.levelText(Ho)}"`);
  ok(V.levelText({ kind: 'hold', cls: 'monthly', value: 1e7, frozen: true }) === 'נזילות חודשית · קפוא החודש' && V.levelText({ kind: 'hold', cls: 'locked', value: 3e6, lockUntil: 34 }) === 'נעול · נעול עד חודש 34', 'stone (frozen) / vault (lock until) words');
  ok(!V.normLevel({ kind: 'hold', cls: 'monthly', call: true }).call && V.normLevel({ kind: 'hold', cls: 'bogus' }).cls === 'daily', 'only the daily class carries a call; an unknown class is daily');
  ok(V.kitParts(Ho).call && V.kitParts(Ho).cls === 'daily' && !V.kitParts(Ho).sign, 'hold level: model parts only');
  // stand-ins + scene: paint / step functions; w4's turbine borrowed (kept), motion only in updaters
  ok(/export function paintEnergy/.test(sSrc) && /export function stepEnergy/.test(sSrc) && /export function paintHold/.test(sSrc) && /export function stepTicker/.test(sSrc), 'standins910: paintEnergy / stepEnergy / paintHold / stepTicker');
  ok(!/\.glb['"`]/.test(readFileSync(resolve(ROOT, 'js/render/standins910.js'), 'utf8')) && !/import\(|fetch\(|Loader/.test(readFileSync(resolve(ROOT, 'js/render/standins910.js'), 'utf8')), 'standins910 requests no file');
  const scn = readFileSync(resolve(ROOT, 'js/scene.js'), 'utf8');
  ok(/solar: 'w4\/turbine'/.test(scn) && /keep\.has\(url\)/.test(scn), "w9's ridge turbines are w4's turbine.glb (kept when w9 releases the other worlds' models)");
  ok(/stepEnergy\(it\.obj, dt \|\| 0\)/.test(scn) && /stepTicker\(it\.obj, dt \|\| 0, t \|\| 0\)/.test(scn) && /noSpread/.test(scn), 'pulses / ticker steps run only inside scene updaters (never under reduced motion); the per-frame ring / ribbon skip spreadDecor');
}

/* w13 — identity (the doc, board ΔE ≥ 10 from every world), character colours, model emoji + a procedural stand-in for every model key (no .glb),
   the 'club' / 'sponsor' level kinds (text, pips, model parts only), the age bands of a player token, the cityModels fields game.js reads, still decor */
{
  const lab = (hex) => { const n = parseInt(hex.slice(1), 16); const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => f(x / 255));
    const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); const X = h((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), Y = h(r * 0.2126 + g * 0.7152 + b * 0.0722), Z = h((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
  const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  const s13 = readFileSync(resolve(ROOT, 'js/render/standins13.js'), 'utf8'); const sAll = readFileSync(resolve(ROOT, 'js/render/standins3d.js'), 'utf8') + s13;
  const w = await E.ensureWorld('w13'); const st = V.WORLD_STYLE.w13;
  ok(st && st.sky[0] === '#0b1020' && st.sky[1] === '#1e3a8a' && st.board === '#166534' && st.edge === '#14532d' && st.accent === '#dc2626' && st.accentInk[0] === '#7f1d1d' && st.decor === 'floodlights' && st.motif === 'pitch' && st.caption, 'WORLD_STYLE.w13 = the w13 doc (night sky, pitch board, edge, club red, ink, floodlights)');
  for (const id of Object.keys(V.WORLD_STYLE)) if (id !== 'w13') ok(dE(st.board, V.WORLD_STYLE[id].board) >= 10, `w13 board ΔE ≥ 10 from ${id} (${dE(st.board, V.WORLD_STYLE[id].board).toFixed(1)})`);
  const cs = w.characters.map((c) => c.id);
  ok(cs.join() === 'coachOwner,localTycoon,academyDirector' && cs.every((c) => V.CHAR_STYLE[c]) && new Set(cs.map((c) => V.CHAR_STYLE[c])).size === 3, 'CHAR_STYLE: coachOwner / localTycoon / academyDirector, distinct');
  for (const m of new Set(Object.values(w.models).filter(Boolean))) { ok(V.CITY_EMOJI[m], `CITY_EMOJI w13/${m}`); ok(new RegExp(`\\b${m}[:(,]`).test(sAll) || new RegExp(`${m}: [a-zA-Z]+`).test(sAll), `standins build w13/${m} (no .glb is ever requested)`); }
  ok(!/\.glb['"`]/.test(s13) && !/import\(|fetch\(|Loader/.test(s13), 'standins13 requests no file');
  { const g = E.createGame({ worldId: 'w13', charId: 'coachOwner', seed: 7, mode: 'free' }); const cm = E.cityModels(g);
    const c = cm.find((m) => m.model === 'stadium');
    ok(c && Number.isFinite(c.seats) && Number.isInteger(c.stage) && Number.isFinite(c.fill) && Number.isInteger(c.div) && Number.isInteger(c.rank) && c.floodlights === true && typeof c.training === 'boolean' && typeof c.academy === 'boolean', 'w13 cityModels: the stadium carries seats / stage / fill / div / rank / floodlights / training / academy (the fields game.js reads)', c); }
  const C = V.normLevel({ kind: 'club', stage: 1, seats: 20000, expanded: 0, fill: 0.634, div: 1, rank: 2, floodlights: true, training: true });
  ok(C.kind === 'club' && C.n === 1 && C.fill === 0.63 && !C.trouble && JSON.stringify(V.normLevel(C)) === JSON.stringify(C), 'club level: normalised, idempotent');
  ok(V.levelText(C) === 'הדרג השני · מקום 2 · 20,000 מקומות · תפוסה 63% · מרחיבים את היציע: שלב 1 מתוך 2 · מתחם אימונים' && V.pipsText(C) === '🏗️', `club text "${V.levelText(C)}"`);
  const C0 = V.normLevel({ kind: 'club', stage: 0, seats: 28000, fill: 0.8, div: 2, rank: 7 }); ok(V.pipsText(C0) === '▮▮▮▮▯' && V.levelText(C0).startsWith('הדרג הראשון · מקום 7') && V.activityOf(C0) === null, `club pips = the fill in fifths "${V.pipsText(C0)}", no activity badge`);
  const kp = V.kitParts(C); ok(kp.crane && kp.stage === 1 && kp.fill === 0.63 && kp.training && !kp.sign && !kp.scaffold, 'club level: model parts only (crane while building, fill, training)');
  const Sp = V.normLevel({ kind: 'sponsor', expired: true }); ok(Sp.expired && V.levelText(Sp).includes('נגמר') && V.pipsText(Sp) === '○' && V.kitParts(Sp).lit === false && V.kitParts({ kind: 'sponsor' }).lit === true, 'sponsor level: an ended contract is a dark billboard');
  ok(V.ageBand(19).id === 'young' && V.ageBand(23).id === 'rising' && V.ageBand(27).id === 'prime' && V.ageBand(30).id === 'late' && V.ageBand(33).id === 'vet' && V.AGE_BAND.every((b) => /[\u0590-\u05FF]/.test(b[2])), 'age bands (the token ring) = the market value age steps, each with its Hebrew word');
  ok(/export function paintClub/.test(s13) && /export function paintBillboard/.test(s13) && !/requestAnimationFrame|step[A-Z]\w*\(/.test(s13), 'standins13: paintClub / paintBillboard, nothing steps (still)');
  const scn = readFileSync(resolve(ROOT, 'js/scene.js'), 'utf8');
  ok(/floodlights: decorFloodlights/.test(scn) && !/function decorFloodlights[\s\S]{0,4000}?updaters\.add/.test(scn.slice(scn.indexOf('function decorFloodlights'), scn.indexOf('let floodState'))), 'the floodlights decor adds no updater (on with and without reduced motion)');
  ok(/case 'ball':/.test(scn) && /w13: 'המועדון שלך'/.test(scn), "scene: tile icon 'ball', the caption");
}
console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
