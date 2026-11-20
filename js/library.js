// "ספריית השיעורים" — every lesson the mentor teaches is unlocked into a visible collection (DESIGN-v3 §4).
// Lessons come from the engine (LESSONS / lessons() / lessonList()); unlocks arrive on bus 'lesson' {id|ids} during
// play and in the end payload (e.lessons / e.end.lessons). Stored per device in 'rr2-library'.
//
// API: lessons() → Promise<[{id,title,text,cat?,world?,hint?}]> · unlock(ids) → newly unlocked ids · isUnlocked(id)
//      isNew(id) · markRead(id) · counts() → {have, total, fresh} · onUnlock(fn)
import { bus } from './bus.js';

const KEY = 'rr2-library';
let S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.ids)) return { ids: [...new Set(s.ids)], read: [...new Set(s.read || [])] }; } catch (e) { /* ignore */ }
  return { ids: [], read: [] };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

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
export function unlock(ids) {
  const out = [];
  for (const raw of [].concat(ids || [])) {
    const id = String(raw && typeof raw === 'object' ? raw.id : raw);
    if (!id || id === 'undefined' || S.ids.includes(id)) continue;
    S.ids.push(id); out.push(id);
  }
  if (out.length) { save(); for (const fn of listeners) { try { fn(out); } catch (e) { console.error(e); } } }
  return out;
}
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

bus.on('lesson', (p) => unlock(p && (p.ids || p.id || p.lesson)));

/** Tests only. */
export function _reset() { S = { ids: [], read: [] }; save(); }
