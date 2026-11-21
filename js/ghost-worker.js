// T6 ghost players (spec §2): four archetype policies play the player's own configuration (same seed → same dice, tiles, cards,
// sealed outcomes) through the UNCHANGED engine. Only decisions differ: "same luck, different decisions".
//
// This file is both
//   • a module Web Worker (new Worker(new URL('./ghost-worker.js', import.meta.url), {type:'module'})) speaking protocol v1 (§2.5), and
//   • a plain module (GhostSet) used by the main-thread idle fallback (js/ghosts.js, only after the game ended) and by Node tests.
//
// Information limit (R3, §2.2) is enforced HERE as well as in ghosts.view(): while no 'finish' was received, a 'rows' message never
// carries a row with m > upTo nor a mark with m ≥ upTo. The main thread never receives a ghost state.
//
// Policies: the archetypes are owned by the engine lane. They are loaded by feature detection from (in order) ./systems/archetypes.js
// and ./rivals/policies.js (export ARCHETYPES = {saver, founder, diversified, gambler}, ARCH_V). Two contracts are accepted:
//   ARCH_API === 2 (spec §2.3): decide(pv, ctx) → {id, params} | [id, params]; between(pv, ctx) → [action…] (applied here)
//   otherwise (tools/sim.mjs shape): decide(st, ev, ctx) → [id, params]; between(st, ctx) applies its own actions.
// No policy module → every ghost reports {t:'error', code:'no_policies'} and the UI hides the rivals (never invents a persona's play).
import * as E from './engine.js';
import { tlNew, tlPush, tlRowOf, tlRows, tlOf, dimsOf, TL_COLS } from './summary.js';

export const PROTO_V = 1;
export const ARCHS = ['saver', 'founder', 'diversified', 'gambler'];
const ARCH_SALT = { saver: 0x51A7E001, founder: 0x51A7E002, diversified: 0x51A7E003, gambler: 0x51A7E004 };
const QUIZ_SKILL = { cautious: 0.8, smart: 0.95, reckless: 0.4, tapper: 0.5 };
const STEP_GUARD = 400;   // rolls per ghost-month (a stuck policy is an error, never a hang)

/** mulberry32 on a mixed seed — the archetype's own tie-break PRNG; never touches st.rng */
export function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function ghostCfg(cfg, arch) { return { ...cfg, mentor: 'hint', learn: false, self: arch }; }

let POL = null;
/** Load the archetype module once (feature detection). → {mod, api} | null */
export async function loadPolicies(urls = ['./systems/archetypes.js', './rivals/policies.js']) {
  if (POL) return POL;
  for (const u of urls) {
    try { const mod = await import(u); if (mod && mod.ARCHETYPES) { POL = { mod, api: mod.ARCH_API === 2 ? 2 : 1, v: mod.ARCH_V ?? 0 }; return POL; } } catch (e) { /* not there yet */ }
  }
  return null;
}
export function setPolicies(mod) { POL = mod ? { mod, api: mod.ARCH_API === 2 ? 2 : 1, v: mod.ARCH_V ?? 0 } : null; return POL; }

function applyAction(st, a) {
  if (!Array.isArray(a) || st.over) return;
  switch (a[0]) {
    case 'loan': E.takeLoan(st, a[1] || undefined); break;
    case 'repay': E.repayLoan(st, a[1] || undefined); break;
    case 'payCredit': E.payCredit(st); break;
    case 'plan': E.setPlan(st, a[1]); break;
    case 'focus': if (typeof E.setFocus === 'function') E.setFocus(st, a[1], a[2] ?? 0); break;
    case 'save': E.moveSavings(st, a[1]); break;
    case 'auto': E.setAutoInvest(st, a[1]); break;
    case 'invest': E.invest(st, a[1], a[2]); break;
    default: break;
  }
}

/** One ghost game. */
class Ghost {
  constructor(cfg, arch, pol) {
    this.arch = arch; this.pol = pol; this.P = pol.mod.ARCHETYPES[arch];
    if (!this.P) throw Object.assign(new Error('no_policy'), { code: 'no_policy' });
    this.st = E.createGame(ghostCfg(cfg, arch));
    this.rnd = prng((cfg.seed >>> 0) ^ ARCH_SALT[arch]);
    this.own = tlNew(this.st.month); tlPush(this.own, tlRowOf(E.metrics(this.st)));
    this.sentRows = 0; this.sentMarks = 0; this.error = null; this.end = null;
  }
  get month() { return this.st.month; }
  get over() { return !!this.st.over; }
  /** the timeline: the engine's st.tl when it exists, else the rows recorded here (same columns) */
  tl() { const e = tlOf({ tl: this.st.tl }); return e || this.own; }
  marks() { return Array.isArray(this.st.marks) ? this.st.marks : []; }
  resolve(ev0) {
    const st = this.st; let ev = ev0; let n = 0;
    while (ev && !st.over) {
      let choice;
      if (ev.auto) choice = [ev.options[0].id];
      else if (ev.type === 'mystery' && ev.data && ev.data.kind === 'quiz') {   // quizzes are answered by the driver (archetype quizSkill)
        const c = (E.getWorld(st.worldId).mystery || []).find((x) => x.kind === 'quiz' && x.text === ev.data.question);
        const sk = this.P.quizSkill ?? QUIZ_SKILL[this.P.quiz] ?? 0.7;
        choice = c ? [this.rnd() < sk ? 'a' + c.correct : 'a' + ((c.correct + 1) % c.answers.length)] : [ev.options.find((o) => o.enabled).id];
      } else if (n >= 6) choice = [(ev.options.find((o) => o.enabled && ['done', 'pass', 'ok'].includes(o.id)) || ev.options.find((o) => o.enabled)).id];
      else if (this.pol.api === 2) {
        const pv = E.publicView(st, { freeze: false, event: ev });
        const r = this.P.decide(pv, { rnd: this.rnd, n, tables: { dd: E.DD, cycle: E.CY, focus: E.FC, rivals: E.RIVALS } });
        choice = !r ? [] : Array.isArray(r) ? r : [r.id, r.params];
        if (!choice[0]) choice = [(ev.options.find((o) => o.enabled && ['ok', 'done', 'pass', 'skip'].includes(o.id)) || ev.options.find((o) => o.enabled)).id];
      } else choice = this.P.decide(st, ev, { r: this.rnd, n });
      let res = E.choose(st, ev, choice[0], choice[1] || {});
      if (!res.ok) { const f = ev.options.find((o) => o.enabled && ['done', 'pass', 'ok'].includes(o.id)) || ev.options.find((o) => o.enabled); res = E.choose(st, ev, f.id, f.needsQty ? { qty: 1 } : {}); }
      n++; ev = res.event;
      if (n > 40) throw Object.assign(new Error('event_loop'), { code: 'event_loop' });
    }
  }
  between() {
    const st = this.st;
    if (this.pol.api === 2) { const acts = this.P.between(E.publicView(st, { freeze: false }), { rnd: this.rnd, n: 0, tables: { dd: E.DD, cycle: E.CY, focus: E.FC, rivals: E.RIVALS } }) || []; for (const a of acts) applyAction(st, a); }
    else if (this.P.between) this.P.between(st, { r: this.rnd });
  }
  /** play until the month moves on (or the game ends / the cap) */
  stepMonth(cap = Infinity) {
    const st = this.st; const m0 = st.month; let g = 0;
    while (!st.over && st.month === m0 && st.month < cap) {
      if (g++ > STEP_GUARD) throw Object.assign(new Error('step_guard'), { code: 'step_guard' });
      this.between(); if (st.over) break;
      if (st.pending) { this.resolve(E.currentEvent(st)); if (st.over) break; }
      E.rollDice(st);
      this.resolve(E.landing(st));
    }
    if (!tlOf({ tl: st.tl })) tlPush(this.own, tlRowOf(E.metrics(st)));
  }
  /** the result: engine checkEnd() when the game ended, else a 'capped' summary from engine output only */
  result(extraDims = {}) {
    const st = this.st; const tl = this.tl(); const m = E.metrics(st);
    let end = st.result || E.checkEnd(st);
    if (!end) { const s = E.summaryForServer(st); end = { status: 'capped', reason: 'cap', months: st.month, stars: 0, progress: s.progress, stats: s.stats, learning: s.learning, happiness: s.life.happiness }; }
    const dims = dimsOf(end, { m, tl, worldId: st.worldId, charId: st.charId, ...extraDims });
    return { status: end.status, months: end.months, reason: end.reason || null, stars: end.stars || 0, tl: copyTl(tl), marks: this.marks().slice(), recap: { dims } };
  }
}
const copyTl = (tl) => { const o = { v: 1, step: tl.step || 1, from: tl.from || 1 }; for (const c of TL_COLS) o[c] = (tl[c] || []).slice(); return o; };

/**
 * The four ghosts of one key. post(msg) receives protocol messages. All work is done in step() calls (one ghost-month each),
 * so a caller can yield between them (worker: setTimeout 0; main-thread fallback: requestIdleCallback).
 */
export class GhostSet {
  constructor({ key, cfg, archs = ARCHS, pol = POL, post = () => {} }) {
    this.key = key; this.cfg = cfg; this.post = post; this.upTo = 0; this.cap = null; this.finished = false; this.doneSent = new Set();
    this.ghosts = archs.map((a) => {
      if (!pol) { post({ t: 'error', key, arch: a, code: 'no_policies' }); return { arch: a, error: 'no_policies' }; }
      try { return new Ghost(cfg, a, pol); } catch (e) { post({ t: 'error', key, arch: a, code: e.code || 'init' }); return { arch: a, error: e.code || 'init' }; }
    });
  }
  /** upTo is monotonic: a lower value is ignored */
  advance(upTo) { if (+upTo > this.upTo) this.upTo = +upTo; }
  finish(cap) { this.finished = true; this.cap = Math.max(+cap || 0, this.upTo); }
  live() { return this.ghosts.filter((g) => !g.error); }
  /** one unit of work; → true when more work is pending */
  step() {
    const target = this.finished ? this.cap : this.upTo;
    const g = this.live().filter((x) => !x.over && x.month < target).sort((a, b) => a.month - b.month)[0];
    if (g) {
      try { g.stepMonth(this.finished ? this.cap + 1 : Infinity); } catch (e) { g.error = e.code || 'throw'; this.post({ t: 'error', key: this.key, arch: g.arch, code: g.error, msg: String(e && e.message).slice(0, 120) }); }
      if (!g.error && (g.over || g.month >= target)) this.flush(g);
      return true;
    }
    for (const x of this.live()) this.flush(x);
    if (this.finished) for (const x of this.live()) if (!this.doneSent.has(x.arch)) { this.doneSent.add(x.arch); this.post({ t: 'done', key: this.key, arch: x.arch, end: x.result() }); }
    return false;
  }
  /** post the new rows / marks of one ghost — R3 clamp: m ≤ upTo for rows, m < upTo for marks (unless finished) */
  flush(g) {
    if (this.finished) return; // the full data goes in 'done'
    const at = this.upTo;
    const rows = tlRows(g.tl()).filter((r) => r[0] <= at);
    const marks = g.marks().filter((k) => k[0] < at);
    const nr = rows.slice(g.sentRows), nm = marks.slice(g.sentMarks);
    if (!nr.length && !nm.length) return;
    g.sentRows = rows.length; g.sentMarks = marks.length;
    this.post({ t: 'rows', key: this.key, arch: g.arch, at, rows: nr, marks: nm, over: g.over && g.month <= at ? { m: g.month, status: g.st.over } : null });
  }
}

/* ============================================================ the worker side */
const isWorker = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope; // eslint-disable-line no-undef
if (isWorker) {
  const sets = new Map(); let timer = 0; let queue = Promise.resolve();
  const post = (m) => self.postMessage(m);
  const pump = () => {
    timer = 0;
    for (const s of sets.values()) { if (s.step()) { timer = setTimeout(pump, 0); return; } }
  };
  const kick = () => { if (!timer) timer = setTimeout(pump, 0); };
  self.onmessage = (ev) => {
    const m = ev.data || {};
    queue = queue.then(async () => {
      if (m.t === 'init') {
        if (m.v !== PROTO_V) { post({ t: 'error', key: m.key, arch: null, code: 'proto' }); return; }
        const pol = await loadPolicies();
        for (const k of sets.keys()) if (k !== m.key) sets.delete(k);     // one game at a time
        sets.set(m.key, new GhostSet({ key: m.key, cfg: m.cfg, archs: m.archs || ARCHS, pol, post }));
        post({ t: 'ready', key: m.key, pol: !!pol, archV: pol ? pol.v : null });
      } else if (m.t === 'advance') { const s = sets.get(m.key); if (s) { s.advance(m.upTo); kick(); } }
      else if (m.t === 'finish') { const s = sets.get(m.key); if (s) { s.finish(m.cap); kick(); } }
      else if (m.t === 'drop') sets.delete(m.key);
    }).catch((e) => post({ t: 'error', key: m.key, arch: null, code: 'worker', msg: String(e && e.message).slice(0, 120) }));
  };
}
