#!/usr/bin/env node
// World config validator (worlds wave 0, DESIGN §4.4). Fails (exit 1) on any error; warnings are printed.
//
//   node tools/validate-worlds.mjs            static checks for every world (meta + full config + mechanic modules) + module draw/safe fuzz
//   node tools/validate-worlds.mjs --json     the same, as JSON
//
// validate({metas, worlds, lazyIds, …}) is exported for tests/worlds_config.test.mjs (fixtures with each error class).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../js/engine.js';
import '../js/worlds/all.js';
import { WORLD_META } from '../js/worlds/meta.js';
import { LAZY_IDS } from '../js/worlds/index.js';
import { GOALS, LEGACY_GOALS } from '../js/worlds/goals.js';
import { checkModule } from '../js/worlds/mech/index.js';
import { TILE_TYPES } from '../js/worlds/common.js';
import { ARCHETYPES } from '../js/finance/business.js';
import { STREAMS } from '../js/rng.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** tile type → the world field holding its deck ('' = no deck needed). */
const DECK = { payday: '', deal: 'deals', doodad: 'doodads', market: 'market', crisis: 'crises', mystery: 'mystery', bank: 'bank', upgrade: 'upgrades', fx: 'fxCards', shipping: 'shipping', pitch: 'pitches', giving: 'causes', life: '', edu: '', tax: '', index: '', business: 'bizOffers' };
const META_REQ = ['id', 'order', 'tier', 'name', 'tagline', 'unlock', 'ranked', 'status', 'playable'];
const PLAYABLE_REQ = ['learn', 'newHere', 'diff', 'goalLabel', 'maxMonths', 'stars', 'characters', 'minRules', 'mechanic'];
const FULL_REQ = ['id', 'order', 'name', 'tagline', 'goalLabel', 'lesson', 'board', 'tiles', 'loan', 'creditPct', 'goal', 'maxMonths', 'stars', 'characters', 'deals', 'doodads', 'market', 'crises', 'mystery', 'mentor', 'kinds', 'models', 'tickers', 'theme'];

/** Every ₪ amount written in a Hebrew text ("₪300 אלף", "₪1.5 מיליון", "₪250,000") → shekels. */
export function shekelsIn(text) {
  const out = []; const re = /₪\s?([\d,]+(?:\.\d+)?)\s*(מיליארד|מיליון|אלף)?/g; let m;
  while ((m = re.exec(String(text || '')))) { const v = parseFloat(m[1].replace(/,/g, '')); out.push(Math.round(v * (m[2] === 'מיליארד' ? 1e9 : m[2] === 'מיליון' ? 1e6 : m[2] === 'אלף' ? 1e3 : 1))); }
  return out;
}
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Static validation. → {errors: [], warnings: []} */
export function validate({ metas = WORLD_META, worlds = E.loadedWorlds(), lazyIds = LAZY_IDS, lessons = E.LESSONS, rulesCurrent = E.RULES_CURRENT, worldStyle = null } = {}) {
  const errors = [], warnings = []; const err = (w, m) => errors.push(`${w}: ${m}`); const warn = (w, m) => warnings.push(`${w}: ${m}`);
  const byMeta = {}; const byFull = Object.fromEntries(worlds.map((w) => [w.id, w])); const lessonIds = new Set(lessons.map((l) => l.id));
  // 1–2. meta schema, unique ids, lazy list
  for (const m of metas) {
    if (byMeta[m.id]) err(m.id, 'duplicate world id in meta'); byMeta[m.id] = m;
    for (const k of META_REQ) if (m[k] == null) err(m.id, `meta.${k} missing`);
    if (m.playable) for (const k of PLAYABLE_REQ) if (m[k] == null) err(m.id, `meta.${k} missing (playable world)`);
    if (m.playable && !byFull[m.id]) err(m.id, 'playable in meta but no full config is loaded');
  }
  const lazyMeta = metas.filter((m) => m.status === 'lazy').map((m) => m.id).sort();
  if (JSON.stringify(lazyMeta) !== JSON.stringify([...lazyIds].sort())) err('registry', `meta lazy worlds [${lazyMeta}] ≠ js/worlds/index.js LAZY_IDS [${lazyIds}]`);
  const charSeen = {};
  for (const w of worlds) for (const c of w.characters) { if (charSeen[c.id]) err(w.id, `character id '${c.id}' also in ${charSeen[c.id]} (ids are global: CHAR_STYLE / profession)`); charSeen[c.id] = w.id; }
  // unlock graph: references, ★ ≤ 1, acyclic, reachable from w1
  for (const m of metas) for (const c of m.unlock || []) {
    if ((c.stars || 1) > 1) err(m.id, 'an unlock clause needs ★★ or more (never a gate)');
    if (!Array.isArray(c.any) || !c.any.length) err(m.id, 'unlock clause without worlds');
    for (const x of c.any || []) if (!byMeta[x]) err(m.id, `unlock references unknown world ${x}`);
    if ((c.count || 1) > (c.any || []).length) err(m.id, 'unlock count larger than its list');
  }
  const reach = new Set(); let grew = true;
  while (grew) { grew = false; for (const m of metas) if (!reach.has(m.id) && (m.unlock || []).every((c) => (c.any || []).filter((x) => reach.has(x)).length >= (c.count || 1))) { reach.add(m.id); grew = true; } }
  for (const m of metas) if (!reach.has(m.id)) err(m.id, 'not reachable from w1 (or the unlock graph has a cycle)');
  // per world
  for (const w of worlds) {
    const m = byMeta[w.id]; const id = w.id;
    for (const k of FULL_REQ) if (w[k] == null) err(id, `config.${k} missing`);
    if (m) {
      for (const k of ['order', 'name', 'goalLabel', 'maxMonths']) if (m[k] !== w[k]) err(id, `meta.${k} (${m[k]}) ≠ config (${w[k]})`);
      if (JSON.stringify(m.stars) !== JSON.stringify(w.stars)) err(id, 'meta.stars ≠ config.stars');
      if ((m.minRules || 3) !== (w.minRules || 3) && m.status === 'lazy') err(id, `meta.minRules ${m.minRules} ≠ config ${w.minRules}`);
      if (m.mechanic !== w.mechanic) err(id, `meta.mechanic ${m.mechanic} ≠ ${w.mechanic}`);
      const mc = m.characters || [];
      if (mc.map((c) => c.id).join() !== w.characters.map((c) => c.id).join()) err(id, 'meta characters ≠ config characters (ids / order)');
      for (const c of w.characters) { const x = mc.find((y) => y.id === c.id); if (!x) continue; for (const k of ['name', 'maxMonths', 'maxMonths4']) if ((x[k] ?? null) !== (c[k] ?? null)) err(id, `character ${c.id}: meta.${k} ≠ config`); if (JSON.stringify(x.stars || null) !== JSON.stringify(c.stars || null)) err(id, `character ${c.id}: meta.stars ≠ config`); }
    } else err(id, 'no meta entry');
    if ((w.minRules || 3) > rulesCurrent) err(id, `minRules ${w.minRules} > RULES_CURRENT ${rulesCurrent}`);
    // goal
    const g = w.goal || {};
    if (!LEGACY_GOALS.includes(g.type) && !GOALS[g.type]) err(id, `goal type '${g.type}' is not registered`);
    if (g.hold != null && !(g.hold >= 1 && g.hold <= 6)) err(id, 'goal.hold out of 1–6');
    // board & tiles & decks
    if (typeof w.board !== 'string' || w.board.length !== 40) err(id, 'board must be 40 tiles');
    const mechTiles = {}; for (const M of w.mech || []) { const pr = checkModule(M); for (const x of pr) err(id, `module ${M.id}: ${x}`); for (const ch of Object.keys(M.tiles || {})) mechTiles[ch] = M; }
    for (const ch of new Set(w.board || '')) {
      const t = (w.tiles || {})[ch]; if (!t) { err(id, `board char '${ch}' has no tile`); continue; }
      if (!TILE_TYPES[ch] && !mechTiles[ch]) err(id, `tile '${ch}' is neither a shared tile type nor a module tile`);
      if (mechTiles[ch]) continue;
      const deck = DECK[t.type]; if (deck === undefined) { err(id, `tile '${ch}' type ${t.type} has no handler`); continue; }
      if (deck && !(Array.isArray(w[deck]) && w[deck].length)) err(id, `tile '${ch}' (${t.type}) needs a non-empty ${deck}`);
    }
    for (const b of w.bizOffers || []) if (!ARCHETYPES[b]) err(id, `bizOffers: unknown archetype ${b}`);
    // cards: kinds, tickers, money coherence
    const cards = [...(w.deals || []), ...(w.golden || []), ...(w.starterDeal ? [w.starterDeal] : []), ...w.characters.flatMap((c) => c.assets || [])];
    const band = w.econ && w.econ.band; const downs = [];
    for (const c of cards) {
      if (c.tk) { if (!(w.tickers || {})[c.tk]) err(id, `card '${c.n}': ticker ${c.tk} not in tickers`); continue; }
      if (c.crypto) continue;
      if (!(w.kinds || {})[c.k]) err(id, `card '${c.n}': kind '${c.k}' not in kinds`);
      if (!(w.models || {})[c.k]) warn(id, `card '${c.n}': kind '${c.k}' has no model (render falls back)`);
      if (c.down > c.cost) err(id, `card '${c.n}': down ${c.down} > cost ${c.cost}`);
      if (!Number.isInteger(c.cost) || !Number.isInteger(c.down) || (c.cf != null && !Number.isInteger(c.cf))) err(id, `card '${c.n}': money must be integer ₪`);
      if (c.cost > 0) downs.push(c.down);
      if (band) { const [lo, hi] = band.deal; if (c.cost < lo / 3 || c.cost > hi * 3) warn(id, `card '${c.n}': cost ${c.cost} far outside econ.band.deal`); else if (c.cost < lo || c.cost > hi) warn(id, `card '${c.n}': cost ${c.cost} outside econ.band.deal`); }
      for (const t of [c.n, c.d, c.q]) if (/\{\w+\}/.test(t || '')) err(id, `card '${c.n}': unfilled {placeholder} in its text`);
      for (const v of shekelsIn(c.d)) if (v >= 100000 && c.op == null && ![c.cost, c.down, c.cf, c.value].includes(v)) warn(id, `card '${c.n}': text says ₪${v} — not one of its fields`);
      if (c.op && c.cf0 != null && c.cf !== c.cf0) err(id, `card '${c.n}': op card cf ${c.cf} ≠ its priced average ${c.cf0}`);
    }
    if (w.starterDeal && w.characters.some((ch) => ch.cash < w.starterDeal.down)) warn(id, 'starterDeal down payment above a character\'s cash (the tutorial lowers it)');
    const md = median(downs); if (md && w.loan && (w.loan.unit < md * 0.01 || w.loan.unit > md * 0.1)) warn(id, `loan.unit ${w.loan.unit} is outside 1–10 % of the median down payment ${md}`);
    if (w.bounds && !(w.bounds.nwMax < 1e13)) err(id, 'bounds.nwMax must stay < 1e13 (JS-safe with margin)');
    for (const c of [...(w.market || []), ...(w.crises || [])]) for (const t of [c.n, c.d, c.q]) if (/\{\w+\}/.test(t || '')) err(id, `card '${c.n}': unfilled {placeholder}`);
    // characters: star thresholds, start money
    for (const c of w.characters) {
      const T = E.starThresholds(w, c.id, rulesCurrent);
      if (!(T.t3 < T.t2 && T.t2 < T.maxMonths && T.maxMonths <= 200)) err(id, `character ${c.id}: needs t3 < t2 < maxMonths ≤ 200 (got ${T.t3} / ${T.t2} / ${T.maxMonths})`);
      if (!Number.isInteger(c.cash) || c.cash < 0) err(id, `character ${c.id}: cash must be a non-negative integer`);
      if (!Array.isArray(c.expenses) || !c.expenses.length) err(id, `character ${c.id}: expenses missing`);
    }
    // modules: lessons, mentor keys
    for (const M of w.mech || []) {
      for (const l of M.lessons || []) if (!lessonIds.has(l)) err(id, `module ${M.id}: lesson '${l}' is not in the library`);
      for (const k of M.mentorKeys || []) if (!(w.mentor || {})[k]) err(id, `module ${M.id}: mentor key '${k}' missing in the world's mentor`);
    }
    // static goal sanity (passive12): the deck can produce the target at all (the best 12 cards' planned average, no compounding)
    if (g.type === 'passive12') { const best = cards.filter((c) => c.cf > 0).map((c) => c.cf).sort((a, b) => b - a).slice(0, 12).reduce((s, x) => s + x, 0); if (best < g.target) err(id, `impossible goal: the 12 best cards average ₪${best} < target ₪${g.target}`); }
    if (worldStyle && !worldStyle[id]) warn(id, 'WORLD_STYLE has no entry (render lane: js/render/vocab.js)');
  }
  return { errors, warnings };
}

/** Lint: module files use only exact arithmetic (no Math.pow / exp / log / random, no Date) — bit-identical in browser, Node and Deno. */
export function lintModules(dir = join(ROOT, 'js', 'worlds', 'mech')) {
  const errors = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const re of [/Math\.(pow|exp|log|log2|log10|sqrt|random|sin|cos|tan|atan|cbrt|hypot)\b/, /\bDate\b/, /\*\*/, /\bimport\b[^;]*engine\.js/]) if (re.test(src)) errors.push(`mech/${f}: forbidden ${re}`);
  }
  return errors;
}

/** Dynamic checks of every module world: fixed draw counts (two opposite players, same seed → identical stream positions after every turn)
 *  and room safety (a module tile's `safe` option never spends: cash, loans and assets unchanged). */
export function fuzzModules(worlds = E.loadedWorlds(), turns = 70) {
  const errors = []; const notes = [];
  for (const w of worlds.filter((x) => (x.mech || []).length)) for (const ch of w.characters) {
    const mk = () => E.createGame({ worldId: w.id, charId: ch.id, seed: 4242 + ch.id.length, mode: 'free', mentor: 'hint' });
    const A = mk(), B = mk(); let landings = 0, safeChecked = 0, worldDraws = 0;
    const safeOf = (st) => { const p = st.pending; if (!p || p.type !== 'mech') return null; for (const M of w.mech) if (M.tiles && M.tiles[p.mt]) return M.tiles[p.mt].safe; return null; };
    for (let t = 0; t < turns && !A.over && !B.over; t++) {
      // A: buys what it can, accepts module offers, applies every enabled module action; B: always the safe / pass option, no actions
      for (const a of E.worldActions(A).filter((x) => x.enabled).slice(0, 3)) E.worldAction(A, a.id, a.param);
      if (A.over) break;
      const w0 = A.rng.world; E.rollDice(A); E.rollDice(B);
      let ea = E.landing(A); let eb = E.landing(B);
      if (A.pending && A.pending.type === 'mech') landings++;
      // B takes the safe option on a module tile and checks it spends nothing
      if (eb && B.pending && B.pending.type === 'mech') { const sid = safeOf(B); const o = eb.options.find((x) => x.id === sid); if (!o || !o.enabled) errors.push(`${w.id}: tile ${B.pending.mt} safe option '${sid}' missing or disabled`); else { const c0 = B.cash, l0 = B.loans, n0 = B.assets.length; eb = E.choose(B, eb, sid).event; safeChecked++; if (B.cash !== c0 || B.loans !== l0 || B.assets.length !== n0) errors.push(`${w.id}: safe option '${sid}' changed money or assets`); } }
      let k = 0; while (ea && !A.over && k++ < 12) { const en = ea.options.filter((x) => x.enabled); const o = en.find((x) => x.kind === 'buy' || x.id === 'accept') || en.find((x) => ['ok', 'done', 'pass', 'decline', 'skip'].includes(x.id)) || en[0]; ea = E.choose(A, ea, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      k = 0; while (eb && !B.over && k++ < 12) { const en = eb.options.filter((x) => x.enabled); const o = en.find((x) => ['pass', 'skip', 'ok', 'done', 'decline'].includes(x.id)) || en[0]; eb = E.choose(B, eb, o.id, o.needsQty ? { qty: 1 } : {}).event; }
      void w0; if (A.over || B.over) break;
      for (const s of STREAMS) if (A.rng[s] !== B.rng[s]) { errors.push(`${w.id}/${ch.id}: stream ${s} diverged at turn ${t} (a draw depends on a decision)`); t = turns; break; }
    }
    worldDraws = A.rng.world;
    notes.push(`${w.id}/${ch.id}: ${landings} module landings, ${safeChecked} safe options checked, stream positions equal`);
    void worldDraws;
  }
  return { errors, notes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let style = null; try { style = (await import('../js/render/vocab.js')).WORLD_STYLE; } catch (e) { style = null; }
  const r = validate({ worldStyle: style }); const lint = lintModules(); const fz = fuzzModules();
  const errors = [...r.errors, ...lint, ...fz.errors];
  if (process.argv.includes('--json')) console.log(JSON.stringify({ errors, warnings: r.warnings, notes: fz.notes }, null, 1));
  else {
    for (const x of r.warnings) console.log('⚠ ' + x);
    for (const x of fz.notes) console.log('· ' + x);
    for (const x of errors) console.log('✗ ' + x);
    console.log(errors.length ? `✗ ${errors.length} error(s)` : `✓ ${E.loadedWorlds().length} worlds valid (${r.warnings.length} warnings)`);
  }
  process.exit(errors.length ? 1 : 0);
}
