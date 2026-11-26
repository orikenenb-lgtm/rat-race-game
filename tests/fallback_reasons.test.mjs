// Team ב (3D compatibility & fallback) — Node, no browser. Run: node tests/fallback_reasons.test.mjs [-v]
//  F-probe   select.js: WebGL2 → 3D; WebGL1 only → 2D 'no-webgl2' (three r170 needs WebGL2, so it is never downloaded);
//            no WebGL → 2D 'no-webgl'; probe contexts released; GPU string read; cached; מצב קל / flag never probe.
//  F-notice  overlay.js noticeFor(): one notice per real cause (BRIEF §8), a "פרטים טכניים" line, no wrong diagnosis for an
//            unknown reason, asset failures stay 3D (N6), no phone-only wording.
//  F-vendor  index.html: three.js and the fonts are served from this repo (relative paths, GitHub Pages base), every
//            `three/addons/…` import in js/ is vendored, licences + ATTRIBUTION.md exist.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const VERBOSE = process.argv.includes('-v');
let n = 0, fails = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } else if (VERBOSE) console.log('ok  ', msg); };

/* ------------------------------------------------------------ fake browser for the probe */
let caps = { webgl2: true, webgl: true, renderer: 'ANGLE (Fake GPU)', throws: false };
const log = { getContext: [], lost: 0 };
function fakeCtx(type) {
  return {
    RENDERER: 0x1F01,
    getExtension(name) {
      if (name === 'WEBGL_lose_context') return { loseContext() { log.lost++; } };
      if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_RENDERER_WEBGL: 0x9246 };
      return null;
    },
    getParameter(p) { return p === 0x9246 ? caps.renderer + (type === 'webgl' ? ' gl1' : '') : 'WebKit WebGL'; },
  };
}
globalThis.document = {
  createElement(tag) {
    return { tag, getContext(type) { log.getContext.push(type); if (caps.throws) throw new Error('blocked'); return caps[type] ? fakeCtx(type) : null; } };
  },
  body: { dataset: {} },
};
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const flags = await import('../js/flags.js');
const sel = await import('../js/render/select.js');
const OV = await import('../js/render/overlay.js');
const reset = (c, { lite = false, flagVal = null } = {}) => {
  caps = { webgl2: true, webgl: true, renderer: 'ANGLE (Fake GPU)', throws: false, ...c };
  log.getContext = []; log.lost = 0; store.clear();
  if (lite) store.set('rr2-settings', JSON.stringify({ lite: true }));
  flags._resetForTests({ search: flagVal ? `?ff=board2d:${flagVal}` : '', storage: null });
  sel._resetProbe();
};

/* ------------------------------------------------------------ F-probe */
reset({});
let ch = sel.preferredChoice(), g = sel.glInfo();
ok(ch.kind === '3d' && ch.reason === null, 'WebGL2 → 3D');
ok(g.gl2 && g.gl1 && g.renderer === 'ANGLE (Fake GPU)', 'glInfo: gl2, gl1, GPU string ' + JSON.stringify(g));
ok(log.lost === log.getContext.filter((t) => caps[t]).length && log.lost >= 1, 'every probe context is released (loseContext)');
ok(JSON.stringify(log.getContext) === '["webgl2"]', 'WebGL2 found: no extra WebGL1 probe ' + JSON.stringify(log.getContext));
const calls = log.getContext.length; sel.preferredChoice(); sel.glInfo(); sel.webglAvailable();
ok(log.getContext.length === calls, 'probe is cached (no new contexts)');
ok(Object.isFrozen(sel.glInfo()), 'glInfo result is frozen');

reset({ webgl2: false });
ch = sel.preferredChoice(); g = sel.glInfo();
ok(ch.kind === '2d' && ch.reason === 'no-webgl2', 'WebGL1 only → 2D, reason no-webgl2 ' + JSON.stringify(ch));
ok(!g.gl2 && g.gl1 && /gl1$/.test(g.renderer), 'WebGL1 only: GPU string read from the WebGL1 context ' + JSON.stringify(g));
ok(sel.webglAvailable() === true, 'webglAvailable() keeps its old meaning (any WebGL)');
ok(log.lost === 1, 'WebGL1 probe context released');

reset({ webgl2: false, webgl: false });
ch = sel.preferredChoice(); g = sel.glInfo();
ok(ch.kind === '2d' && ch.reason === 'no-webgl', 'no WebGL → 2D, reason no-webgl');
ok(!g.gl1 && !g.gl2 && g.renderer === '', 'no WebGL: empty GPU string');
ok(sel.webglAvailable() === false, 'webglAvailable() false');

reset({ throws: true });
ch = sel.preferredChoice();
ok(ch.kind === '2d' && ch.reason === 'no-webgl', 'getContext throwing → no-webgl (never throws out)');

reset({}, { lite: true });
ch = sel.preferredChoice();
ok(ch.kind === '2d' && ch.reason === 'user-lite' && log.getContext.length === 0, 'מצב קל chosen → 2D user-lite, WebGL never probed');
reset({ webgl2: false }, { flagVal: 'on' });
ch = sel.preferredChoice();
ok(ch.kind === '2d' && ch.reason === 'flag' && log.getContext.length === 0, 'flag board2d:on → 2D flag, no probe');
reset({ webgl2: false, webgl: false }, { flagVal: 'off' });
ch = sel.preferredChoice();
ok(ch.kind === '3d', 'flag board2d:off → 3D always (unchanged)');

// the source keeps the WebGL1 device away from three: preferredChoice must not return 3D for gl1-only (checked above), and
// loadRenderer documents the reasons it can return
const selSrc = read('js/render/select.js');
for (const r of ['no-webgl', 'no-webgl2', 'three-failed', 'three-timeout', 'webgl-init-failed', 'context-lost', '2d-failed']) ok(selSrc.includes(`'${r}'`), `select.js documents reason ${r}`);
ok(/gpu: gpu\(\)/.test(selSrc), 'loadRenderer returns the GPU string (gpu) with every result');

/* ------------------------------------------------------------ F-notice */
const S = OV.STR;
const N = (reason, extra = {}) => OV.noticeFor({ kind: '2d', reason, gpu: 'ANGLE (Fake GPU)', ...extra });
const table = {
  'no-webgl': ['N1', null], 'no-webgl2': ['N1b', null], 'three-failed': ['N2', 'reload3d'], 'three-timeout': ['N2s', 'reload3d'],
  'webgl-init-failed': ['N3', null], 'context-lost': ['N8', 'reload3d'],
};
const texts = new Set();
for (const [reason, [id, action]] of Object.entries(table)) {
  const x = N(reason);
  ok(x && x.id === id, `${reason} → ${id} (${x && x.id})`);
  ok(x && typeof x.text === 'string' && x.text.length > 20 && x.text === S[id], `${reason}: text is STR.${id}`);
  ok(x && x.action === action, `${reason}: action ${action}`);
  if (action) ok(x.actionLabel === 'לנסות שוב בתלת־ממד', `${reason}: retry label`);
  ok(x && x.sub.startsWith('פרטים טכניים: ') && x.sub.includes(reason === 'context-lost' ? 'context-lost' : reason) && x.sub.includes('ANGLE (Fake GPU)'), `${reason}: technical line has the code + GPU (${x && x.sub})`);
  ok(x && x.ms >= 6000, `${reason}: shown ≥ 6 s`);
  texts.add(x && x.text);
}
ok(texts.size === Object.keys(table).length, 'every cause has its own text (no shared diagnosis)');
ok(N('no-webgl', { gpu: '' }).sub === 'פרטים טכניים: \u2066no-webgl\u2069', 'no GPU string → code only');
ok(/WebGL/.test(S.N1) && /האצת החומרה/.test(S.N1) && !/לא תומך/.test(S.N1), 'N1 names WebGL + hardware acceleration, does not say "not supported"');
ok(/הישנה של WebGL/.test(S.N1b) && !/\d/.test(S.N1b), 'N1b: the old WebGL, no digit (bidi-safe)');
ok(S.tech('c', 'x'.repeat(100)).length < 90 && S.tech('c', 'x'.repeat(100)).endsWith('…\u2069'), 'long GPU strings are cut to 60 chars');
ok(/לאט/.test(S.N2s) && !/לא הצלחנו/.test(S.N2s), 'slow three: "slow", not "failed"');
ok(/נעצרה/.test(S.N8) && /שמורה/.test(S.N8), 'context lost in lobby: "stopped" + progress saved');
for (const r of ['user-lite', 'flag']) { const x = N(r); ok(x && x.text === '' && x.id === 'quiet', `${r}: settled, no message`); }
ok(N('something-new').text === '', 'unknown 2D reason: no message (never a wrong diagnosis)');
ok(N(null).text === '', '2D without a reason: no message');
const none = OV.noticeFor({ kind: 'none', reason: 'three-failed' });
ok(none.id === 'N5' && none.sub.includes('three-failed'), 'no renderer at all → N5 with the code');
ok(OV.noticeFor({ kind: '3d', failed: 3 }).id === 'N6', '3D + failed GLBs → N6 (stays 3D, not "no support")');
ok(OV.noticeFor({ kind: '3d', failed: 3, lowPower: true }).id === 'N6', 'N6 before the N7 offer');
const n7 = OV.noticeFor({ kind: '3d', lowPower: true });
ok(n7.id === 'N7' && n7.action === 'lite' && n7.actionLabel === S.N7a, 'software GL → N7 + "למצב קל"');
ok(OV.noticeFor({ kind: '3d', lowPower: true, liteOffered: true }) === null, 'N7 only once (liteOffered)');
ok(OV.noticeFor({ kind: '3d', lowPower: true, liteAllowed: false }) === null, 'no N7 when the flag forbids 2D');
ok(OV.noticeFor({ kind: '3d' }) === null, 'healthy 3D: nothing (null = may report later)');
ok(OV.noticeFor() === null && OV.noticeFor(null) === null, 'noticeFor() tolerates no input');
// no phone-only wording anywhere (G4): the context-loss texts are shown on desktop too
for (const [k, v] of Object.entries(S)) if (typeof v === 'string') ok(!/טלפון/.test(v), `STR.${k} has no phone-only wording`);
ok(/זיכרון הגרפי/.test(S.R3b) && /שמורה/.test(S.R3b), 'R3b neutral: graphics memory + progress saved');
ok(S.tech('x', 'y') === 'פרטים טכניים: \u2066x · y\u2069' && S.tech('x', '') === 'פרטים טכניים: \u2066x\u2069', 'STR.tech format (code + GPU in one LTR isolate)');
ok(/details = ''/.test(read('js/render/overlay.js')) && /class="rtech"/.test(read('js/render/overlay.js')), 'showRecover accepts a details line');

/* ------------------------------------------------------------ F-vendor */
const html = read('index.html');
const im = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
ok(im.three === './vendor/three/build/three.module.min.js', 'importmap three → local relative vendor path');
ok(im['three/addons/'] === './vendor/three/examples/jsm/', 'importmap addons → local relative vendor path');
ok(existsSync(join(ROOT, im.three)), 'vendored three.module.min.js exists');
ok(/\/three\/build\//.test(im.three), "core path contains /three/build/ (stability_e2e S2/S3 block '**/three/build/**')");
ok(/0\.170\.0/.test(read('vendor/three/VERSION')), 'vendor/three/VERSION says 0.170.0');
ok(/const t="170"/.test(read(im.three.slice(2))) && /\bt as REVISION\b/.test(read(im.three.slice(2))), 'vendored three is r170 (REVISION "170")');
ok(!/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<meta[^>]*>/g, '').replace(/xmlns=%22http:\/\/www\.w3\.org\/2000\/svg%22/g, '')), 'index.html loads nothing from another origin');
ok(!/fonts\.googleapis|fonts\.gstatic|jsdelivr|unpkg/.test(html), 'no Google Fonts / CDN references in index.html');
ok(!/^\s*\//m.test(Object.values(im).join('\n')), 'importmap paths are relative (work under /rat-race-game/)');
// every addon imported anywhere in js/ is vendored
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // comments stripped
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => { const p = posix.join(d, f); return statSync(join(ROOT, p)).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
const addons = new Set();
for (const f of walk('js')) for (const m of code(f).matchAll(/from\s*['"]three\/addons\/([^'"]+)['"]|import\(\s*['"]three\/addons\/([^'"]+)['"]\s*\)/g)) addons.add(m[1] || m[2]);
ok(addons.size >= 4, 'found the addon imports (' + [...addons].join(', ') + ')');
const AD = 'vendor/three/examples/jsm/';
for (const a of addons) ok(existsSync(join(ROOT, AD, a)), `addon ${a} is vendored`);
// and the vendored addons' own relative imports resolve
for (const a of addons) for (const m of code(AD + a).matchAll(/^\s*(?:import|export)\b[^;]*?from\s*['"](\.[^'"]+)['"]/gm)) ok(existsSync(join(ROOT, posix.normalize(posix.join(AD, posix.dirname(a), m[1])))), `${a} → ${m[1]} vendored`);
for (const a of addons) for (const m of code(AD + a).matchAll(/^\s*(?:import|export)\b[^;]*?from\s*['"]([^.'"][^'"]*)['"]/gm)) ok(m[1] === 'three', `${a} imports only 'three' bare (${m[1]})`);
ok(existsSync(join(ROOT, 'vendor/three/LICENSE')) && /MIT License/.test(read('vendor/three/LICENSE')), 'three.js MIT licence shipped');
// fonts
const css = read('css/stability.css');
const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/["']/g, ''));
const fontUrls = urls.filter((u) => /\.woff2$/.test(u));
ok(fontUrls.length === 4, '4 @font-face files (Rubik hebrew/latin, Secular One hebrew/latin)');
for (const u of fontUrls) ok(existsSync(join(ROOT, 'css', u)), `font file ${u} exists`);
ok(!urls.some((u) => /^https?:/.test(u)), 'no external url() in stability.css');
ok(/font-family:Rubik;[^}]*font-weight:300 900/.test(css) && /font-family:"Secular One"/.test(css), '@font-face for Rubik (300–900) and Secular One');
for (const f of ['OFL-Rubik.txt', 'OFL-SecularOne.txt']) ok(existsSync(join(ROOT, 'vendor/fonts', f)) && /SIL Open Font License/.test(read('vendor/fonts/' + f)), `${f} shipped`);
const attr = existsSync(join(ROOT, 'ATTRIBUTION.md')) ? read('ATTRIBUTION.md') : '';
ok(/three\.js/.test(attr) && /MIT/.test(attr) && /Rubik/.test(attr) && /Secular One/.test(attr) && /OFL|Open Font License/.test(attr) && /Blender/.test(attr), 'ATTRIBUTION.md: three (MIT), fonts (OFL), own assets');
// the recover bar moves off an open card's buttons (G4)
ok(/body:has\(#evm:not\(\[hidden\]\)\) \.recover/.test(css), 'recover bar moves to the top while a card is open');

console.log(`fallback_reasons: ${n - fails}/${n} passed${fails ? `, ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);
