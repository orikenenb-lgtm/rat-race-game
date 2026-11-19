// Local progression for מירוץ העכברים 2.0 — stars per world, unlocks, achievements, pawns, titles, daily streak.
// Stored in localStorage 'rr2-progress'; merged with the server profile (net.profile) on boot and pushed back with
// net.syncProgress (debounced, offline-safe: a 'dirty' flag survives reloads and is retried on the next boot / 'online').
//
// API
//   getProgress()                → copy of the progress object
//   totalStars(p?) / title(p?) / nextTitle(p?) → {name, need} | null
//   isUnlocked(worldId)          → w1 always; wN when w(N-1) is unlocked and has ≥1★ (stars won in a locked world via the
//                                   daily challenge are banked — they count once the chain reaches that world)
//   nextGoal()                   → {text, sub, worldId}  ("המשימה הבאה")
//   nextStarLine(worldId)        → short line about the next star in a world
//   PAWNS, PAWN_COLORS, pawnUnlocked(id), setPawn(id), setPawnColor(hex)
//   beginSession()               → call right before a game starts (tracks achievements earned during that game)
//   addAchievements(ids)         → newly added achievement defs (ignores unknown/duplicate ids)
//   recordGame(endPayload)       → {newStars, prevStars, gained, unlockedWorld, newPawns, newAchievements, titleBefore,
//                                   titleAfter, totalBefore, totalAfter, best, prevBest, newBest, bankedLocked}
//   setDaily({streak, best, last}) / streakInfo() → {streak, best, playedToday, alive}
//   syncFromServer() / scheduleSync() / mergeProfile(profile) / setTutorialDone()
import { net } from './net.js';
import { WORLDS, getWorld } from './worlds/index.js';
import { starThresholds } from './engine.js';
import { ACHIEVEMENTS, achievementById, checkMetaAchievements, titleFor, TITLES } from './achievements.js';

const KEY = 'rr2-progress';
const WIDS = WORLDS.map((w) => w.id);

export const PAWNS = [
  { id: 'classic', name: 'קלאסי', need: 0 },
  { id: 'car', name: 'מונית', need: 2 },
  { id: 'tophat', name: 'מגבעת', need: 4 },
  { id: 'rocket', name: 'טיל', need: 6 },
  { id: 'crown', name: 'כתר', need: 9 },
  { id: 'diamond', name: 'יהלום', need: 12 },
];
export const PAWN_COLORS = [
  { hex: '#f2b632', name: 'זהב' },
  { hex: '#ef4444', name: 'אדום' },
  { hex: '#3b82f6', name: 'כחול' },
  { hex: '#22c55e', name: 'ירוק' },
  { hex: '#a855f7', name: 'סגול' },
  { hex: '#ec4899', name: 'ורוד' },
];

function fresh() {
  return {
    v: 1, stars: Object.fromEntries(WIDS.map((w) => [w, 0])), best: {}, achievements: [], pawn: 'classic', pawnColor: PAWN_COLORS[0].hex,
    pawnChosenAt: 0, gamesPlayed: 0, wins: 0, tutorialDone: false, lastSeenWorld: null, worldsPlayed: [],
    streak: 0, bestStreak: 0, lastDaily: null, dirty: false, seenWorlds: ['w1'], lastChar: {}, hadBankruptcy: false,
  };
}

let P = load();
function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
  const p = { ...fresh(), ...(raw && typeof raw === 'object' ? raw : {}) };
  p.stars = { ...fresh().stars, ...(p.stars || {}) };
  for (const w of WIDS) p.stars[w] = Math.max(0, Math.min(3, +p.stars[w] || 0));
  p.best = { ...(p.best || {}) };
  p.lastChar = { ...(p.lastChar || {}) };
  p.achievements = [...new Set(Array.isArray(p.achievements) ? p.achievements : [])];
  p.worldsPlayed = [...new Set(Array.isArray(p.worldsPlayed) ? p.worldsPlayed : [])];
  p.seenWorlds = [...new Set(Array.isArray(p.seenWorlds) ? p.seenWorlds : ['w1'])];
  if (!PAWNS.some((x) => x.id === p.pawn)) p.pawn = 'classic';
  return p;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* storage full / private mode */ } }

const listeners = new Set();
/** Subscribe to progress changes (returns unsubscribe). */
export function onProgress(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function changed() { save(); for (const fn of listeners) { try { fn(getProgress()); } catch (e) { console.error(e); } } }

export function getProgress() { return JSON.parse(JSON.stringify(P)); }
export function totalStars(p = P) { return WIDS.reduce((s, w) => s + (p.stars[w] || 0), 0); }
export function title(p = P) { return titleFor(totalStars(p)); }
export function nextTitle(p = P) {
  const t = totalStars(p);
  const n = TITLES.find((x) => x.min > t);
  return n ? { name: n.name, need: n.min - t, min: n.min } : null;
}
export function isUnlocked(worldId) {
  const i = WIDS.indexOf(worldId);
  if (i <= 0) return i === 0;
  return isUnlocked(WIDS[i - 1]) && (P.stars[WIDS[i - 1]] || 0) >= 1;
}
export function unlockedWorlds() { return WIDS.filter(isUnlocked); }

/* ---------------- Hebrew helpers for world names */
export const inW = (name) => 'ב' + String(name).replace(/^ה/, '');   // בשכונה, בעיר הגדולה, בעמק העתיד
export const fromW = (name) => 'מ' + name;                            // מהשכונה, מעמק העתיד
export const toW = (name) => 'ל' + String(name).replace(/^ה/, '');   // לשכונה, לעיר הגדולה

/** Thresholds for the character the player last used in a world (stars are per character), else the first one. */
function thresholdsFor(worldId) {
  const w = getWorld(worldId);
  const c = w.characters.find((x) => x.id === P.lastChar[worldId]) || w.characters[0];
  let T; try { T = starThresholds(w, c.id); } catch (e) { T = { maxMonths: w.maxMonths, ...w.stars }; }
  return { ...T, charName: c.name };
}
/** One line about the next star in a world (thresholds of the last character played there). */
export function nextStarLine(worldId) {
  const s = P.stars[worldId] || 0; const T = thresholdsFor(worldId);
  if (s >= 3) return 'מושלם ★★★';
  if (s === 0) return `★ ראשון: לצאת תוך ${T.maxMonths} חודשים`;
  if (s === 1) return `★★: לצאת תוך ${T.t2} חודשים (${T.charName})`;
  return `★★★: לצאת תוך ${T.t3} חודשים (${T.charName})`;
}
export function setLastChar(worldId, charId) { if (P.lastChar[worldId] !== charId) { P.lastChar[worldId] = charId; changed(); } }

/** The "next mission" shown above the map. */
export function nextGoal() {
  const lockedIdx = WIDS.findIndex((w) => !isUnlocked(w));
  const nt = nextTitle();
  const sub = nt ? `עוד ${nt.need === 1 ? '★ אחד' : nt.need + '★'} לדרגת ${nt.name}` : 'הגעת לדרגה הכי גבוהה. עכשיו תנצח את החברים.';
  if (lockedIdx > 0) {
    const prev = getWorld(WIDS[lockedIdx - 1]); const next = getWorld(WIDS[lockedIdx]);
    return { text: `עוד ★ אחד ${inW(prev.name)} כדי לפתוח את ${next.name}`, sub, worldId: prev.id };
  }
  const notMax = WIDS.find((w) => (P.stars[w] || 0) < 3);
  if (notMax) {
    const w = getWorld(notMax); const s = P.stars[notMax] || 0; const T = thresholdsFor(notMax);
    const lim = s === 1 ? T.t2 : T.t3;
    return { text: `${s === 1 ? '★★' : '★★★'} ${inW(w.name)}: לצאת תוך ${lim} חודשים עם ${T.charName}`, sub, worldId: w.id };
  }
  return { text: 'אגדה! כל 12 הכוכבים שלך.', sub: 'עכשיו תוכיח את זה באתגר היומי — אותן קוביות לכולם.', worldId: null };
}

/* ---------------- pawns */
export function pawnUnlocked(id, p = P) { const x = PAWNS.find((q) => q.id === id); return !!x && totalStars(p) >= x.need; }
export function unlockedPawns(p = P) { return PAWNS.filter((x) => pawnUnlocked(x.id, p)).map((x) => x.id); }
export function setPawn(id) { if (!pawnUnlocked(id)) return false; P.pawn = id; P.pawnChosenAt = Date.now(); changed(); scheduleSync(); return true; }
export function setPawnColor(hex) { if (!PAWN_COLORS.some((c) => c.hex === hex)) return false; P.pawnColor = hex; changed(); return true; }
export function markWorldSeen(id) { if (!P.seenWorlds.includes(id)) { P.seenWorlds.push(id); changed(); } }
export function setTutorialDone() { if (!P.tutorialDone) { P.tutorialDone = true; changed(); } }
/** The engine's one-time mentor bail-out is offered until the player has gone bankrupt (or been bailed out) once. */
export function bailoutAvailable() { return !P.hadBankruptcy; }
export function markBankruptcy() { if (!P.hadBankruptcy) { P.hadBankruptcy = true; changed(); } }

/* ---------------- achievements */
let session = new Set();
/** Call right before a game starts or resumes; achievements earned until recordGame() are reported as this game's. */
export function beginSession() { session = new Set(); }
export function addAchievements(ids = []) {
  const out = [];
  for (const id of ids || []) {
    const a = achievementById(id);
    if (!a || P.achievements.includes(id)) continue;
    P.achievements.push(id); session.add(id); out.push(a);
  }
  if (out.length) { changed(); scheduleSync(); }
  return out;
}
function metaCheck() {
  const got = checkMetaAchievements({ stars: P.stars, achievements: P.achievements, worldsPlayed: P.worldsPlayed });
  return addAchievements(got.map((a) => a.id));
}

/* ---------------- game results */
let lastSig = null; let lastResult = null;
export function recordGame(e = {}) {
  const sig = [e.resultId || '', e.worldId, e.charId, e.mode, e.status, e.months, Math.round(e.netWorth || 0)].join('|');
  if (sig === lastSig && lastResult) return lastResult; // the same game:end delivered twice
  const wid = WIDS.includes(e.worldId) ? e.worldId : 'w1';
  const won = e.status === 'won';
  const totalBefore = totalStars(); const titleBefore = titleFor(totalBefore);
  const unlockedBefore = unlockedWorlds(); const pawnsBefore = unlockedPawns();
  const wasUnlocked = isUnlocked(wid);
  const prevStars = P.stars[wid] || 0;
  const got = won ? Math.max(0, Math.min(3, Math.round(+e.stars || 0))) : 0;
  P.stars[wid] = Math.max(prevStars, got);
  P.gamesPlayed += 1;
  const prevBest = P.best[wid] ?? null;
  let newBest = false;
  if (won) {
    P.wins += 1;
    if (prevBest == null || e.months < prevBest) { P.best[wid] = e.months; newBest = prevBest != null; }
  }
  if (!P.worldsPlayed.includes(wid)) P.worldsPlayed.push(wid);
  P.tutorialDone = true; P.lastSeenWorld = wid;
  const end = e.end || {}; const st = e.stats || end.stats || {};
  if (end.reason === 'bankrupt' || end.bailedOut || end.bailout || st.bailouts > 0 || st.bailout) P.hadBankruptcy = true;
  if (e.charId) P.lastChar[wid] = e.charId;
  const fromPayload = [...(e.achievements || []), ...((e.state && e.state.ach) || []), ...((e.end && e.end.achievements) || [])];
  addAchievements(fromPayload);
  metaCheck();
  const newAchievements = [...session].map(achievementById).filter(Boolean);
  session = new Set();
  const unlockedWorld = unlockedWorlds().find((w) => !unlockedBefore.includes(w)) || null;
  const newPawns = unlockedPawns().filter((x) => !pawnsBefore.includes(x));
  const totalAfter = totalStars();
  changed(); scheduleSync(300);
  lastSig = sig;
  lastResult = {
    worldId: wid, prevStars, newStars: P.stars[wid], earned: got, gained: P.stars[wid] - prevStars, unlockedWorld, newPawns, newAchievements,
    titleBefore, titleAfter: titleFor(totalAfter), totalBefore, totalAfter, best: P.best[wid] ?? null, prevBest, newBest,
    bankedLocked: !wasUnlocked && got > prevStars,
  };
  return lastResult;
}

/* ---------------- daily streak */
export function israelDate(d = new Date()) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
  catch (e) { return d.toISOString().slice(0, 10); }
}
const dayOf = (s) => { const m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; };
export function setDaily({ streak, best, last } = {}) {
  let ch = false;
  if (streak != null && +streak !== P.streak) { P.streak = +streak || 0; ch = true; }
  if (best != null && +best > P.bestStreak) { P.bestStreak = +best; ch = true; }
  if (P.streak > P.bestStreak) { P.bestStreak = P.streak; ch = true; }
  if (last !== undefined && last !== P.lastDaily) { P.lastDaily = last; ch = true; }
  if (ch) changed();
}
/** {streak, best, playedToday, alive}: a streak is alive if the last daily was today or yesterday (Israel time). */
export function streakInfo() {
  const today = dayOf(israelDate()); const last = dayOf(P.lastDaily);
  const playedToday = last != null && last === today;
  const alive = last != null && today - last <= 1;
  return { streak: alive ? P.streak : 0, best: Math.max(P.bestStreak, P.streak), playedToday, alive };
}

/* ---------------- server sync */
/** Merge a server profile into local progress (max stars per world, union of achievements). Returns true if local changed. */
export function mergeProfile(prof) {
  if (!prof || typeof prof !== 'object') return false;
  let ch = false;
  for (const [w, s] of Object.entries(prof.stars || {})) {
    if (!WIDS.includes(w)) continue;
    const v = Math.max(0, Math.min(3, +s || 0));
    if (v > (P.stars[w] || 0)) { P.stars[w] = v; ch = true; }
  }
  for (const id of prof.achievements || []) if (!P.achievements.includes(id) && achievementById(id)) { P.achievements.push(id); ch = true; }
  const m = prof.meta;
  if (m && typeof m === 'object') {
    if (+m.games > P.gamesPlayed) { P.gamesPlayed = +m.games; ch = true; }
    if (+m.wins > P.wins) { P.wins = +m.wins; ch = true; }
    for (const [w, v] of Object.entries(m.best || {})) {
      if (!WIDS.includes(w) || !(+v > 0)) continue;
      if (P.best[w] == null || +v < P.best[w]) { P.best[w] = +v; ch = true; }
    }
    if (P.wins > P.gamesPlayed) P.gamesPlayed = P.wins;
  }
  if (prof.pawn && !P.pawnChosenAt && prof.pawn !== P.pawn && PAWNS.some((x) => x.id === prof.pawn)) { P.pawn = prof.pawn; ch = true; }
  if (prof.daily_streak != null || prof.best_streak != null || prof.last_daily !== undefined) {
    const before = JSON.stringify([P.streak, P.bestStreak, P.lastDaily]);
    if (prof.daily_streak != null) P.streak = +prof.daily_streak || 0;
    if (prof.best_streak != null) P.bestStreak = Math.max(P.bestStreak, +prof.best_streak || 0);
    if (prof.last_daily !== undefined) P.lastDaily = prof.last_daily;
    if (P.streak > P.bestStreak) P.bestStreak = P.streak;
    if (JSON.stringify([P.streak, P.bestStreak, P.lastDaily]) !== before) ch = true;
  }
  if (ch) changed();
  return ch;
}
function serverBehind(prof) {
  if (!prof) return true;
  for (const w of WIDS) if ((P.stars[w] || 0) > (+((prof.stars || {})[w]) || 0)) return true;
  const have = new Set(prof.achievements || []);
  if (P.achievements.some((id) => !have.has(id))) return true;
  if (P.pawnChosenAt && prof.pawn !== P.pawn) return true;
  const m = prof.meta || {};
  if (P.gamesPlayed > (+m.games || 0) || P.wins > (+m.wins || 0)) return true;
  for (const [w, v] of Object.entries(P.best)) if (v != null && !(+((m.best || {})[w]) <= v)) return true;
  return false;
}
const metaOf = () => ({ games: P.gamesPlayed, wins: P.wins, best: { ...P.best } });
let timer = null; let inflight = null;
export function scheduleSync(delay = 1500) {
  if (!P.dirty) { P.dirty = true; save(); }
  if (!net.hasMe()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { pushSync(); }, delay);
}
async function pushSync() {
  if (!net.hasMe()) return false;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const prof = await net.syncProgress({ stars: P.stars, achievements: P.achievements, pawn: P.pawn, meta: metaOf() });
      P.dirty = false; save();
      mergeProfile(prof);
      return true;
    } catch (e) { return false; } finally { inflight = null; }
  })();
  return inflight;
}
/** Boot: pull the server profile, merge, and push whatever the server is missing. Offline-safe (resolves false). */
export async function syncFromServer() {
  if (!net.hasMe()) return false;
  try {
    const prof = await net.profile();
    const ch = mergeProfile(prof);
    if (P.dirty || serverBehind(prof)) await pushSync();
    return ch;
  } catch (e) { return false; }
}
/** After a fresh register / restore: push local progress right away so leaderboards show the right title. */
export function pushNow() { return pushSync(); }
if (typeof addEventListener === 'function') addEventListener('online', () => { if (P.dirty) pushSync(); });

/** Test/debug helper: replace local progress (used by tests only). */
export function _reset(p) { P = { ...fresh(), ...(p || {}) }; session = new Set(); lastSig = null; lastResult = null; changed(); }
export { ACHIEVEMENTS, WIDS };
