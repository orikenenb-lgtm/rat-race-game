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
console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
