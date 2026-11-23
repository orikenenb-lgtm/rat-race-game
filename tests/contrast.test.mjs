// T5 part A — design-token contrast + type floor (Node, no browser). Run: node tests/contrast.test.mjs [-v]
// Parses the tokens straight from css/game.css (:root light-dark() pairs and body[data-world] overrides) and css/lobby.css,
// then asserts the WCAG 2.x ratios the T5 spec requires (A-1, A-2, A-4, §2.1 badge table, white-ink tile tags).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const VERBOSE = process.argv.includes('-v');
// T7 CR-33: the in-game half of game.css moved to css/game-play.css (same cascade spot) — both are "game.css" for these checks
const GAME = read('css/game.css') + '\n' + read('css/game-play.css'), LOBBY = read('css/lobby.css');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
let n = 0, fails = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } else if (VERBOSE) console.log('ok  ', msg); };

/* ---------- colour maths (WCAG 2.x relative luminance) */
const hex = (h) => { h = h.trim().replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error('bad hex ' + h); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const cr = (a, b) => { const x = lum(typeof a === 'string' ? hex(a) : a), y = lum(typeof b === 'string' ? hex(b) : b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const f2 = (x) => x.toFixed(2);

/* ---------- token parsing */
function block(css, selector) {
  const s = strip(css), i = s.indexOf(selector + '{') >= 0 ? s.indexOf(selector + '{') : s.indexOf(selector + ' {');
  if (i < 0) return null;
  const a = s.indexOf('{', i), b = s.indexOf('}', a);
  return s.slice(a + 1, b);
}
function decls(body) {
  const out = {};
  for (const part of body.split(';')) { const m = part.match(/^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/); if (m) out[m[1]] = m[2]; }
  return out;
}
/** value → {light, dark} for hex or light-dark(hex,hex); null otherwise */
function pair(v) {
  if (!v) return null;
  let m = v.match(/^light-dark\(\s*(#[0-9a-f]{3,6})\s*,\s*(#[0-9a-f]{3,6})\s*\)$/i);
  if (m) return { light: m[1], dark: m[2] };
  m = v.match(/^(#[0-9a-f]{3,6})$/i);
  return m ? { light: m[1], dark: m[1] } : null;
}
const rootBody = block(GAME, ':root');
ok(!!rootBody, 'game.css has a :root token block');
const T = decls(rootBody || '');
const tok = (name) => { const p = pair(T[name]); if (!p) throw new Error(`token ${name} missing or not a hex / light-dark(hex,hex): ${T[name]}`); return p; };
const MODES = ['light', 'dark'];
const SURF = ['--paper', '--paper2', '--paper3'];
const surfaces = (mode) => SURF.map((s) => tok(s)[mode]);

/* spec §2.1 surfaces are fixed: a token change there must be deliberate */
ok(JSON.stringify(SURF.map((s) => tok(s).light)) === JSON.stringify(['#fffaf0', '#f6eedd', '#efe4cd']), 'light surfaces = #fffaf0 #f6eedd #efe4cd');
ok(JSON.stringify(SURF.map((s) => tok(s).dark)) === JSON.stringify(['#1f1b27', '#2a2533', '#352f40']), 'dark surfaces = #1f1b27 #2a2533 #352f40');

const table = [];
function worst(fg, mode) { return Math.min(...surfaces(mode).map((s) => cr(fg, s))); }

/* ---------- A-1: text tokens ≥ 4.5 on all three surfaces of their mode */
const TEXT = ['--ink', '--mut', '--green', '--red', '--blue', '--pink', '--gold-text', '--accent-ink'];
for (const t of TEXT) {
  const p = tok(t), row = { token: t };
  for (const mode of MODES) {
    const rs = surfaces(mode).map((s) => cr(p[mode], s));
    row[mode] = `${p[mode]} ${rs.map(f2).join(' / ')}`;
    ok(Math.min(...rs) >= 4.5, `A-1 ${t} ${mode} ${p[mode]} ≥ 4.5 on every surface (worst ${f2(Math.min(...rs))})`);
  }
  table.push(row);
}

/* ---------- A-1: --accent-ink for the 5 worlds × 2 modes (w1 = :root; others from body[data-world=…]) */
const accentInk = { w1: tok('--accent-ink') };
const accentFill = {};
for (const w of ['w2', 'w3', 'w4', 'w5', 'h']) {
  const b = block(GAME, `body[data-world=${w}]`);
  ok(!!b, `game.css has body[data-world=${w}]`);
  const d = decls(b || '');
  accentInk[w] = pair(d['--accent-ink']);
  ok(!!accentInk[w], `body[data-world=${w}] sets --accent-ink as light-dark(hex,hex)`);
  if (d['--accent']) accentFill[w] = d['--accent'];
}
const SPEC_INK = { w1: ['#8a5a00', '#f2b632'], w2: ['#9d1784', '#ff4fd8'], w3: ['#0b5f78', '#38bdf8'], w4: ['#6d28d9', '#22d3ee'], w5: ['#9a3412', '#ff9f7f'], h: ['#7a5520', '#c8a24a'] };
for (const [w, p] of Object.entries(accentInk)) {
  if (!p) continue;
  ok(p.light.toLowerCase() === SPEC_INK[w][0] && p.dark.toLowerCase() === SPEC_INK[w][1], `--accent-ink ${w} matches the §3 identity sheet`);
  const row = { token: `--accent-ink ${w}` };
  for (const mode of MODES) {
    const rs = surfaces(mode).map((s) => cr(p[mode], s));
    row[mode] = `${p[mode]} ${rs.map(f2).join(' / ')}`;
    ok(Math.min(...rs) >= 4.5, `A-1 --accent-ink ${w} ${mode} ${p[mode]} ≥ 4.5 (worst ${f2(Math.min(...rs))})`);
  }
  table.push(row);
}

/* ---------- A-2: non-text ≥ 3:1 (focus ring, earned-star stroke, unearned-star outline, pip ring) */
const NONTEXT = [['--focus', 'focus ring'], ['--gold-text', 'earned-star stroke / filled-pip border'], ['--mut', 'unearned-star outline / hollow-pip ring']];
for (const [t, what] of NONTEXT) {
  const p = tok(t);
  for (const mode of MODES) {
    const w = worst(p[mode], mode);
    ok(w >= 3, `A-2 ${what} (${t} ${mode} ${p[mode]}) ≥ 3:1 on every surface (worst ${f2(w)})`);
    table.push({ token: `${t} (${what})`, [mode]: `${p[mode]} worst ${f2(w)}` });
  }
}
// the stars really use those tokens (shape + stroke), not a colour-only glyph
const L = strip(LOBBY), G = strip(GAME);
ok(/\.lb-stars i\s*\{[^}]*color:\s*transparent;[^}]*-webkit-text-stroke:[^;]*var\(--mut\)/.test(L), 'A-7 lobby unearned star = outline (transparent fill + --mut stroke)');
ok(/\.lb-stars i\.on\s*\{[^}]*color:\s*var\(--gold\);[^}]*-webkit-text-stroke:[^;]*var\(--gold-text\)/.test(L), 'A-7 lobby earned star = gold fill + --gold-text stroke');
ok(/\.end-star\s*\{[^}]*color:\s*transparent;[^}]*-webkit-text-stroke:[^;]*var\(--mut\)/.test(L), 'A-7 end-screen unearned star = outline');
ok(/\.end-star\.on\s*\{[^}]*-webkit-text-stroke:[^;]*var\(--gold-text\)/.test(L), 'A-7 end-screen earned star = gold + stroke');
ok(!/#dccfb5|#e8dcc4/i.test(L), 'old low-contrast empty-star colours are gone');
ok(/:focus-visible[^{]*\{[^}]*outline:\s*3px solid var\(--focus\)/.test(G), 'focus-visible ring uses --focus');

/* ---------- §2.1 gold: fills only; gold text uses --gold-text */
const gold = '#f2b632', goldInk = tok('--gold-ink').light;
ok(cr(goldInk, gold) >= 4.5, `--gold-ink on --gold ≥ 4.5 (${f2(cr(goldInk, gold))})`);
table.push({ token: '--gold-ink on --gold', light: `${goldInk} ${f2(cr(goldInk, gold))}` });
for (const [name, css] of [['game.css', G], ['lobby.css', L]]) {
  const bad = [...css.matchAll(/(^|[;{\s])color:\s*var\(--gold2\)/g)].length;
  ok(bad === 0, `${name}: --gold2 is never a text colour (${bad} found)`);
  const old = [...css.matchAll(/color:\s*light-dark\(#a86b00/gi)].length;
  ok(old === 0, `${name}: old #a86b00 gold text replaced by --gold-text (${old} found)`);
}

/* ---------- text on world accent FILLS uses --ink (§2.1, h fill becomes #c8a24a) */
const worldsSrc = Object.fromEntries(['w1', 'w2', 'w3', 'w4', 'w5', 'h'].map((w) => [w, read(`js/worlds/${w}.js`)]));
const fillOf = (w) => accentFill[w] || (worldsSrc[w].match(/accent:\s*'(#[0-9a-f]{6})'/i) || worldsSrc.w1.match(/accent:\s*'(#[0-9a-f]{6})'/i))[1];
for (const w of ['w1', 'w2', 'w3', 'w4', 'w5', 'h']) {
  const f = fillOf(w), r = cr(tok('--ink').light, f);
  ok(r >= 4.5, `--ink on ${w} accent fill ${f} ≥ 4.5 (${f2(r)})`);
  table.push({ token: `--ink on accent ${w}`, light: `${f} ${f2(r)}` });
}

/* ---------- white-on-colour badges (§2.1 table) */
const lobbyBg = (sel) => { const b = block(LOBBY, sel); const m = b && b.match(/background:\s*(#[0-9a-f]{6})/i); return m ? m[1] : null; };
const BADGES = [['.lb-title', 'title badge t0', '#6f687c'], ['.lb-t1', 'title badge t1', '#157a4b'], ['.lb-t2', 'title badge t2'], ['.lb-t3', 'title badge t3'], ['.gp-newtag', '"new" tag (red)']];
for (const [sel, what, want] of BADGES) {
  const bg = lobbyBg(sel);
  ok(!!bg, `${sel} has a solid hex background`);
  if (!bg) continue;
  if (want) ok(bg.toLowerCase() === want, `${what} background = ${want}`);
  const r = cr('#ffffff', bg);
  ok(r >= 4.5, `white on ${what} ${bg} ≥ 4.5 (${f2(r)})`);
  table.push({ token: `white on ${what}`, light: `${bg} ${f2(r)}` });
}
const newTag = (L.match(/\.map-tag-new\s*\{[^}]*background:\s*(#[0-9a-f]{6})/i) || [])[1];
ok(newTag && cr('#ffffff', newTag) >= 4.5, `white on map "new" tag ${newTag} ≥ 4.5`);
const verdictMid = (G.match(/#verdict\.mid \.vs\{background:(#[0-9a-f]{6})\}/i) || [])[1];
ok(verdictMid && cr('#ffffff', verdictMid) >= 4.5, `white on verdict "mid" score ${verdictMid} ≥ 4.5 (${verdictMid && f2(cr('#fff', verdictMid))})`);

/* ---------- white-ink tags: the OKLCH lightness clamp in .tag / #evCard .tag must make white text pass for every tile colour */
const toLin = (c) => lin(c), toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklab(rgb) {
  const [r, g, b] = rgb.map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L_, a, b]) {
  const l = (L_ + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L_ - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L_ - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (lin3) => lin3.every((c) => c >= -1e-6 && c <= 1 + 1e-6);
const to8 = (lin3) => lin3.map((c) => Math.round(255 * toGam(Math.min(1, Math.max(0, c)))));
/** clamp OKLCH lightness to lmax; return both the clipped and the chroma-reduced (CSS Color 4 gamut mapping) sRGB results */
function clampL(h, lmax) {
  const [L0, a, b] = oklab(hex(h)); const Lc = Math.min(L0, lmax);
  const clipped = to8(fromOklab([Lc, a, b]));
  let lo = 0, hi = 1; if (!inGamut(fromOklab([Lc, a, b]))) { for (let i = 0; i < 30; i++) { const k = (lo + hi) / 2; if (inGamut(fromOklab([Lc, a * k, b * k]))) lo = k; else hi = k; } } else lo = 1;
  return { clipped, mapped: to8(fromOklab([Lc, a * lo, b * lo])), changed: L0 > lmax };
}
const clampRe = /oklch\(from var\(--c[^)]*\) min\(l,\s*([\d.]+)\) c h\)/g;
const clamps = [...G.matchAll(clampRe)].map((m) => +m[1]);
ok(clamps.length >= 2, `game.css clamps tag lightness in .tag and #evCard .tag[white ink] (${clamps.length} rules)`);
const lmax = Math.max(...clamps, 0);
const tileColours = new Set();
const common = read('js/worlds/common.js');
for (const m of common.matchAll(/color:\s*'(#[0-9a-f]{6})',\s*ink:\s*'#ffffff'/gi)) tileColours.add(m[1].toLowerCase());
for (const w of ['w2', 'w3', 'w4', 'h']) for (const m of worldsSrc[w].matchAll(/(\w|'\?'):\s*\{[^}]*?color:\s*'(#[0-9a-f]{6})'(?![^}]*ink:)/gi)) tileColours.add(m[2].toLowerCase());
for (const c of ['#2f6fdb', '#2459b8', '#c98a12', '#3b3f4e', '#f2b632']) tileColours.add(c); // ui.modal default / main.js tags / energy modal
let worstTag = 99, worstHex = '';
for (const c of tileColours) {
  const { clipped, mapped } = clampL(c, lmax);
  const r = Math.min(cr('#ffffff', clipped), cr('#ffffff', mapped));
  if (r < worstTag) { worstTag = r; worstHex = c; }
  ok(r >= 4.5, `white on tag ${c} after min(l,${lmax}) ≥ 4.5 (${f2(r)})`);
}
table.push({ token: `white on any tile tag after OKLCH clamp l≤${lmax}`, light: `${tileColours.size} colours, worst ${worstHex} ${f2(worstTag)}` });

/* ---------- A-4: no font-size below 12px in either CSS file; the cap token is 12px */
ok(T['--fs-cap'] === '.75rem' || T['--fs-cap'] === '0.75rem', '--fs-cap = .75rem (12px)');
for (const [name, css] of [['game.css', G], ['lobby.css', L]]) {
  const tiny = [];
  for (const m of css.matchAll(/font-size:\s*([\d.]+)(px|rem|em)\b/g)) { const px = m[2] === 'px' ? +m[1] : +m[1] * 16; if (px < 12 && m[2] !== 'em') tiny.push(m[0]); }
  for (const m of css.matchAll(/font:\s*(?:italic\s+|normal\s+)?(?:\d{3}\s+)?([\d.]+)px/g)) if (+m[1] < 12) tiny.push(m[0]);
  ok(tiny.length === 0, `A-4 ${name}: no font-size below 12px (${tiny.join(', ') || 'none'})`);
}
for (const t of ['--fs-sm', '--fs-md', '--fs-lg', '--fs-xl', '--fs-2xl', '--fs-3xl', '--fs-display', '--sp-1', '--sp-7', '--r-md', '--r-pill', '--shadow-l', '--dur-1', '--dur-max', '--ease-out', '--ease-pop', '--z-modal']) ok(!!T[t], `token ${t} defined`);
ok(T['--dur-max'] === '600ms', '--dur-max = 600ms (feedback motion ceiling)');

/* ---------- ₪ rule: money is Rubik, also inside titles */
ok(/\.num,\.lb-num\{font-family:var\(--font\)\}/.test(G.replace(/\s+/g, '')), '₪ rule: .num / .lb-num use the Rubik stack');

/* ---------- reduced motion: every OS block has a data-motion=reduce twin and honours data-motion=full */
for (const [name, css] of [['game.css', G], ['lobby.css', L]]) {
  const blocks = [...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\})\s*\}/g)];
  ok(blocks.length > 0, `${name}: has reduced-motion rules`);
  for (const b of blocks) ok(!/(^|\})\s*(?!:root:not\(\[data-motion=full\]\))[.#\w]/.test(b[1].replace(/\s*:root:not\(\[data-motion=full\]\)[^{]*\{[^}]*\}/g, '')), `${name}: OS reduced-motion rules are scoped by :root:not([data-motion=full])`);
  const osCount = (css.match(/:root:not\(\[data-motion=full\]\)/g) || []).length, appCount = (css.match(/:root\[data-motion=reduce\]/g) || []).length;
  ok(appCount === osCount, `${name}: ${appCount} data-motion=reduce rules mirror ${osCount} OS rules`);
}

/* ---------- 3D upgrade wave 2 (A3): a tag inside a gold (primary) button — "המנטור ממליץ לבדוק", "הבחירה של המנטור" — in both themes */
{
  const sG = strip(G);
  const last = (sel) => { let v = null; for (const m of sG.matchAll(/([^{}]+)\{([^}]*)\}/g)) if (m[1].split(',').map((x) => x.trim()).includes(sel)) { const c = m[2].match(/(?:^|;)\s*color:\s*([^;]+)/); if (c) v = c[1].trim(); } return v; };
  const res = (v) => (v && v.startsWith('var(') ? tok(v.slice(4, -1)) : pair(v));
  for (const sel of ['.primary .tagc', '.primary .tagc.dflt', '.primary .tagc.rec', '.choice.primary .tagc.rec', '.ddins .insp.primary .tagc.rec']) {
    const p = res(last(sel));
    ok(p && cr(p.light, gold) >= 4.5 && cr(p.dark, gold) >= 4.5, `${sel} on the gold fill ≥ 4.5 in light and dark (${p ? f2(cr(p.light, gold)) + ' / ' + f2(cr(p.dark, gold)) : 'no rule'})`);
    if (p) table.push({ token: `${sel} on --gold`, light: `${p.light} ${f2(cr(p.light, gold))}`, dark: `${p.dark} ${f2(cr(p.dark, gold))}` });
  }
}

/* ---------- report */
if (VERBOSE || fails) {
  console.log('\ncontrast table (light: value r(paper)/r(paper2)/r(paper3); dark likewise)');
  for (const r of table) console.log(`  ${r.token.padEnd(52)} ${r.light ? 'L ' + r.light : ''}${r.dark ? '   D ' + r.dark : ''}`);
}
console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
