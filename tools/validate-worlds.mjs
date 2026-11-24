#!/usr/bin/env node
// World config validator (worlds wave 0, DESIGN §4.4). Fails (exit 1) on any error; warnings are printed.
//
//   node tools/validate-worlds.mjs            static checks for every world (meta + full config + mechanic modules) + module draw/safe fuzz
//   node tools/validate-worlds.mjs --json     the same, as JSON
//
// validate({metas, worlds, lazyIds, …}) is exported for tests/worlds_config.test.mjs (fixtures with each error class).
// CATALOG-25 §6.4 additions: V-tier (meta.tier = 1 + max over clauses of the count-th smallest tier), V-mods (every module a world names
// exists and is attached), V-adapter (js/worlds/adapters/*: ≤ 350 lines, `uses:`), M-fict (the companies pool: unique, fictional — the
// denylist tools/data/real-names.txt), C-schema / C-free / C-band / C-draws (every content pool of every world), lazy-stream fuzz.
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
import { STREAMS, LAZY_STREAMS } from '../js/rng.js';
import { checkPool, POOL_D, POOLS } from '../js/systems/content.js';
import { COMPANIES, SECTORS } from '../js/worlds/data/companies.js';
import { clubNames, playerName, DIVS } from '../js/worlds/adapters/league.js';
import { DEALS_W13 } from '../js/content/deals-w13.js';
import { existsSync } from 'node:fs';

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
  // V-tier (CATALOG §0.3): tier(w) = 1 + max over clauses c of the count(c)-th smallest tier among c.any
  { const T = {}; const tierOf = (id, seen = new Set()) => { if (T[id] != null) return T[id]; const m = byMeta[id]; if (!m || seen.has(id)) return 99; seen.add(id);
      let t = 1; for (const c of m.unlock || []) { const ts = (c.any || []).map((x) => tierOf(x, seen)).sort((a, b) => a - b); t = Math.max(t, 1 + (ts[(c.count || 1) - 1] ?? 98)); } return (T[id] = t); };
    for (const m of metas) if (m.tier != null && tierOf(m.id) !== m.tier) err(m.id, `V-tier: meta.tier ${m.tier} ≠ computed ${tierOf(m.id)}`); }
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
    // V-mods: a world that names modules has exactly those modules attached (and meta agrees)
    if (w.modules) { const have = (w.mech || []).map((M) => M.id); for (const x of w.modules) if (!have.includes(x)) err(id, `V-mods: module '${x}' is named but not attached`); for (const x of have) if (!w.modules.includes(x)) err(id, `V-mods: module '${x}' is attached but not named`);
      if (m && m.modules && JSON.stringify(m.modules) !== JSON.stringify(w.modules)) err(id, 'V-mods: meta.modules ≠ config.modules'); }
    // lazy streams: only rules ≥ 7, only known names, and every module that draws one declares its counts
    for (const nm of w.streams || []) { if (!LAZY_STREAMS.includes(nm)) err(id, `stream '${nm}' is not a lazy stream`); if ((w.minRules || 3) < 7) err(id, `stream '${nm}' needs minRules ≥ 7`); }
    for (const M of w.mech || []) for (const nm of Object.keys(M.streams || {})) if (!(w.streams || []).includes(nm)) err(id, `module ${M.id} draws stream '${nm}' the world does not declare`);
    // content pools (C-schema, C-free, C-band, C-draws, C-empty static): every pool valid; a tile pool has a non-empty legacy fallback deck
    if (w.content) { if ((w.minRules || 3) < 7) err(id, 'content pools need minRules ≥ 7'); if (!(w.streams || []).includes('content')) err(id, 'content pools need the `content` stream');
      for (const [pool, es] of Object.entries(w.content.data || {})) { if (!POOLS.includes(pool)) err(id, `C-schema: unknown pool '${pool}'`); for (const x of checkPool(pool, es)) err(id, 'C-schema ' + x);
        for (const e of es) { if (e.worlds && !e.worlds.includes(id) && !e.worlds.includes('∞')) warn(id, `C-schema: ${e.id} is in the world's pool but not for it`);
          const g = (e.gen || {}).cost; if (g && g[0] === 'band' && !(g[1] >= 0 && g[2] <= 1)) err(id, `C-band: ${e.id} cost band [${g[1]}, ${g[2]}] outside [0, 1] of econ.band.deal`); } }
      for (const [ch, pool] of Object.entries(w.content.pools || {})) { if (!POOL_D[pool]) err(id, `C-draws: tile ${ch} → unknown pool ${pool}`); if (!(w.content.data || {})[pool]) err(id, `C-empty: tile ${ch} → pool ${pool} has no data`);
        const t = (w.tiles || {})[ch]; if (!t) err(id, `content tile ${ch} is not on the board`); else if (DECK[t.type] && !(Array.isArray(w[DECK[t.type]]) && w[DECK[t.type]].length)) err(id, `C-empty: tile ${ch} needs a non-empty legacy ${DECK[t.type]} (the pool's fallback)`); } }
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

/** M-fict (CATALOG §3.1): the companies pool — names and tickers unique, ≥ 6 per sector, no real listed company (tools/data/real-names.txt). */
export function checkCompanies(pool = COMPANIES, deny = readDeny()) {
  const errors = []; const names = new Set(), tks = new Set(); const per = {};
  for (const c of pool) {
    if (names.has(c.name)) errors.push(`M-fict: duplicate name ${c.name}`); if (tks.has(c.tk)) errors.push(`M-fict: duplicate ticker ${c.tk}`); names.add(c.name); tks.add(c.tk);
    if (!SECTORS[c.sector]) errors.push(`M-fict: ${c.key} unknown sector ${c.sector}`); per[c.sector] = (per[c.sector] || 0) + 1;
    if (!/^[A-Z]{3,5}$/.test(c.tk)) errors.push(`M-fict: ${c.key} ticker ${c.tk} must be 3–5 capital letters`);
    const words = c.name.split(/[\s־-]+/);
    if (deny.has(c.name) || deny.has(c.tk) || words.some((x) => deny.has(x))) errors.push(`M-fict: ${c.key} (${c.name} / ${c.tk}) matches a real listed company`);
    for (const k of ['beta', 'vol', 'div', 'q', 'px']) if (!Array.isArray(c[k]) || !(c[k][0] <= c[k][1])) errors.push(`M-fict: ${c.key}.${k} must be [lo ≤ hi]`);
    if (!(c.q[0] >= 0 && c.q[1] <= 1)) errors.push(`M-fict: ${c.key}.q outside [0, 1]`);
  }
  for (const s of Object.keys(SECTORS)) if ((per[s] || 0) < 6) errors.push(`M-fict: sector ${s} has ${per[s] || 0} companies (≥ 6)`);
  return errors;
}
function readDeny() { const f = join(ROOT, 'tools', 'data', 'real-names.txt'); if (!existsSync(f)) return new Set(); return new Set(readFileSync(f, 'utf8').split('\n').map((x) => x.trim()).filter((x) => x && !x.startsWith('#'))); }
/** L-fict (CATALOG §7.4, w13): the league's clubs, divisions, the first 600 generated player names and the sponsors' brands are fictional —
 *  no entry of tools/data/real-names.txt (real football clubs, leagues and players included) is a name or a whole word of one. */
export function checkLeague(deny = readDeny()) {
  const errors = []; const bad = (s) => deny.has(s) || s.split(/[\s־-]+/).some((x) => deny.has(x)) || [...deny].some((d) => d.includes(' ') && s.includes(d));
  for (const n of clubNames()) if (bad(n)) errors.push(`L-fict: club ${n} matches a real club`);
  if (new Set(clubNames()).size !== clubNames().length) errors.push('L-fict: duplicate club names');
  for (const d of DIVS) if (bad(d.n)) errors.push(`L-fict: division ${d.n} matches a real league`);
  for (let i = 1; i <= 600; i++) { const n = playerName(i); if (bad(n)) errors.push(`L-fict: player name ${n} (id ${i}) matches a real name`); }
  for (const e of DEALS_W13) for (const b of ((e.vars || {}).brand || [])) if (bad(b)) errors.push(`L-fict: sponsor ${b} matches a real name`);
  return errors;
}
/** V-adapter (CATALOG §2.1): a rule adapter (js/worlds/adapters/*.js) is ≤ 350 lines and declares `uses: [moduleIds]`. */
export function checkAdapters(dir = join(ROOT, 'js', 'worlds', 'adapters')) {
  const errors = []; if (!existsSync(dir)) return errors;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) { const src = readFileSync(join(dir, f), 'utf8'); if (src.split('\n').length > 350) errors.push(`V-adapter: ${f} > 350 lines`); if (!/\buses\s*:\s*\[/.test(src)) errors.push(`V-adapter: ${f} declares no uses: [moduleIds]`); }
  return errors;
}

/** Lint: module files use only exact arithmetic (no Math.pow / exp / log / random, no Date) — bit-identical in browser, Node and Deno. */
export function lintModules(dir = join(ROOT, 'js', 'worlds', 'mech')) {
  const errors = [];
  const adapters = join(dir, '..', 'adapters'); const files = readdirSync(dir).filter((x) => x.endsWith('.js')).map((f) => join(dir, f));
  if (dir.endsWith(join('worlds', 'mech')) && existsSync(adapters)) for (const f of readdirSync(adapters).filter((x) => x.endsWith('.js'))) files.push(join(adapters, f)); // rule adapters: the same exact-arithmetic rule
  for (const fp of files) { const f = fp.slice(dir.length + 1);
    const src = readFileSync(fp, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
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
      for (const s of [...STREAMS, ...LAZY_STREAMS]) if (A.rng[s] !== B.rng[s]) { errors.push(`${w.id}/${ch.id}: stream ${s} diverged at turn ${t} (a draw depends on a decision)`); t = turns; break; }
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
  const errors = [...r.errors, ...lint, ...fz.errors, ...checkCompanies(), ...checkAdapters(), ...checkLeague()];
  if (process.argv.includes('--json')) console.log(JSON.stringify({ errors, warnings: r.warnings, notes: fz.notes }, null, 1));
  else {
    for (const x of r.warnings) console.log('⚠ ' + x);
    for (const x of fz.notes) console.log('· ' + x);
    for (const x of errors) console.log('✗ ' + x);
    console.log(errors.length ? `✗ ${errors.length} error(s)` : `✓ ${E.loadedWorlds().length} worlds valid (${r.warnings.length} warnings)`);
  }
  process.exit(errors.length ? 1 : 0);
}
