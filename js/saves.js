// מירוץ העכברים — client save shell: classify, backup before risky conversions, quarantine corrupt data, quota handling,
// boot sweep. UI-side module: saves → engine is allowed, engine → saves NEVER (verify pin, tests/render_api.test.mjs T-graph).
// Versions are always relative to the engine's exported SAVE_VERSION (3 today, 4 after the engine release): never hard-coded.
// Nothing here touches storage at import time (Node tests inject a storage with _setStorage).
import * as E from './engine.js';

export const APP_VERSION = 'nl1', WRAP_V = 3, BAK = 'rr2-bak:', QUAR = 'rr2-quarantine:';
export const MAX_BAK_PER_SLOT = 2, MAX_BAK_TOTAL = 8, BAK_BYTES_SOFT = 256 * 1024;
const SLOT = 'rr2-save-';
const PENDING = 'rr2-pending-finish';
/** keys the boot sweep checks besides the save slots: [key, kind] (obj = must be a JSON object, any = any JSON). */
const SWEEP_KEYS = [['rr2-progress', 'obj'], ['rr-player', 'obj'], [PENDING, 'arr'], ['rr2-energy', 'any'], ['rr2-library', 'any'], ['rr2-settings', 'any'],
  ['rr2-coach', 'any'], ['rr2-fallback', 'any'], ['rr2-flags', 'any'], ['rr2-seen-chal', 'any'], ['rr2-quiz-credit', 'any'],
  ['rr2-ghosts', 'arr'], ['rr2-branches', 'arr'], ['rr2-last-game', 'obj']];   // T6 §11.2 note 8 (rr2-ghosts is evictable; branch saves are rr2-save-branch-<w>)
/** never evicted to make room */
const NEVER_EVICT = /^(rr2-save-|rr2-progress$|rr-player$|rr2-pending-finish$|rr2-energy$)/;

/** Save messages (UI strings, Hebrew). */
export const STR = {
  S1t: 'המשחק הזה נשמר בגרסה חדשה יותר',
  S1b: 'כנראה שיחקת בו בגרסה מעודכנת של מירוץ העכברים. רענן את הדף כדי לקבל את הגרסה החדשה ולהמשיך מאותה נקודה. השמירה לא נמחקה.',
  S1tag: 'שמירה מגרסה חדשה',
  reload: 'רענון הדף', lobby: 'חזרה ללובי',
  S2: 'עדכנו את המשחק השמור לגרסה החדשה. עותק של המקור נשמר במכשיר.',
  S3: 'לא הצלחנו להמיר את המשחק השמור לגרסה הזאת. שמרנו עותק שלו, ומתחילים משחק חדש.',
  S4: 'משחק שמור אחד נפגם ולא ניתן לטעינה. שמרנו עותק שלו במכשיר.',
  S5: 'לא הצלחנו לטעון את ההתקדמות שלך באתגר. המשחק לא התחיל מחדש. נסה שוב בעוד רגע.',
  S6t: 'אין מקום לגיבוי',
  S6b: 'לפני שמעדכנים משחק שמור אנחנו שומרים עותק של המקור, אבל אין מספיק מקום במכשיר. אפשר להמשיך בלי גיבוי או לחזור ללובי.',
  S6go: 'להמשיך בלי גיבוי',
  S7: 'אין מקום במכשיר לשמור את המשחק. אפשר להמשיך לשחק, אבל אם תסגור את הדף ההתקדמות תאבד. כדאי לפנות מקום בדפדפן או לצאת מגלישה בסתר.',
  S7b: 'הדפדפן לא מאפשר לשמור את המשחק במכשיר הזה. אפשר להמשיך לשחק, אבל אם תסגור את הדף ההתקדמות תאבד. כדאי לאפשר שמירת נתונים לאתר הזה או לצאת מגלישה בסתר.',
  S8: 'נתוני ההתקדמות במכשיר נפגמו. שמרנו עותק שלהם. אם יש לך כינוי, הכוכבים וההישגים יחזרו מהשרת.',
  S9: 'פרטי הכינוי במכשיר נפגמו. שמרנו עותק שלהם. אפשר לשחזר את החשבון עם קוד השחזור.',
  S10: 'תוצאה של אתגר שעוד לא נשלחה לשרת נפגמה. שמרנו עותק שלה במכשיר.',
  S11: 'המשחק השמור שלך חזר, ואפשר להמשיך ממנו.',
  // T6 verify D4: {w} = the world's name
  S13: 'כדי לשמור את המשחק פינינו מקום במכשיר: ענף התרגול של {w} נמחק. המשחק המקורי שלו לא נפגע.',
  S12: 'לא הצלחנו לטעון את המשחק. בדוק את החיבור ורענן את הדף.',
};

/* ------------------------------------------------------------ storage access (injectable) */
let ST = null;
/** Node tests: use this storage ({getItem, setItem, removeItem, key(i), length}). null = globalThis.localStorage. */
export function _setStorage(s) { ST = s; checked.clear(); }
const store = () => ST || globalThis.localStorage;
function get(k) { try { return store().getItem(k); } catch (e) { return null; } }
function del(k) { try { store().removeItem(k); return true; } catch (e) { return false; } }
/** throws (quota) — callers decide */
function put(k, v) { store().setItem(k, v); }
const storageOk = () => { try { return !!store(); } catch (e) { return false; } };
function keys() {
  const out = [];
  // store() itself may throw (SecurityError: blocked site data)
  try { const s = store(); const n = s.length; for (let i = 0; i < n; i++) { const k = s.key(i); if (k != null) out.push(k); } } catch (e) { /* ignore */ }
  return out;
}
const engV = () => Number(E.SAVE_VERSION) || 0;
let lastAt = 0;
const now = () => { lastAt = Math.max(Date.now(), lastAt + 1); return lastAt; };
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

export function isQuotaError(e) {
  if (!e) return false;
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014;
}

/* ------------------------------------------------------------ classification */
/** Classify an engine state object (or JSON string) on its own (e.g. a ranked server checkpoint). */
export function classifyState(st, wrapperV = WRAP_V) {
  if (typeof st === 'string') { try { st = JSON.parse(st); } catch (e) { return { status: 'corrupt' }; } }
  if (!isObj(st)) return { status: 'corrupt' };
  const stateV = st.v;
  if (typeof stateV !== 'number') return { status: 'old', state: st, stateV };
  if (stateV > engV() || wrapperV > WRAP_V) return { status: 'future', state: st, stateV };
  if (st.over) return { status: 'over', state: st, stateV };
  if (stateV < engV()) return { status: 'old', state: st, stateV };
  return { status: 'current', state: st, stateV };
}
/** Pure classification of a raw slot string, no writes, no deserialize. */
export function classify(raw) {
  if (raw == null) return { status: 'empty' };
  let w;
  try { w = JSON.parse(raw); } catch (e) { return { status: 'corrupt' }; }
  if (!isObj(w)) return { status: 'corrupt' };
  let state = w.state;
  if (typeof state === 'string') { try { state = JSON.parse(state); } catch (e) { return { status: 'corrupt' }; } }
  if (!isObj(state)) return { status: 'corrupt' };
  const wv = typeof w.v === 'number' ? w.v : 2; // missing v = legacy wrapper v2
  const c = classifyState(state, wv);
  return { ...c, wrapper: w, state };
}
/** classify(the slot's current content) */
export function peek(key) { return classify(get(key)); }

/* ------------------------------------------------------------ backups */
function readBak(bk) {
  try { const r = JSON.parse(get(bk)); if (isObj(r) && Array.isArray(r.items)) return { v: 1, items: r.items.filter((x) => isObj(x) && typeof x.raw === 'string') }; } catch (e) { /* overwrite */ }
  return { v: 1, items: [] };
}
function svOf(raw) { try { const w = JSON.parse(raw); const s = typeof w.state === 'string' ? JSON.parse(w.state) : w.state; return typeof s.v === 'number' ? s.v : null; } catch (e) { return null; } }
function appOf(raw) { try { const w = JSON.parse(raw); return typeof w.app === 'string' ? w.app : null; } catch (e) { return null; } }
/** All backup items: [{bk, slot, idx, item}] */
function allItems() {
  const out = [];
  for (const k of keys()) if (k.startsWith(BAK)) readBak(k).items.forEach((item, idx) => out.push({ bk: k, slot: k.slice(BAK.length), idx, item }));
  return out;
}
function bytesUsed() {
  let n = 0;
  for (const k of keys()) if (k.startsWith(BAK) || k.startsWith(QUAR)) n += k.length + String(get(k) || '').length;
  return n;
}
/** Remove one backup item (by identity of `at` + raw) from its key. */
function dropItem(bk, item) {
  const rec = readBak(bk);
  const items = rec.items.filter((x) => !(x.at === item.at && x.raw === item.raw));
  if (!items.length) return del(bk);
  try { put(bk, JSON.stringify({ v: 1, items })); return true; } catch (e) { return false; }
}
/** Eviction candidates in order: non-future backups oldest first, then quarantine oldest first, then future backups oldest first. */
function evictionList({ keep = null, protectSlotFuture = null, withQuarantine = true, withFuture = true } = {}) {
  const items = allItems().filter((x) => !(keep && x.item === keep) && !(keep && x.item.at === keep.at && x.item.raw === keep.raw));
  const nonF = items.filter((x) => x.item.reason !== 'future').sort((a, b) => a.item.at - b.item.at);
  const fut = items.filter((x) => x.item.reason === 'future' && x.slot !== protectSlotFuture).sort((a, b) => a.item.at - b.item.at);
  const out = nonF.map((x) => ({ kind: 'bak', ...x }));
  if (withQuarantine) {
    const q = keys().filter((k) => k.startsWith(QUAR)).map((k) => { let at = 0; try { at = +JSON.parse(get(k)).at || 0; } catch (e) { /* 0 */ } return { kind: 'quar', key: k, at }; }).sort((a, b) => a.at - b.at);
    out.push(...q);
  }
  if (withFuture) out.push(...fut.map((x) => ({ kind: 'bak', ...x })));
  return out;
}
function evictOne(c) { return c.kind === 'quar' || c.kind === 'key' ? del(c.key) : dropItem(c.bk, c.item); }
/** T6 review M3 — re-computable / practice data goes BEFORE any T1 backup: the ghost cache (rr2-ghosts), then other worlds' practice
 *  branches (rr2-save-branch-<w>, oldest first; never `except`). */
const BRANCH = 'rr2-save-branch-';
function softList(except) {
  const out = [];
  if (get('rr2-ghosts') != null) out.push({ kind: 'key', key: 'rr2-ghosts' });
  const savedAt = (k) => { try { return +JSON.parse(get(k)).savedAt || 0; } catch (e) { return 0; } };
  out.push(...keys().filter((k) => k.startsWith(BRANCH) && k !== except).map((k) => ({ kind: 'key', key: k, at: savedAt(k) })).sort((a, b) => a.at - b.at));
  return out;
}
/** T6 verify D4 (spec §7.2): soft data is removed only when that makes the write succeed. tryPut() takes soft items one by one
 *  (ghosts, then other branches) and retries; when the write still fails every taken item is PUT BACK (the space it used is free
 *  again, because nothing was written). A branch that did go is recorded (takeRemovedBranches) and its rr2-branches entry dropped. */
function softTake(except) {
  const taken = [];
  return {
    taken,
    *steps() { for (const c of softList(except)) { const raw = get(c.key); if (raw == null || !del(c.key)) continue; taken.push([c.key, raw]); yield c; } },
    rollback() { for (let i = taken.length - 1; i >= 0; i--) { try { put(taken[i][0], taken[i][1]); } catch (e) { /* cannot happen: its own space is free */ } } taken.length = 0; },
    commit() { const gone = taken.map(([k]) => k).filter((k) => k.startsWith(BRANCH)); if (gone.length) branchesGone(gone); taken.length = 0; return gone; },
  };
}
const removedLog = [];
function branchesGone(keys0) {
  const ws = keys0.map((k) => k.slice(BRANCH.length));
  for (const w of ws) if (!removedLog.includes(w)) removedLog.push(w);
  try { const v = JSON.parse(get('rr2-branches') || '[]'); if (Array.isArray(v)) put('rr2-branches', JSON.stringify(v.filter((b) => !(b && ws.includes(b.w))))); } catch (e) { /* the meta is best effort */ }
}
/** worlds whose practice branch was removed to make room since the last call (the shell tells the player once) */
export function takeRemovedBranches() { return removedLog.splice(0); }
/** Enforce the voluntary caps (items and bytes); never evicts `keep`. These are soft limits: they only drop ordinary
 *  backups, never 'future' backups or quarantined data — those go only under real quota pressure (write/backup paths). */
function enforceCaps(keep) {
  for (let guard = 0; guard < 64; guard++) {
    const total = allItems().length;
    if (total <= MAX_BAK_TOTAL && bytesUsed() <= BAK_BYTES_SOFT) return;
    const list = evictionList({ keep, withQuarantine: false, withFuture: false });
    if (!list.length) return;
    evictOne(list[0]);
  }
}
/** Copy a raw slot string into rr2-bak:<key> (≤ 2 per slot, ≤ 8 total, ≤ 256 KB). → true when stored. */
export function backup(key, raw, reason) {
  if (typeof raw !== 'string') return false;
  const bk = BAK + key;
  const rec = readBak(bk);
  const item = { at: now(), reason, app: appOf(raw), sv: svOf(raw), raw };
  let items = rec.items.filter((x) => x.raw !== raw); // same content backed up again → one item, newest reason
  items.unshift(item);
  while (items.length > MAX_BAK_PER_SLOT) {
    // per-slot cap: drop the oldest older non-future item; future items are never dropped by the cap (the slot may
    // then hold more than MAX_BAK_PER_SLOT items)
    let idx = -1;
    for (let i = items.length - 1; i > 0; i--) if (items[i].reason !== 'future') { idx = i; break; }
    if (idx < 0) break;
    items.splice(idx, 1);
  }
  const val = JSON.stringify({ v: 1, items });
  try { put(bk, val); }
  catch (e) {
    if (!isQuotaError(e)) return false;
    // make room: the ghost cache / other practice branches first (T6 M3), then OTHER slots' backups (never this slot's future item);
    // soft data comes back when the backup still does not fit (T6 verify D4)
    const soft = softTake(key);
    for (const c of soft.steps()) { void c; try { put(bk, val); soft.commit(); enforceCaps(item); return true; } catch (e3) { if (!isQuotaError(e3)) { soft.rollback(); return false; } } }
    const list = evictionList({ keep: item, protectSlotFuture: key, withQuarantine: false }).filter((c) => c.bk !== bk);
    for (const c of list) evictOne(c);
    try { put(bk, val); soft.commit(); } catch (e2) { soft.rollback(); return false; }
  }
  enforceCaps(item);
  return true;
}
/** [{key, at, reason, sv, app}] newest first per slot */
export function listBackups(key) {
  const src = key ? [[BAK + key, readBak(BAK + key)]] : keys().filter((k) => k.startsWith(BAK)).map((k) => [k, readBak(k)]);
  const out = [];
  for (const [bk, rec] of src) for (const it of rec.items) out.push({ key: bk.slice(BAK.length), at: it.at, reason: it.reason, sv: it.sv ?? null, app: it.app ?? null });
  return out;
}
/** Put backup #index back into its slot, only when the slot is empty or holds a finished game. → boolean */
export function restoreBackup(key, index = 0) {
  const c = classify(get(key));
  if (c.status !== 'empty' && c.status !== 'over') return false;
  const rec = readBak(BAK + key); const it = rec.items[index]; if (!it) return false;
  try { put(key, it.raw); } catch (e) { return false; }
  dropItem(BAK + key, it);
  return true;
}

/* ------------------------------------------------------------ quarantine (non-slot keys) */
function quarantine(key, raw, extraItems = null) {
  const qk = QUAR + key;
  let rec = null; try { rec = JSON.parse(get(qk)); } catch (e) { rec = null; }
  if (!isObj(rec)) rec = {};
  const out = { v: 1, at: now() };
  if (raw != null) out.raw = raw; else if (typeof rec.raw === 'string') out.raw = rec.raw;
  const items = [...(Array.isArray(rec.items) ? rec.items : []), ...(extraItems || [])];
  if (items.length || extraItems) out.items = items;
  try { put(qk, JSON.stringify(out)); return true; }
  catch (e) {
    if (!isQuotaError(e)) return false;
    for (const c of evictionList({ withQuarantine: false, withFuture: false })) evictOne(c);
    try { put(qk, JSON.stringify(out)); return true; } catch (e2) { return false; }
  }
}

/* ------------------------------------------------------------ load / write / claim / clear */
/**
 * Classify, then deserialize when status is old|current. Writes a backup BEFORE migrating.
 * → {status:'empty'|'ok'|'migrated'|'future'|'corrupt'|'incompatible'|'over'|'backup_failed', state?, cfg?, ui?, wrapper?}
 */
export function load(key, { allowNoBackup = false } = {}) {
  const raw = get(key);
  const c = classify(raw);
  if (c.status === 'empty') return { status: 'empty' };
  if (c.status === 'corrupt') { if (backup(key, raw, 'corrupt')) del(key); return { status: 'corrupt' }; }
  if (c.status === 'future') return { status: 'future', wrapper: c.wrapper, cfg: c.wrapper.cfg };
  if (c.status === 'over') return { status: 'over', wrapper: c.wrapper, state: c.state, cfg: c.wrapper.cfg };
  if (c.status === 'old' && !backup(key, raw, 'migrate') && !allowNoBackup) return { status: 'backup_failed', wrapper: c.wrapper };
  let st;
  try { st = E.deserialize(c.state); } catch (e) {
    const msg = String(e && e.message);
    const status = /save_incompatible|save_future/.test(msg) ? 'incompatible' : 'corrupt';
    if (backup(key, raw, status)) del(key);
    return { status, error: msg };
  }
  return { status: c.status === 'old' ? 'migrated' : 'ok', state: st, cfg: c.wrapper.cfg, ui: c.wrapper.ui, wrapper: c.wrapper };
}

const checked = new Set(); // slots whose current content was checked once this page (future-save guard)
/** Write a game. Quota → evict backups, then quarantine, retry. Never overwrites a future save without a backup. */
export function write(key, cfg, state) {
  if (!checked.has(key)) {
    const raw = get(key); const c = classify(raw);
    if (c.status === 'future' && !backup(key, raw, 'future')) return { ok: false, quota: false, future: true };
    checked.add(key);
  }
  const val = JSON.stringify({ v: WRAP_V, app: APP_VERSION, sv: engV(), cfg, state, savedAt: Date.now() });
  try { put(key, val); return { ok: true }; }
  catch (e) {
    if (!isQuotaError(e)) return { ok: false, quota: false };
    // T6 review M3: first the ghost cache, then other practice branches; a practice branch itself never evicts T1 backups.
    // T6 verify D4: soft data is gone only when the write succeeds — otherwise it is put back; removed branches are reported
    const soft = softTake(key);
    for (const c of soft.steps()) {
      void c;
      try { put(key, val); return { ok: true, evicted: true, removedBranches: soft.commit() }; } catch (e2) { if (!isQuotaError(e2)) { soft.rollback(); return { ok: false, quota: false }; } }
    }
    if (key.startsWith(BRANCH)) { soft.rollback(); return { ok: false, quota: true }; }
    for (const c of evictionList({ withFuture: false })) {
      evictOne(c);
      try { put(key, val); return { ok: true, evicted: true, removedBranches: soft.commit() }; } catch (e2) { if (!isQuotaError(e2)) { soft.rollback(); return { ok: false, quota: false }; } }
    }
    soft.rollback();
    return { ok: false, quota: true };
  }
}
/** Before the first write of a NEW game: back up whatever unfinished game the slot holds (unless same seed / finished). */
export function claimSlot(key, seed) {
  const raw = get(key); const c = classify(raw);
  checked.add(key);
  if (c.status === 'empty' || c.status === 'over') return { ok: true };
  let reason = null;
  // a state that does not load (unknown world, broken migration…) counts as unreadable, whatever its seed
  let readable = c.status !== 'corrupt';
  if (readable && c.status !== 'future') { try { E.deserialize(c.state); } catch (e) { readable = false; } }
  if (c.status === 'future') reason = 'future';
  else if (!readable) reason = c.status === 'corrupt' ? 'corrupt' : 'incompatible';
  else if (seed != null && (c.state.seed >>> 0) === (seed >>> 0)) return { ok: true };
  else reason = 'overwrite';
  const ok = backup(key, raw, reason);
  if (!ok) checked.delete(key);
  // unreadable or future content whose backup failed must be kept: the caller may not overwrite it (review m-3)
  return { ok, reason, future: reason === 'future', keep: !ok && (reason === 'future' || !readable) };
}
/** Back up (reason 'clear', or 'future') then remove. Finished games are removed without a backup. → boolean removed */
export function clear(key) {
  const raw = get(key); const c = classify(raw);
  if (c.status === 'empty') return true;
  if (c.status !== 'over') {
    const reason = c.status === 'future' ? 'future' : c.status === 'corrupt' ? 'corrupt' : 'clear';
    if (!backup(key, raw, reason)) return false;
  }
  checked.delete(key);
  return del(key);
}

/* ------------------------------------------------------------ boot sweep */
/** Quarantine unparsable data before any module reads it. → {quarantined:[keys], corruptSlots, pendingItems} */
export function sweep() {
  const res = { quarantined: [], corruptSlots: 0, pendingItems: 0 };
  if (!storageOk()) return res; // storage blocked: nothing to sweep (and nothing can be read)
  for (const k of keys()) {
    if (!k.startsWith(SLOT)) continue;
    const raw = get(k);
    if (classify(raw).status === 'corrupt' && backup(k, raw, 'corrupt')) { del(k); res.corruptSlots++; }
  }
  for (const [k, kind] of SWEEP_KEYS) {
    const raw = get(k); if (raw == null) continue;
    let v, ok = true;
    try { v = JSON.parse(raw); } catch (e) { ok = false; }
    if (ok && kind === 'obj' && !isObj(v)) ok = false;
    if (ok && kind === 'arr' && !Array.isArray(v)) ok = false;
    if (!ok) { if (quarantine(k, raw)) { del(k); res.quarantined.push(k); } continue; }
    if (k === PENDING) {
      const good = v.filter((x) => isObj(x) && typeof x.resultId === 'string');
      const bad = v.filter((x) => !(isObj(x) && typeof x.resultId === 'string'));
      if (bad.length && quarantine(k, null, bad)) {
        try { put(k, JSON.stringify(good)); } catch (e) { /* keep as is */ }
        res.pendingItems += bad.length; res.quarantined.push(k);
      }
    }
  }
  return res;
}
/** P2: after an upgrade, put 'future' backups that this engine can now read back into their (empty) slots. → count */
export function autoRestoreFuture() {
  let n = 0;
  for (const bk of keys().filter((k) => k.startsWith(BAK))) {
    const key = bk.slice(BAK.length);
    const rec = readBak(bk);
    const idx = rec.items.findIndex((it) => it.reason === 'future' && classify(it.raw).status !== 'future' && classify(it.raw).status !== 'corrupt');
    if (idx < 0) continue;
    if (classify(get(key)).status !== 'empty') continue;
    if (restoreBackup(key, idx)) n++;
  }
  return n;
}

/* ------------------------------------------------------------ S.ui defaults */
/** Repair the client-side ui block that travels with the state. Wrong types → default; unknown fields kept. */
export function normalizeUi(ui) {
  const o = isObj(ui) ? { ...ui } : {};
  const n = Number(o.seq);
  o.seq = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  o.coach = isObj(o.coach) ? { ...o.coach } : {};
  o.firstPayday = typeof o.firstPayday === 'boolean' ? o.firstPayday : false;
  for (const [k, max] of [['hist', 240], ['pensionHist', 120]]) {
    if (!(k in o)) continue;
    if (!Array.isArray(o[k])) delete o[k]; else if (o[k].length > max) o[k] = o[k].slice(-max);
  }
  for (const k of ['trackMonth', 'weddingAge', 'burnSeen']) if (k in o && !(typeof o[k] === 'number' && Number.isFinite(o[k]))) delete o[k];
  if ('lifeSeen' in o && typeof o.lifeSeen !== 'boolean') delete o.lifeSeen;
  if ('inflReality' in o && !(o.inflReality == null || ['object', 'string', 'number'].includes(typeof o.inflReality))) delete o.inflReality;
  return o;
}
