// Local progression for מירוץ העכברים 2.0 — stars per world, unlocks, achievements, pawns, titles, daily streak.
// Stored in localStorage 'rr2-progress'; merged with the server profile (net.profile) on boot and pushed back with
// net.syncProgress (debounced, offline-safe: a 'dirty' flag survives reloads and is retried on the next boot / 'online').
//
// API
//   getProgress()                → copy of the progress object
//   totalStars(p?) / title(p?) / nextTitle(p?) → {name, need} | null
//   isUnlocked(mapId)            → 2026-11-25 (owner: "תחלק את המפות לעולמות"): LINEAR along js/worlds-groups.js ORDER — the first map is open;
//                                   a later BUILT map opens once the built map before it is open and finished (worldFinished); an unbuilt
//                                   map ("בקרוב") is skipped, never a wall. Stars banked in a locked map (daily) count once the chain reaches
//                                   it. Nothing that was open is ever locked again: on the first load of a save from before the groups, every
//                                   map open under the old meta.unlock graph is kept (P.kept, groupsV 1). w1–w4 unchanged. Admin /
//                                   setUnlockAll(true) open every built map. A playable meta id outside ORDER falls back to meta.unlock.
//   worldMap()                   → the map for the lobby in ORDER: every map (playable + planned, also the planned ones not in meta yet) with
//                                   its world (group), number in the world, unlocked / stars / lock text — meta + worlds-groups only
//   mapGroups()                  → the 6 worlds for the lobby: [{id, n, name, learn, icon, maps:[worldMap entries], done, total, open, built}]
//   nextMapOf(id) / prevMapOf(id) → the next / previous BUILT map in ORDER (or null)
//   ensureWorldRules(id)         → Promise: loads a lazy world's full rules before createGame / deserialize / resume / the character picker
//   starThresholdsOf(id, charId) → ★ thresholds from meta (works before a lazy world's rules are loaded)
//   nextGoal()                   → {text, sub, worldId}  ("המשימה הבאה")
//   nextStarLine(worldId)        → short line about the next star in a world
//   PAWNS, PAWN_COLORS, pawnUnlocked(id), setPawn(id), setPawnColor(hex)
//   beginSession()               → call right before a game starts (tracks achievements earned during that game)
//   addAchievements(ids)         → newly added achievement defs (ignores unknown/duplicate ids)
//   recordGame(endPayload)       → {newStars, prevStars, gained, unlockedWorld, newPawns, newAchievements, titleBefore,
//                                   titleAfter, totalBefore, totalAfter, best, prevBest, newBest, bankedLocked}
//   setDaily({streak, best, last}) / streakInfo() → {streak, best, playedToday, alive}
//   syncFromServer() / scheduleSync() / mergeProfile(profile) / setTutorialDone()
//   recordLearning(end.learning, sig) → {improved, missed, strongest, dqAvgBefore} · learningSummary() · gamePrinciples(learning)
//   T4: setDream(id|null) · requestTutorialReplay() · consumeTutorialReplay() → bool · setLastMode(m) · setMentorPref(l)
//       recordLearnGame(e) → {learn:true, wouldStars, worldId, …} · recordDream(e) · DREAM_IDS
import { net } from './net.js';
import { WORLDS, getWorld, ensureWorld, isLoaded } from './worlds/index.js';
import { starThresholds } from './engine.js';
import { ACHIEVEMENTS, achievementById, checkMetaAchievements, titleFor, TITLES } from './achievements.js';
import { WORLD_META, metaOf, isUnlockedBy, unlockText, playableMeta } from './worlds/meta.js';
import { WORLD_GROUPS, ORDER, PLANNED, groupOf, mapNo, mapIndex, nextMap, prevMap, crossesWorld, openMaps } from './worlds-groups.js';

const KEY = 'rr2-progress';
/** Every playable world (core w1–w4 + released lazy worlds), map order — from meta, so the lobby never needs a lazy world's rules. */
const WIDS = playableMeta().map((m) => m.id);
/** Worlds whose stars the server profile already knows (ranked or core). Lazy, unranked worlds stay local until the DB migration. */
const SYNC_IDS = WORLD_META.filter((m) => m.playable && (m.ranked || m.status === 'core')).map((m) => m.id);

/** 2026-11-25 the worlds / maps split: a save without groupsV ≥ 1 keeps (P.kept) every map the old unlock graph had open. */
const GROUPS_V = 1;
const LEARN_GAMES = 20;          // decision-quality history kept ("מה למדתי")
const LEARN_WEIGHT_CAP = 30;     // old decisions count at most this much against a new game (recent play matters)
const clamp01 = (x) => Math.max(0, Math.min(1, x));
/** T4 ids (declared up here: load() runs at import time). */
export const DREAM_IDS = ['biz', 'family', 'stable', 'free'];
const MODES = ['normal', 'learn'];
const MENTOR_PREFS = ['guide', 'hint', 'pro'];

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
    streak: 0, bestStreak: 0, lastDaily: null, dirty: false, seenWorlds: ['w1'], lastChar: {}, hadBankruptcy: false, onboarded: false, history: {},
    endSigs: [],   // P0b 2026-11-24: the last games already recorded (survives reloads — a game's end is never counted twice)
    cleared: {},   // P0 2026-11-24: worlds escaped in a practice (learning) game — they open the next world, never stars/best
    groupsV: GROUPS_V, kept: [],   // 2026-11-25: maps open before the worlds / maps split (old meta.unlock graph) — never locked again
    learn: freshLearn(),
    // T4 §14.4 (local only — never in metaOf() / never synced)
    learnGames: 0, dream: null, dreams: {}, tutorialReplay: false, lastMode: 'normal', mentorPref: null,
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
  p.history = { ...(p.history || {}) };
  p.learn = cleanLearn(p.learn);
  cleanT4(p);
  p.cleared = cleanCleared(p);
  p.endSigs = cleanSigs(p.endSigs);
  migrateGroups(p, raw);
  p.achievements = [...new Set(Array.isArray(p.achievements) ? p.achievements : [])];
  p.worldsPlayed = [...new Set(Array.isArray(p.worldsPlayed) ? p.worldsPlayed : [])];
  p.seenWorlds = [...new Set(Array.isArray(p.seenWorlds) ? p.seenWorlds : ['w1'])];
  if (!PAWNS.some((x) => x.id === p.pawn)) p.pawn = 'classic';
  return p;
}
/** (function declarations only up here: load() runs at import time, before any const below is initialised) */
function endSigsMax() { return 40; }
/** 2026-11-25: the first load of a save from before the worlds / maps split keeps every map the old meta.unlock graph opened (finished maps
 *  count as ★, exactly as the old isUnlocked saw them) — the linear rule never closes a map a player already had. Later loads only clean. */
function migrateGroups(p, raw) {
  const ok = (x) => typeof x === 'string' && WIDS.includes(x);
  const had = raw && typeof raw === 'object' && +raw.groupsV >= GROUPS_V;
  const kept = new Set((Array.isArray(p.kept) ? p.kept : []).filter(ok));
  if (!had) {
    const fs = {}; for (const w of WIDS) fs[w] = Math.max(Math.max(0, Math.min(3, +p.stars[w] || 0)), worldFinished(w, p) ? 1 : 0);
    for (const w of WIDS) if (w !== 'w1' && isUnlockedBy(w, fs, {})) kept.add(w);
  }
  p.kept = WIDS.filter((w) => kept.has(w));
  p.groupsV = GROUPS_V;
}
function cleanSigs(a) { return (Array.isArray(a) ? a : []).filter((x) => typeof x === 'string' && x.length < 200).slice(-endSigsMax()); }
/** P0b: a game end that was already recorded (this session or before a reload) is never recorded again. */
function seenEnd(sig) { return P.endSigs.includes(sig); }
function markEnd(sig) { P.endSigs = [...P.endSigs.filter((x) => x !== sig), sig].slice(-endSigsMax()); }
/** {w1:true,…} — only known world ids with a literal true. Repair for saves from before 2026-11-24: a practice escape
 *  recorded nothing that opens a world, but the last practice game's learning signature ("|learn|<w>|seed|months|won")
 *  is evidence of a real escape, so that world counts as cleared (nothing else is granted: no stars, best or ⚡). */
function cleanCleared(p) {
  const src = p.cleared && typeof p.cleared === 'object' && !Array.isArray(p.cleared) ? p.cleared : {};
  const out = {};
  for (const w of WIDS) if (src[w] === true) out[w] = true;
  const m = /^\|learn\|(w\d+)\|[^|]*\|\d+\|won$/.exec((p.learn && p.learn.lastSig) || '');
  if (m && WIDS.includes(m[1])) out[m[1]] = true;
  return out;
}
/** The single progression rule: a world is "finished" (it opens the next one) after any escape from it — a normal game at
 *  any speed (a recorded best), a ★ (also banked from a daily), or a practice escape (cleared). */
/** Stars as the unlock rules see them: a finished world counts as at least ★ (see worldFinished). */
function finishedStars() { const o = {}; for (const w of WIDS) o[w] = Math.max(P.stars[w] || 0, worldFinished(w) ? 1 : 0); return o; }
export function worldFinished(worldId, p = P) { return (p.stars[worldId] || 0) >= 1 || (p.best || {})[worldId] != null || !!(p.cleared && p.cleared[worldId]); }
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
/** owner (admin) mode: every world and pawn is open on this device — set only from a server-confirmed rr_admin_status.
 *  Not stored in progress: stars, records and ranked games are unchanged. */
let ADMIN = false;
export function setAdmin(on) { const was = ADMIN; ADMIN = !!on; if (was !== ADMIN) changed(); }
export function isAdmin() { return ADMIN; }
/** A map that can be played (registered in meta as playable) — the unlock rule skips every other one. */
const built = (id) => WIDS.includes(id);
/** The maps open under the linear rule + the kept ones (js/worlds-groups.js openMaps). */
function openSet() { return new Set(openMaps({ finished: (id) => worldFinished(id), built, kept: P.kept })); }
export function isUnlocked(worldId) {
  if (!WIDS.includes(worldId)) return false;
  if (ADMIN || P.unlockAll) return true;
  if (!ORDER.includes(worldId)) return isUnlockedBy(worldId, finishedStars(), {});   // a playable map that no world lists yet: the old rule
  // 2026-11-25: linear along ORDER — finishing a map (an escape at any speed, a ★ also banked from a daily, or a practice escape:
  // worldFinished) opens the next built map; kept maps (open before the split) stay open
  return openSet().has(worldId);
}
/** The open maps, in the order of the game (ORDER), then any playable map no world lists yet. */
export function unlockedWorlds() { const o = openSet(); return [...ORDER, ...WIDS.filter((w) => !ORDER.includes(w))].filter((w) => WIDS.includes(w) && (ADMIN || P.unlockAll || (ORDER.includes(w) ? o.has(w) : isUnlocked(w)))); }
/** The next / previous BUILT map in the order of the game (null at the ends). */
export const nextMapOf = (id) => nextMap(id, built);
export const prevMapOf = (id) => prevMap(id, built);
/** The world (group) that a step into map `to` from map `from` opens, or null when both are in the same world. */
export function newWorldOf(from, to) { return to && crossesWorld(from, to) ? groupOf(to) : null; }
/** Owner / admin override: every playable world unlocked on this device (local only, never synced). */
export function setUnlockAll(on) { const v = !!on; if (!!P.unlockAll !== v) { P.unlockAll = v; changed(); } return v; }
/** ★ thresholds of a character from meta (lazy worlds too). Same numbers as engine starThresholds for a loaded world. */
export function starThresholdsOf(worldId, charId) {
  if (isLoaded(worldId)) { try { return starThresholds(getWorld(worldId), charId, 6); } catch (e) { /* fall through to meta */ } }
  const m = metaOf(worldId) || {}; const c = (m.characters || []).find((x) => x.id === charId) || (m.characters || [])[0] || {};
  return { maxMonths: c.maxMonths4 || c.maxMonths || m.maxMonths, happy: 60, fundMonths: 3, ...(m.stars || {}), ...(c.stars || {}) };
}
/** Load a world's full rules (a no-op for w1–w4). Call before createGame / deserialize / resume / the character picker of a lazy world. */
export function ensureWorldRules(worldId) { return ensureWorld(worldId); }
/** A map's name: meta's (built or registered), else the planned name in js/worlds-groups.js. */
export function mapName(id) { const m = metaOf(id); return (m && m.name) || (PLANNED[id] && PLANNED[id].name) || id; }
/** How a map opens, in words: "לצאת מהשכונה" (the previous built map); for a planned one "תיפתח אחרי <the map before it>, כשתהיה מוכנה". */
function lockTextOf(id) {
  if (!ORDER.includes(id)) return unlockText(id);
  if (!built(id)) { const i = ORDER.indexOf(id); return i > 0 ? `תיפתח אחרי ${mapName(ORDER[i - 1])}, כשתהיה מוכנה` : 'תיפתח כשתהיה מוכנה'; }
  const pv = prevMap(id, built);
  return pv ? `לצאת ${fromW(mapName(pv))}` : '';
}
/**
 * The map for the lobby, in the order of the game (js/worlds-groups.js ORDER), then any playable meta map no world lists yet:
 * [{id, order (position in ORDER), metaOrder, mapNo (position in its world), group {id, n, name}, tier, name, tagline, learn, newHere, diff,
 *   estMin, status, playable, ranked, unlocked, finished, stars, best, lockText, prev, characters}] — planned maps included (playable:false,
 * a "בקרוב" pin), also those not in meta.js yet (from PLANNED).
 */
export function worldMap() {
  const ids = [...ORDER, ...WORLD_META.map((m) => m.id).filter((id) => !ORDER.includes(id))];
  return ids.map((id) => {
    const m = metaOf(id); const pl = PLANNED[id] || {}; const g = groupOf(id); const playable = !!(m && m.playable);
    return { id, order: mapIndex(id) || (m && m.order) || 0, metaOrder: m ? m.order : null, mapNo: mapNo(id), group: g ? { id: g.id, n: g.n, name: g.name } : null,
      tier: m ? m.tier : null, name: (m && m.name) || pl.name || id, tagline: (m && m.tagline) || pl.tagline || '', learn: (m && m.learn) || null, newHere: (m && m.newHere) || null,
      diff: (m && m.diff) || pl.diff || null, estMin: m ? m.estMin ?? null : null, status: m ? m.status : 'planned', playable, ranked: !!(m && m.ranked), roomOk: !!(m && m.roomOk),
      unlock: m ? m.unlock : [], unlocked: playable ? isUnlocked(id) : false, finished: playable && worldFinished(id), stars: P.stars[id] || 0, best: P.best[id] ?? null,
      lockText: lockTextOf(id), prev: prevMap(id, built), characters: (m && m.characters) || [] };
  });
}
/** The 6 worlds for the lobby's chapters: each with its maps (worldMap entries), how many are finished / built / in it, and whether it is open
 *  (any of its maps open) — a world whose maps are all planned is "בקרוב". */
export function mapGroups() {
  const W = worldMap(); const by = Object.fromEntries(W.map((x) => [x.id, x]));
  return WORLD_GROUPS.map((g) => {
    const maps = g.maps.map((id) => by[id]); const play = maps.filter((x) => x.playable);
    return { id: g.id, n: g.n, name: g.name, icon: g.icon, learn: g.learn, maps, total: maps.length, built: play.length,
      done: play.filter((x) => x.finished).length, open: play.some((x) => x.unlocked), soon: play.length === 0 };
  });
}
/** The line a lobby shows before a private room in a world this player has not unlocked (BRIEF-worlds §8). */
export const ROOM_LOCKED_NOTE = 'משחקים במפה שעוד לא נפתחה לך. התוצאה לא תיספר להתקדמות.';

/* ---------------- Hebrew helpers for world names */
export const inW = (name) => 'ב' + String(name).replace(/^ה/, '');   // בשכונה, בעיר הגדולה, בעמק העתיד
export const fromW = (name) => 'מ' + name;                            // מהשכונה, מעמק העתיד
export const toW = (name) => 'ל' + String(name).replace(/^ה/, '');   // לשכונה, לעיר הגדולה

/** Thresholds for the character the player last used in a world (stars are per character), else the first one. Meta-based (lazy worlds too). */
function thresholdsFor(worldId) {
  const m = metaOf(worldId) || { characters: [] };
  const c = m.characters.find((x) => x.id === P.lastChar[worldId]) || m.characters[0] || { id: null, name: '' };
  let T; if (isLoaded(worldId) && WORLDS.some((w) => w.id === worldId)) { const w = getWorld(worldId); try { T = starThresholds(w, c.id); } catch (e) { T = { maxMonths: w.maxMonths, ...w.stars }; } } else T = starThresholdsOf(worldId, c.id);
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
  const seq = [...ORDER.filter(built), ...WIDS.filter((w) => !ORDER.includes(w))];   // every playable map, in the order of the game
  const lockedId = seq.find((w) => !isUnlocked(w));
  const nt = nextTitle();
  const sub = nt ? `עוד ${nt.need === 1 ? '★ אחד' : nt.need + '★'} לדרגת ${nt.name}` : 'הגעת לדרגה הכי גבוהה. עכשיו תנצח את החברים.';
  if (lockedId && ORDER.includes(lockedId)) {
    // 2026-11-25: the first closed map's previous built map is open and not finished yet (linear rule) — finish it
    const pv = prevMap(lockedId, built) || 'w1'; const g = newWorldOf(pv, lockedId);
    return { text: g ? `לצאת מהמירוץ ${inW(mapName(pv))} כדי לפתוח עולם חדש: ${g.name}` : `לצאת מהמירוץ ${inW(mapName(pv))} כדי לפתוח את המפה הבאה: ${mapName(lockedId)}`,
      sub, worldId: pv, nextId: lockedId, newWorld: g ? g.id : null };
  }
  const notMax = seq.find((w) => (P.stars[w] || 0) < 3);
  if (notMax) {
    const w = metaOf(notMax); const s = P.stars[notMax] || 0; const T = thresholdsFor(notMax);
    const lim = s === 1 ? T.t2 : T.t3;
    return { text: `${s === 1 ? '★★' : '★★★'} ${inW(w.name)}: לצאת תוך ${lim} חודשים עם ${T.charName}`, sub, worldId: w.id };
  }
  return { text: `אגדה! כל ${seq.length * 3} הכוכבים שלך.`, sub: 'עכשיו תוכיח את זה באתגר היומי — אותן קוביות לכולם.', worldId: null };
}

/* ---------------- pawns */
export function pawnUnlocked(id, p = P) { const x = PAWNS.find((q) => q.id === id); return !!x && (ADMIN || totalStars(p) >= x.need); }
export function unlockedPawns(p = P) { return PAWNS.filter((x) => pawnUnlocked(x.id, p)).map((x) => x.id); }
export function setPawn(id) { if (!pawnUnlocked(id)) return false; P.pawn = id; P.pawnChosenAt = Date.now(); changed(); scheduleSync(); return true; }
export function setPawnColor(hex) { if (!PAWN_COLORS.some((c) => c.hex === hex)) return false; P.pawnColor = hex; changed(); return true; }
export function markWorldSeen(id) { if (!P.seenWorlds.includes(id)) { P.seenWorlds.push(id); changed(); } }
export function setOnboarded() { if (!P.onboarded) { P.onboarded = true; changed(); } }
export function setTutorialDone() { if (!P.tutorialDone) { P.tutorialDone = true; changed(); } }

/* ---------------- T4: learning mode, dream goal, tutorial replay, mode / mentor preference (local only, never synced) */
/** Old or hand-edited values → the T4 shape (additive: unknown keys are kept, nothing is deleted). */
function cleanT4(p) {
  p.learnGames = Math.max(0, Math.floor(+p.learnGames) || 0);
  const okId = (x) => typeof x === 'string' && /^[a-z0-9_]{2,32}$/.test(x);   // unknown (future engine) dream ids are kept
  p.dream = okId(p.dream) ? p.dream : null;
  const d = p.dreams && typeof p.dreams === 'object' && !Array.isArray(p.dreams) ? p.dreams : {};
  p.dreams = {};
  for (const [id, v] of Object.entries(d)) {
    if (!okId(id) || !v || typeof v !== 'object') continue;
    p.dreams[id] = { done: [...new Set((Array.isArray(v.done) ? v.done : []).filter((x) => typeof x === 'string' && /^[a-z0-9_]{2,32}$/.test(x)))], games: Math.max(0, Math.floor(+v.games) || 0) };
  }
  p.tutorialReplay = p.tutorialReplay === true;
  p.lastMode = MODES.includes(p.lastMode) ? p.lastMode : 'normal';
  p.mentorPref = MENTOR_PREFS.includes(p.mentorPref) ? p.mentorPref : null;
}
/** The dream goal for the next free/learning game ('biz'|'family'|'stable'|'free'|null). Never touches stars or ranked. */
export function setDream(id) { const v = DREAM_IDS.includes(id) ? id : null; if (P.dream !== v) { P.dream = v; changed(); } return v; }
/** F4: "full tutorial in the next w1 game" — consumed once by startFree. */
export function requestTutorialReplay() { if (!P.tutorialReplay) { P.tutorialReplay = true; changed(); } }
export function consumeTutorialReplay() { if (!P.tutorialReplay) return false; P.tutorialReplay = false; changed(); return true; }
export function setLastMode(m) { const v = MODES.includes(m) ? m : 'normal'; if (P.lastMode !== v) { P.lastMode = v; changed(); } return v; }
export function setMentorPref(l) { const v = MENTOR_PREFS.includes(l) ? l : null; if (P.mentorPref !== v) { P.mentorPref = v; changed(); } return v; }
/** Completed normal games (free / ranked / history) — learning games are not counted (they are not synced either). */
export const completedGames = () => P.gamesPlayed;
/** Review M-2: the very first game of a brand-new player (the only one whose first 10 rolls are free). */
export const firstEverGame = () => !P.tutorialDone && !(P.gamesPlayed > 0) && !(P.learnGames > 0);
/**
 * A finished LEARNING game (§7.1): learnGames += 1, tutorialDone, lastChar. Nothing else — no stars, best, unlocks,
 * titles, pawns, achievements, worldsPlayed, gamesPlayed, wins or hadBankruptcy. Returns what the end screen needs.
 */
let lastLearnSig = null; let lastLearnRes = null;
export function recordLearnGame(e = {}) {
  const sig = ['learn', e.worldId, e.charId, e.seed ?? '', e.status, e.months, Math.round(e.netWorth || 0)].join('|');
  if (sig === lastLearnSig && lastLearnRes) return lastLearnRes;  // the same game:end delivered twice
  if (seenEnd(sig)) return dupResult(e, true);                    // P0b: recorded before a reload
  const wid = WIDS.includes(e.worldId) ? e.worldId : 'w1';
  const unlockedBefore = unlockedWorlds();
  P.learnGames += 1;
  P.tutorialDone = true;
  if (e.charId) P.lastChar[wid] = e.charId;
  session = new Set();                                             // achievements of this game are never reported
  const won = e.status === 'won';
  // P0 2026-11-24: escaping in practice finishes the world — the next one opens (still no stars, best, titles or ⚡)
  if (won && isUnlocked(wid)) P.cleared = { ...P.cleared, [wid]: true };
  markEnd(sig);
  changed();
  const unlockedWorld = unlockedWorlds().find((w) => !unlockedBefore.includes(w)) || null;
  lastLearnSig = sig;
  lastLearnRes = { learn: true, worldId: wid, wouldStars: won ? Math.max(0, Math.min(3, Math.round(+e.stars || 0))) : 0, learnGames: P.learnGames,
    newStars: P.stars[wid] || 0, prevStars: P.stars[wid] || 0, gained: 0, earned: 0, unlockedWorld, unlockedGroup: groupIdOf(wid, unlockedWorld), newPawns: [], newAchievements: [],
    titleBefore: title(), titleAfter: title(), totalBefore: totalStars(), totalAfter: totalStars(), best: P.best[wid] ?? null, prevBest: P.best[wid] ?? null, newBest: false, bankedLocked: false };
  return lastLearnRes;
}
/** Free NORMAL games only (§6.3/§7.1): merge the dream missions completed in this game (end.dream / e.dream) into the lifetime badges. */
let lastDreamSig = null;
export function recordDream(e = {}) {
  const d = e.dream || (e.end && e.end.dream) || null;
  if (!d || !/^[a-z0-9_]{2,32}$/.test(String(d.id)) || e.learn) return null;
  const sig = [e.resultId || '', e.worldId, e.charId, e.seed ?? '', e.status, e.months, d.id].join('|');
  if (sig === lastDreamSig) return null;                            // the same game:end delivered twice (review m-9)
  lastDreamSig = sig;
  const done = (Array.isArray(d.missions) ? d.missions.filter((m) => m && m.done).map((m) => m.id) : Array.isArray(d.done) ? d.done : Object.keys(d.done || {}))
    .filter((x) => typeof x === 'string' && /^[a-z0-9_]{2,32}$/.test(x));
  const prev = P.dreams[d.id] || { done: [], games: 0 };
  const fresh = done.filter((x) => !prev.done.includes(x));
  P.dreams = { ...P.dreams, [d.id]: { done: [...prev.done, ...fresh], games: prev.games + 1 } };
  changed();
  return { id: d.id, fresh, done: P.dreams[d.id].done };
}
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
/** History mode (מכונת הזמן): best result per scenario; never counts toward world stars/titles. */
export function recordHistory(e = {}) {
  const sid = e.scenarioId || (e.end && e.end.scenarioId) || (e.history && e.history.scenarioId) || 'unknown';
  const prev = P.history[sid] || { plays: 0, best: null };
  const stars = e.status === 'won' || e.stars ? Math.max(0, Math.min(3, Math.round(+e.stars || 0))) : 0;
  const cur = { stars, netWorth: Math.round(+e.netWorth || 0), beat: e.status === 'won', at: Date.now() };
  const better = !prev.best || cur.stars > prev.best.stars || (cur.stars === prev.best.stars && cur.netWorth > prev.best.netWorth);
  P.history = { ...P.history, [sid]: { plays: prev.plays + 1, best: better ? cur : prev.best, lastSeed: e.seed ?? prev.lastSeed ?? null } };
  P.gamesPlayed += 1; if (cur.beat) P.wins += 1;
  if (!P.worldsPlayed.includes('h')) P.worldsPlayed.push('h');
  P.tutorialDone = true;
  addAchievements([...(e.achievements || []), ...((e.end && e.end.achievements) || [])]);
  const newAchievements = [...session].map(achievementById).filter(Boolean); session = new Set();
  changed(); scheduleSync(300);
  return { scenarioId: sid, prevBest: prev.best, best: P.history[sid].best, newBest: better && !!prev.best, first: !prev.best, newAchievements, unlockedWorld: null, newPawns: [], titleBefore: title(), titleAfter: title(), totalBefore: totalStars(), totalAfter: totalStars(), gained: 0, bankedLocked: false, newStars: stars, prevStars: prev.best ? prev.best.stars : 0, worldId: 'h' };
}
export function setHistorySeed(sid, seed) { P.history = { ...P.history, [sid]: { plays: 0, best: null, ...(P.history[sid] || {}), lastSeed: seed } }; changed(); }
/** History mode opens once w1 has ≥1★ (a teaser before). */
export const historyUnlocked = () => (P.stars.w1 || 0) >= 1;
export function recordGame(e = {}) {
  if (e.mode === 'history' || e.worldId === 'h') return recordHistory(e);
  const sig = [e.resultId || '', e.worldId, e.charId, e.mode, e.status, e.months, Math.round(e.netWorth || 0), e.seed ?? ''].join('|');
  if (sig === lastSig && lastResult) return lastResult; // the same game:end delivered twice
  if (seenEnd(sig)) return dupResult(e, false);         // P0b: recorded before a reload — never counted twice
  const wid = WIDS.includes(e.worldId) ? e.worldId : 'w1';
  const won = e.status === 'won';
  const totalBefore = totalStars(); const titleBefore = titleFor(totalBefore);
  const unlockedBefore = unlockedWorlds(); const pawnsBefore = unlockedPawns();
  const wasUnlocked = isUnlocked(wid);
  const prevStars = P.stars[wid] || 0;
  // BRIEF-worlds §8: a private room played in a world this player has not unlocked gives no stars, unlocks or titles
  const roomGuest = e.access === 'room' && !wasUnlocked;
  const got = won && !roomGuest ? Math.max(0, Math.min(3, Math.round(+e.stars || 0))) : 0;
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
  markEnd(sig);
  changed(); scheduleSync(300);
  lastSig = sig;
  lastResult = {
    worldId: wid, prevStars, newStars: P.stars[wid], earned: got, gained: P.stars[wid] - prevStars, unlockedWorld, unlockedGroup: groupIdOf(wid, unlockedWorld), newPawns, newAchievements,
    titleBefore, titleAfter: titleFor(totalAfter), totalBefore, totalAfter, best: P.best[wid] ?? null, prevBest, newBest,
    bankedLocked: !wasUnlocked && got > prevStars, roomGuest,
  };
  return lastResult;
}

/** The world a finished map's end opened (its id) when the newly opened map is in another world, else null. */
function groupIdOf(from, opened) { const g = opened ? newWorldOf(from, opened) : null; return g ? g.id : null; }
/** The answer for an end that was already recorded: nothing new (no stars, unlocks, pawns or titles gained again). */
function dupResult(e, learn) {
  const wid = WIDS.includes(e.worldId) ? e.worldId : 'w1';
  return { worldId: wid, learn: !!learn, duplicate: true, prevStars: P.stars[wid] || 0, newStars: P.stars[wid] || 0, earned: 0, gained: 0, wouldStars: 0,
    unlockedWorld: null, unlockedGroup: null, newPawns: [], newAchievements: [], titleBefore: title(), titleAfter: title(), totalBefore: totalStars(), totalAfter: totalStars(),
    best: P.best[wid] ?? null, prevBest: P.best[wid] ?? null, newBest: false, bankedLocked: false, learnGames: P.learnGames };
}

/* ---------------- "מה למדתי" — decision quality & principle mastery across games (local only, never synced) */
// Engine contract (ENGINE.md §8 / checkEnd): end.learning = {decisionQuality 0..100|null, decisions, verdicts, luck:{total ₪, parts},
//   principles:{id:{mastery 0..1, n, shown}} (a bare number is accepted too), top, sentence}.
function freshLearn() { return { games: 0, dq: [], principles: {}, lastSig: null }; }
function cleanLearn(l) {
  const out = freshLearn();
  if (!l || typeof l !== 'object') return out;
  out.games = Math.max(0, Math.floor(+l.games) || 0);
  out.dq = (Array.isArray(l.dq) ? l.dq : []).map((x) => Math.round(+x)).filter((x) => x >= 0 && x <= 100).slice(-LEARN_GAMES);
  for (const [id, v] of Object.entries(l.principles && typeof l.principles === 'object' ? l.principles : {})) {
    if (!/^[a-z_]{2,32}$/.test(id) || !v || !Number.isFinite(+v.m)) continue;
    out.principles[id] = { m: clamp01(+v.m), n: Math.max(0, Math.floor(+v.n) || 0), games: Math.max(0, Math.floor(+v.games) || 0), last: clamp01(+v.last || +v.m), prev: v.prev == null ? null : clamp01(+v.prev) };
  }
  out.lastSig = typeof l.lastSig === 'string' ? l.lastSig : null;
  return out;
}
/** Normalised principles of one game: [{id, mastery 0..1, n}] (accepts {id: number} or {id: {mastery, n}}). */
export function gamePrinciples(learning) {
  const pr = learning && learning.principles; if (!pr || typeof pr !== 'object') return [];
  const out = [];
  for (const [id, v] of Object.entries(pr)) {
    if (!/^[a-z_]{2,32}$/.test(id)) continue;
    const m = typeof v === 'number' ? v : v && v.mastery;
    if (!Number.isFinite(+m)) continue;
    out.push({ id, mastery: clamp01(+m), n: Math.max(1, Math.floor(+(v && v.n)) || 1) });
  }
  return out;
}
/** Fold one game's learning block into the profile. Returns {improved:{id,from,to}|null, missed:{id,mastery}|null, strongest, dqAvgBefore}
 *  or null when the block is missing. Same game twice (sig) → the first answer again. */
let lastLearn = null;
export function recordLearning(learning, sig = null) {
  if (!learning || typeof learning !== 'object') return null;
  const L = P.learn || (P.learn = freshLearn());
  if (sig && L.lastSig === sig && lastLearn) return lastLearn;
  const q = learning.decisionQuality;
  const ps = gamePrinciples(learning);
  const hasQ = q != null && q !== '' && Number.isFinite(+q);
  if (!hasQ && !ps.length) return null;
  const dqBefore = L.dq.length ? Math.round(L.dq.reduce((a, b) => a + b, 0) / L.dq.length) : null;
  if (hasQ) L.dq = [...L.dq, Math.max(0, Math.min(100, Math.round(+q)))].slice(-LEARN_GAMES);
  let improved = null; let missed = null; let strongest = null;
  for (const g of ps) {
    const old = L.principles[g.id];
    const from = old ? old.m : null;
    const w = old ? Math.min(old.n, LEARN_WEIGHT_CAP) : 0;
    const m = old ? (old.m * w + g.mastery * g.n) / (w + g.n) : g.mastery;
    L.principles[g.id] = { m: Math.round(m * 1000) / 1000, n: (old ? old.n : 0) + g.n, games: (old ? old.games : 0) + 1, last: g.mastery, prev: from };
    if (from != null && g.mastery - from > 0.04 && (!improved || g.mastery - from > improved.to - improved.from)) improved = { id: g.id, from, to: g.mastery };
    if (g.mastery < 0.6 && (!missed || g.mastery < missed.mastery || (g.mastery === missed.mastery && g.n > missed.n))) missed = { id: g.id, mastery: g.mastery, n: g.n };
    if (g.mastery >= 0.7 && (!strongest || g.mastery > strongest.mastery || (g.mastery === strongest.mastery && g.n > strongest.n))) strongest = { id: g.id, mastery: g.mastery, n: g.n };
  }
  L.games += 1; L.lastSig = sig || null;
  changed();
  lastLearn = { improved, missed, strongest, dqAvgBefore: dqBefore, games: L.games };
  return lastLearn;
}
/** Profile view: {games, dqAvg, dqLast, dqTrend (last − average of the earlier ones), principles:[{id, mastery, n, games, last, prev}] best first}. */
export function learningSummary() {
  const L = P.learn || freshLearn();
  const dq = L.dq; const last = dq.length ? dq[dq.length - 1] : null;
  const earlier = dq.slice(0, -1);
  const avg = dq.length ? Math.round(dq.reduce((a, b) => a + b, 0) / dq.length) : null;
  const trend = earlier.length ? last - Math.round(earlier.reduce((a, b) => a + b, 0) / earlier.length) : null;
  const principles = Object.entries(L.principles).map(([id, v]) => ({ id, mastery: v.m, n: v.n, games: v.games, last: v.last, prev: v.prev }))
    .sort((a, b) => b.mastery - a.mastery || b.n - a.n);
  return { games: L.games, dqAvg: avg, dqLast: last, dqTrend: trend, dqHistory: dq.slice(), principles };
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
    // T4 §4.6 (review M-3): a player the server knows has finished games is never onboarded again on a new device
    if (+m.games > 0 && !P.tutorialDone) { P.tutorialDone = true; ch = true; }
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
  for (const w of SYNC_IDS) if ((P.stars[w] || 0) > (+((prof.stars || {})[w]) || 0)) return true;
  const have = new Set(prof.achievements || []);
  if (P.achievements.some((id) => !have.has(id))) return true;
  if (P.pawnChosenAt && prof.pawn !== P.pawn) return true;
  const m = prof.meta || {};
  if (P.gamesPlayed > (+m.games || 0) || P.wins > (+m.wins || 0)) return true;
  for (const [w, v] of Object.entries(P.best)) if (SYNC_IDS.includes(w) && v != null && !(+((m.best || {})[w]) <= v)) return true;
  return false;
}
const profileMeta = () => ({ games: P.gamesPlayed, wins: P.wins, best: Object.fromEntries(Object.entries(P.best).filter(([w]) => SYNC_IDS.includes(w))) });
/** Stars the server profile receives: the worlds it knows (lazy unranked worlds stay local until the DB migration — DRAFT 2026112x_worlds). */
const syncStars = () => Object.fromEntries(Object.entries(P.stars).filter(([w]) => SYNC_IDS.includes(w)));
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
      const prof = await net.syncProgress({ stars: syncStars(), achievements: P.achievements, pawn: P.pawn, meta: profileMeta() });
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
export function _reset(p) { P = { ...fresh(), ...(p || {}) }; P.stars = { ...fresh().stars, ...(P.stars || {}) }; P.best = { ...(P.best || {}) }; P.learn = cleanLearn(P.learn); cleanT4(P); P.cleared = cleanCleared(P); P.endSigs = cleanSigs(P.endSigs); migrateGroups(P, p || null); session = new Set(); lastSig = null; lastResult = null; lastLearn = null; lastLearnSig = null; lastLearnRes = null; lastDreamSig = null; changed(); }
export { ACHIEVEMENTS, WIDS, WORLD_GROUPS, ORDER };
