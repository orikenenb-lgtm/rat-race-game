// T6 practice rewind (spec §7, §8.1): go back to a decision of a free / learning game and try it differently in a BRANCH.
// • allowed only in free (incl. learn) games — never daily / weekly / challenge / history, never with a result id; every entry point
//   throws Error('rewind_ranked') for a ranked config (defence in depth: the UI never shows the entry there).
// • a branch = a T4 learning game (learn:true, no stars / achievements / ⚡ / boards) replayed from the original's action log, in its
//   own slot rr2-save-branch-<w>; metadata in rr2-branches (≤ 4). The original (rr2-save-free-<w>, rr2-save-learn-<w>, rr2-last-game)
//   is only ever READ here (saves.peek / getItem) — no code path in this file writes an origin key (AC-27 hashes them).
// • rr2-last-game = {cfg, rcfg, actions, tl, endLite, ghostsKey, at} of the last finished free/learn game (written by game.js endGame).
import * as E from './engine.js';
import * as saves from './saves.js';
import { flagFor, isRankedCfg } from './flags.js';
import { tlOf, tlUpTo } from './summary.js';

export const META_KEY = 'rr2-branches', LAST_KEY = 'rr2-last-game', MAX_BRANCHES = 4;
export const branchKey = (w) => `rr2-save-branch-${w || 'w1'}`;
export const isBranchKey = (k) => typeof k === 'string' && k.startsWith('rr2-save-branch-');
export const STR = {
  banner: '🧪 ענף תרגול — המשחק המקורי שמור', back: 'חזרה למקור', compare: 'השוואה',
  sheetTitle: 'רגעי החלטה', row: 'חודש {m} · {title} · בחרת: {chose}', rowNoChose: 'חודש {m} · {title}', cta: '🔁 לחזור לכאן',
  overlay: 'מחזירים את הזמן…',
  replaceQ: 'יש כבר ענף תרגול בעולם הזה. להחליף אותו? המשחק המקורי לא ייפגע.', replace: 'להחליף', cancel: 'ביטול',
  deleteQ: 'למחוק את ענף התרגול? המשחק המקורי לא ייפגע.', del: 'למחוק',
  errFail: 'לא הצלחנו לחזור לרגע הזה. המשחק המקורי לא נפגע.', errQuota: 'אין מספיק מקום לענף תרגול. אפשר למחוק ענף ישן.',
  lobbyCont: '🧪 ענף תרגול: חודש {m} — להמשיך', lobbyDel: 'למחוק ענף', lobbyLast: '🔁 לחזור לרגע מהמשחק האחרון',
};

let ST = null;
/** Node tests: inject a storage ({getItem,setItem,removeItem,key,length}); saves.js gets the same one. */
export function _setStorage(s) { ST = s; saves._setStorage(s); }
const store = () => ST || globalThis.localStorage;
const read = (k) => { try { return store().getItem(k); } catch (e) { return null; } };
const readJson = (k, d) => { try { const v = JSON.parse(read(k) || 'null'); return v ?? d; } catch (e) { return d; } };
/** writes are limited to branch keys and the two T6 meta keys (asserted) */
function writeKey(k, v) {
  if (!(isBranchKey(k) || k === META_KEY || k === LAST_KEY)) throw new Error('rewind_write_guard');
  store().setItem(k, v);
}

/* ---------------------------------------------------------------- ranked resume (§8.1 V3) */
/** a is a prefix of b (element-wise JSON equality) */
export function isPrefix(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length <= b.length && a.every((x, i) => JSON.stringify(x) === JSON.stringify(b[i])); }
/** the local save wins only when it is newer (ui.seq) AND its action log extends the server's; otherwise the server state */
export function pickRankedState(local, srv) {
  const seqOf = (x) => (x && x.ui && x.ui.seq) || 0;
  return local && srv && local.seed === srv.seed && seqOf(local) > seqOf(srv) && isPrefix(srv.actions || [], local.actions || []) ? local : srv;
}

/* ---------------------------------------------------------------- who may rewind (§7.1) */
const isPracticeCfg = (cfg) => !!cfg && (cfg.mode === 'free' || !cfg.mode) && !isRankedCfg(cfg) && cfg.worldId !== 'h';
export function allowed(cfg) { return !!(flagFor('rewind', cfg) && isPracticeCfg(cfg)); }
export function assertPractice(cfg) { if (!cfg || isRankedCfg(cfg)) throw new Error('rewind_ranked'); if (!isPracticeCfg(cfg)) throw new Error('rewind_mode'); }

/* ---------------------------------------------------------------- last finished game (§7.2) */
/** Only game.js endGame calls this (free / learn ends that are not themselves branches). */
export function saveLastGame({ cfg, state, endLite, ghostsKey = null }) {
  if (!cfg || isRankedCfg(cfg) || !isPracticeCfg(cfg) || cfg.slot === 'branch') return false;
  const rec = { v: 1, cfg: stripCfg(cfg), rcfg: E.replayConfig(state), actions: (state.actions || []).slice(), tl: tlOf(state), endLite: endLite || null, ghostsKey, at: Date.now() };
  try { writeKey(LAST_KEY, JSON.stringify(rec)); return true; } catch (e) { return false; }
}
export function lastGame() { const r = readJson(LAST_KEY, null); return r && Array.isArray(r.actions) && r.rcfg ? r : null; }
const stripCfg = (c) => { const o = { ...c }; for (const k of ['state', 'resume', 'checkpointTurn', 'slot']) delete o[k]; return o; };

/* ---------------------------------------------------------------- decision points (§4.4, §7.4) */
/**
 * [{k0, k, m, t, type, c, o, v}] newest last. The engine's E.decisionPoints when it exists (T6 E9); until then from the decision
 * records (dq.decisions[].k, T2) with the card start found in the log: the action right after the landing ('l') that opened the
 * card — or the decision itself for between-roll decisions (focus, story inbox, loans).
 */
export function decisionPoints(st) {
  if (!st) return [];
  if (typeof E.decisionPoints === 'function') { try { return E.decisionPoints(st); } catch (e) { /* fall back */ } }
  const A = st.actions || []; const D = (st.dq && st.dq.decisions) || [];
  const out = new Map();
  for (const d of D) {
    if (!Number.isInteger(d.k) || d.k < 0 || d.k >= A.length) continue;
    let k0 = d.k;
    if (A[d.k] && A[d.k][0] === 'c') {
      for (let j = d.k - 1; j >= 0; j--) { const c = A[j][0]; if (c === 'l') { k0 = j + 1; break; } if (c === 'r') break; }
    }
    out.set(k0, { k0, k: d.k, m: d.m, t: d.t, type: d.type, c: d.c, o: d.o, v: d.v });   // the last decision on a card wins
  }
  return [...out.values()].sort((a, b) => a.k0 - b.k0).slice(-120);
}

/* ---------------------------------------------------------------- branches */
export function branches() { const v = readJson(META_KEY, []); return Array.isArray(v) ? v.filter((x) => x && x.w) : []; }
export function branchFor(w) { return branches().find((b) => b.w === w) || null; }
/** the branch slot's save (peek: never migrates or writes) → {cfg, month} | null */
export function branchSave(w) { const c = saves.peek(branchKey(w)); return c.status === 'current' || c.status === 'old' ? { cfg: c.wrapper.cfg, month: c.state.month, state: c.state } : null; }
/** the original's state (read only): live slot via saves.peek, or the stored last game replayed */
export function originOf(meta) {
  if (!meta) return null;
  if (meta.origin === 'last') { const L = lastGame(); return L ? { cfg: L.cfg, rcfg: L.rcfg, actions: L.actions, tl: L.tl, endLite: L.endLite } : null; }
  const c = saves.peek(meta.originKey);
  if (!(c.status === 'current' || c.status === 'old' || c.status === 'over')) return null;
  let st; try { st = E.deserialize(c.state); } catch (e) { return null; }
  if (!st.ui && c.state && c.state.ui) st.ui = c.state.ui;   // keep the ui block (UI timeline, branch info) of the saved state
  return { cfg: c.wrapper.cfg, rcfg: E.replayConfig(st), actions: st.actions || [], tl: tlOf(st), state: st, wrapperUi: c.wrapper.ui || null };
}
/**
 * Create (or replace) the branch of world w at card start k0. origin 'live' (the live free/learn slot) or 'last' (rr2-last-game).
 * opts.confirmReplace() → Promise<boolean> when a branch exists. → {ok, cfg (start config for game.startGame), ms} | {ok:false, error}
 */
export async function createBranch({ origin = 'live', w, k0, originKey = null, cfg = null } = {}, opts = {}) {
  const t0 = (globalThis.performance || Date).now();
  let src = null, srcCfg = null, fromBranch = false;
  if (origin === 'last') {
    const L = lastGame(); if (!L) return { ok: false, error: 'no_origin' };
    assertPractice(L.cfg);
    src = { rcfg: L.rcfg, actions: L.actions, tl: L.tl }; srcCfg = L.cfg; w = w || L.cfg.worldId; originKey = LAST_KEY;
  } else {
    if (cfg) assertPractice(cfg);
    if (!originKey) return { ok: false, error: 'no_origin' };
    // branching from a branch replays the BRANCH's own log (k0 is a point of that log) and replaces it; originKey keeps the original
    fromBranch = isBranchKey(originKey);
    const o = originOf({ origin: 'live', originKey }); if (!o) return { ok: false, error: 'no_origin' };
    assertPractice(o.cfg || cfg);
    src = o; srcCfg = o.cfg || cfg; w = w || srcCfg.worldId;
    if (fromBranch) { const m = (o.state && o.state.ui && o.state.ui.branch) || (o.wrapperUi && o.wrapperUi.branch) || branchFor(w) || {}; originKey = m.originKey || null; origin = m.origin || 'live'; if (!originKey) return { ok: false, error: 'no_origin' }; }
  }
  const n = src.actions.length;
  if (!Number.isInteger(k0) || k0 < 0 || k0 > n) return { ok: false, error: 'bad_k0' };
  if (branchFor(w) && opts.confirmReplace && !fromBranch && !(await opts.confirmReplace())) return { ok: false, error: 'cancelled' };   // branching from the branch itself replaces it without asking
  let S2;
  try { S2 = E.replay({ ...src.rcfg, learn: true }, src.actions.slice(0, k0)); }
  catch (e) { return { ok: false, error: 'replay', msg: String(e && e.message) }; }
  const meta = { w, origin, originKey, k0, month: S2.month, label: '', at: Date.now() };
  const ui = saves.normalizeUi({});
  ui.branch = { k0, originKey, origin, at: meta.at };
  if (!tlOf(S2) && src.tl) ui.tl = tlUpTo(src.tl, S2.month);          // UI-side timeline: the original's months up to the branch point
  S2.ui = ui;
  const bcfg = { ...stripCfg(srcCfg), worldId: S2.worldId, charId: S2.charId, seed: S2.seed, mode: 'free', learn: true, slot: 'branch' };
  delete bcfg.resultId; delete bcfg.challengeId; delete bcfg.groupId; delete bcfg.duel; delete bcfg.title;
  const r = saves.write(branchKey(w), bcfg, S2);
  if (!r.ok) return { ok: false, error: r.quota ? 'quota' : 'write' };
  const list = branches().filter((b) => b.w !== w); list.push(meta);
  try { writeKey(META_KEY, JSON.stringify(list.slice(-MAX_BRANCHES))); } catch (e) { /* the branch itself is saved; meta is best effort */ }
  return { ok: true, cfg: { ...bcfg, resume: true }, key: branchKey(w), month: S2.month, ms: Math.round((globalThis.performance || Date).now() - t0) };
}
/** delete only the branch slot + its meta entry (the caller confirms) */
export function deleteBranch(w) {
  try { store().removeItem(branchKey(w)); } catch (e) { /* ignore */ }
  const list = branches().filter((b) => b.w !== w);
  try { writeKey(META_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  return true;
}
/** the comparison data for an open branch: the original's timeline, cut to the months both have played (§7.5) */
export function compareData(branchState) {
  const b = branchState && branchState.ui && branchState.ui.branch; if (!b) return null;
  const o = originOf({ origin: b.origin, originKey: b.originKey });
  if (!o) return null;
  const tl = o.tl || (o.state ? tlOf(o.state) : null);
  return { originTl: tl, upTo: branchState.month, endLite: o.endLite || null, origin: b.origin };
}
