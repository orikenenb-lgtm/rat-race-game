// "ספריית השיעורים" — every lesson the mentor teaches is unlocked into a visible collection (DESIGN-v3 §4).
// Lessons come from the engine (LESSONS / lessons() / lessonList()); unlocks arrive on bus 'lesson' {id|ids} during
// play and in the end payload (e.lessons / e.end.lessons). Stored per device in 'rr2-library'.
//
// API: lessons() → Promise<[{id,title,text,cat?,world?,hint?}]> · unlock(ids, list?) → newly unlocked ids · isUnlocked(id)
//      isNew(id) · markRead(id) · counts() → {have, total, fresh} · onUnlock(fn)
//      T4: contextOf(id) → {m, w, ev, num, at}|null (where you first learned it) · meta(id) → LESSON_META[id]|null
//          markPracticed(topic, right) · practiceStats() → {[topic]: {n, right}} · practiceTotals() → {n, right}
// Storage v2 (T4 §9.4): {v:2, ids, read, ctx:{[id]: {m, w, ev, num:{label,value}|null, at}}, practiced:{[topic]: {n, right}}}.
// A v1 value ({ids, read}) reads as v2 with empty maps; unknown extra keys are kept (written back additively).
import { bus } from './bus.js';
import { LESSON_META } from './data/lessons-meta.js';

const KEY = 'rr2-library';
let S = load();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.ids)) {
      const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
      return { ...s, v: 2, ids: [...new Set(s.ids.map(String))], read: [...new Set((Array.isArray(s.read) ? s.read : []).map(String))], ctx: { ...obj(s.ctx) }, practiced: { ...obj(s.practiced) } };
    }
  } catch (e) { /* ignore */ }
  return { v: 2, ids: [], read: [], ctx: {}, practiced: {} };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
const short = (t, n) => String(t ?? '').slice(0, n);
/** A lesson's context from the engine (E-6: {month, worldId, event, num}) or an already stored one ({m, w, ev, num}). */
function ctxOf(c) {
  if (!c || typeof c !== 'object') return null;
  const m = Math.floor(+(c.month ?? c.m)); const w = c.worldId ?? c.w;
  const num = c.num && typeof c.num === 'object' && c.num.label != null ? { label: short(c.num.label, 60), value: c.num.value == null ? null : (typeof c.num.value === 'number' ? c.num.value : short(c.num.value, 40)) } : null;
  if (!(m > 0)) return null;
  return { m, w: typeof w === 'string' ? short(w, 8) : null, ev: c.event ?? c.ev ? short(c.event ?? c.ev, 80) : null, num, at: Date.now() };
}

let LIST = null; let listP = null;
const norm = (l, i) => (typeof l === 'string' ? { id: 'l' + i, title: l, text: l } : { ...l, id: String(l.id ?? l.key ?? 'l' + i), title: l.title || l.name || '', text: l.text || l.body || l.desc || '', cat: l.cat || l.topic || l.category || '' });
/** Engine lesson list (cached). Accepts the shapes the engine may export. */
export function lessons() {
  if (LIST) return Promise.resolve(LIST);
  if (!listP) listP = (async () => {
    let raw = null;
    try {
      const E = await import('./engine.js');
      raw = E.LESSONS || (typeof E.lessonsList === 'function' && E.lessonsList()) || (typeof E.lessons === 'function' && E.lessons()) || (typeof E.lessonList === 'function' && E.lessonList()) || null;
    } catch (e) { raw = null; }
    if (!raw) { try { const L = await import('./life.js'); raw = L.LESSONS || (typeof L.lessons === 'function' && L.lessons()) || null; } catch (e) { raw = null; } }
    if (raw && !Array.isArray(raw)) raw = Object.entries(raw).map(([id, v]) => (typeof v === 'string' ? { id, title: v, text: v } : { id, ...v }));
    LIST = (raw || []).map(norm).filter((l) => l.title);
    return LIST;
  })();
  return listP;
}
/** For tests / the engine contract changing late. */
export function _setLessons(list) { LIST = (list || []).map(norm); listP = Promise.resolve(LIST); }

const listeners = new Set();
export function onUnlock(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** Unlock ids; `list` (the engine's out.lessons: [{id, ctx}]) — or objects in `ids` themselves — carry the context.
 *  The FIRST context wins (where you first learned it); a later unlock never overwrites it. */
export function unlock(ids, list) {
  const out = []; let ctxChanged = false;
  const byId = {};
  for (const l of [].concat(list || [], ids || [])) if (l && typeof l === 'object' && l.id != null && l.ctx) byId[String(l.id)] ||= l.ctx;
  for (const raw of [].concat(ids || [])) {
    const id = String(raw && typeof raw === 'object' ? raw.id : raw);
    if (!id || id === 'undefined') continue;
    if (!S.ctx[id] && byId[id]) { const c = ctxOf(byId[id]); if (c) { S.ctx[id] = c; ctxChanged = true; } }
    if (S.ids.includes(id)) continue;
    S.ids.push(id); out.push(id);
  }
  if (out.length || ctxChanged) save();
  if (out.length) for (const fn of listeners) { try { fn(out); } catch (e) { console.error(e); } }
  return out;
}
export const contextOf = (id) => S.ctx[String(id)] || null;
/** Teaser / hint / worked example / simplification label (js/data/lessons-meta.js). */
export const meta = (id) => LESSON_META[String(id)] || null;
/** In-game practice answer (bus 'practice' {topic, right}). Records only — nothing spendable. */
export function markPracticed(topic, right) {
  topic = String(topic || ''); if (!/^[a-z0-9_]{2,32}$/.test(topic)) return null;
  const p = S.practiced[topic] || { n: 0, right: 0 };
  S.practiced[topic] = { n: (Math.floor(+p.n) || 0) + 1, right: (Math.floor(+p.right) || 0) + (right ? 1 : 0) };
  save();
  return { ...S.practiced[topic] };
}
export function practiceStats() { return JSON.parse(JSON.stringify(S.practiced)); }
export function practiceTotals() { let n = 0, right = 0; for (const v of Object.values(S.practiced)) { n += Math.floor(+v.n) || 0; right += Math.floor(+v.right) || 0; } return { n, right }; }
export const isUnlocked = (id) => S.ids.includes(String(id));
export const isNew = (id) => S.ids.includes(String(id)) && !S.read.includes(String(id));
export function markRead(id) { id = String(id); if (!S.read.includes(id)) { S.read.push(id); save(); } }
export function counts() {
  const total = LIST ? LIST.length : 0;
  const known = LIST ? new Set(LIST.map((l) => l.id)) : null;
  const have = known ? S.ids.filter((id) => known.has(id)).length : S.ids.length;
  const fresh = S.ids.filter((id) => !S.read.includes(id) && (!known || known.has(id))).length;
  return { have, total, fresh };
}
export function unlockedIds() { return [...S.ids]; }

bus.on('lesson', (p) => unlock(p && (p.ids || p.id || p.lesson), p && p.list));
bus.on('practice', (p) => { if (p && p.topic) markPracticed(p.topic, !!p.right); });

/** Tests only. */
export function _reset() { S = { v: 2, ids: [], read: [], ctx: {}, practiced: {} }; save(); }
