// Lobby / meta layer for מירוץ העכברים 2.0: world map (home), world + character picker, daily & weekly challenges,
// groups & group challenges, profile (pawns, achievements, recovery code) and the END SCREEN.
// Renders into #lobby-root inside #start (owned by index.html). Talks to the game only through the contract:
//   game.js: startGame(cfg), savedGame(key), clearSave(key), hasActiveGame(), activeConfig()
//   bus:     'game:end' (→ end screen), 'achievement' (→ store + toast)
// Exports: openLobby(view?), closeLobby(), showEndScreen(payload)  (view: 'home'|'profile'|'world:w2'|{k:'world',id}|{k:'group',id})
import { net } from './net.js';
import { bus } from './bus.js';
import { WORLDS, getWorld } from './worlds/index.js';
import { characterCard, starThresholds, starsFor, fmt, fmtM, createGame, metrics } from './engine.js';
import * as ENG from './engine.js';                       // T4 feature detection only (DREAMS, MENTOR_LEVELS, TUTORIAL_FREE_ROLLS…)
import { ACHIEVEMENTS, titleFor, TITLES } from './achievements.js';
import * as P from './progress.js';
import * as EN from './energy.js';
import * as LIB from './library.js';
import { reducedMotion, motionPref, setMotionPref, initMotion } from './motion.js';
import { catName } from './data/lessons-meta.js';
import { PRACTICE } from './practice.js';
import { flag } from './flags.js';
import { metaOf } from './worlds/meta.js';            // worlds wave 0: the 12-world map is meta only (P.worldMap()); rules load on demand
import { groupOf, mapNo, mapLabel, groupLabel } from './worlds-groups.js';   // 2026-11-25: every level is a מפה inside one of 6 עולמות

/* ============================================================ small helpers */
const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const asset = (p) => new URL('../' + p, import.meta.url).href;
/** Escape + isolate every money token ("−₪79,790", "+₪7,500", "$9,000", "₪1.25" of "₪1.25 מיליון") so RTL never flips it. */
const MONEY_RE = /[−+-]?[₪$]\d{1,3}(?:,\d{3})*(?:\.\d+)?/g;
const iso = (t) => esc(t).replace(MONEY_RE, (m) => `<bdi dir="ltr" class="lb-num">${m}</bdi>`);
/** Isolate a whole short LTR token (numbers, "6 / 12", percentages). */
const num = (t) => `<bdi dir="ltr" class="lb-num">${esc(t)}</bdi>`;
/** Server / other-player numbers → a safe integer before they touch markup (strings like "<img …>" become the fallback). */
const int = (v, d = 0) => { const n = Math.floor(+v); return Number.isFinite(n) ? n : d; };
const HEX_RE = /^#[0-9a-f]{3,8}$/i;
// T7 CR-33 / PF-5: WebP copies of the 800×480 card PNGs (q90, ~20 KB instead of ~280 KB each, PSNR ≥ 36 dB); the PNGs stay in assets/
const cardArt = (wid) => asset(`assets/${wid}/card.webp`);
const freeKey = (wid) => 'rr2-save-free-' + wid;
/** T4 IR-T4-1: learning games have their own slot (rr2-save-learn-<w>); game.js saveKeyFor owns the rule, this is the fallback. */
const slotKey = (wid, learn = false) => (learn ? ((G && G.saveKeyFor && safe(() => G.saveKeyFor({ mode: 'free', worldId: wid, learn: true }))) || 'rr2-save-learn-' + wid) : freeKey(wid));
const rankedKey = (rid) => 'rr2-save-' + rid;
const randSeed = () => Math.floor(Math.random() * 2147483646) + 1;
/** The full world config, or — for a known world whose rules are not loaded yet (lazy) — a meta-shaped stand-in with the fields the
 *  lobby reads for names and lines (never used for a character picker or a game: those await ensureRules first). */
const worldOf = (id) => {
  try { return getWorld(id || 'w1'); } catch (e) { /* not loaded / unknown */ }
  const m = metaOf(id); if (!m) return WORLDS[0];
  return { ...m, stub: true, goal: {}, lesson: '', characters: (m.characters || []).map((c) => ({ ...c, expenses: [], assets: [] })) };
};
/** worlds wave 0 + w5: the map (P.worldMap(): every world, playable and planned) — w1–w4 from the engine if progress is older */
const mapList = () => safe(() => P.worldMap(), null) || WORLDS.map((w) => ({ id: w.id, order: w.order, mapNo: w.order, tier: w.order, name: w.name, tagline: w.tagline, playable: true, status: 'core', unlocked: P.isUnlocked(w.id), unlock: [], lockText: '', characters: w.characters }));
const playableMap = () => mapList().filter((m) => m.playable);
/** Are the full rules of a world in memory (w1–w4 always; a lazy world after ensureRules)? */
const rulesReady = (id) => safe(() => !!getWorld(id), false);
const lazyLoads = new Map();   // id → 'loading' | 'error'
/** Load a lazy world's rules (no-op for w1–w4) → true, or false after telling the player (toast). */
async function ensureRules(id, { quiet = false } = {}) {
  if (!id || id === 'h' || rulesReady(id)) return true;
  const m = metaOf(id); if (!m || !m.playable) return false;
  lazyLoads.set(id, 'loading');
  try { await P.ensureWorldRules(id); lazyLoads.delete(id); return true; }
  catch (e) { console.warn('lobby: world rules failed', id, e); lazyLoads.set(id, 'error'); if (!quiet) toast(LAZY_ERR); return false; }
}
const LAZY_ERR = 'לא הצלחנו לטעון את המפה. בדוק את החיבור ונסה שוב.';
/** Card art: w1–w4 have painted cards; later worlds get a generated card (sky gradient + motif) — never a missing image. */
const PAINTED = new Set(['w1', 'w2', 'w3', 'w4']);
const MOTIF = { w1: '🏘️', w2: '🏙️', w3: '⚓', w4: '🚀', w5: '🌴', w6: '🏭', w7: '🛍️', w8: '🏗️', w9: '☀️', w10: '🏦', w11: '🌍', w12: '👑', w13: '🏟️', w14: '🏛️', w15: '☁️', w16: '🌾', w17: '🧪', w18: '🌊', w19: '🔔' };
// generated card art: w5–w8 from their WORLD_STYLE skies, later worlds a placeholder pair
const GEN_SKY = { w5: ['#ffd6a5', '#48cae4'], w6: ['#cfd8dc', '#607d8b'], w7: ['#ef8354', '#2b2d42'], w8: ['#fde68a', '#93c5fd'], w9: ['#fef3c7', '#fbbf24'],
  w10: ['#3b82f6', '#0f172a'], w11: ['#1e1b4b', '#020617'], w12: ['#e7efe9', '#166534'], w13: ['#1e3a8a', '#0b1020'], w15: ['#4c1d95', '#1e1b4b'], w16: ['#fde68a', '#a16207'],
  w14: ['#e7e5e4', '#44403c'], w17: ['#ecfeff', '#0e7490'], w18: ['#bae6fd', '#1e3a8a'], w19: ['#fef9c3', '#14532d'] };   // 2026-11-25: the newly built maps get a card too
function artHtml(id, alt = '', extra = '') {
  if (PAINTED.has(id)) return `<img src="${cardArt(id)}" alt="${esc(alt)}" ${extra}>`;
  const [a, b] = GEN_SKY[id] || ['#e8e0d0', '#8c7b62'];
  return `<span class="gen-art" style="--g1:${a};--g2:${b}"${alt ? ` role="img" aria-label="${esc(alt)}"` : ' aria-hidden="true"'}><span class="gen-motif" aria-hidden="true">${MOTIF[id] || '🗺️'}</span></span>`;
}
/** "לפתוח: לצאת מהשכונה" — 2026-11-25: every map opens from the built map before it (P.worldMap() lockText, linear along the worlds). */
function unlockLine(m) {
  const e = m && (m.lockText != null ? m : mapList().find((x) => x.id === m.id));
  return (e && e.lockText) || '';
}
/** The next built map after a map (null at the end) and, when the step crosses into another world, that world. */
const nextMapEntry = (id) => { const n = safe(() => P.nextMapOf(id), null); return n ? mapList().find((x) => x.id === n) || null : null; };
const newWorldOf = (from, to) => (to ? safe(() => P.newWorldOf(from, to), null) : null);
/** "🔓 נפתח עולם חדש: הכסף הגדול — מפה ראשונה: מרכז הפיננסים" / "🔓 נפתחה מפה חדשה: העיר הגדולה" (toasts, news, the repair message). */
function openedLine(from, to) {
  const g = newWorldOf(from, to); const n = worldOf(to).name;
  return g ? `🔓 נפתח עולם חדש: ${g.name} — מפה ראשונה: ${n}` : `🔓 נפתחה מפה חדשה: ${n}`;
}
const DIFF5 = ['', 'קל', 'קל־בינוני', 'בינוני', 'קשה', 'קשה מאוד'];
function diff5Html(d) { if (!d) return ''; return `<span class="map-diff" aria-label="קושי ${d} מתוך 5: ${DIFF5[d] || ''}"><span aria-hidden="true">${'●'.repeat(d)}${'○'.repeat(5 - d)}</span><em>${DIFF5[d] || ''}</em></span>`; }
const estHtml = (m) => (m && m.estMin ? `<span class="map-est">⏱️ כ־${num(String(m.estMin))} דק׳</span>` : '');
const charOf = (w, id) => w.characters.find((c) => c.id === id) || null;
/** Daily/weekly character: the server sends char_index into the world's daily list (fallback: all characters). */
function dailyChar(w, i) {
  const list = (w.daily && w.daily.chars) || w.characters.map((c) => c.id);
  const id = list[(((+i || 0) % list.length) + list.length) % list.length];
  return charOf(w, id) || w.characters[0];
}
const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
const baseUrl = () => location.origin + location.pathname;
const waHref = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);
const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);

const CHAR_ICON = { book: '📚', truck: '🚚', laptop: '💻', stethoscope: '🩺', scale: '⚖️', chef: '🧑‍🍳', chip: '📱', box: '📦', avocado: '🥑', anchor: '⚓', rocket: '🚀', gear: '⚙️', heart: '💗', hotel: '🏨', music: '🎪', factory: '🏭',
  shop: '🏪', chart: '📊', handshake: '🤝', crane: '🏗️', land: '🌾', hardhat: '👷',
  bolt: '⚡', briefcase: '💼', sun: '☀️',
  whistle: '📣', crown: '👑', sprout: '🌱',
  ship: '🚢', house: '🏡' };   // w12 chair (crown) / activist (chart) / thirdGen (sprout) · w16 agronomist (sprout) / moshavFarmer (house) / agriFund (briefcase)   // w11 ceo (briefcase) / oldExporter (ship) / pe (chart) · w15 soloFounder (rocket) / bigTechExec (briefcase) / bootstrapper (sprout)   // w13 coachOwner / localTycoon / academyDirector   // w9 gridEng / infraFund / kibbutz · w10 allocator (chart) / blockHeir (factory) / floorTrader (bolt)   // w7 shopFounder / cfo / franchisor · w8 developer / landowner / contractor
const ACH_ICON = {
  seed: '🌱', shield: '🛡️', gold: '🪙', pillow: '🛟', card: '💳', arrows: '🔁', chart: '📈', cap: '🎓', crown: '👑', feather: '🪶', piggy: '🐷',
  phoenix: '🔥', scissors: '✂️', house: '🏠', fox: '🦊', moon: '🌙', lock: '🔒', hammer: '🔨', tower: '🏙️', umbrella: '☂️', scale: '⚖️',
  anchor: '⚓', wings: '😇', unicorn: '🦄', heart: '💗', globe: '🌍', calendar: '📅', map: '🗺️', star: '⭐', trophy: '🏆',
};
const NEW_HERE = {
  basic: 'נכס מול התחייבות, הלוואות ופיתויים.',
  rate: 'ריבית שזזה, משכנתאות, שדרוגים — ואינפלציית סגנון חיים.',
  fx: 'שער הדולר, גידור, וזהב שמציל במשבר.',
  angel: 'השקעות אנג׳ל לפי חוק החזקה — ונתינה שמשנה עולם.',
};
/** v3: ★★★ also needs happiness ≥ starThresholds().happy; v3.2: and an emergency fund of starThresholds().fundMonths months. */
const HAPPY_RULE = true;
const MODE_NAME = { free: 'משחק חופשי', daily: 'האתגר היומי', weekly: 'האתגר השבועי', challenge: 'אתגר קבוצתי', history: 'מכונת הזמן' };
const PAWN_INDEX = Object.fromEntries(P.PAWNS.map((p, i) => [p.id, i]));

function timeLeft(d) {
  const ms = new Date(d) - Date.now();
  if (!(ms > 0)) return 'נסגר';
  const m = Math.ceil(ms / 6e4);
  if (m < 60) return `נשארו ${m} דק׳`;
  const h = Math.ceil(ms / 36e5);
  return h < 48 ? `נשארו ${h} שעות` : `נשארו ${Math.ceil(h / 24)} ימים`;
}
function starsHtml(n, cls = '') {
  n = Math.max(0, Math.min(3, n | 0));
  return `<span class="lb-stars ${cls}" role="img" aria-label="${n} כוכבים מתוך 3">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;
}
const starStr = (n) => { n = Math.max(0, Math.min(3, Math.floor(+n) || 0)); return '★'.repeat(n) + '☆'.repeat(3 - n); };
function titleIdx(total) { let k = 0; TITLES.forEach((t, i) => { if (total >= t.min) k = i; }); return k; }
function titleBadge(total) { return `<span class="lb-title lb-t${titleIdx(total || 0)}">${esc(titleFor(total || 0))}</span>`; }
function pawnHtml(id, color, cls = '') {
  const i = Object.hasOwn(PAWN_INDEX, id) ? PAWN_INDEX[id] : 0;
  const c = typeof color === 'string' && HEX_RE.test(color) ? color : null;
  return `<span class="lb-pawn ${cls} ${c ? '' : 'raw'}" style="--pi:${i};${c ? `--pc:${c}` : ''}" aria-hidden="true"></span>`;
}
/** 1–3 per character, from the per-character ★★ threshold (≈ median months of good play): longer = harder. */
function difficulty(w) {
  const out = {};
  const t = w.characters.map((c) => ({ id: c.id, fixed: c.difficulty, v: safe(() => starThresholds(w, c.id).t2, w.stars.t2) }));
  const vals = t.map((x) => x.v); const lo = Math.min(...vals); const hi = Math.max(...vals);
  for (const x of t) {
    if (x.fixed) out[x.id] = Math.max(1, Math.min(3, x.fixed));
    else if (hi / Math.max(1, lo) < 1.08) out[x.id] = 2;
    else out[x.id] = x.v <= lo * 1.04 ? 1 : x.v >= hi * 0.96 ? 3 : 2;
  }
  return out;
}
const DIFF = ['', 'קל', 'בינוני', 'קשה'];
function diffHtml(d) { return `<span class="wv-diff d${d}" title="קושי">${[1, 2, 3].map((i) => `<i class="${i <= d ? 'on' : ''}"></i>`).join('')}<em>${DIFF[d]}</em></span>`; }

/* ============================================================ lazy modules (game / ui / audio) */
let G = null; let gameP = null;
function game() {
  if (G) return Promise.resolve(G);
  if (!gameP) gameP = import('./game.js').then((m) => { G = m; return m; }).catch((e) => { console.error('lobby: game.js failed', e); gameP = null; return null; });
  return gameP;
}
// T7 CR-33: the T6 modules are not needed by the lobby home — loaded together with game.js (which imports them too, so the
// module map shares one copy), never before the home is usable. Every user checks for null: a world view drawn before they
// arrive simply has no branch chips (redrawn when they land, like the resume card that waits for game.js); the end screen
// (only reachable after a game, i.e. after game.js) waits for them.
//   T6S = summary.js — T6 §6 the personal end summary (graph, dimensions, more sections)
//   GH  = ghosts.js  — T6 §2 finished ghost results (only after the game) — never sent to the server
//   RW  = rewind.js  — T6 §7 practice branches (free / learn only)
let T6S = null, GH = null, RW = null, t6P = null, t6Failed = false;
// T4 §5.2 strength / weakness rows of the character cards (world view only): same post-render batch; missing → rows omitted
let CM = null;
const charMeta = (wid, cid) => (CM ? CM.charMeta(wid, cid) : null);
const cmP = () => import('./data/characters-meta.js').then((m) => { CM = m; }).catch(() => {});   // failed → the end screen falls back to the classic one
function t6Mods() {
  if (T6S && GH && RW) return Promise.resolve(true);
  return (t6P ||= Promise.all([import('./summary.js'), import('./ghosts.js'), import('./rewind.js')])
    .then(([s, g, r]) => { T6S = s; GH = g; RW = r; return true; })
    .catch((e) => { console.error('lobby: T6 modules failed', e); t6P = null; t6Failed = true; return false; }));
}
let UIp = null;
// CR-33: ui.js draws its modals / toasts with css/game-play.css — enabled (and waited for) together with the module
const playCss = () => (window.__rrPlayCss ? window.__rrPlayCss() : Promise.resolve());
const ui = () => (UIp ||= Promise.all([import('./ui.js'), playCss()]).then(([m]) => m).catch(() => ({})));
/* ---- wave 3b: live rooms + groups v2 + competitions (flag `rooms`, default OFF). js/rooms.js loads on demand (not on the boot graph). */
const roomsOn = () => flag('rooms') === true;
let RMp = null;
const roomsMod = () => (RMp ||= import('./rooms.js').catch((e) => { RMp = null; throw e; }));
let pendingRoom = safe(() => { const c = new URLSearchParams(location.search).get('room'); return c && /^[A-Za-z2-9]{6}$/.test(c) ? c.toUpperCase() : null; });
function roomsApi() {
  return {
    net, html, toast, sfx, go, worldOf, pawnHtml, waHref, baseUrl, isLobbyVisible: lobbyVisible,
    unlocked: () => P.unlockedWorlds(),
    confirm: (text, yes) => confirmAsk(text, yes),
    viewIs: (k, id) => view.k === k && (id == null || view.id === id),
    clearRoomParam: () => { pendingRoom = null; safe(() => { if (new URLSearchParams(location.search).has('room')) history.replaceState(null, '', location.pathname); }); },
    reloadGroup: (gid) => { delete cache.group[gid]; return renderGroup(gid); },
    playChallenge: (id, gid, title) => playRanked('challenge', id, gid, title),
    hasGameHook: () => !!(G && typeof G.setDriver === 'function'),
    // the room on the 3D game screen: needs game.js's wave-3b hook (setDriver); the driver keeps polling while the game is open
    playRoom: async (drv) => {
      const g = await game(); if (!g || typeof g.setDriver !== 'function') { toast('מסך המשחק עוד לא תומך בחדרים — משחקים כאן'); return false; }
      const st = drv.state; if (!st) return false;
      g.setDriver(drv);
      roomsMod().then((m) => m.leaveView(true)).catch(() => {});
      return launch(launchCfg({ worldId: st.worldId, charId: st.charId, seed: 1, mode: st.mode, room: drv.roomId, title: 'חדר חי', tutorial: false, resume: false }));
    },
  };
}
function renderRooms(v) {
  if (!roomsOn()) return renderHome();
  view = v; ++token; trace(v.k);
  return roomsMod().then((m) => m.render(roomsApi(), v)).catch((e) => { console.error(e); toast('לא הצלחנו לטעון את החדרים'); renderHome(); });
}
function fillV2(g) { if (roomsOn() && g && g.my_role) roomsMod().then((m) => { if (view.k === 'group' && view.id === g.id) return m.fillGroup(roomsApi(), g); return null; }).catch((e) => console.warn(e)); }
let AUp = null;
const audio = () => (AUp ||= import('./audio.js').catch(() => ({})));
function sfx(name) { audio().then((a) => { try { a.sfx && a.sfx(name); } catch (e) { /* ignore */ } }); }

let toastT = 0;
function toast(text) {
  if (!lobbyVisible()) { ui().then((u) => (u.toast ? u.toast(text) : miniToast(text))); return; }
  miniToast(text);
}
function miniToast(text) {
  let el = $('#lb-toast');
  if (!el) { el = document.createElement('div'); el.id = 'lb-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = text; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600);
}
function achToast(a) {
  if (lobbyVisible()) { sfx('achievement'); miniToast(`🏅 הישג חדש: ${a.name}`); return; }
  // ui.achievementToast plays its own sound
  ui().then((u) => { if (u.achievementToast) u.achievementToast({ name: a.name, desc: a.desc, icon: ACH_ICON[a.icon] || '🏅' }); else { sfx('achievement'); miniToast(`🏅 ${a.name}`); } });
}
async function copyText(text, okMsg = 'הועתק') {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove(); toast(ok ? okMsg : 'לא הצלחנו להעתיק — סמן והעתק ידנית');
  }
}

/* ============================================================ CSS + root */
function ensureCss() {
  if (document.querySelector('link[data-lobby-css]') || [...document.styleSheets].some((s) => /lobby\.css/.test(s.href || ''))) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../css/lobby.css', import.meta.url).href; l.dataset.lobbyCss = '1';
  document.head.appendChild(l);
}
const overlay = () => document.getElementById('start');
const root = () => document.getElementById('lobby-root');
const lobbyVisible = () => { const o = overlay(); return !!o && !o.hidden; };
function html(markup) {
  const r = root(); if (!r) return;
  r.innerHTML = markup;
  imgFallbacks(r);
  const o = overlay(); if (o) o.scrollTop = 0;
}
/** Broken art → hide/remove it. No inline onerror="…" handlers (so a CSP without 'unsafe-inline' scripts works):
 *  a capture-phase listener on the root (install) + a sweep for images that already failed before it ran. */
function imgFallback(img) { if (!img || !img.dataset || !img.dataset.fallback) return; if (img.dataset.fallback === 'hide') img.style.display = 'none'; else img.remove(); }
function imgFallbacks(r) { r.querySelectorAll('img[data-fallback]').forEach((img) => { if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) imgFallback(img); }); }

/* ============================================================ state */
let view = { k: 'home' };
let token = 0;
let booted = false; let installed = false;
let pendingJoin = safe(() => new URLSearchParams(location.search).get('join'));
/** ?ref=<player id> from any invite/duel/share link: kept until this device registers (referrer gets +5⚡ on the server). */
const REFK = 'rr2-ref';
safe(() => { const r = new URLSearchParams(location.search).get('ref'); if (r && /^[\w-]{8,64}$/.test(r) && !net.hasMe()) localStorage.setItem(REFK, r); });
const pendingRef = () => safe(() => localStorage.getItem(REFK)) || null;
/** Append &ref=<my id> to every link we hand out. */
function withRef(url) {
  const id = safe(() => net.refId && net.refId()); if (!id) return url;
  return url + (url.includes('?') ? '&' : '?') + 'ref=' + encodeURIComponent(id);
}
const cache = { daily: null, weekly: null, groups: null, group: {} };
let endCtx = null;
let duelShown = false;
let lastEndSig = null;

function normalize(v) {
  if (!v) return { k: 'home' };
  if (typeof v === 'string') { const [k, id] = v.split(':'); return { k, id }; }
  // T4 IR-T4-6: {view:'world', id, learn:true} from the in-game "out of ⚡" card
  if (v.view) { const n = normalize(v.view); if (v.id && !n.id) n.id = v.id; if (v.learn) n.learn = true; return n; }
  return v.k ? v : { k: 'home' };
}

/* ============================================================ public API */
export function openLobby(v) {
  ensureCss(); install();
  const o = overlay(); if (!o) { console.error('lobby: #start not found'); return; }
  o.hidden = false; o.classList.add('lb-open'); document.body.classList.add('lb-lobby-open'); syncInert();
  if (!booted) { booted = true; boot(); }
  else if (runEndRepair() && !(v && v.k === 'end')) setTimeout(() => { if (lobbyVisible() && !typing()) rerender(); }, 0);
  const nv = normalize(v);
  if (nv.k !== 'world') worldMode = nv.learn ? 'learn' : null;
  if (nv.k === 'end' && !endCtx) nv.k = 'home';
  if (pendingDuel && nv.k === 'home' && !duelShown) { duelShown = true; nv.k = 'duel'; }
  // T4 verify D7: a player from before the welcome (progress, but no rr2-onboarded) is onboarded already — mark it, no welcome
  if (!safe(() => localStorage.getItem(ONBK)) && (completedAny() || P.getProgress().onboarded)) safe(() => localStorage.setItem(ONBK, '1'));
  if (nv.k === 'home' && pendingRoom && roomsOn() && net.hasMe()) { nv.k = 'rooms'; nv.code = pendingRoom; }   // wave 3b: ?room=CODE
  if (nv.k === 'home' && !pendingJoin && !pendingDuel && !safe(() => localStorage.getItem(ONBK))) nv.k = 'welcome';
  claimGifts();
  checkAdmin();
  startEnergyTicker();
  go(nv);
}
export function closeLobby() {
  stopGroupRefresh(); stopEnergyTicker();
  const o = overlay(); if (o) { o.hidden = true; o.classList.remove('lb-open'); }
  document.body.classList.remove('lb-lobby-open'); syncInert();
  closeLesson(false); worldMode = null; dreamOpen = false;
}
function go(v) { const r = goRender(v); focusView(); return r; }
/** T7 K-2 / CR-03: after a view render focus never stays on <body> (or on a node the render replaced). A render's own initial
 *  focus (focusSoon, 30 ms) wins; otherwise the view's heading (tabindex=-1), else its first control. */
function focusView() {
  setTimeout(() => {
    if (!lobbyVisible()) return;
    const a = document.activeElement, o = overlay(), r = root();
    if (!r || (a && a !== document.body && a.isConnected && o && o.contains(a))) return;
    if (a && a !== document.body && a.isConnected && a.closest('#gm:not([hidden]), #evm:not([hidden])')) return;   // a dialog over the lobby keeps it
    const h = r.querySelector('h1') || r.querySelector('h2');
    const t = h || r.querySelector(FOCUSABLE);
    if (!t) return;
    if (h && !h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    safe(() => t.focus({ preventScroll: true }));
  }, 80);
}
function goRender(v) {
  view = v;
  if (v.k !== 'group') stopGroupRefresh();
  if (v.k !== 'room' && RMp) RMp.then((m) => m.leaveView()).catch(() => {});
  switch (v.k) {
    case 'rooms': case 'room': return renderRooms(v);
    case 'world': return renderWorld(v.id, { learn: !!v.learn });
    case 'group': return renderGroup(v.id);
    case 'profile': return renderProfile();
    case 'end': return renderEnd();
    case 'duel': return renderDuel();
    case 'welcome': return renderWelcome();
    case 'library': return renderLibrary();
    case 'history': return renderHistory();
    case 'groups': renderHome(); return setTimeout(() => $('#lbGroups')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    case 'daily': renderHome(); return setTimeout(() => $('#lbDaily')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    default: return renderHome();
  }
}
const rerender = () => { if (lobbyVisible() && view.k !== 'end') go(view); };

/** wave 3b: a boot-time re-render never wipes what the player is typing (a nickname typed before the game modules finished loading
 *  was replaced together with its form, and its Enter went nowhere — seen as a flaky "#lbDaily" wait in the lobby suites). */
function typing() {
  const r = root(); if (!r) return false;
  const a = document.activeElement;
  if (a && r.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
  return [...r.querySelectorAll('input[type="text"], input:not([type]), textarea')].some((x) => !x.readOnly && x.value);
}
/** P0b 2026-11-24: a free / practice game that ENDED (won or lost) but whose end never reached the lobby — the page was closed
 *  or reloaded during the celebration — is recorded now from its save (stars, best, the next world). The save is marked
 *  endSent so a later resume does not deliver it again; progress also dedupes by game signature. Ranked games are left to
 *  their own server flow. Returns the worlds that opened. */
function repairUnrecordedEnds() {
  const opened = [];
  for (const w of WORLDS) {
    for (const learn of [false, true]) {
      const key = learn ? 'rr2-save-learn-' + w.id : freeKey(w.id);
      let raw = null; try { raw = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { raw = null; }
      const st = raw && parseState(raw.state); const r = st && st.result; const cfg = (raw && raw.cfg) || {};
      if (!st || !st.over || !r || (st.ui && st.ui.endSent) || (cfg.mode && cfg.mode !== 'free') || cfg.resultId || st.history) continue;
      if (st.worldId !== w.id || (r.status !== 'won' && r.status !== 'lost')) continue;
      const e = { status: r.status, stars: r.stars || 0, months: r.months, netWorth: r.netWorth, passive: r.passive, expenses: r.expenses, progress: r.progress,
        worldId: st.worldId, charId: st.charId, mode: 'free', resultId: null, end: r, achievements: Array.isArray(st.ach) ? st.ach.slice() : [], seed: (st.seed >>> 0), learn };
      const res = safe(() => (learn ? P.recordLearnGame(e) : P.recordGame(e)), null);
      if (res && res.unlockedWorld) opened.push({ from: w.id, to: res.unlockedWorld });
      try { st.ui = { ...(st.ui || {}), endSent: true }; localStorage.setItem(key, JSON.stringify({ ...raw, state: typeof raw.state === 'string' ? JSON.stringify(st) : st })); } catch (x) { /* storage full: progress dedupes anyway */ }
    }
  }
  return opened;
}
/** P0b: run the repair (boot, and every time the lobby opens — e.g. "לובי" pressed during the win celebration), never while a
 *  game is still delivering its own end. Tells the player what opened. */
function runEndRepair() {
  if (G && typeof G.isEnding === 'function' && safe(() => G.isEnding(), false)) return;
  const repaired = safe(() => repairUnrecordedEnds(), []) || [];
  if (repaired.length) setTimeout(() => toast(`${repaired.map((x) => openedLine(x.from, x.to)).join(' · ')} — הניצחון הקודם שלך נשמר`), 600);
  return repaired.length > 0;
}
function boot() {
  runEndRepair();
  migrateReveal();   // T4 §4.6: once — existing players → rr2-reveal.all (no tutorial, gradual HUD or hints)
  // CR-33: the in-game graph starts loading right AFTER this first render (a task later), so it never delays the home itself
  setTimeout(() => Promise.all([game(), t6Mods(), cmP(), playCss()]).then(([m]) => { if ((m || CM) && lobbyVisible() && (view.k === 'home' || view.k === 'world') && !typing()) rerender(); }), 0);
  P.syncFromServer().then((ch) => { if (ch) revealAfterMerge(); if (ch && lobbyVisible() && (view.k === 'home' || view.k === 'profile') && !typing()) rerender(); });
  flushPending();
  scenarios(); LIB.lessons().then(() => { const el = $('.map-lib'); if (el) el.outerHTML = libraryCard(); });
  if (pendingJoin) {
    if (net.hasMe()) { const c = pendingJoin; setTimeout(() => joinCode(c), 0); }
  }
}

/* ============================================================ starting games */
function launchCfg(extra) { const p = P.getProgress(); return { pawn: p.pawn, pawnColor: p.pawnColor, ...extra }; }
async function launch(cfg) {
  const g = await game();
  if (!g || !g.startGame) { toast('לא הצלחנו לטעון את המשחק. בדוק את החיבור ורענן את הדף.'); return false; }
  // worlds wave 0: a lazy world's rules load BEFORE createGame / resume / deserialize (game.js checks again for starts that skip the lobby)
  if (cfg && cfg.worldId && !rulesReady(cfg.worldId)) { miniToast('טוען את המפה…'); if (!(await ensureRules(cfg.worldId))) return false; }
  lastEndSig = null;
  P.beginSession(); sessLessons = [];
  closeLobby();
  try { const r = await g.startGame(cfg); return r !== false; } // false = handled by game.js (message shown / lobby reopened)
  catch (e) { console.error(e); openLobby(view); toast('משהו השתבש בפתיחת המשחק'); return false; }
}
async function confirmAsk(text, yes, no = 'ביטול') {
  const u = await ui();
  if (u.confirmBox) { try { return !!(await u.confirmBox(text, { yes, no })); } catch (e) { /* fall through */ } }
  return window.confirm(text);
}
/** Free game. opts: {seed, title, duel, noAsk, learn, quick} — duel reuses a known seed. Asks before replacing a save.
 *  T4: learn → learning mode (own slot, no ⚡/stars/achievements); dream + mentor from progress; tutorial per §4.6. */
async function startFree(worldId, charId, opts = {}) {
  if (!P.isUnlocked(worldId) && !opts.duel) return go({ k: 'world', id: worldId });
  if (!(await ensureRules(worldId))) return false;
  const learn = !!opts.learn && !opts.duel;
  const g = await game();
  const key = slotKey(worldId, learn);
  const sv = g && safe(() => g.savedGame(key));
  // T6 review M1: the end of a practice branch is a learning end, but the learning slot holds the player's ORIGINAL — always ask
  const fromBranch = !!(endCtx && endCtx.e && endCtx.e.branch && view.k === 'end');
  if (sv && (!opts.noAsk || fromBranch)) {
    const ok = await confirmAsk(`יש לך ${learn ? 'תרגול שמור' : 'משחק שמור'} ${P.inW(worldOf(worldId).name)} (${sv.charName || ''}, חודש ${sv.month}). משחק חדש ימחק אותו.`, 'משחק חדש');
    if (!ok) return false;
  }
  if (sv) safe(() => g.clearSave(key));
  P.markWorldSeen(worldId); if (!opts.duel) P.setLastChar(worldId, charId);
  if (!opts.duel && !opts.quick) P.setLastMode(learn ? 'learn' : 'normal');
  sfx('click');
  const prog = P.getProgress();
  // §4.6: the tutorial runs in a brand-new player's first w1 game (or once after "הדרכה מלאה במשחק הבא"), never in a duel / replayed
  // board, and never again for a player with finished games (review M-3: a restore / server merge can leave tutorialDone false)
  const w1 = worldId === 'w1' && !opts.duel && !opts.seed;
  const tutorial = w1 && (P.consumeTutorialReplay() || (!prog.tutorialDone && !completedAny(prog)));
  const cfg = { worldId, charId, seed: opts.seed || randSeed(), mode: 'free', tutorial, resume: false, bailout: learn ? true : P.bailoutAvailable() };
  // review M-2: the 10 free rolls (D-9) belong to the player's very first game only — a replayed tutorial keeps its coaches, not the rolls
  if (tutorial && !learn && P.firstEverGame()) cfg.tutorialFree = true;
  if (learn) cfg.learn = true;
  if (prog.dream && !opts.duel) cfg.dream = prog.dream;                       // engine ignores it until E-7 lands
  if (mentorLevels()) cfg.mentor = tutorial ? 'guide' : (mentorAllowed(prog.mentorPref, prog) && prog.mentorPref) || undefined;
  if (cfg.mentor === undefined) delete cfg.mentor;
  if (opts.title) cfg.title = opts.title;
  if (opts.duel) cfg.duel = opts.duel;
  return launch(launchCfg(cfg));   // T4: P.setTutorialDone() is no longer called on launch (bus 'onboard:done' / recordGame)
}
async function continueFree(worldId, { learn = false } = {}) {
  const g = await game(); const sv = g && safe(() => g.savedGame(slotKey(worldId, learn)));
  if (!sv) { toast('לא מצאנו משחק שמור'); return rerender(); }
  return launch(launchCfg({ ...sv.cfg, resume: true, bailout: sv.cfg && sv.cfg.learn ? true : P.bailoutAvailable() }));
}
/* -------- server checkpoints (anti-replay): never restart a ranked game from turn 0 when the server has progress */
function parseState(x) { if (!x) return null; if (typeof x === 'string') { try { return JSON.parse(x); } catch (e) { return null; } } return typeof x === 'object' ? x : null; }
/** Monotonic progress key of an engine state: later turn, later event, resolved after pending. */
function stateKey(st) { if (!st) return -1; return (+st.turn || 0) * 1e6 + (+st.nextEventId || 0) * 2 + (st.pending ? 0 : 1) + (st.over ? 0.5 : 0); }
function localSaveState(key) { try { const raw = JSON.parse(localStorage.getItem(key) || 'null'); return raw && raw.state ? parseState(raw.state) : null; } catch (e) { return null; } }
let rankedBusy = false;
async function playRanked(mode, challengeId = null, groupId = null, title = '') {
  if (!net.hasMe()) return needNick();
  if (rankedBusy) return; rankedBusy = true;
  try {
    await flushPending();
    let r;
    try { r = await net.begin(mode, challengeId); } catch (e) { toast(e.message); return; }
    if (r.status !== 'playing') { toast('כבר סיימת את המשחק הזה'); return rerender(); }
    if (pendingList().some((x) => x.resultId === r.result_id)) { toast('התוצאה הקודמת שלך עוד לא נשמרה. בדוק חיבור ונסה שוב.'); return; }
    if (mode === 'daily') P.setDaily({ streak: r.streak, last: P.israelDate() });
    const g = await game();
    if (!g) { toast('המשחק עוד נטען… נסה שוב'); return; }
    const key = rankedKey(r.result_id);
    const sv = safe(() => g.savedGame(key));
    const w = worldOf(r.world);
    const charId = (r.char && charOf(w, r.char)) ? r.char : dailyChar(w, r.char_index).id;
    const cfg = { worldId: w.id, charId, seed: Number(r.seed), mode, resultId: r.result_id, challengeId: challengeId || null, groupId: r.group_id || groupId || null,
      title: r.title || title || MODE_NAME[mode], tutorial: false, resume: false };
    if (mode === 'daily' && r.max_months != null) cfg.maxMonths = +r.max_months;
    const dk = rankedDateKey(mode, r, challengeId, r.group_id || groupId); if (dk) cfg.dateKey = dk;   // T2 review B1 (CR-29): the rule set follows the server's day key
    const cpTurn = +r.checkpoint_turn || 0;
    if (cpTurn > 0) {
      const server = parseState(r.checkpoint);
      const local = sv ? localSaveState(key) : null;
      // game.js keeps a monotonic counter in state.ui.seq (= the checkpoint turn); fall back to the engine's own counters
      const lseq = local && local.ui && local.ui.seq; const sseq = (server && server.ui && server.ui.seq) ?? cpTurn;
      const localNewer = local && (lseq != null ? lseq > sseq : stateKey(local) > stateKey(server));
      if (sv && localNewer) return launch(launchCfg({ ...sv.cfg, resume: true }));
      if (!server) { toast('לא הצלחנו לטעון את ההתקדמות שלך מהשרת. נסה שוב בעוד רגע.'); return; }
      if (sv) safe(() => g.clearSave(key));
      return launch(launchCfg({ ...cfg, state: server, checkpointTurn: cpTurn }));
    }
    if (sv) return launch(launchCfg({ ...sv.cfg, resume: true }));
    return launch(launchCfg(cfg));
  } finally { rankedBusy = false; }
}
/** The day key the verifier uses for this ranked result (verify_core rulesFor): daily → the Israel date of the daily key,
 *  weekly → the ISO week key, challenge → the Israel date the challenge was created. rr_begin may return it as date_key (preferred);
 *  otherwise it comes from what the lobby already fetched (rr_daily / rr_weekly key, the group's challenge starts_at — assumed equal
 *  to created_at) and, last, from today's Israel date at the moment rr_begin answered. */
function rankedDateKey(mode, r, challengeId, groupId) {
  if (r && r.date_key) return String(r.date_key);
  const today = P.israelDate();
  if (mode === 'daily') return cache.daily && cache.daily.key === today ? cache.daily.key : today;
  if (mode === 'weekly') {
    if (cache.weekly && cache.weekly.key && /^\d{4}-W\d{1,2}$/.test(cache.weekly.key)) return cache.weekly.key;
    const [y, m, d] = today.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d)); const dow = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dow + 3); const wy = t.getUTCFullYear(); const w1 = new Date(Date.UTC(wy, 0, 4));
    const wk = 1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7);
    return `${wy}-W${String(wk).padStart(2, '0')}`;
  }
  if (mode === 'challenge') {
    const g = groupId && cache.group[groupId]; const c = g && (g.challenges || []).find((x) => x.id === challengeId);
    const at = c && (c.created_at || c.starts_at);
    return at ? P.israelDate(new Date(at)) : today;
  }
  return null;
}
function needNick() {
  toast('צריך כינוי קודם — שנייה אחת');
  if (view.k !== 'home') renderHome();
  setTimeout(() => { const i = $('#lb-root-nick') || $('[data-form="nick"] input'); if (i) { i.scrollIntoView({ behavior: 'smooth', block: 'center' }); i.focus({ preventScroll: true }); } }, 60);
}

/* ============================================================ pending finishes (offline-safe ranked submit) */
const PKEY = 'rr2-pending-finish';
function pendingList() { try { const l = JSON.parse(localStorage.getItem(PKEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function setPending(l) { try { localStorage.setItem(PKEY, JSON.stringify(l)); } catch (e) { /* ignore */ } }
function addPending(a) { setPending([...pendingList().filter((x) => x.resultId !== a.resultId), a]); }
function dropPending(id) { setPending(pendingList().filter((x) => x.resultId !== id)); }
/* -------- server verification (docs/VERIFY_INTEGRATION.md §3): finish → verify(resultId, actions).
   The action log rides in the pending item, NEVER inside the finish stats (rr_finish drops stats ≥ 16 KB).
   Retryable answers (offline, 503 engine_unavailable during a release, 5xx, 429, 409 not_finished) keep the item
   queued as {finished:true}; anything else is final. Old saves without a log are finished and simply not verified. */
const VERIFY_RETRY = ['offline', 'engine_unavailable', 'rate_limited', 'server_error', 'not_finished'];
const VERIFY_MAX_TRIES = 30;                 // client-side cap (the server also caps real attempts per result)
const VERIFY_MAX_AGE = 14 * 864e5;           // give up on very old queued verifications
const verifyRetryable = (e) => !!e && (VERIFY_RETRY.includes(e.code) || +e.status >= 500 || /^http_5/.test(String(e.code || '')));
/** Finish (unless already done) then verify. → {drop, verified: true|false|null, retry, error?}. Throws when finish failed retryably. */
const verifyOutcome = new Map();          // resultId → last sendResult answer (submitResult may find flushPending got there first)
async function sendResult(a) { const r = await sendResult0(a); verifyOutcome.set(a.resultId, r); return r; }
async function sendResult0(a) {
  if ((metaOf((a.stats && a.stats.world) || a.worldId) || {}).ranked === false) return { drop: true, verified: null, error: 'unranked_world' };   // never sent (net.finish refuses too)
  if (!a.finished) {
    try { await net.finish(a); }
    catch (e) {
      if (['result_not_found', 'unauthorized'].includes(e.code)) return { drop: true, verified: null, error: e.code };
      if (e.code !== 'already_finished') throw e;
    }
    a.finished = true;
  }
  if (!Array.isArray(a.actions) || !a.actions.length || typeof net.verify !== 'function') return { drop: true, verified: null };
  try {
    const v = await net.verify(a.resultId, a.actions);
    return { drop: true, verified: v && v.verified === true ? true : v && v.verified === false ? false : null, already: !!(v && v.already), error: v && v.error };
  } catch (e) {
    a.vtries = (+a.vtries || 0) + 1; a.firstAt = a.firstAt || Date.now();
    if (e.code === 'not_finished') a.finished = false;              // the server lost the finish: send it again next time
    if (verifyRetryable(e) && a.vtries < VERIFY_MAX_TRIES && Date.now() - a.firstAt < VERIFY_MAX_AGE) return { drop: false, verified: null, retry: true, error: e.code };
    return { drop: true, verified: null, error: e.code };
  }
}
let verifyTimer = null;
function scheduleVerifyRetry(ms = 90000) { if (verifyTimer) return; verifyTimer = setTimeout(() => { verifyTimer = null; flushPending(); }, ms); }
let flushing = null;
function flushPending() {
  if (flushing) return flushing;
  flushing = (async () => {
    const me = net.me();
    let again = false;
    for (const a of pendingList()) {
      if (!me || (a.pid && a.pid !== me.id)) continue;
      try { const r = await sendResult(a); if (r.drop) dropPending(a.resultId); else { addPending(a); again = true; } }
      catch (e) { if (['already_finished', 'result_not_found', 'unauthorized'].includes(e.code)) dropPending(a.resultId); }
    }
    if (again) scheduleVerifyRetry();
  })().finally(() => { flushing = null; });
  return flushing;
}
if (typeof addEventListener === 'function') addEventListener('online', () => { if (pendingList().length) flushPending(); });

/* ============================================================ shared fragments */
function topBar() {
  const p = P.getProgress(); const me = net.me(); const total = P.totalStars(p); const si = P.streakInfo();
  const streak = si.streak;
  // T7 AX-2 (CR-12) label-in-name: the player and ⚡ buttons are named by their visible text plus a hidden lead-in (no aria-label)
  return `<header class="lb-top">
    <p class="lb-rights">כל הזכויות שמורות להשם יתברך (לאורי קינן)</p>
    <div class="lb-logo" aria-label="מירוץ העכברים">מירוץ<br>העכברים</div>
    <button class="lb-player" data-act="profile">
      <span class="sr">הפרופיל שלי: </span>${pawnHtml(p.pawn, p.pawnColor, 'md')}
      <span class="lb-pl-txt"><b class="lb-pl-name">${me ? esc(me.nickname) : 'אורח'}</b>${titleBadge(total)}</span>
      <span class="lb-pl-stats"><span class="lb-pl-star" title="כוכבים"><span aria-hidden="true">★</span> ${total}<span class="sr"> כוכבים</span></span>${streak ? `<span class="lb-pl-fire ${si.playedToday ? '' : 'wait'}" title="ימים ברצף באתגר היומי"><span aria-hidden="true">🔥</span> ${streak}<span class="sr"> ימים ברצף</span></span>` : ''}</span>
    </button>
    ${energyHtml()}
    ${muteBtn()}
  </header>`;
}
let muted = null;
function muteBtn() {
  return `<button class="lb-icon" data-act="mute" aria-label="${muted ? 'להפעיל צלילים' : 'להשתיק'}" title="צלילים">${muted ? '🔇' : '🔊'}</button>`;
}
async function refreshMuted() {
  const a = await audio();
  const m = typeof a.isMuted === 'function' ? !!safe(() => a.isMuted()) : typeof a.getMuted === 'function' ? !!safe(() => a.getMuted()) : null;
  if (m !== muted) { muted = m; document.querySelectorAll('[data-act="mute"]').forEach((b) => { b.outerHTML = view.k === 'profile' && b.classList.contains('lb-toggle') ? muteToggle() : muteBtn(); }); }
}
async function toggleMute() {
  const a = await audio();
  const next = !muted;
  if (typeof a.setMuted === 'function') safe(() => a.setMuted(next));
  muted = next;
  if (!next) sfx('click');
  document.querySelectorAll('[data-act="mute"]').forEach((b) => { b.outerHTML = b.classList.contains('lb-toggle') ? muteToggle() : muteBtn(); });
}
function muteToggle() { return `<button class="lb-toggle ${muted ? '' : 'on'}" data-act="mute" role="switch" aria-checked="${!muted}"><span>צלילים</span><i></i></button>`; }

function nickForm(label, id = '') {
  return `<form class="lb-nick" data-form="nick"><label for="${id || 'lbNick'}">${label}</label>
    <div class="inl"><input id="${id || 'lbNick'}" name="nick" maxlength="20" placeholder="כינוי (2–20 תווים)" autocomplete="nickname" required><button class="primary">יאללה</button></div>
    <p class="err" aria-live="polite"></p></form>`;
}
function boardHtml(rows, ctx = {}) {
  if (!rows || !rows.length) return '<p class="lb-empty">עוד אף אחד לא סיים. תהיה הראשון.</p>';
  const limit = ctx.limit || 10; let n = 0;
  const w = worldOf(ctx.worldId);
  const li = rows.map((r) => {
    const done = r.status !== 'playing'; if (done) n++;
    let res;
    const pr = Math.max(0, Math.min(1, r.status === 'won' ? 1 : r.progress != null ? +r.progress : (+r.passive || 0) / Math.max(1, +r.expenses || 1)));
    const pct = Math.round(pr * 100) || 0;
    if (ctx.sprint) {
      // daily sprint: everyone is ranked by how close to freedom they got; escapees also show their month
      if (r.status === 'won') res = `<span class="lb-rs-won">${num('100%')}</span><span class="lb-rs-st">✓ יצא בחודש ${int(r.months)}</span>`;
      else if (r.status === 'lost') res = `<span class="lb-rs-won">${num(pct + '%')}</span>`;
      else res = `<span class="lb-rs-play">${r.progress != null ? num(pct + '%') + ' · ' : ''}משחק עכשיו…</span>`;
    } else if (r.status === 'won') {
      const s = safe(() => starsFor(w, int(r.months), ctx.maxMonths ?? undefined, ctx.charId), 0);
      res = `<span class="lb-rs-won">חודש ${int(r.months)}</span>${s ? `<span class="lb-rs-st">${starStr(s)}</span>` : ''}`;
    } else if (r.status === 'lost') {
      res = `<span class="lb-rs-lost">${num(pct + '%')} מהדרך</span>`;
    } else res = '<span class="lb-rs-play">משחק עכשיו…</span>';
    // server verification (migration B adds `verified`): ✓ replayed and matched · ⚠ rejected (dimmed, the server sorts it last)
    const vmark = r.verified === true ? '<span class="lb-ver ok" title="תוצאה מאומתת בשרת" aria-label="מאומת">✓</span>'
      : r.verified === false ? '<span class="lb-ver bad" title="התוצאה לא עברה אימות בשרת" aria-label="לא אומת">⚠</span>' : '';
    return { me: !!r.me, h: `<li class="${r.me ? 'me' : ''} ${n <= 3 && done ? 'top' + n : ''} ${r.verified === false ? 'unver' : ''}"><span class="rk">${done ? (n <= 3 ? ['🥇', '🥈', '🥉'][n - 1] : n) : '·'}</span>${pawnHtml(r.pawn || 'classic', null, 'xs')}<span class="nm">${esc(r.nickname)}${vmark}${r.me ? ' <small>(אתה)</small>' : ''}</span>${titleBadge(int(r.stars))}<span class="rs">${res}</span></li>` };
  });
  let shown = li.slice(0, limit);
  const meIdx = li.findIndex((x) => x.me);
  if (meIdx >= limit) shown = [...shown, { h: '<li class="gap" aria-hidden="true">⋯</li>' }, li[meIdx]];
  return `<ol class="lb-board">${shown.map((x) => x.h).join('')}</ol>${li.length > limit && ctx.more ? `<button class="chip lb-more" data-act="${ctx.more}">כל הטבלה (${li.length})</button>` : ''}`;
}
function activeBanner() {
  if (!G || !G.hasActiveGame || !safe(() => G.hasActiveGame())) return '';
  const cfg = safe(() => G.activeConfig()) || {};
  if (lastEndSig && lastEndSig === sigOf(cfg)) return '';
  const w = worldOf(cfg.worldId); const c = charOf(w, cfg.charId);
  return `<button class="lb-resume" data-act="resume-active"><span class="lb-resume-ic">▶</span><span><b>חזרה למשחק</b><small>${esc(w.name)}${c ? ' · ' + esc(c.name) : ''}${cfg.learn ? ' · 🎓 תרגול' : ''}${cfg.mode && cfg.mode !== 'free' ? ' · ' + esc(cfg.title || MODE_NAME[cfg.mode]) : ''}</small></span></button>`;
}
const sigOf = (o) => [o.worldId, o.charId, o.mode, o.resultId || ''].join('|');

/* ============================================================ T4: strings, feature detection, a11y helpers */
// Exact strings of docs/next-level/specs/T4-opening-modes-library.md (ids S-…). ⚡ = "זריקות", 🔋 = "כוח".
const T4 = {
  W1: 'החיים שלך. הכסף שלך. הזמן שלך.',
  W2: 'משכורת נכנסת, הוצאות יוצאות. המטרה: נכסים שמשלמים את החשבונות — ולהישאר מאושר בדרך.',
  W3: 'יאללה, משחק ראשון ←', W4: 'אני רוצה לבחור דמות', W5: 'כבר שיחקתי במכשיר אחר',
  M0: 'איך משחקים?', M1: '⭐ משחק רגיל', M2: 'כוכבים, הישגים ובונוסים. כל הטלה עולה ⚡ זריקה אחת.',
  M3: '🎓 תרגול חופשי', M4: 'בלי הגבלת זריקות. בלי כוכבים, הישגים ובונוסי ⚡. לנסות, לטעות וללמוד.',
  M5: (c, m) => `▶ להמשיך · ${c} · חודש ${m}`, M6: (c, m) => `▶ להמשיך בתרגול 🎓 · ${c} · חודש ${m}`, M8: '🎓 לתרגל בלי הגבלה',
  K1: (t1, t2, t3, h = 60, f = 3) => `★ עד ${t1} חודשים · ★★ עד ${t2} · ★★★ עד ${t3}, וגם 😊 ${h} ו־🛟 קרן של ${f} חודשים`,
  K2: 'בסוף כל חודש חסר', K3f: ' (חיה מהמזומן)', K3m: ' (חי מהמזומן)', K4: 'בסוף כל חודש נשאר',
  Kgoal: (n) => `🎯 לצאת תוך ${n} חודשים`, Kmore: 'עוד פרטים ▾', Kless: 'פחות פרטים ▴', Kplay: 'לשחק ←',
  Knet: 'נטו בחודש', Kcash: 'מזומן בהתחלה', Kexp: 'הוצאות קבועות',
  D5: 'החלום שלי', D6: 'מה בשבילך לצאת מהמירוץ?', D7: 'זה לא משנה את הכוכבים — רק את המשימות שתראה בדרך.', D8: 'בלי חלום כרגע',
  D9: (ic, n) => `החלום שלי: ${ic} ${n} · שינוי`, D10: 'לפני המשחק הבא: מה החלום שלך?', D11: (n) => `נשמר. במשחק הבא תראה את המשימות של ${n}.`,
  D12: '🎯 החלומות שלי', D18: (ic, n, d) => `${ic} החלום שלך, ${n}: ${d} מתוך 3 משימות`,
  G1: 'רוצה פחות עזרה? במשחק הבא אבא עשיר רק ירמוז.', G2: 'רמת עזרה:', G3: 'מדריך', G4: 'רמזים', G5: 'מקצוען', G6: '🔒 אחרי ★★', G7: '🔒 אחרי משחק אחד',
  L1: 'יצאת מהמירוץ — בתרגול 🎓', L2: 'נשארת במירוץ — בתרגול 🎓',
  L3: (s) => `במשחק רגיל התוצאה הזאת הייתה שווה ${s}.`, L4: 'במשחק רגיל זה עוד לא היה כוכב.',
  L5: 'במצב תרגול לא נאספים כוכבים, הישגים ו־⚡. יציאה מהמירוץ פותחת את המפה הבאה, והשיעורים נכנסים לספרייה.', L6: 'לנסות במשחק רגיל ⭐', L7: 'עוד תרגול 🎓',
  H3: '🎬 סיור קצר במסך (5 צעדים)', H4: '📖 מה כל סימן אומר', H5: '🔄 הדרכה מלאה במשחק הבא בשכונה', H6: 'נפתח את ההדרכה במשחק הבא בשכונה.',
  H7: '🎬 סיור קצר — בפעם הבאה שתיכנס למשחק', H8: '👋 להציג שוב את מסך הפתיחה', Hhelp: 'איך משחקים', T2: 'מה כל סימן אומר',
  B1: (t, h) => `שיעור נעול: ${t}. איך פותחים: ${h}`, B2: 'עוד ▾', B3: (x) => `🔢 דוגמה: ${x}`, B5: (x) => `🎲 פישוט של המשחק: ${x}`, B6: (r, n) => `💡 תרגלת: ${r} מתוך ${n} נכונות`,
  P9: (r, n) => `תרגול: ${r} מתוך ${n}`,
  S1: (n) => `🔥 ${n === 1 ? 'יום אחד' : n + ' ימים'} ברצף. האתגר של היום מחכה לך.`,
  // T5 §12 T5-S0…S1 (settings section, lobby lane) + T1 מצב קל
  S0: 'תצוגה ותנועה', S1leg: 'תנועה במשחק', S1opt: [['auto', 'לפי המכשיר'], ['reduce', 'מופחתת'], ['full', 'מלאה']],
  S1hint: 'מופחתת: בלי רעידות, קונפטי וקפיצות. הקוביות והחייל זזים מיד.', lite: 'מצב קל (בלי תלת־ממד)', liteHint: 'לוח דו־ממדי שטוח: מהיר יותר בטלפונים ישנים. החזרה לתלת־ממד טוענת את הדף מחדש.',
};
/** Lobby-side dream display names (the missions and their logic belong to the engine, E-7). */
const DREAM_META = {
  biz: { icon: '🚀', name: 'עסק משלי', line: 'לבנות משהו שעובד גם בלעדיך' },
  family: { icon: '👨‍👩‍👧', name: 'זמן למשפחה', line: 'פחות שעות בשביל כסף, יותר בשביל אנשים' },
  stable: { icon: '🛟', name: 'יציבות', line: 'שקט: כרית בצד ובלי חובות מפתיעים' },
  free: { icon: '🗽', name: 'חופש כלכלי', line: 'נכסים שמשלמים את כל ההוצאות' },
};
/** §14.1 feature detection: dreams exist only when the engine exports DREAMS (tests may provide window.__t4dreams). */
function dreamsList() {
  // the test seam (window.__t4dreams) is read only under automation (navigator.webdriver), never for real players
  const seam = safe(() => globalThis.navigator && globalThis.navigator.webdriver === true, false) && Array.isArray(globalThis.__t4dreams) ? globalThis.__t4dreams : null;
  const d = Array.isArray(ENG.DREAMS) && ENG.DREAMS.length ? ENG.DREAMS : seam;
  return d ? d.filter((x) => x && DREAM_META[x.id]).map((x) => ({ ...DREAM_META[x.id], ...x })) : null;
}
const dreamById = (id) => { const l = dreamsList(); return (l && l.find((x) => x.id === id)) || (DREAM_META[id] ? { id, ...DREAM_META[id], missions: [] } : null); };
/** T2 mentor levels (feature-detected): ['guide','hint','pro'] or null. */
const mentorLevels = () => { const l = ENG.MENTOR_LEVELS || (ENG.MN && ENG.MN.LEVELS); return Array.isArray(l) && l.includes('guide') ? l : null; };
/** (same as ui.js nearMissText — the lobby does not load ui.js) Playtest B1: the end-screen near miss never shows negative months. The engine's "עוד {d} חודשים פחות" is about TIME; when the
 *  months already met the ★★★ (or ★★) line, what stopped the star was the fund or happiness — say that. */
function nearMissText(end) {
  const n = end && end.nearMiss; if (!n || !n.text) return '';
  if (typeof n.monthsToNext !== 'number' || n.monthsToNext > 0) return n.text;
  const f = !!end.starsBlockedByFund, h = !!end.starsBlockedByHappiness;
  if (f && h) return 'יצאת בזמן של ★★★, אבל ★★★ דורש גם קרן חירום של 3 חודשי הוצאות וגם אושר של 60 לפחות.';
  if (f) return 'יצאת בזמן של ★★★, אבל ★★★ דורש גם קרן חירום של 3 חודשי הוצאות.';
  if (h) return 'יצאת בזמן של ★★★, אבל ★★★ דורש גם אושר של 60 לפחות.';
  if (end.starsBlockedBy && end.starsBlockedBy.label) return `יצאת בזמן של ★★★, אבל ${end.starsBlockedBy.label}.`;   // worlds: a module's star rule (w6)
  return 'יצאת בזמן — הכוכב הבא היה ממש קרוב.';
}
const completedAny = (p = P.getProgress()) => (p.gamesPlayed || 0) + (p.learnGames || 0) > 0;
const hasTwoStars = (p = P.getProgress()) => Object.values(p.stars || {}).some((x) => x >= 2);
function mentorAllowed(level, p = P.getProgress()) { return level === 'guide' || (level === 'hint' && completedAny(p)) || (level === 'pro' && hasTwoStars(p)); }
/** Test-only trace of screens (welcome, world, game…), harmless in production (§14.2). Consecutive repeats are folded. */
function trace(screen) {
  try { const t = (window.__t4trace ||= []); if (!t.length || t[t.length - 1].screen !== screen) t.push({ t: Math.round(performance.now()), screen }); } catch (e) { /* no window */ }
}
/** §7.3: is this end payload a learning-mode game? */
function isLearnEnd(e) {
  if (!e) return false;
  if (e.learn === true || (e.summary && e.summary.config && e.summary.config.learn === true)) return true;
  const cfg = G && G.activeConfig ? safe(() => G.activeConfig()) : null;
  return !!(cfg && cfg.learn === true && cfg.worldId === e.worldId && (cfg.mode || 'free') === (e.mode || 'free'));
}
/** A11Y-1: Tab/Shift+Tab cycle inside `root`. Returns release(). (ui.js will own trapFocus; the lobby keeps its own copy.) */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
function trapFocus(el) {
  const onKey = (ev) => {
    if (ev.key !== 'Tab') return;
    const f = [...el.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
    if (!f.length) { ev.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) { ev.preventDefault(); first.focus(); }
  };
  el.addEventListener('keydown', onKey);
  return () => el.removeEventListener('keydown', onKey);
}
/** A11Y-1: the in-game DOM is inert while the lobby overlay covers it (kept in sync with #start[hidden]). */
const GAME_DOM = ['c', 'board2d', 'hud', 'sheet', 'sheetBack', 'bar', 'evm', 'coach', 'hist'];
function syncInert() {
  const on = lobbyVisible();
  for (const id of GAME_DOM) { const el = document.getElementById(id); if (el) { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); } }
}
/** Initial focus after a render (A11Y-3); preventScroll keeps the page at the top. */
function focusSoon(sel) { setTimeout(() => { const el = typeof sel === 'string' ? $(sel) : sel; if (el && lobbyVisible()) safe(() => el.focus({ preventScroll: true })); }, 30); }
/* -------- §4.6 one-time reveal migration: existing players never see the tutorial, the gradual HUD or the hints */
const REVEALK = 'rr2-reveal';
const HINT_IDS = ['C-roll', 'C-roi', 'C-meter', 'C-plan', 'C-sheet', 'C-power', 'C-fund', 'C-happy', 'C-credit', 'C-cpi', 'C-zr', 'C-focus', 'C-impact'];
const readReveal = () => safe(() => { const r = JSON.parse(localStorage.getItem(REVEALK) || 'null'); return r && typeof r === 'object' && !Array.isArray(r) ? r : null; }, null);
const writeReveal = (patch) => safe(() => localStorage.setItem(REVEALK, JSON.stringify({ v: 1, all: false, coached: [], tourNext: false, ...(readReveal() || {}), ...patch })));
let newAtBoot = false;
function migrateReveal() {
  const p = P.getProgress();
  if (readReveal()) return;
  if (completedAny(p)) writeReveal({ all: true, coached: HINT_IDS.slice() });
  else { newAtBoot = true; writeReveal({}); }
}
/** A server profile / restore code can turn a "new" device into an existing player: mark everything revealed (once). */
function revealAfterMerge() {
  if (!newAtBoot || P.getProgress().gamesPlayed + P.getProgress().learnGames <= gamesThisSession) return;
  newAtBoot = false; writeReveal({ all: true, coached: HINT_IDS.slice() });
}
let gamesThisSession = 0;
let pointerAt = 0;

/* ============================================================ ⚡ ENERGY · gifts · welcome · library */
const ONBK = 'rr2-onboarded';
let sessLessons = [];
LIB.onUnlock((ids) => { sessLessons.push(...ids); });
/** Free-play milestones for friends' group feeds (ranked results come from the server itself). */
function logMilestones(e, res) {
  if (!net.hasMe() || !net.logEvent || (e.mode && e.mode !== 'free' && e.mode !== 'history') || isLearnEnd(e)) return; // T4: never for learning games
  const ls = (e.end && e.end.lifeSummary) || {};
  const ev = [];
  if (e.mode === 'history') ev.push(['history_done', { scenario: e.scenarioId, stars: e.stars | 0, beat: e.status === 'won' }]);
  else {
    if (e.status === 'won') ev.push(['escaped', { world: e.worldId, age: ls.age != null ? Math.floor(ls.age) : null, months: e.months, stars: e.stars | 0 }]);
    if (res.unlockedWorld) ev.push(['world_unlocked', { world: res.unlockedWorld }]);
    if (res.gained > 0 && res.newStars === 3) ev.push(['stars3', { world: e.worldId }]);
  }
  for (const [k, d] of ev) net.logEvent(k, d).catch(() => {});
}
const ACH_ENERGY = 2;            // ⚡ per new achievement
const DAILY_ENERGY = 10;         // ⚡ for playing the daily
const STREAK_ENERGY = { 3: 5, 7: 10, 30: 25 };
function energyHtml(cls = '') {
  const e = EN.get(); const ms = EN.msUntilNext();
  return `<button class="lb-energy ${e === 0 ? 'empty' : e < 5 ? 'low' : ''} ${cls}" data-act="energy">
    <span class="lb-en-ic" aria-hidden="true">⚡</span><span class="sr">${EN.NAME}: </span><b data-energy="val">${num(e + '/' + EN.MAX)}</b>${ms ? `<small data-energy="wait">+1 בעוד ${num(EN.fmtWait(ms))}</small>` : '<small>מלא</small>'}</button>`;
}
let enTimer = null;
function startEnergyTicker() {
  if (enTimer) return;
  enTimer = setInterval(() => {
    if (!lobbyVisible()) return;
    document.querySelectorAll('.lb-energy').forEach((b) => { b.outerHTML = energyHtml(b.classList.contains('lg') ? 'lg' : ''); });
    const em = $('#lbEmpty'); if (em && EN.get() > 0) em.remove();
    const w = $('[data-energy="full-wait"]'); if (w) w.textContent = EN.fmtWait(EN.msUntilNext());
  }, 1000);
}
function stopEnergyTicker() { clearInterval(enTimer); enTimer = null; }
EN.onChange((p) => { if (p.delta > 0 && p.reason && !['sync', 'roll'].includes(p.reason) && lobbyVisible()) { /* bonus toasts are shown by the caller */ } });
/** director decision 6: with ⚡ at 0, say that the unfinished game is kept (it continues from the same turn once a roll is back) */
function savedNote() {
  if (!G || !G.savedGame) return '';
  const sv = playableMap().filter((w) => P.isUnlocked(w.id)).map((w) => [w, safe(() => G.savedGame(slotKey(w.id)), null)]).find(([, x]) => x && !x.future);
  if (!sv) return '';
  const [w, x] = sv;
  return `<p class="lb-en-saved">💾 המשחק שלך שמור: ${esc(x.charName || '')} ${esc(P.inW(w.name))}, חודש ${num(String(x.month))}. ממשיכים ממנו בדיוק מאותו מקום.</p>`;
}
/** "Out of energy" card: what you CAN do while waiting (DESIGN-v3 §3). */
function emptyEnergyHtml() {
  if (EN.get() > 0) return '';
  const d = cache.daily; const dailyOpen = net.hasMe() && d && !d.error && !d.my_status;
  return `<section class="lb-empty-en" id="lbEmpty"><div class="lb-en-big" aria-hidden="true">🪫</div>
    <div><h2>נגמרו הזריקות ⚡</h2><p>בעוד <b data-energy="full-wait">${EN.fmtWait(EN.msUntilNext())}</b> תקבל זריקה חדשה. בינתיים:</p>${savedNote()}
    <div class="lb-acts start"><button class="primary" data-act="learn-now">${T4.M8}</button>${dailyOpen ? '<button data-act="daily">🎲 האתגר היומי (בלי זריקות)</button>' : ''}
      <button data-act="library">📚 ספריית השיעורים</button>${net.hasMe() ? '<button data-act="groups-view">🎁 לשלוח זריקות לחברים</button>' : ''}</div></div></section>`;
}
/* -------- owner (admin): the server decides (rr_admin_status); the client only opens worlds/pawns locally and tops up ⚡ */
async function checkAdmin() {
  if (!net.hasMe() || !net.adminStatus) { P.setAdmin(false); return; }
  try {
    const r = await net.adminStatus(); const on = !!(r && r.admin); const was = P.isAdmin();
    P.setAdmin(on);
    if (on && EN.get() < EN.CAP) { EN.add(EN.CAP - EN.get(), 'admin'); refreshEnergyChips(); }
    if (on !== was && view && (view.k === 'home' || view.k === 'profile')) rerender();
  } catch (e) { /* offline: keep the current state */ }
}
function adminHtml() {
  if (!net.hasMe()) return '';
  if (P.isAdmin()) return `<section class="lb-card pf-admin"><h2>🛡️ מנהל</h2>
      <p class="lb-note">אצלך כל העולמות והכלים פתוחים, והזריקות מתמלאות בכל כניסה ללובי. כוכבים, שיאים ומשחקים מדורגים לא משתנים.</p>
      <form class="lb-form" data-form="admin-search"><label for="pfAdminQ">לתת זריקות לשחקן</label><div class="inl"><input id="pfAdminQ" name="q" placeholder="חיפוש לפי כינוי (ריק = החדשים)" autocomplete="off"><button>לחפש</button></div><p class="err" aria-live="polite"></p></form>
      <div id="pfAdminList" class="pf-admin-list" aria-live="polite"></div></section>`;
  return `<details class="lb-card pf-admin-claim"><summary>קוד מנהל</summary>
      <form class="lb-form" data-form="admin-claim"><label for="pfAdminCode">קוד חד־פעמי של בעל המשחק</label><div class="inl"><input id="pfAdminCode" name="code" dir="ltr" autocomplete="off" placeholder="XXXX-XXXX-XXXX"><button>לאשר</button></div><p class="err" aria-live="polite"></p></form></details>`;
}
async function loadAdminList(q) {
  const box = $('#pfAdminList'); if (!box || !P.isAdmin()) return;
  box.innerHTML = '<p class="lb-note">טוען…</p>';
  try {
    const rows = (await net.adminPlayers(q)) || [];
    box.innerHTML = rows.length ? `<ul class="pf-admin-rows">${rows.map((r) => `<li><span class="pf-admin-who"><b>${esc(r.nickname)}</b><small>★ ${+r.stars || 0} · מ־${esc(String(r.joined || ''))}</small></span>
        <span class="pf-admin-give">${[5, 10, 25].map((n) => `<button class="chip" data-act="admin-give" data-id="${esc(r.id)}" data-n="${n}" data-nick="${esc(r.nickname)}" aria-label="לתת ${n} זריקות ל${esc(r.nickname)}">+${n} ⚡</button>`).join('')}</span></li>`).join('')}</ul>`
      : '<p class="lb-note">לא נמצאו שחקנים.</p>';
  } catch (e) { box.innerHTML = '<p class="lb-note">לא הצלחנו לטעון את הרשימה. נסה שוב.</p>'; }
}
let claimAt = 0;
async function claimGifts() {
  if (!net.hasMe() || !net.claimEnergy || Date.now() - claimAt < 30000) return;
  claimAt = Date.now();
  try {
    const r = await net.claimEnergy();
    const total = +((r && r.total) ?? r) || 0;
    if (total > 0) {
      EN.add(total, 'gift');
      const from = (r && r.from) || [];
      const lines = from.length ? from.map((f) => f.kind === 'admin' ? `🛡️ המנהל שלח לך ${EN.label(f.amount)} ⚡` : f.kind === 'referral' ? `${f.nickname} הצטרף בזכותך: +${EN.label(f.amount)} ⚡` : `${f.nickname} שלח לך ${EN.label(f.amount)} ⚡`) : [`קיבלת ${EN.label(total)} ⚡`];
      lines.slice(0, 3).forEach((t, i) => setTimeout(() => toast('🎁 ' + t), i * 2700));
      sfx('coin'); refreshEnergyChips();
    }
  } catch (e) { /* offline: try next time */ }
}
function refreshEnergyChips() { document.querySelectorAll('.lb-energy').forEach((b) => { b.outerHTML = energyHtml(b.classList.contains('lg') ? 'lg' : ''); }); }
/* -------- quiz answers: reward:'lesson' (engine) = understanding, not money → +1⚡ per right answer.
   Live: bus 'reward' (game.js forwards out.reward). Fallback at game end: stats.quizRight minus what was already credited
   for that game (key = mode + resultId/seed, survives reloads), so nothing is paid twice and nothing is lost. */
const QUIZ_ENERGY = 1;
const QK = 'rr2-quiz-credit';
const quizSig = (o) => `${(o && o.mode) || 'free'}|${(o && (o.resultId || ((+o.seed || 0) >>> 0))) || ''}`;
function quizCredited(sig) { const q = safe(() => JSON.parse(localStorage.getItem(QK) || 'null')); return q && q.sig === sig ? int(q.n) : 0; }
function setQuizCredited(sig, n) { safe(() => localStorage.setItem(QK, JSON.stringify({ sig, n }))); }
function onQuizReward(p) {
  const r = p && (p.reward || p);
  if (!r || r.kind !== 'lesson' || r.right !== true) return;
  const cfg = G && G.activeConfig ? safe(() => G.activeConfig()) : null; if (!cfg) return;
  if (cfg.learn) return;                                   // T4 §7.1: no ⚡ bonuses in learning mode
  if (cfg.slot === 'branch') return;                       // T6: a practice branch is a learning game
  const live = safe(() => localSaveState(G && G.saveKeyFor ? G.saveKeyFor(cfg) : slotKey(cfg.worldId)), null);
  if (live && live.afterWin) return;                       // T6 review m3: no ⚡ farming in the continuation after a win
  const sig = quizSig(cfg); setQuizCredited(sig, quizCredited(sig) + 1);
  if (EN.add(QUIZ_ENERGY, 'lesson')) toast(`📚 תשובה נכונה: +${EN.label(QUIZ_ENERGY)} ⚡`);
}
function creditQuizAtEnd(e) {
  if (isLearnEnd(e)) return 0;                              // T4 §7.1
  const st = e.stats || (e.summary && e.summary.stats) || (e.end && e.end.stats) || {};
  const right = int(st.quizRight); const sig = quizSig(e); const had = quizCredited(sig);
  const owe = Math.max(0, right - had);
  setQuizCredited(sig, Math.max(right, had));
  return owe ? EN.add(owe * QUIZ_ENERGY, 'lesson') : 0;
}
function grantDaily(streak) {
  const day = P.israelDate();
  let got = EN.grantOnce('daily:' + day, DAILY_ENERGY, 'daily');
  const sb = STREAK_ENERGY[+streak];
  if (sb) got += EN.grantOnce(`streak${streak}:${day}`, sb, 'streak');
  return got;
}

function renderWelcome() {
  view = { k: 'welcome' }; ++token; trace('welcome');
  // T4 F1: ≤ 35 words, no ⚡ / ★★★ / plan text (they come back as just-in-time coaches in the game)
  html(`<div class="lb-shell lb-welcome">
    <article class="wl-card" aria-labelledby="wlH">
      <div class="wl-hero"><img src="${cardArt('w1')}" alt=""><div class="lb-logo wl-logo">מירוץ<br>העכברים</div></div>
      <h1 id="wlH">${T4.W1}</h1>
      <p class="wl-lead">${T4.W2}</p>
      <button class="primary lb-big" data-act="welcome-go">${T4.W3}</button>
      <button class="wl-pick" data-act="welcome-pick">${T4.W4}</button>
      <button class="wl-restore" data-act="welcome-restore">${T4.W5}</button>
    </article></div>`);
  focusSoon('[data-act="welcome-go"]');
}

async function renderLibrary() {
  view = { k: 'library' }; const t = ++token; trace('library');
  html(`<div class="lb-shell lb-library"><div class="lb-bar"><button class="chip" data-act="home">› למפה</button>${topMini()}</div><p class="lb-note">טוען את הספרייה…</p></div>`);
  const L = await LIB.lessons();
  if (t !== token) return;
  const c = LIB.counts();
  const cats = [];
  // T4 §9.1: Hebrew category names only — an unknown category falls back to '📚 שיעורים', never to the raw key
  for (const l of L) { const k = catName(l.cat); let g = cats.find((x) => x.k === k); if (!g) cats.push(g = { k, items: [] }); g.items.push(l); }
  const pct = c.total ? Math.round((c.have / c.total) * 100) : 0;
  const pt = LIB.practiceTotals();
  html(`<div class="lb-shell lb-library">
    <div class="lb-bar"><button class="chip" data-act="home">› למפה</button>${topMini()}</div>
    <header class="lib-head"><span class="lib-ic" aria-hidden="true">📚</span><div><h1>ספריית השיעורים</h1>
      <p>כל שיעור שאבא עשיר מלמד אותך במשחק נכנס לכאן. <b>${num(c.have + '/' + c.total)}</b></p>
      <div class="lb-bar-track"><i style="width:${pct}%"></i></div>${pt.n ? `<p class="lb-note">${esc(T4.P9(pt.right, pt.n))}</p>` : ''}</div></header>
    ${L.length ? cats.map((g) => `<section class="lib-sec"><h2>${esc(g.k)} <small>${num(g.items.filter((l) => LIB.isUnlocked(l.id)).length + '/' + g.items.length)}</small></h2>
      <div class="lib-grid">${g.items.map((l) => libCard(l)).join('')}</div></section>`).join('')
      : '<p class="lb-empty">הספרייה תתמלא כשתתחיל לשחק.</p>'}
  </div>`);
}
/** Unlocked: title + text. Locked (§9.3): 🔒 + a curious teaser (the real title stays hidden) + 🔓 how to unlock. */
function libCard(l) {
  if (LIB.isUnlocked(l.id)) {
    return `<button class="lib-card ${LIB.isNew(l.id) ? 'is-new' : ''}" data-act="lesson" data-id="${esc(l.id)}">${LIB.isNew(l.id) ? '<span class="gp-newtag">חדש</span>' : ''}<b>${esc(l.title)}</b><small>${iso(String(l.text).length > 150 ? String(l.text).slice(0, 147) + '…' : l.text)}</small></button>`;
  }
  const m = LIB.meta(l.id) || {};
  const teaser = m.teaser || 'שיעור שמחכה לך';
  const hint = m.hint || l.hint || (l.world ? 'מחכה לך ' + P.inW(worldOf(l.world).name) : 'שחק כדי לגלות');
  return `<div class="lib-card is-locked" role="group" aria-label="${esc(T4.B1(teaser, hint))}"><span class="lib-lock" aria-hidden="true">🔒</span><b>${esc(teaser)}</b><small><span aria-hidden="true">🔓 </span>${iso(hint)}</small></div>`;
}
/** Lesson sheet (§9.4): title · text (≤160, then עוד ▾) · example · where you learned it · simplification · practice. */
const lessonTopics = (id) => [...new Set(PRACTICE.filter((x) => x.after.includes(id)).map((x) => x.topic))];
function lessonLines(l) {
  const m = LIB.meta(l.id) || {}; const ctx = LIB.contextOf(l.id); const out = [];
  if (m.example) out.push(`<p class="ls-line ls-ex">${iso(T4.B3(m.example))}</p>`);
  if (ctx) {
    const wn = ctx.w === 'h' ? 'מכונת הזמן' : ctx.w ? safe(() => getWorld(ctx.w).name, '') : '';
    const where = wn ? (ctx.w === 'h' ? 'ב' + wn : P.inW(wn)) : '';
    const numTxt = ctx.num && ctx.num.label ? ` · ${ctx.num.label} ${ctxValue(l.id, ctx.num.value)}` : '';
    out.push(`<p class="ls-line ls-ctx">${iso(`📍 למדת את זה בחודש ${ctx.m}${where ? ' ' + where : ''}${ctx.ev ? ` — "${ctx.ev}"` : ''}${numTxt}`)}</p>`);
  }
  if (m.sim) out.push(`<p class="ls-line ls-sim">${iso(T4.B5(m.sim))}</p>`);
  const st = LIB.practiceStats(); let n = 0, r = 0;
  for (const t of lessonTopics(l.id)) if (st[t]) { n += st[t].n || 0; r += st[t].right || 0; }
  if (n) out.push(`<p class="ls-line ls-pr">${esc(T4.B6(r, n))}</p>`);
  return out.join('');
}
/** E-6 num values: a string is shown as is; a number is a % (rates), a count, or ₪ (everything else). */
const CTX_PCT = new Set(['tax_brackets', 'marginal_overtime', 'inflation']);
const CTX_COUNT = new Set(['diversification', 'index_fund']);
function ctxValue(id, v) {
  if (v == null) return '';
  if (typeof v !== 'number') return String(v);
  if (CTX_PCT.has(id)) return `${Math.round(v * (Math.abs(v) <= 1 ? 1000 : 10)) / 10}%`;
  if (CTX_COUNT.has(id)) return String(Math.round(v));
  return fmtM(v);
}
let lessonRelease = null; let lessonOpener = null;
async function openLesson(id) {
  const L = await LIB.lessons(); const l = L.find((x) => x.id === id); if (!l) return;
  LIB.markRead(id);
  closeLesson(false);
  lessonOpener = document.activeElement;
  const text = String(l.text || '');
  const body = text.length > 160
    ? `<p>${iso(text.slice(0, 157).replace(/\s+\S*$/, ''))}…</p><details class="ls-more"><summary>${T4.B2}</summary><p>${iso(text)}</p></details>`
    : `<p>${iso(text)}</p>`;
  const el = document.createElement('div'); el.id = 'lbLesson'; el.className = 'lb-sheet';
  el.innerHTML = `<div class="lb-sheet-card" role="dialog" aria-modal="true" aria-labelledby="lbLessonT"><span class="lib-ic sm" aria-hidden="true">📚</span><h2 id="lbLessonT">${esc(l.title)}</h2>${body}${lessonLines(l)}<button class="primary lb-wide" data-act="lesson-close">הבנתי</button></div>`;
  root().appendChild(el);
  lessonRelease = trapFocus(el);
  focusSoon(el.querySelector('[data-act="lesson-close"]'));
  const card = $(`.lib-card[data-id="${CSS.escape(id)}"]`); if (card) { card.classList.remove('is-new'); card.querySelector('.gp-newtag')?.remove(); }
}
function closeLesson(restore = true) {
  const el = $('#lbLesson'); if (!el) return false;
  if (lessonRelease) { lessonRelease(); lessonRelease = null; }
  el.remove();
  const c = $('.map-lib'); if (c) c.outerHTML = libraryCard();
  if (restore && lessonOpener && lessonOpener.isConnected) safe(() => lessonOpener.focus({ preventScroll: true }));
  lessonOpener = null;
  return true;
}

/* ============================================================ ⏳ מכונת הזמן (history mode) */
const HIST_ART = asset('assets/history/card.webp');
let SCEN = null; let scenP = null;
/** E.scenarioList() → [{id, name, start, months, blurb, lesson}] (needs js/data/real.js; null while unavailable). */
function scenarios() {
  if (SCEN) return Promise.resolve(SCEN);
  if (!scenP) scenP = (async () => {
    const tries = [
      async () => { const E = await import('./engine.js'); if (typeof E.loadRealData === 'function' && !(safe(() => E.scenarioList()) || []).length) await E.loadRealData(); return typeof E.scenarioList === 'function' ? E.scenarioList() : null; },
      async () => { const H = await import('./history.js'); return typeof H.scenarioList === 'function' ? H.scenarioList() : H.SCENARIOS || null; },
      async () => { const D = await import('./data/real.js'); const S = D.SCENARIOS || (D.default && D.default.SCENARIOS); return S ? (Array.isArray(S) ? S : Object.entries(S).map(([id, v]) => ({ id, ...v }))) : null; },
    ];
    for (const t of tries) { try { const l = await t(); if (Array.isArray(l) && l.length) { SCEN = l.map((x) => ({ ...x, name: x.name || x.title || x.id, blurb: x.blurb || x.desc || x.tagline || '' })); return SCEN; } } catch (e) { /* next */ } }
    return null;
  })().finally(() => { if (!SCEN) scenP = null; });
  return scenP;
}
const scenById = (id) => (SCEN || []).find((x) => x.id === id) || null;
const ymText = (ym) => { const m = String(ym || '').match(/^(\d{4})-?(\d{2})/); return m ? `${+m[2]}/${m[1]}` : String(ym || ''); };
function historyCard(p) {
  const open = P.historyUnlocked(); const played = Object.values(p.history || {}).filter((h) => h.best).length;
  return `<button class="map-hist ${open ? '' : 'is-locked'}" data-act="history">
    <span class="map-hist-art"><img src="${HIST_ART}" alt="" loading="lazy" data-fallback="hide"><span class="map-hist-ic" aria-hidden="true">⏳</span></span>
    <span class="map-hist-body"><b>מכונת הזמן</b><span>שוק אמיתי, חודש אחרי חודש: 2000, 2008, 2020, 2022. תנצח משקיע שרק קנה והחזיק?</span>
    <em>${open ? (played ? `שיחקת ${played} תקופות` : 'חדש! נסה תקופה ראשונה') : '🔒 נפתח אחרי ★ בשכונה — אפשר להציץ'}</em></span></button>`;
}
function libraryCard() {
  const c = LIB.counts();
  return `<button class="map-lib" data-act="library"><span class="lib-ic" aria-hidden="true">📚</span><span><b>ספריית השיעורים</b><em>${c.total ? num(c.have + '/' + c.total) + ' שיעורים' : 'כל שיעור שתלמד נכנס לכאן'}${c.fresh ? ` · <span class="gp-newtag">${c.fresh} חדשים</span>` : ''}</em></span></button>`;
}
async function renderHistory() {
  view = { k: 'history' }; const t = ++token;
  const open = P.historyUnlocked(); const p = P.getProgress();
  html(`<div class="lb-shell lb-history"><div class="lb-bar"><button class="chip" data-act="home">› למפה</button>${topMini()}</div><p class="lb-note">טוען את מכונת הזמן…</p></div>`);
  const list = await scenarios();
  if (t !== token) return;
  const g = await game();
  const body = !list ? '<div class="wv-locked"><div class="wv-lock-ic" aria-hidden="true">⏳</div><h2>מכונת הזמן מתכיילת…</h2><p>הנתונים ההיסטוריים עוד נטענים. נסה שוב עוד רגע.</p><button class="primary" data-act="history">לנסות שוב</button></div>'
    : `<div class="hs-grid">${list.map((sc, i) => {
      const h = p.history[sc.id] || {}; const best = h.best;
      const sv = open && g && h.lastSeed != null ? safe(() => g.savedGame({ mode: 'history', worldId: 'h', scenarioId: sc.id, seed: h.lastSeed })) : null;
      return `<article class="hs-card ${open ? '' : 'is-locked'}" style="--i:${i}">
        <div class="hs-top"><span class="hs-years">${esc(ymText(sc.start))} · ${int(sc.months)} חודשים</span>${best ? starsHtml(best.stars) : ''}</div>
        <h3>${esc(sc.name)}</h3><p>${esc(sc.blurb || '')}</p>
        ${best ? `<p class="hs-best">🏁 הכי טוב שלך: ${iso(fmtM(best.netWorth))}${best.beat ? ' · ניצחת את המדד 🏆' : ''}</p>` : ''}
        <div class="hs-acts">${open ? `${sv ? `<button class="primary" data-act="history-continue" data-id="${esc(sc.id)}">▶ להמשיך · חודש ${esc(sv.month)}</button>` : ''}<button class="${sv ? '' : 'primary'}" data-act="history-go" data-id="${esc(sc.id)}">${sv ? 'מההתחלה' : 'לחזור בזמן ←'}</button>` : '<span class="lb-mini-lock">🔒 צריך ★ בשכונה</span>'}</div>
      </article>`; }).join('')}</div>`;
  html(`<div class="lb-shell lb-history">
    <div class="lb-bar"><button class="chip" data-act="home">› למפה</button>${topMini()}</div>
    <header class="hs-head"><img src="${HIST_ART}" alt="" data-fallback="remove"><div><span class="hs-kicker">⏳ מכונת הזמן</span><h1>להשקיע בהיסטוריה האמיתית</h1>
      <p>המחירים, הריבית והאינפלציה — בדיוק כמו שהיו, חודש אחרי חודש. היריב שלך: משקיע משעמם שקנה קרן מדד ולא נגע בה. תצליח לנצח אותו?</p>
      ${open ? '' : `<p class="lb-note">🔒 נפתח אחרי ★ ראשון בשכונה. <button class="chip" data-act="world" data-id="w1">לשחק בשכונה</button></p>`}</div></header>
    ${body}
    <p class="lb-foot">הנתונים אמיתיים ומפושטים. "ההיסטוריה לא חוזרת על עצמה, אבל היא מתחרזת".</p>
  </div>`);
}
async function startHistory(sid, cont = false) {
  if (!P.historyUnlocked()) { toast('🔒 מכונת הזמן נפתחת אחרי ★ ראשון בשכונה'); return; }
  const p = P.getProgress(); const h = p.history[sid] || {};
  const g = await game();
  if (cont && h.lastSeed != null) {
    const sv = g && safe(() => g.savedGame({ mode: 'history', worldId: 'h', scenarioId: sid, seed: h.lastSeed }));
    if (sv) return launch(launchCfg({ ...sv.cfg, resume: true, bailout: P.bailoutAvailable() }));
  }
  if (!cont && h.lastSeed != null && g && safe(() => g.savedGame({ mode: 'history', worldId: 'h', scenarioId: sid, seed: h.lastSeed }))) {
    const ok = await confirmAsk('יש לך משחק שמור בתקופה הזאת. להתחיל מההתחלה?', 'מההתחלה'); if (!ok) return;
    safe(() => g.clearSave({ mode: 'history', worldId: 'h', scenarioId: sid, seed: h.lastSeed }));
  }
  const seed = randSeed(); P.setHistorySeed(sid, seed);
  sfx('click');
  return launch(launchCfg({ mode: 'history', scenarioId: sid, worldId: 'h', seed, tutorial: false, resume: false, bailout: P.bailoutAvailable(), title: (scenById(sid) || {}).name || 'מכונת הזמן' }));
}

/* ============================================================ HOME (world map) */
function renderHome() {
  view = { k: 'home' }; const t = ++token; trace('home');
  const p = P.getProgress(); const me = net.me(); const goal = P.nextGoal();
  html(`<div class="lb-shell lb-home">
    ${activeBanner()}
    ${pendingJoin && !me ? `<section class="lb-invite"><div class="lb-invite-ic">💌</div><div><h2>הוזמנת לקבוצה!</h2><p>בחר כינוי ונכניס אותך ישר לקבוצה.</p>${nickForm('איך יקראו לך בטבלאות?', 'lb-root-nick')}</div></section>` : ''}
    ${topBar()}
    <div class="lb-mission" role="note"><span class="lb-mission-ic" aria-hidden="true">🎯</span><span><small>המשימה הבאה</small><b>${esc(goal.text)}</b><em>${esc(goal.sub)}</em></span>${goal.worldId && P.isUnlocked(goal.worldId) ? `<button class="primary lb-mission-go" data-act="world" data-id="${goal.worldId}">יאללה</button>` : ''}</div>
    ${emptyEnergyHtml()}
    <div class="lb-grid ${me ? '' : 'is-guest'}">
      <section class="lb-map" aria-labelledby="lbMapH">
        <div class="map-head"><h2 id="lbMapH">המפה</h2>${trailHtml(p)}</div>
        <div class="map-grid map-worlds">${mapGridHtml(p)}</div>
        <div class="map-extra">${historyCard(p)}${libraryCard()}</div>
      </section>
      <section class="lb-card lb-daily" id="lbDaily" aria-label="האתגר היומי">${dailyHtml(cache.daily)}</section>
      <section class="lb-card lb-weekly" id="lbWeekly" aria-label="האתגר השבועי">${weeklyHtml(cache.weekly)}</section>
      <section class="lb-card lb-groups" id="lbGroups" aria-label="הקבוצות שלי">${groupsHtml(cache.groups)}</section>
    </div>
    <p class="lb-foot">המספרים במשחק מפושטים כדי שהמשחק יזרום — העקרונות אמיתיים.</p>
  </div>`);
  refreshMuted();
  if (me) { loadDaily(t); loadWeekly(t); loadGroups(t); }
}
function trailHtml(p) {
  const L = mapList(); const play = L.filter((m) => m.playable); const soon = L.length - play.length;
  return `<ol class="map-trail" aria-label="ההתקדמות שלך">${play.map((w, i) => {
    const un = P.isUnlocked(w.id); const s = p.stars[w.id] || 0;
    const g = w.group ? `${w.group.name} · ` : '';
    return `<li class="${un ? 'un' : ''} ${un && !s ? 'cur' : ''} ${un && s ? 'done' : ''} ${w.mapNo === 1 && i > 0 ? 'w-start' : ''}" title="${esc(g + w.name)}"><span>${!un ? '🔒' : s ? '★'.repeat(s) : i + 1}</span></li>`;
  }).join('')}${soon > 0 ? `<li class="soon" title="${soon} מפות בקרוב"><span>🔜 ${soon}</span></li>` : ''}</ol>`;
}
/** 2026-11-25 (owner: "תחלק את המפות לעולמות"): the map is 6 worlds (chapters, P.mapGroups()), each a heading + "X/Y מפות הושלמו" + its open /
 *  locked / coming state + what you learn there, and a list of its maps — playable ones as cards (locked or open), planned ones as "בקרוב" pins
 *  (not buttons). The cards keep the order of P.worldMap() (= the order of the game). */
function mapGridHtml(p) {
  const G6 = safe(() => P.mapGroups(), null);
  if (!G6) return mapList().map((m, i) => (m.playable ? worldCard(m, i, p) : soonCard(m, i))).join('');
  let i = 0; const L = mapList(); const extra = L.filter((m) => !m.group);
  const sec = G6.map((g) => {
    const state = g.soon ? 'soon' : g.done === g.built && g.built ? 'done' : g.open ? 'open' : 'locked';
    const prevG = G6[g.n - 2]; const lastPrev = prevG ? [...prevG.maps].reverse().find((x) => x.playable) : null;
    const stTxt = state === 'soon' ? '🔜 בקרוב' : state === 'done' ? '✓ הושלם' : state === 'open' ? 'פתוח' : `🔒 נפתח אחרי ${lastPrev ? lastPrev.name : 'העולם הקודם'}`;
    const cards = g.maps.map((m) => `<li>${m.playable ? worldCard(m, i++, p) : soonCard(m, i++)}</li>`).join('');
    return `<section class="mw is-${state}" data-group="${g.id}" aria-labelledby="mwh-${g.id}">
      <header class="mw-head"><span class="mw-ic" aria-hidden="true">${esc(g.icon || '')}</span>
        <div class="mw-txt"><h3 id="mwh-${g.id}"><small>עולם ${g.n}</small> ${esc(g.name)}</h3><p class="mw-learn">${esc(g.learn || '')}</p></div>
        <p class="mw-state"><span class="mw-count">${num(g.done + '/' + g.total)} מפות הושלמו</span><span class="mw-st">${esc(stTxt)}</span></p>
      </header>
      <ol class="mw-maps" aria-label="המפות של ${esc(g.name)}">${cards}</ol>
    </section>`;
  }).join('');
  return sec + (extra.length ? `<ol class="mw-maps mw-extra" aria-label="מפות נוספות">${extra.map((m) => `<li>${m.playable ? worldCard(m, i++, p) : soonCard(m, i++)}</li>`).join('')}</ol>` : '');
}
function soonCard(m, i) {
  return `<div class="map-card is-soon" role="group" aria-labelledby="mapn-${m.id}" data-id="${m.id}" style="--i:${i}">
    <span class="map-art">${artHtml(m.id)}<span class="map-num">${m.mapNo || m.order}</span><span class="map-soon" aria-hidden="true">בקרוב</span></span>
    <span class="map-body">
      <span class="map-row"><b class="map-name" id="mapn-${m.id}">${esc(m.name)}</b><span class="map-soon-t">🔜 בקרוב</span></span>
      <span class="map-tagline">${esc(m.tagline || '')}</span>
      <span class="map-meta">${diff5Html(m.diff)}</span>
      ${m.lockText ? `<span class="map-line lock">${esc(m.lockText)}</span>` : ''}
    </span>
  </div>`;
}
function worldCard(w, i, p) {
  const m = metaOf(w.id) || w;
  const un = P.isUnlocked(w.id); const s = p.stars[w.id] || 0; const best = p.best[w.id];
  const sv = un && G && G.savedGame ? safe(() => G.savedGame(freeKey(w.id))) : null;
  const svL = un && !sv && G && G.savedGame ? safe(() => G.savedGame(slotKey(w.id, true))) : null;
  const d = cache.daily; const isDaily = !!(d && d.world === w.id);
  const isNew = un && i > 0 && !p.seenWorlds.includes(w.id);
  const next = un && !s;
  const inDaily = WORLDS.some((x) => x.id === w.id);   // the daily / weekly rotation stays w1–w4
  const tags = [
    isNew ? '<span class="map-tag-new">חדש!</span>' : '',
    isDaily ? '<span class="map-tag-daily">🎲 היומי של היום</span>' : '',
    sv ? `<span class="map-tag-save">▶ שמור · חודש ${esc(sv.month)}</span>` : svL ? `<span class="map-tag-save">🎓 תרגול · חודש ${esc(svL.month)}</span>` : '',
  ].join('');
  const late = !inDaily;   // the new worlds show what they teach, how hard they are and how long they take (BRIEF-worlds §5)
  return `<button class="map-card ${un ? '' : 'is-locked'} ${next ? 'is-next' : ''} ${s >= 3 ? 'is-max' : ''} ${late ? 'is-late' : ''}" data-act="world" data-id="${w.id}" style="--i:${i}">
    <span class="map-art">${artHtml(w.id, '', 'loading="lazy" decoding="async"')}<span class="map-num">${w.mapNo || m.order || i + 1}</span>${un ? '' : '<span class="map-lock" aria-hidden="true">🔒</span>'}<span class="map-tags">${tags}</span></span>
    <span class="map-body">
      <span class="map-row"><b class="map-name">${esc(w.name)}</b>${starsHtml(s)}</span>
      <span class="map-tagline">${esc(w.tagline)}</span>
      ${late ? `<span class="map-learn">🧠 ${esc(m.learn || '')}</span><span class="map-meta">${diff5Html(m.diff)}${estHtml(m)}${m.ranked === false ? '<span class="map-free">משחק חופשי וחדרים פרטיים</span>' : ''}</span>` : ''}
      ${un ? `<span class="map-line">${esc(P.nextStarLine(w.id))}</span>` : `<span class="map-line lock">לפתוח: ${esc(unlockLine(w))}</span>`}
      ${un ? (best ? `<span class="map-best">🏁 שיא: ${best} חודשים</span>` : '') : inDaily ? `<span class="map-tease">${isDaily ? 'אפשר לטעום היום באתגר היומי!' : 'טעימה דרך האתגר היומי'}</span>` : ''}
    </span>
  </button>`;
}

/* ---------------- daily */
function dailyHtml(d) {
  const me = net.me();
  if (!me) {
    return `<div class="lb-dh lb-dh-anon"><span class="lb-pill">🎲 האתגר היומי</span></div>
      <div class="lb-db"><h2>ספרינט יומי: כמה קרוב לחופש תגיע?</h2><p class="lb-note">כל יום מפה אחרת, אותן קוביות לכולם — גם מפות נעולות. בונים רצף 🔥 ומטפסים בטבלה.</p>
      ${pendingJoin ? '' : nickForm('איך יקראו לך בטבלאות?', 'lb-root-nick')}</div>`;
  }
  if (!d) return `<div class="lb-dh lb-dh-anon"><span class="lb-pill">🎲 האתגר היומי</span></div><div class="lb-db"><p class="lb-note">טוען את האתגר של היום…</p></div>`;
  if (d.error) return `<div class="lb-dh lb-dh-anon"><span class="lb-pill">🎲 האתגר היומי</span></div><div class="lb-db"><p class="err">${esc(d.error)}</p><button class="chip" data-act="reload-home">לנסות שוב</button></div>`;
  const w = worldOf(d.world); const c = dailyChar(w, d.char_index); const un = P.isUnlocked(w.id);
  const played = d.my_status === 'won' || d.my_status === 'lost';
  const si = P.streakInfo();
  const streak = P.getProgress().lastDaily ? si.streak : (+d.streak || 0);
  let cta;
  if (played) cta = `<p class="lb-done">✓ שיחקת היום${d.my_status === 'won' ? ' ויצאת מהמירוץ' : ''}. אתגר חדש מחר — אל תשכח לחזור!</p>`;
  else cta = `<button class="primary lb-big" data-act="daily">${d.my_status === 'playing' ? '▶ להמשיך את האתגר' : 'לשחק עכשיו'}</button>`;
  const streakLine = played
    ? `<div class="lb-streak"><span class="fire">🔥</span><b>${streak || 1}</b><span>${(streak || 1) === 1 ? 'יום ברצף' : 'ימים ברצף'}</span></div>`
    : streak > 0
      ? `<div class="lb-streak wait"><span>${esc(T4.S1(streak))}</span></div>`
      : '<div class="lb-streak cold"><span class="fire">🔥</span><span>שחק היום ותתחיל רצף</span></div>';
  return `<div class="lb-dh" style="background-image:url('${cardArt(w.id)}')">
      <span class="lb-pill">🎲 האתגר היומי</span>${un ? '' : '<span class="lb-pill lock">🔒 מפה נעולה — טעימה!</span>'}<span class="lb-timer">⏳ ${timeLeft(d.ends_at)}</span>
      <div class="lb-dh-txt"><b>${esc(w.name)}</b><span>${esc(c.name)} · ⏱️ ספרינט ${int(d.max_months, 24) || 24} חודשים</span></div>
    </div>
    <div class="lb-db">
      ${played ? '' : `<p class="lb-sprint">⏱️ ספרינט ${int(d.max_months, 24) || 24} חודשים — כמה קרוב לחופש תגיע?</p>`}
      ${streakLine}
      ${cta}
      <h3 class="lb-sub">הטבלה של היום · הכי קרוב לחופש</h3>
      ${boardHtml(d.board, { worldId: w.id, charId: c.id, maxMonths: int(d.max_months, 24) || 24, limit: 10, sprint: true })}
    </div>`;
}
async function loadDaily(t) {
  try {
    const d = await net.daily();
    cache.daily = d;
    P.setDaily({ streak: d.streak, ...(d.my_status ? { last: P.israelDate() } : {}) });
  } catch (e) { cache.daily = { error: e.message }; }
  if (t !== token) return;
  const box = $('#lbDaily'); if (box) box.innerHTML = dailyHtml(cache.daily);
  // the daily world may be a locked world → refresh the map tags + header streak
  const grid = $('.map-grid'); if (grid) grid.innerHTML = mapGridHtml(P.getProgress());
  const top = $('.lb-top'); if (top) top.outerHTML = topBar();
}

/* ---------------- weekly */
function weeklyHtml(wk) {
  const me = net.me();
  const head = '<div class="lb-ch-head"><h2>האתגר השבועי</h2>';
  if (!me) return `${head}</div><p class="lb-note">כל השחקנים, אותה מפה ואותה דמות, שבוע שלם. צריך רק כינוי.</p>`;
  if (!wk) return `${head}</div><p class="lb-note">טוען…</p>`;
  if (wk.error) return `${head}</div><p class="err">${esc(wk.error)}</p>`;
  const w = worldOf(wk.world); const c = dailyChar(w, wk.char_index); const un = P.isUnlocked(w.id);
  const done = wk.my_status === 'won' || wk.my_status === 'lost';
  return `${head}<span class="lb-timer dark">⏳ ${timeLeft(wk.ends_at)}</span></div>
    <div class="lb-wk-row"><img class="lb-thumb" src="${cardArt(w.id)}" alt=""><div><b>${esc(w.name)}</b>${un ? '' : ' <span class="lb-mini-lock">🔒 טעימה</span>'}<br><small>${esc(c.name)} · ${esc(c.desc || '')}</small></div></div>
    ${done ? '<p class="lb-done">✓ סיימת את האתגר השבוע. נתראה בשבוע הבא.</p>' : `<button class="primary lb-wide" data-act="weekly">${wk.my_status === 'playing' ? '▶ להמשיך' : 'להתחיל את האתגר'}</button>`}
    ${boardHtml(wk.board, { worldId: w.id, charId: c.id, maxMonths: undefined, limit: view.wkAll ? 50 : 5, more: view.wkAll ? null : 'wk-all' })}`;
}
async function loadWeekly(t) {
  try { cache.weekly = await net.weekly(); } catch (e) { cache.weekly = { error: e.message }; }
  if (t !== token) return;
  const box = $('#lbWeekly'); if (box) box.innerHTML = weeklyHtml(cache.weekly);
}

/* ---------------- groups (home card) */
function groupsHtml(gs) {
  const me = net.me();
  if (!me) return `<div class="lb-ch-head"><h2>הקבוצות שלי</h2></div><p class="lb-note">פותחים קבוצה, שולחים קישור בוואטסאפ, ומתחרים מי יוצא מהמירוץ הכי מהר.</p><button class="chip" data-act="focus-nick">לבחור כינוי</button>`;
  const list = groupsList(gs);
  return groupsShell(list);
}
function groupsList(gs) {
  return !gs ? '<p class="lb-note">טוען…</p>' : gs.error ? `<p class="err">${esc(gs.error)}</p>` : gs.length
    ? `<div class="lb-glist">${gs.map((g) => `<button class="lb-gitem" data-act="group" data-id="${esc(g.id)}"><span class="lb-gav" aria-hidden="true">${esc([...g.name][0] || '?')}</span><span><b>${esc(g.name)}</b><small>${int(g.members) === 1 ? 'רק אתה — הזמן חברים' : int(g.members) + ' שחקנים'}${int(g.active) ? ` · ${int(g.active) === 1 ? 'אתגר פעיל' : int(g.active) + ' אתגרים פעילים'}` : ''}</small></span><span class="lb-chev" aria-hidden="true">‹</span></button>`).join('')}</div>`
    : '<p class="lb-empty">עוד אין לך קבוצות. פתח אחת ושלח לחברים.</p>';
}
function groupsShell(list) {
  return `<div class="lb-ch-head"><h2>הקבוצות שלי</h2></div><div id="lbGList">${list}</div>
    <form class="lb-form" data-form="newgroup"><label for="lbGname">קבוצה חדשה</label><div class="inl"><input id="lbGname" name="name" maxlength="40" placeholder="למשל: ט׳3 בורסה"><button class="primary">לפתוח</button></div></form>
    <form class="lb-form" data-form="join"><label for="lbJcode">קיבלת קוד מחבר?</label><div class="inl"><input id="lbJcode" name="code" maxlength="6" placeholder="קוד" class="lb-code-in"><button>להצטרף</button></div></form>
    <p class="err" id="lbGErr" aria-live="polite"></p>${roomsOn() ? '<button class="rm-entry" data-act="rooms"><span class="rm-entry-ic" aria-hidden="true">🎲</span><span><b>חדר חי</b><small>לשחק עכשיו עם חברים — 2–4 שחקנים</small></span><span class="lb-chev" aria-hidden="true">‹</span></button>' : ''}`;
}
async function loadGroups(t) {
  try { cache.groups = await net.myGroups(); } catch (e) { cache.groups = { error: e.message }; }
  if (t !== token) return;
  // only the list is replaced, so a group name being typed survives
  const l = $('#lbGList'); if (l) { l.innerHTML = groupsList(cache.groups); return; }
  const box = $('#lbGroups'); if (box) box.innerHTML = groupsHtml(cache.groups);
}
async function joinCode(code) {
  pendingJoin = null;
  safe(() => history.replaceState(null, '', location.pathname));
  try { const g = await net.joinGroup(String(code).trim().toUpperCase()); toast('הצטרפת ל' + g.name + ' 🎉'); sfx('unlock'); cache.groups = null; renderGroup(g.id); }
  catch (e) { renderHome(); setTimeout(() => { const el = $('#lbGErr'); if (el) el.textContent = e.message; toast(e.message); }, 0); }
}

/* ============================================================ WORLD (character picker / locked preview) */
// T4 §5: mode group (normal / learning) → dream row → mentor row → character cards (articles, not buttons).
let worldMode = null;            // 'normal' | 'learn' while the world view is open (null = from progress)
let dreamOpen = false;           // the dream row is expanded
function modeNow(p = P.getProgress()) {
  if (worldMode) return worldMode;
  return completedAny(p) ? p.lastMode : 'normal';   // a brand-new player always gets a normal first game
}
/** T6 §7.4 items 3–4: the practice branch of this world (continue / delete) and "back to a moment of the last game" (flag rewind) */
function t6WorldHtml(w) {
  if (!flag('rewind')) return '';
  if (!RW) return '';   // CR-33: not loaded yet — boot() redraws the world view once it is
  const out = [];
  const bs = safe(() => RW.branchSave(w.id), null);
  if (bs) out.push(`<div class="t6-wbr"><button class="lb-continue is-learn" data-act="t6-branch" data-id="${w.id}"><span><b>${esc(RW.STR.lobbyCont.replace('{m}', bs.month))}</b></span></button><button class="chip" data-act="t6-branch-del" data-id="${w.id}">${esc(RW.STR.lobbyDel)}</button></div>`);
  const L = safe(() => RW.lastGame(), null);
  if (L && L.cfg && L.cfg.worldId === w.id) out.push(`<button class="chip t6-wlast" data-act="t6-last">${esc(RW.STR.lobbyLast)}</button>`);
  return out.join('');
}
/** A planned world (meta status 'planned'): what it will teach and how it opens — no play button (BRIEF-worlds §5). */
function renderSoon(m0) {
  const m = mapList().find((x) => x.id === m0.id) || m0;
  view = { k: 'world', id: m.id }; ++token; trace('world');
  html(`<div class="lb-shell lb-world is-soon">
    <div class="lb-bar"><button class="chip" data-act="home">› למפה</button>${topMini()}</div>
    <header class="wv-hero is-locked">${artHtml(m.id)}<div class="wv-hero-txt"><span class="map-num">${m.mapNo || m.order}</span>${kickerHtml(m.id)}<h1>${esc(m.name)}</h1><p>${esc(m.tagline || '')}</p></div></header>
    <div class="wv-locked"><div class="wv-lock-ic" aria-hidden="true">🔜</div><h2>המפה הזו בקרוב</h2>
      <p>היא עוד נבנית — אפשר לראות אותה במפה, אבל עוד לא לשחק בה.</p>
      ${m.lockText ? `<p class="lb-note">${esc(m.lockText)}</p>` : ''}
      <p class="lb-note">${diff5Html(m.diff)}</p>
      <div class="lb-acts"><button class="primary" data-act="home">חזרה למפה</button></div></div>
  </div>`);
}
/** A lazy world whose rules are still loading (or failed): the hero + a loading line, or an error with "לנסות שוב". */
function renderWorldLoading(id, opts, failed) {
  const m = { ...(metaOf(id) || {}), mapNo: mapNo(id) }; view = { k: 'world', id }; const t = ++token; trace('world');
  html(`<div class="lb-shell lb-world is-loading">
    <div class="lb-bar"><button class="chip" data-act="home">› למפה</button>${topMini()}</div>
    <header class="wv-hero">${artHtml(id)}<div class="wv-hero-txt"><span class="map-num">${m.mapNo || m.order || ''}</span>${kickerHtml(id)}<h1>${esc(m.name || '')}</h1><p>${esc(m.tagline || '')}</p></div></header>
    ${failed ? `<div class="wv-locked wv-loaderr" role="alert"><div class="wv-lock-ic" aria-hidden="true">📡</div><h2>${esc(LAZY_ERR)}</h2>
      <div class="lb-acts"><button class="primary" data-act="world" data-id="${esc(id)}">לנסות שוב</button><button data-act="home">חזרה למפה</button></div></div>`
    : `<div class="wv-locked wv-loading" role="status" aria-live="polite"><div class="lb-spin" aria-hidden="true"></div><h2>טוען את ${esc(m.name || 'המפה')}…</h2><p class="lb-note">החוקים של המפה נטענים בפעם הראשונה.</p></div>`}
  </div>`);
  if (failed) return;
  ensureRules(id, { quiet: true }).then((ok) => { if (t !== token || view.k !== 'world' || view.id !== id) return; if (ok) renderWorld(id, opts); else renderWorldLoading(id, opts, true); });
}
function renderWorld(id, opts = {}) {
  const meta = metaOf(id);
  if (meta && !meta.playable) return renderSoon(meta);
  if (!meta && groupOf(id)) { const e = mapList().find((x) => x.id === id); if (e && !e.playable) return renderSoon(e); }   // a planned map not in meta yet
  // worlds wave 0: an unlocked lazy world loads its rules BEFORE the character picker (a locked one is shown from meta only)
  if (meta && !rulesReady(id) && P.isUnlocked(id)) return renderWorldLoading(id, opts, false);
  const w = worldOf(id); view = { k: 'world', id: w.id }; ++token; trace('world');
  if (opts.learn) worldMode = 'learn';
  const m = meta || {};
  const i = (mapNo(w.id) || m.order || WORLDS.indexOf(w) + 1) - 1; const p = P.getProgress(); const un = P.isUnlocked(w.id); const s = p.stars[w.id] || 0;
  if (un) P.markWorldSeen(w.id);
  const sv = un && G && G.savedGame ? safe(() => G.savedGame(slotKey(w.id))) : null;
  const svL = un && G && G.savedGame ? safe(() => G.savedGame(slotKey(w.id, true))) : null;
  const inDaily = WORLDS.some((x) => x.id === w.id);
  const d = cache.daily; const isDaily = inDaily && !!(d && d.world === w.id && d.my_status !== 'won' && d.my_status !== 'lost');
  const diffs = un ? difficulty(w) : {};
  let body;
  if (un) {
    const mode = modeNow(p);
    const cont = (x, learn) => `<button class="lb-continue ${learn ? 'is-learn' : ''}" data-act="continue-free" data-id="${w.id}" ${learn ? 'data-learn="1"' : ''}><span><b>${esc(learn ? T4.M6(x.charName || '', x.month) : T4.M5(x.charName || '', x.month))}</b></span></button>`;
    body = `${sv ? cont(sv, false) : ''}${svL ? cont(svL, true) : ''}${t6WorldHtml(w)}
      ${modeGroupHtml(mode)}
      ${dreamRowHtml(p)}
      ${mentorRowHtml(p)}
      <h2 class="wv-h">${sv || svL ? 'או משחק חדש — ' : ''}בחר דמות</h2>
      <div class="wv-chars">${w.characters.map((c) => charCard(w, c, diffs[c.id], s)).join('')}</div>`;
  } else {
    const frontier = playableMap().find((x) => P.isUnlocked(x.id) && !x.finished && !(p.stars[x.id] > 0)) || null;
    const ul = unlockLine({ id: w.id });
    body = `<div class="wv-locked">
      <div class="wv-lock-ic" aria-hidden="true">🔒</div>
      <h2>המפה הזו עוד נעולה</h2>
      <p>${/^לצאת /.test(ul) ? `לפתוח: ${esc(ul)} (בכל קצב — ★ זה בונוס).` : `לפתוח: ${esc(ul)}`}</p>
      <p class="lb-note">מה מחכה כאן: ${esc(NEW_HERE[w.mechanic] || m.newHere || w.tagline)}</p>
      <div class="lb-acts">${isDaily ? '<button class="primary" data-act="daily">🎲 לטעום עכשיו באתגר היומי</button>' : ''}
      ${frontier && P.isUnlocked(frontier.id) ? `<button class="${isDaily ? '' : 'primary'}" data-act="world" data-id="${frontier.id}">לשחק ${esc(P.inW(frontier.name))}</button>` : ''}</div>
      ${isDaily ? '' : '<p class="lb-note">טיפ: כל יום האתגר היומי במפה אחרת — גם במפות נעולות.</p>'}
    </div>`;
  }
  html(`<div class="lb-shell lb-world ${un && modeNow(p) === 'learn' ? 'is-learn' : ''}">
    <div class="lb-bar"><button class="chip" data-act="home">› למפה</button>${topMini()}</div>
    <header class="wv-hero ${un ? '' : 'is-locked'}">${artHtml(w.id)}
      <div class="wv-hero-txt"><span class="map-num">${i + 1}</span>${kickerHtml(w.id)}<h1>${esc(w.name)}</h1><p>${esc(w.tagline)}</p>${starsHtml(s, 'lg')}${p.best[w.id] ? `<span class="wv-best-sm">🏁 השיא שלך: ${int(p.best[w.id])} חודשים</span>` : ''}</div></header>
    <div class="wv-goal">
      <div><span>🎯 המטרה</span><b>${esc(w.goalLabel)}</b></div>
      <div class="wv-new"><span>🧠 חדש כאן</span><b>${esc(NEW_HERE[w.mechanic] || m.newHere || '')}</b></div>
      ${!inDaily && m.learn ? `<div class="wv-learn"><span>📚 מה לומדים</span><b>${esc(m.learn)}</b></div>` : ''}
      ${!inDaily && m.diff ? `<div class="wv-diff5"><span>🎚️ קושי${m.estMin ? ' ומשך' : ''}</span><b>${diff5Html(m.diff)}${estHtml(m)}</b></div>` : ''}
      ${!inDaily && m.ranked === false ? `<div class="wv-free"><span>🏷️ איפה משחקים</span><b>משחק חופשי וחדרים פרטיים (עוד בלי טבלאות)</b></div>` : ''}
      ${p.best[w.id] ? `<div><span>🏁 השיא שלך</span><b>${p.best[w.id]} חודשים</b></div>` : ''}
    </div>
    ${body}
  </div>`);
  if (un) focusSoon('input[name="t4mode"]:checked');
}
/** "מפה 2 · הכסף הגדול" above a map's title (picker / locked / loading / soon views). */
function kickerHtml(id) { const t = mapLabel(id); return t ? `<span class="wv-kicker">${esc(t)}</span>` : ''; }
function modeGroupHtml(mode) {
  const opt = (v, t, sub) => `<label class="t4-opt ${mode === v ? 'on' : ''}"><input type="radio" name="t4mode" value="${v}" ${mode === v ? 'checked' : ''}><span><b>${t}</b><small>${sub}</small></span></label>`;
  return `<fieldset class="t4-modes" role="radiogroup" aria-label="${T4.M0}"><legend class="sr">${T4.M0}</legend>${opt('normal', T4.M1, T4.M2)}${opt('learn', T4.M3, T4.M4)}</fieldset>`;
}
function dreamRowHtml(p) {
  const list = dreamsList(); if (!list) return '';
  const cur = p.dream ? dreamById(p.dream) : null;
  // AC-C3: on the smallest phones (≤ 380 px) the optional picker starts as one line too, so the first character's play button stays in view
  if (!dreamOpen && (cur || (typeof innerWidth === 'number' && innerWidth <= 380))) {
    return `<div class="t4-dream-line"><button class="t4-dream-sum" data-act="dream-open" aria-expanded="false">${esc(cur ? T4.D9(cur.icon, cur.name) : '🎯 חלום לדרך (לא חובה) · לבחור')}</button></div>`;
  }
  const opt = (id, ic, name, line) => `<label class="t4-dopt ${(p.dream || '') === id ? 'on' : ''}"><input type="radio" name="t4dream" value="${id}" ${(p.dream || '') === id ? 'checked' : ''}><span class="t4-dic" aria-hidden="true">${esc(ic)}</span><span><b>${esc(name)}</b>${line ? `<small>${esc(line)}</small>` : ''}</span></label>`;
  return `<fieldset class="t4-dreams" role="radiogroup" aria-label="${T4.D5}"><legend><b>${T4.D6}</b><small>${T4.D7}</small></legend>
    <div class="t4-dgrid">${list.map((x) => opt(x.id, x.icon, x.name, x.line)).join('')}${opt('', '·', T4.D8, '')}</div></fieldset>`;
}
function mentorRowHtml(p) {
  const L = mentorLevels(); if (!L) return '';
  const cur = mentorAllowed(p.mentorPref, p) ? p.mentorPref || 'guide' : 'guide';
  // one vocabulary with the game (review m-3): T2's MN.LEVEL_TEXT labels, T4's words only as a fallback
  const LT = (ENG.MN && ENG.MN.LEVEL_TEXT) || {};
  const name = { guide: (LT.guide && LT.guide.label) || T4.G3, hint: (LT.hint && LT.hint.label) || T4.G4, pro: (LT.pro && LT.pro.label) || T4.G5 };
  const lock = { hint: T4.G7, pro: T4.G6 };
  return `<fieldset class="t4-mentor" role="radiogroup" aria-label="${T4.G2}"><legend>${T4.G2}</legend>${['guide', 'hint', 'pro'].filter((x) => L.includes(x)).map((lv) => {
    const ok = mentorAllowed(lv, p);
    return `<label class="t4-mopt ${cur === lv ? 'on' : ''} ${ok ? '' : 'is-locked'}" ${ok ? '' : `title="${esc(lock[lv])}"`}><input type="radio" name="t4mentor" value="${lv}" ${cur === lv ? 'checked' : ''} ${ok ? '' : `disabled aria-label="${esc(name[lv] + ' ' + lock[lv])}"`}><span>${esc(name[lv])}${ok ? '' : ` <span aria-hidden="true">🔒</span><small>${esc(lock[lv].replace('🔒 ', ''))}</small>`}</span></label>`;
  }).join('')}</fieldset>`;
}
function topMini() {
  const p = P.getProgress(); const me = net.me();
  return `<button class="lb-mini-player" data-act="profile">${pawnHtml(p.pawn, p.pawnColor, 'sm')}<span>${me ? esc(me.nickname) : 'אורח'}</span>${titleBadge(P.totalStars(p))}</button>`;
}
/** §5.4 the first number of the HUD: metrics(createGame()).cashflow (pure, cached per character). */
const surplusCache = {};
function surplusOf(w, c) {
  const k = w.id + ':' + c.id;
  if (!(k in surplusCache)) surplusCache[k] = safe(() => metrics(createGame({ worldId: w.id, charId: c.id, seed: 1 })).cashflow, characterCard(w, c).surplus);
  return surplusCache[k];
}
/** §5.3 identity line, computed, no slash forms: "בן 31 · נשוי + ילד". */
function identityLine(c) {
  const f = c.gender === 'f'; const fam = c.family || {};
  const partner = fam.partner === 'married' ? (f ? 'נשואה' : 'נשוי') : fam.partner === 'together' ? 'בזוגיות' : (f ? 'רווקה' : 'רווק');
  const k = +fam.kids || 0;
  return c.age ? `${f ? 'בת ' : 'בן '}${c.age} · ${partner}${k === 1 ? ' + ילד' : k > 1 ? ` + ${k} ילדים` : ''}` : '';
}
function charCard(w, c, d) {
  const cc = characterCard(w, c); const T = starThresholds(w, c.id); const meta = charMeta(w.id, c.id);
  const cf = surplusOf(w, c); const neg = cf < 0;
  const salary = cc.salaryUsd ? `$${cc.salaryUsd.toLocaleString('en-US')}` : fmtM(cc.salary);
  const extras = [];
  for (const a of c.assets || []) extras.push(`🏷️ כבר יש לך: ${esc(a.n)}`);
  for (const [tk, q] of Object.entries(c.holdings || {})) extras.push(`📈 ${q.toLocaleString('en-US')} מניות ${esc(tk)}`);
  if (c.impact) extras.push(`💗 ${c.impact} נקודות השפעה מההתחלה`);
  if (cc.perk) extras.push(`✨ ${esc(cc.perk)}`);
  const exp = [...(c.expenses || [])].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const did = `wvd-${w.id}-${c.id}`;
  const idl = identityLine(c);
  return `<article class="wv-char" aria-labelledby="${did}-n" data-w="${w.id}" data-c="${c.id}">
    <div class="wv-top"><span class="wv-ic" aria-hidden="true">${CHAR_ICON[c.icon] || '🙂'}</span><span class="wv-cname"><b id="${did}-n">${esc(c.name)}</b>${idl ? `<small class="wv-id">${esc(idl)}</small>` : ''}</span>${diffHtml(d || 2)}</div>
    <p class="wv-desc">${esc(c.desc || '')}</p>
    ${meta ? `<p class="wv-sw wv-str">💪 ${iso(meta.strength)}</p><p class="wv-sw wv-weak">⚠️ ${iso(meta.weakness)}</p>` : c.pros || c.cons ? `${(c.pros || []).slice(0, 2).map((x) => `<p class="wv-sw wv-str">💪 ${iso(x)}</p>`).join('')}${(c.cons || []).slice(0, 2).map((x) => `<p class="wv-sw wv-weak">⚠️ ${iso(x)}</p>`).join('')}` : ''}
    <p class="wv-cf ${neg ? 'neg' : 'pos'}"><span>${neg ? T4.K2 : T4.K4}${neg ? (c.gender === 'f' ? T4.K3f : T4.K3m) : ''}</span><b>${iso((cf > 0 ? '+' : '') + (Math.abs(cf) >= 1e6 ? fmtM(cf) : fmt(cf)))}</b></p>
    <p class="wv-goalline">${esc(T4.Kgoal(T.maxMonths))}</p>
    <div class="wv-details" id="${did}" hidden>
      <div class="wv-nums"><span><small>${T4.Knet}</small><b>${iso(salary)}</b></span><span><small>${T4.Kcash}</small><b>${iso(fmtM(cc.cash))}</b></span></div>
      ${exp.length ? `<p class="wv-exph">${T4.Kexp}</p><ul class="wv-exp">${exp.map(([l, a]) => `<li><span>${esc(l)}</span><b>${iso(fmtM(a))}</b></li>`).join('')}</ul>` : ''}
      ${extras.length ? `<div class="wv-extra">${extras.map((x) => `<span>${x}</span>`).join('')}</div>` : ''}
      <p class="wv-th">${esc(T4.K1(T.maxMonths, T.t2, T.t3, int(T.happy, 60), int(T.fundMonths, 3)))}</p>
    </div>
    <div class="wv-acts"><button class="wv-more" data-act="char-more" aria-expanded="false" aria-controls="${did}">${T4.Kmore}</button><button class="primary wv-go" data-act="char" data-w="${w.id}" data-c="${c.id}" aria-label="${esc(T4.Kplay + ' ' + c.name)}">${T4.Kplay}</button></div>
  </article>`;
}

/* ============================================================ GROUP */
async function renderGroup(id) {
  view = { k: 'group', id }; const t = ++token;
  if (!net.hasMe()) return renderHome();
  const c = cache.group[id];
  html(c ? groupHtml(c) : `<div class="lb-shell"><div class="lb-bar"><button class="chip" data-act="home">› ללובי</button></div><p class="lb-note">טוען את הקבוצה…</p></div>`);
  try {
    const g = await net.group(id); cache.group[id] = g; noteNew(g);
    if (t !== token) return;
    html(groupHtml(g)); fillV2(g);
    focusView();   // wave 2 (A3 K-2): the fetched page replaced the loading view (and the node focus was on) — focus lands on its heading
    loadFeed(id);
    startGroupRefresh(id);
  } catch (e) { if (t !== token) return; delete cache.group[id]; toast(e.message); renderHome(); }
}
/* -------- "חדש" badges: challenges that appeared since the last visit (first visit: none) */
const SEENK = 'rr2-seen-chal';
function seenMap() { try { return JSON.parse(localStorage.getItem(SEENK) || '{}') || {}; } catch (e) { return {}; } }
function markSeen(gid, ids) { const m = seenMap(); m[gid] = [...new Set([...(m[gid] || []), ...ids])].slice(-200); try { localStorage.setItem(SEENK, JSON.stringify(m)); } catch (e) { /* ignore */ } }
const groupNew = {};
function noteNew(g) {
  const seen = seenMap()[g.id]; const ids = g.challenges.map((c) => c.id);
  groupNew[g.id] ||= new Set();
  if (seen) for (const id of ids) if (!seen.includes(id)) groupNew[g.id].add(id);
  markSeen(g.id, ids);
}
/* -------- auto-refresh while the group page is open (every 20 s, and when the tab/app comes back) */
let groupTimer = null;
function startGroupRefresh(id) { stopGroupRefresh(); groupTimer = setInterval(() => refreshGroup(id), 20000); }
function stopGroupRefresh() { if (groupTimer) clearInterval(groupTimer); groupTimer = null; }
let refreshing = false;
async function refreshGroup(id) {
  if (refreshing || view.k !== 'group' || view.id !== id || !lobbyVisible() || document.hidden) return;
  refreshing = true;
  try {
    loadFeed(id);
    const g = await net.group(id);
    if (view.k !== 'group' || view.id !== id) return;
    const prev = cache.group[id]; cache.group[id] = g; noteNew(g);
    if (prev && JSON.stringify(prev) === JSON.stringify(g)) return;
    const a = $('#gpChals'); if (a) a.outerHTML = chalsSection(g);
    const m = $('#gpMembers'); if (m) m.innerHTML = membersHtml(g);
    const cnt = $('#gpCount'); if (cnt) cnt.textContent = countText(g);
    if (!$('#gpV2 details[open], #gpComps details[open], #gpV2 #gpHist > *')) fillV2(g);   // wave 3b: never under an open form
  } catch (e) { /* offline — try again next tick */ } finally { refreshing = false; }
}
const countText = (g) => (g.members.length === 1 ? 'רק אתה כאן — שלח את הקישור לחברים' : g.members.length + ' שחקנים');
function membersHtml(g) {
  const members = [...g.members].sort((a, b) => int(b.stars) - int(a.stars));
  const gifted = new Set((feedCache[g.id] && feedCache[g.id].gifted_today) || []);
  return members.map((m) => `<li class="${m.me ? 'me' : ''}">${pawnHtml(m.pawn || 'classic', null, 'sm')}<span class="nm">${esc(m.nickname)}${m.me ? ' <small>(אתה)</small>' : ''}${m.owner ? ' <span title="מנהל הקבוצה">👑</span>' : ''}${roomsOn() && m.role === 'admin' ? ' <span class="gp-role r-admin">מנהל</span>' : ''}</span>${titleBadge(int(m.stars))}<span class="gp-st">★ ${int(m.stars)}</span>${m.me ? '' : gifted.has(m.nickname)
    ? '<button class="gp-send sent" disabled title="שלחת לו זריקות היום">✓ נשלח</button>'
    : `<button class="gp-send" data-act="send-energy" data-g="${esc(g.id)}" data-n="${esc(m.nickname)}" title="לשלוח 3 זריקות (פעם ביום)">שלח ⚡ 3</button>`}</li>`).join('');
}
/* -------- group feed: friends' milestones + ranked results (net.groupFeed) */
const feedCache = {};
const agoText = (at) => { const ms = Date.now() - new Date(at); if (!(ms >= 0)) return ''; const m = Math.floor(ms / 6e4); if (m < 1) return 'עכשיו'; if (m < 60) return `לפני ${m} דק׳`; const h = Math.floor(m / 60); if (h < 24) return `לפני ${h} שע׳`; const d = Math.floor(h / 24); return d === 1 ? 'אתמול' : `לפני ${d} ימים`; };
const wName = (id) => (id === 'h' ? 'מכונת הזמן' : safe(() => getWorld(id).name, ''));
function feedLine(f) {
  const d = f.data || {}; const who = `<b>${esc(f.nickname)}</b>${f.me ? ' <small>(אתה)</small>' : ''}`;
  const st = int(d.stars) > 0 ? ' ' + starStr(int(d.stars)) : '';
  switch (f.kind) {
    case 'escaped': return ['🎉', `${who} יצא מהמירוץ ${esc(P.inW(wName(d.world)))}${int(d.age) > 0 ? ` בגיל ${int(d.age)}` : ''}${int(d.months) > 0 ? ` · ${int(d.months)} חודשים` : ''}${st}`];
    case 'world_unlocked': return ['🔓', `${who} פתח את ${esc(wName(d.world))}`];
    case 'stars3': return ['⭐', `${who} השיג ★★★ ${esc(P.inW(wName(d.world)))}`];
    case 'history_done': return ['⏳', `${who} חזר מ${esc((scenById(d.scenario) || {}).name || 'מכונת הזמן')}${d.beat ? ' — וניצח את המדד 🏆' : ''}${st}`];
    case 'ranked_won': return ['🏁', `${who} יצא מהמירוץ ${d.title ? `ב״${esc(d.title)}״` : d.mode ? 'ב' + esc(MODE_NAME[d.mode] || '') : 'באתגר'}${int(d.months) > 0 ? ` בחודש ${int(d.months)}` : ''}${st}`];
    case 'ranked_lost': { const pr = d.progress ?? (d.stats && d.stats.progress); return ['💪', `${who} סיים ${d.title ? `את ״${esc(d.title)}״` : d.mode ? 'את ' + esc(MODE_NAME[d.mode] || 'האתגר') : 'אתגר'}${pr != null && Number.isFinite(+pr) ? ` עם ${num(Math.round(Math.max(0, Math.min(1, +pr)) * 100) + '%')} מהדרך` : ''}`]; }
    case 'gift': case 'energy': return ['⚡', `${who} שלח זריקות ⚡`];
    case 'joined': return ['👋', `${who} הצטרף לקבוצה`];
    default: return ['•', `${who} ${esc(f.kind)}`];
  }
}
function feedHtml(gid) {
  const f = feedCache[gid];
  const items = f && Array.isArray(f.feed) ? f.feed.slice(0, 12) : null;
  return `<section class="lb-card gp-feed" id="gpFeed"><h2>מה קורה בקבוצה</h2>${!f ? '<p class="lb-note">טוען…</p>' : !items.length ? '<p class="lb-empty">עוד שקט כאן. סיים משחק — וזה יופיע לכולם.</p>'
    : `<ul class="gp-flist">${items.map((x) => { const [ic, t] = feedLine(x); return `<li class="${x.me ? 'me' : ''}"><span class="gp-fic" aria-hidden="true">${ic}</span><span class="gp-ft">${t}</span><small>${agoText(x.at)}</small></li>`; }).join('')}</ul>`}</section>`;
}
async function loadFeed(gid) {
  if (!net.groupFeed) return;
  try {
    const f = await net.groupFeed(gid); const prev = JSON.stringify(feedCache[gid] || null); feedCache[gid] = f;
    if (view.k !== 'group' || view.id !== gid || prev === JSON.stringify(f)) return;
    const a = $('#gpFeed'); if (a) a.outerHTML = feedHtml(gid);
    const m = $('#gpMembers'); const g = cache.group[gid]; if (m && g) m.innerHTML = membersHtml(g);
  } catch (e) { if (!feedCache[gid]) feedCache[gid] = { feed: [], gifted_today: [] }; }
}
function chalsSection(g) {
  const list = roomsOn() && g.my_role ? g.challenges.filter((c) => !c.status) : g.challenges;   // wave 3b: competitions → #gpComps
  return `<section class="gp-chals" id="gpChals"><h2>אתגרים</h2>
      ${list.length ? list.map((c) => chalHtml(g, c)).join('') : '<p class="lb-empty">אין עדיין אתגרים. פתח את הראשון למטה — ותשלח לקבוצה 👇</p>'}
    </section>`;
}
function groupLink(g) { return withRef(`${baseUrl()}?join=${g.code}`); }
function groupHtml(g) {
  const link = groupLink(g); const me = net.me();
  const wa = waHref(`בוא להתחרות איתי במירוץ העכברים 🐭💰 הצטרף לקבוצה "${g.name}": ${link}`);
  const un = P.unlockedWorlds();
  const w0 = worldOf(un[0]);
  return `<div class="lb-shell lb-group">
    <div class="lb-bar"><button class="chip" data-act="home">› ללובי</button><button class="chip" data-act="group" data-id="${esc(g.id)}">↻ רענון</button></div>
    <header class="gp-head"><span class="lb-gav lg" aria-hidden="true">${esc([...g.name][0] || '?')}</span><div><h1>${esc(g.name)}</h1><p id="gpCount">${countText(g)}</p></div></header>
    ${roomsOn() && g.my_role ? '<div id="gpV2"></div>' : ''}
    ${chalsSection(g)}
    ${roomsOn() && g.my_role ? '<div id="gpComps"></div>' : ''}
    ${feedHtml(g.id)}
    <div class="gp-grid">
      <section class="lb-card gp-invite"><h2>להזמין חברים</h2>
        <p class="lb-note">שלח קישור — או תן להם את הקוד:</p>
        <div class="gp-code" dir="ltr">${esc(g.code)}</div>
        <a class="lb-wa" href="${wa}" target="_blank" rel="noopener">📲 להזמין בוואטסאפ</a>
        <div class="inl gp-link"><input value="${esc(link)}" readonly dir="ltr" aria-label="קישור הזמנה"><button data-act="copy" data-text="${esc(link)}">להעתיק</button></div>
      </section>
      <section class="lb-card gp-members"><h2>מי בקבוצה</h2>
        <ul class="gp-mlist" id="gpMembers">${membersHtml(g)}</ul>
      </section>
      <section class="lb-card gp-new"><h2>אתגר חדש</h2>
        <p class="lb-note">כולם משחקים באותה מפה, עם אותה דמות, אותן קוביות ואותם קלפים. מנצח מי שיוצא מהמירוץ בפחות חודשים.</p>
        <form data-form="newchal" data-g="${esc(g.id)}" class="gp-form">
          <input name="title" maxlength="50" placeholder="שם האתגר (למשל: מי יוצא ראשון?)" aria-label="שם האתגר">
          <div class="gp-sel">
            <label><span>מפה</span><select name="world">${un.map((id) => `<option value="${id}">${esc(worldOf(id).name)}</option>`).join('')}</select></label>
            <label><span>דמות</span><select name="char">${charOptions(w0)}</select></label>
            <label><span>משך</span><select name="days">${[[1, 'יום'], [3, '3 ימים'], [7, 'שבוע'], [14, 'שבועיים']].map(([d, l]) => `<option value="${d}" ${d === 3 ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>
          <button class="primary lb-wide">לפתוח אתגר</button>
          <p class="err" aria-live="polite"></p>
        </form>
        ${un.length < WORLDS.length ? `<p class="lb-note">עולמות נוספים ייפתחו כאן כשתפתח אותם במפה.</p>` : ''}
      </section>
    </div>
    <p class="gp-leave-row"><button class="chip lb-leave" data-act="leave" data-id="${esc(g.id)}">לעזוב את הקבוצה</button></p>
  </div>`;
}
function charOptions(w) { return w.characters.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join(''); }
function chalHtml(g, c) {
  const w = worldOf(c.world || 'w1'); const ch = charOf(w, c.profession) || w.characters[0];
  const done = c.my_status === 'won' || c.my_status === 'lost';
  const un = P.isUnlocked(w.id);
  const share = waHref(`אתגר בקבוצה "${g.name}": ${c.title} — ${w.name}, ${ch.name}. מי יוצא ראשון מהמירוץ? ${groupLink(g)}`);
  const isNew = !!(groupNew[g.id] && groupNew[g.id].has(c.id));
  return `<article class="lb-card gp-chal ${c.active ? '' : 'is-closed'} ${isNew ? 'is-new' : ''}">
    <div class="gp-chal-head"><img class="lb-thumb" src="${cardArt(w.id)}" alt=""><div><h3>${isNew ? '<span class="gp-newtag">חדש</span> ' : ''}${esc(c.title)}</h3><p class="lb-meta">${esc(w.name)} · ${esc(ch.name)} · ${c.active ? timeLeft(c.ends_at) : 'נסגר'}${un ? '' : ' · <span class="lb-mini-lock">🔒 טעימה</span>'}</p></div></div>
    <div class="gp-chal-acts">
      ${c.active && !done ? `<button class="primary" data-act="chal" data-id="${esc(c.id)}" data-g="${esc(g.id)}" data-t="${esc(c.title)}">${c.my_status === 'playing' ? '▶ להמשיך' : 'לשחק'}</button>` : done ? '<span class="lb-done sm">✓ סיימת</span>' : ''}
      ${c.active ? `<a class="lb-wa sm" href="${share}" target="_blank" rel="noopener">📲 לשתף</a>` : ''}
    </div>
    ${boardHtml(c.board, { worldId: w.id, charId: ch.id, limit: 15 })}
  </article>`;
}

/* ============================================================ PROFILE */
function renderProfile() {
  view = { k: 'profile' }; ++token; trace('profile');
  loadQuality();
  const p = P.getProgress(); const me = net.me(); const total = P.totalStars(p); const nt = P.nextTitle(p); const si = P.streakInfo();
  const curMin = TITLES[titleIdx(total)].min;
  const pct = nt ? Math.round(((total - curMin) / (nt.min - curMin)) * 100) : 100;
  const have = new Set(p.achievements);
  const rank = (a) => (have.has(a.id) ? 0 : a.hidden ? 2 : 1);
  const achs = [...ACHIEVEMENTS].sort((a, b) => rank(a) - rank(b));
  html(`<div class="lb-shell lb-profile">
    <div class="lb-bar"><button class="chip" data-act="home">› למפה</button></div>
    <section class="lb-card pf-head">
      <div class="pf-pawn">${pawnHtml(p.pawn, p.pawnColor, 'xl')}</div>
      <div class="pf-id">
        ${me ? `<div class="pf-name"><h1>${esc(me.nickname)}</h1><button class="chip" data-act="rename-open">✏️ שינוי כינוי</button></div>
          <form class="lb-form pf-rename" data-form="rename" hidden><div class="inl"><input name="nick" maxlength="20" value="${esc(me.nickname)}" aria-label="כינוי חדש"><button class="primary">לשמור</button></div><p class="err" aria-live="polite"></p></form>`
          : `<h1>אורח</h1>${nickForm('בחר כינוי כדי להופיע בטבלאות:')}`}
        <div class="pf-title">${titleBadge(total)}<span class="pf-total">★ ${num(total + ' / 12')}</span></div>
        <div class="pf-next"><div class="lb-bar-track"><i style="width:${pct}%"></i></div><small>${nt ? `עוד ${nt.need === 1 ? '★ אחד' : nt.need + '★'} לדרגת <b>${esc(nt.name)}</b>` : 'הדרגה הכי גבוהה. אגדה.'}</small></div>
        <div class="pf-stats"><span><b>${p.gamesPlayed}</b><small>משחקים</small></span><span><b>${p.wins}</b><small>יציאות מהמירוץ</small></span><span><b>🔥 ${si.streak}</b><small>רצף (שיא ${si.best})</small></span><span><b>${num(p.achievements.filter((id) => achs.some((a) => a.id === id)).length + '/' + achs.length)}</b><small>הישגים</small></span></div>
      </div>
    </section>
    <section class="lb-card pf-worlds"><h2>כוכבים לפי מפה</h2>
      <div class="pf-wlist">${playableMap().map((w) => { const un = P.isUnlocked(w.id); return `<button class="pf-w ${un ? '' : 'is-locked'}" data-act="world" data-id="${w.id}">${artHtml(w.id)}<span><b>${esc(w.name)}</b><small>${un ? (p.best[w.id] ? `שיא: ${p.best[w.id]} חודשים` : 'עוד לא יצאת') : '🔒 נעול'}</small></span>${starsHtml(p.stars[w.id] || 0)}</button>`; }).join('')}</div>
    </section>
    ${learnProfileHtml()}
    <section class="lb-card pf-pawns"><h2>הכלי שלך</h2>
      <div class="pf-pgrid">${P.PAWNS.map((x) => { const ok = P.pawnUnlocked(x.id, p); const on = p.pawn === x.id; return `<button class="pf-pc ${ok ? '' : 'is-locked'} ${on ? 'on' : ''}" data-act="pawn" data-id="${x.id}" ${ok ? '' : 'aria-disabled="true"'} aria-pressed="${on}">${pawnHtml(x.id, ok ? p.pawnColor : null, 'lg')}<b>${esc(x.name)}</b><small>${ok ? (on ? 'נבחר ✓' : 'לבחור') : `🔒 ${x.need}★`}</small></button>`; }).join('')}</div>
      <h3 class="lb-sub">צבע</h3>
      <div class="pf-colors" role="radiogroup" aria-label="צבע הכלי">${P.PAWN_COLORS.map((c) => `<button class="pf-col ${p.pawnColor === c.hex ? 'on' : ''}" data-act="color" data-hex="${c.hex}" style="--c:${c.hex}" role="radio" aria-checked="${p.pawnColor === c.hex}" aria-label="${c.name}"></button>`).join('')}</div>
    </section>
    <section class="lb-card pf-ach"><h2>הישגים <small>${num(p.achievements.filter((id) => achs.some((a) => a.id === id)).length + '/' + achs.length)}</small></h2>
      <div class="pf-agrid">${achs.map((a) => { const got = have.has(a.id); const hid = !got && a.hidden; const wn = a.world ? worldOf(a.world).name : a.meta ? 'מסע' : ''; return `<div class="pf-a ${got ? 'got' : ''} ${hid ? 'hid' : ''}" title="${hid ? 'הישג סודי' : esc(a.desc)}"><span class="pf-aic">${hid ? '?' : ACH_ICON[a.icon] || '🏅'}</span><b>${hid ? 'הישג סודי' : esc(a.name)}</b><small>${hid ? 'תגלה כשתשיג' : esc(a.desc)}</small>${wn && !hid ? `<em>${esc(wn)}</em>` : ''}</div>`; }).join('')}</div>
    </section>
    ${dreamsProfileHtml(p)}
    ${adminHtml()}
    ${settingsHtml()}
    <section class="lb-card pf-recover"><h2>להעביר את השחקן למכשיר אחר</h2>
      ${me ? `<p class="lb-note">קוד השחזור מעביר את השחקן, הכוכבים והקבוצות למכשיר אחר. <b>אל תשלח אותו לאף אחד</b> — מי שמחזיק בו שולט בשחקן שלך.</p>
        <div class="pf-code"><button class="chip" data-act="code-show">👁️ להציג את הקוד</button><button class="chip" data-act="code-copy">📋 להעתיק</button></div><div id="pfCode" class="pf-codebox" hidden></div>` : '<p class="lb-note">יש לך שחקן במכשיר אחר? הדבק כאן את קוד השחזור שלו.</p>'}
      <form class="lb-form" data-form="restore"><label for="pfRestore">שחזור מקוד</label><div class="inl"><input id="pfRestore" name="code" placeholder="הדבק קוד שחזור" dir="ltr" autocomplete="off"><button>לשחזר</button></div><p class="err" aria-live="polite"></p></form>
    </section>
  </div>`);
  refreshMuted();
  loadAdminList('');
}

/* -------- T4 F4 + T5 §7.3 settings: sound, "תצוגה ותנועה" (motion, graphics quality when the rendering lane ships it, מצב קל), help */
let QM = null; let qmP = null;
/** js/render/quality.js (T5, rendering lane) — optional: the quality group appears only when the module loads. */
function loadQuality() {
  if (QM || qmP) return;
  qmP = import('./render/quality.js').then((m) => { if (m && typeof m.setQualityPref === 'function' && m.TIER_LABEL) { QM = m; if (view.k === 'profile' && lobbyVisible()) { const el = $('#pfSettings'); if (el) el.outerHTML = settingsHtml(); } } }).catch(() => { /* not shipped yet */ });
}
const readSettings = () => safe(() => JSON.parse(localStorage.getItem('rr2-settings') || '{}') || {}, {});
function radios(name, legend, opts, cur, hint, extra = '') {
  return `<fieldset class="lb-radios"><legend>${legend}</legend>${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''}>${l}</label>`).join('')}${hint ? `<p class="lb-note">${hint}</p>` : ''}${extra}</fieldset>`;
}
function settingsHtml() {
  const liteOk = safe(() => !G || !G.setLite ? false : true, false);
  const lite = !!readSettings().lite;
  const q = QM ? radios('quality', 'איכות גרפיקה', QM.PREFS.map((x) => [x, QM.TIER_LABEL[x]]), safe(() => QM.qualityPref(), 'auto'),
    'חסכונית: בלי צללים ועם פחות קישוטים. מתאים לטלפונים ישנים. החלקת קצוות משתנה אחרי רענון.', `<p class="lb-note" data-q="now">עכשיו: ${esc(QM.TIER_LABEL[safe(() => QM.resolveTier(), 'high')] || '')}</p>`) : '';
  return `<section class="lb-card pf-set" id="pfSettings"><h2>הגדרות</h2>${muteToggle()}
    <h3 class="lb-sub">${T4.S0}</h3>
    ${radios('motion', T4.S1leg, T4.S1opt, motionPref(), T4.S1hint)}
    ${q}
    ${liteOk ? `<button class="lb-toggle ${lite ? 'on' : ''}" data-act="lite" role="switch" aria-checked="${lite}"><span>${T4.lite}</span><i></i></button><p class="lb-note">${T4.liteHint}</p>` : ''}
    <h3 class="lb-sub">${T4.Hhelp}</h3>
    <div class="pf-help">
      <button class="chip" data-act="help-tour">${T4.H7}</button>
      <button class="chip" data-act="help-legend">${T4.H4}</button>
      <button class="chip" data-act="help-tutorial">${T4.H5}</button>
      <button class="chip" data-act="help-welcome">${T4.H8}</button>
    </div></section>`;
}
/** F4 legend in the lobby: no game is running, so it lists what each sign means (the in-game legend adds your values). */
const LEGEND = [
  ['💰', 'מזומן', 'הכסף שבקופה עכשיו.'], ['💧', 'תזרים חודשי', 'מה נשאר בסוף כל חודש: הכנסות פחות הוצאות.'], ['📊', 'מד החופש', 'כמה מההוצאות ההכנסה הפסיבית כבר מכסה. מלא = יצאת מהמירוץ.'],
  ['🎂', 'גיל', 'כל חודש במשחק הוא חודש בחיים.'], ['🔋', 'כוח', 'הכוח של הדמות בסיפור — לא ⚡ זריקות. מתחת ל־25 יש סכנת שחיקה.'], ['😊', 'אושר', 'ל־★★★ צריך לפחות 60.'],
  ['🏦', 'דירוג אשראי', 'קובע כמה יעלו הלוואות. הלוואה כפויה מורידה אותו.'], ['🛒', 'אינפלציה', 'כמה המחירים עולים השנה.'], ['🛟', 'קרן חירום', 'כמה חודשי הוצאות שמורים בצד. ל־★★★ צריך 3.'],
  ['📅', 'התוכנית', 'איך אתה מעביר את החודש: עבודה, שעות נוספות, לימודים, עסק צדדי או מנוחה.'], ['⚡', 'זריקות', 'כל הטלת קוביות במשחק רגיל עולה זריקה אחת. בתרגול חופשי — בלי הגבלה.'], ['🎯', 'המטרה והחלום', 'הצעד הבא בדרך, והמשימות של החלום שבחרת.'],
];
function openSheet(title, inner) {
  closeLesson(false);
  const opener = document.activeElement;
  const el = document.createElement('div'); el.id = 'lbLesson'; el.className = 'lb-sheet';
  el.innerHTML = `<div class="lb-sheet-card" role="dialog" aria-modal="true" aria-labelledby="lbLessonT"><h2 id="lbLessonT">${title}</h2>${inner}<button class="primary lb-wide" data-act="lesson-close">סגירה</button></div>`;
  root().appendChild(el);
  lessonRelease = trapFocus(el); lessonOpener = opener;
  focusSoon(el.querySelector('[data-act="lesson-close"]'));
}
function legendHtml() {
  return `<table class="t4-legend"><tbody>${LEGEND.map(([ic, n, t]) => `<tr><td aria-hidden="true">${ic}</td><th scope="row">${esc(n)}</th><td>${iso(t)}</td></tr>`).join('')}</tbody></table>`;
}
/** §6.3 S-D12 (P1): the current dream (changeable) and the badges per dream. */
function dreamsProfileHtml(p) {
  const list = dreamsList(); if (!list) return '';
  const badges = list.map((d) => {
    const got = (p.dreams[d.id] && p.dreams[d.id].done) || []; if (!got.length) return '';
    const titles = got.map((id) => ((d.missions || []).find((m) => m.id === id) || {}).title || '').filter(Boolean);
    return titles.map((t) => `<li>${esc(d.icon)} ${esc(t)} ✓</li>`).join('');
  }).join('');
  return `<section class="lb-card pf-dreams"><h2>${T4.D12}</h2>${dreamRowHtml({ ...p, dream: p.dream })}${badges ? `<ul class="pf-badges">${badges}</ul>` : '<p class="lb-empty">משימה שתשלים במשחק רגיל תופיע כאן.</p>'}</section>`;
}

/** "מה למדתי": principle mastery across games (progress.js, local) + the decision-quality trend. */
function learnProfileHtml() {
  const S = P.learningSummary();
  if (!S.games || (!S.principles.length && S.dqAvg == null)) {
    return `<section class="lb-card pf-learn"><h2>🧠 מה למדתי</h2><p class="lb-empty">סיים משחק אחד — ונראה כאן אילו עקרונות כסף כבר שלך, ואיפה כדאי להתחזק.</p></section>`;
  }
  const lvl = (m) => (m >= 0.8 ? ['l3', 'שולט'] : m >= 0.6 ? ['l2', 'בדרך'] : ['l1', 'לחזק']);
  const trend = S.dqTrend == null ? '' : S.dqTrend >= 3 ? ` <span class="pf-tr up">▲ ${num(S.dqTrend)}</span>` : S.dqTrend <= -3 ? ` <span class="pf-tr down">▼ ${num(-S.dqTrend)}</span>` : '';
  const hist = S.dqHistory.slice(-12);
  return `<section class="lb-card pf-learn"><h2>🧠 מה למדתי <small>${num(S.games)} ${S.games === 1 ? 'משחק' : 'משחקים'}</small></h2>
    ${S.dqAvg != null ? `<div class="pf-dq"><div><small>איכות ההחלטות (ממוצע)</small><b>${num(S.dqAvg + '/100')}</b>${trend}</div>
      ${hist.length > 1 ? `<div class="pf-dqh" role="img" aria-label="איכות ההחלטות במשחקים האחרונים">${hist.map((v) => `<i style="height:${Math.max(6, int(v))}%" title="${int(v)}"></i>`).join('')}</div>` : ''}</div>` : ''}
    ${S.principles.length ? `<ul class="pf-lp">${S.principles.map((x) => { const [ic, name, hint] = prInfo(x.id); const [c, t] = lvl(x.mastery); const d = x.prev != null ? x.last - x.prev : 0;
      return `<li class="${c}"><span class="pf-lic" aria-hidden="true">${ic}</span><span class="pf-lt"><b>${esc(name)}</b><small>${esc(hint)}</small></span>
        <span class="pf-lbar"><span class="lr-bar"><i style="width:${Math.max(4, Math.round(x.mastery * 100))}%"></i></span><small>${num(pctTxt(x.mastery))}${d > 0.04 ? ' ▲' : d < -0.04 ? ' ▼' : ''} · ${int(x.n)} החלטות</small></span>
        <em class="pf-lv">${t}</em></li>`; }).join('')}</ul>` : ''}
    <p class="lb-note">המדד בודק אם ההחלטה הייתה נכונה לפי מה שידעת באותו רגע — לא אם היה לך מזל.</p>
  </section>`;
}

/* ============================================================ END SCREEN */
export function showEndScreen(e) { onGameEnd(e, 0); }
/** T1 review m-5: main.js resumes a game after the 2D → 3D reload through the lobby's own launch (closeLobby + session bookkeeping) */
export function resumeGame(cfg) { return cfg && cfg.worldId ? launch({ ...cfg, resume: true }) : Promise.resolve(false); }
const LEAK_LABEL = {
  interest: 'ריבית על הלוואות ואשראי', interestPaid: 'ריבית על הלוואות ואשראי', credit: 'ריבית על חוב אשראי', loans: 'ריבית על הלוואות',
  toys: 'פיתויים שבחרת לקנות', wants: 'פיתויים שבחרת לקנות', doodad: 'הוצאות פתאומיות ופיתויים', subs: 'מנויים שהוספת',
  autoLoan: 'הלוואות חירום שהבנק כפה', autoLoans: 'הלוואות חירום שהבנק כפה', bad: 'נכסים שמוציאים כסף', badAssets: 'נכסים שמוציאים כסף',
  crisis: 'משברים בלי כרית', fees: 'עמלות', lifestyle: 'סגנון חיים',
};
/** end.leaks (engine: [{key,label,amount}] biggest first; key 'forced' = needs/crises, shown but never blamed) → biggest
 *  avoidable leaks first, 'forced' last. Also accepts a {key: amount} map; falls back to engine stats. */
function leaksOf(e) {
  const end = e.end || {}; const st = e.stats || end.stats || {};
  const norm = (x, k) => {
    if (typeof x === 'number') x = { key: k, amount: x };
    if (!x || typeof x !== 'object') return null;
    const key = x.key || x.id || k || '';
    return { key, label: x.label || x.name || x.text || LEAK_LABEL[key] || '', amount: Math.abs(+(x.amount ?? x.value ?? x.total ?? 0)) || 0, note: x.note || x.desc || x.hint || '' };
  };
  let list;
  if (Array.isArray(end.leaks)) list = end.leaks.map((x) => norm(x));
  else if (end.leaks && typeof end.leaks === 'object') list = Object.entries(end.leaks).map(([k, v]) => norm(v, k));
  else {
    list = [];
    if (st.interestPaid > 0) list.push(norm(st.interestPaid, 'interest'));
    if (st.toysSpent > 0) list.push(norm(st.toysSpent, 'toys'));
    if (st.badAssetLoss > 0) list.push(norm(st.badAssetLoss, 'badAssets'));
    if (st.subsPaid > 0) list.push(norm(st.subsPaid, 'subs'));
  }
  const ok = list.filter((x) => x && x.label && x.amount > 0);
  const blame = ok.filter((x) => x.key !== 'forced').sort((a, b) => b.amount - a.amount).slice(0, 4);
  const forced = ok.filter((x) => x.key === 'forced').slice(0, 1).map((x) => ({ ...x, forced: true }));
  return [...blame, ...forced];
}
/** "ויתרת על ₪X פיתויים": stats.toysResisted may be an amount (₪) or a count; an explicit amount field wins. */
function resistedOf(e) {
  // engine: stats.toysResisted = ₪ of temptations refused, stats.resisted = how many
  const st = e.stats || (e.end && e.end.stats) || {};
  if (st.toysResisted > 0) return `ויתרת על ${fmt(st.toysResisted)} פיתויים`;
  if (st.resisted > 0) return `ויתרת על ${st.resisted === 1 ? 'פיתוי אחד' : st.resisted + ' פיתויים'}`;
  return '';
}
/* -------- duels: ?duel=<world>.<char>.<seed>&by=<nick>&r=w29.2|l87 — a friendly free game on the same board (no server) */
function parseDuel(q) {
  const d = q && q.get('duel'); if (!d) return null;
  const [wid, cid, sd] = String(d).split('.');
  const w = safe(() => getWorld(wid)); const seed = Math.floor(+sd);
  if (!w || !charOf(w, cid) || !(seed > 0)) return null;
  return { worldId: wid, charId: cid, seed, by: String(q.get('by') || '').trim().slice(0, 20), r: parseRes(q.get('r')) };
}
function parseRes(r) {
  const m = String(r || '').match(/^w(\d{1,3})\.(\d)$/); if (m) return { won: true, months: +m[1], stars: Math.min(3, +m[2]) };
  const l = String(r || '').match(/^l(\d{1,3})$/); if (l) return { won: false, pct: Math.min(100, +l[1]) };
  return null;
}
const resCode = (e) => (e.status === 'won' ? `w${e.months}.${e.stars | 0}` : `l${Math.round(Math.max(0, Math.min(1, e.progress ?? e.end?.progress ?? 0)) * 100)}`);
const resText = (r) => (!r ? '' : r.won ? `${r.months} חודשים ${starStr(r.stars)}` : `${r.pct}% מהדרך`);
function duelVerdict(me, them) {
  if (!them) return 0;
  const score = (r) => (r.won ? 1000 - r.months * 3 + r.stars * 0.5 : r.pct);
  const a = score(me), b = score(them);
  return a > b ? 1 : a < b ? -1 : 0;
}
let pendingDuel = safe(() => parseDuel(new URLSearchParams(location.search)));
function renderDuel() {
  const d = pendingDuel; if (!d) return renderHome();
  view = { k: 'duel' }; ++token;
  const w = worldOf(d.worldId); const c = charOf(w, d.charId);
  const T = starThresholds(w, c.id);
  html(`<div class="lb-shell lb-duel">
    <div class="lb-bar"><button class="chip" data-act="duel-skip">› למפה</button>${topMini()}</div>
    <article class="duel-card">
      <div class="end-art">${artHtml(w.id)}</div>
      <p class="end-kicker">⚔️ דו־קרב</p>
      <h1 class="duel-title">${d.by ? `${esc(d.by)} אתגר אותך!` : 'אתגרו אותך לדו־קרב!'}</h1>
      <p class="duel-sub">${esc(w.name)} · ${esc(c.name)} — אותו לוח, אותן קוביות, אותם קלפים.</p>
      ${d.r ? `<div class="duel-score"><small>התוצאה ${d.by ? 'של ' + esc(d.by) : 'שלו'}</small><b>${esc(resText(d.r))}</b></div>` : ''}
      <p class="lb-note">⭐ ★★ עד ${T.t2} חודשים · ★★★ עד ${T.t3}</p>
      <div class="duel-acts"><button class="primary lb-big" data-act="duel-go">יאללה, לשחק ←</button></div>
      <p class="lb-note">משחק ידידותי, בלי טבלה. בסוף תוכל להחזיר אתגר.</p>
    </article>
  </div>`);
}
function clearDuelParam() { safe(() => { const q = new URLSearchParams(location.search); q.delete('duel'); q.delete('by'); q.delete('r'); const qs = q.toString(); history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '')); }); }

function onGameEnd(e, delay) {
  if (!e || !e.worldId) return;
  if (!RW && !t6Failed) { t6Mods().then(() => onGameEnd(e, delay)); return; }   // CR-33: normally already in (game.js imports them)
  const cfg = (G && G.activeConfig && safe(() => G.activeConfig())) || null;
  const same = !!(cfg && cfg.worldId === e.worldId && (cfg.mode || 'free') === (e.mode || 'free') && (e.worldId === 'h' || cfg.charId === e.charId));
  const hist = e.mode === 'history' || e.worldId === 'h';
  const seed = e.seed ?? (e.summary && e.summary.seed) ?? (same ? cfg.seed : null);
  if (hist) e = { ...e, mode: 'history', worldId: 'h', seed, scenarioId: e.scenarioId || (e.end && e.end.scenarioId) || (e.summary && e.summary.scenarioId) || (same && cfg.scenarioId) || null };
  const learnMode = !hist && !e.resultId && isLearnEnd(e);                     // T4 §7.3
  if (learnMode) e = { ...e, learn: true };
  const saveKey = e.resultId ? rankedKey(e.resultId) : hist ? ((G && G.saveKeyFor && safe(() => G.saveKeyFor({ mode: 'history', worldId: 'h', scenarioId: e.scenarioId, seed }))) || '') : slotKey(e.worldId, learnMode);
  // the engine's one-time bail-out may have been used mid-game: it only shows in the saved state's flags (never for learning games)
  const saved = saveKey ? localSaveState(saveKey) : null;
  if (!learnMode && saved && saved.flags && saved.flags.bailoutUsed) P.markBankruptcy();
  // lessons learned this game → library (also in learning mode: learning is the point), with the engine's context (E-6)
  const lessonIds = [e.lessons, e.end && e.end.lessons, e.summary && e.summary.lessons, saved && saved.lessons].filter(Array.isArray).flat();
  LIB.unlock(lessonIds, (e.end && Array.isArray(e.end.lessonList) && e.end.lessonList) || null);
  // §7.1 learning: no stars, best, unlocks, titles, pawns, achievements, worldsPlayed, gamesPlayed, wins, ⚡, boards
  // T6 §9.3: the end of a continuation after the win records nothing (stars, best and unlocks were recorded at the win)
  const afterWin = !!(e.afterWin || (e.end && e.end.afterWin));
  const res = afterWin ? { newPawns: [], newAchievements: [], titleBefore: '', titleAfter: '', afterWin: true } : learnMode ? P.recordLearnGame(e) : P.recordGame(e);
  gamesThisSession++;
  res.newLessons = [...sessLessons]; sessLessons = [];
  const learning = (e.end && e.end.learning) || (e.summary && e.summary.learning) || null;
  res.learn = afterWin ? null : safe(() => P.recordLearning(learning, [e.resultId || '', learnMode ? 'learn' : e.mode || 'free', e.worldId, e.seed ?? '', e.months, e.status].join('|')), null);
  res.quizEnergy = afterWin ? 0 : creditQuizAtEnd(e);
  if (e.mode === 'daily') { res.energy = grantDaily(P.streakInfo().streak); res.energyWhy = 'על האתגר היומי — אפשר להמשיך לשחק'; }
  if (!learnMode && !afterWin && (e.mode || 'free') === 'free' && !hist) res.dream = safe(() => P.recordDream(e), null);   // §6.3 badges: free normal games only
  if (!afterWin) logMilestones(e, res);
  lastEndSig = sigOf(e);
  const ranked = e.mode && e.mode !== 'free' && !!e.resultId && (metaOf(e.worldId) || {}).ranked !== false;   // worlds wave 0: an unranked world has no result to send
  endCtx = { e, res, ranked, hist, learn: learnMode, seed, duel: e.duel || (same && cfg.duel) || null, submit: ranked ? { state: 'saving' } : null, groupCode: null, groupName: null, dreamSaved: null,
    ghosts: null, rivals: (e.t6 && e.t6.rivals) || 'off' };
  if (ranked) {
    // the replay log goes to verify, never into rr_finish's stats (16 KB cap); prefer the longer of summary / saved state
    const { actions: sumActions = null, ...summary } = e.summary || {};
    const actions = [sumActions, saved && saved.actions].filter(Array.isArray).sort((a, b) => b.length - a.length)[0] || null;
    addPending({ pid: net.me()?.id, resultId: e.resultId, status: e.status, months: e.months, passive: e.passive || 0, expenses: e.expenses || 0, netWorth: e.netWorth || 0,
      actions, stats: { ...(e.summary ? summary : { stats: e.stats || {} }), progress: e.progress ?? null, stars: e.stars || 0, world: e.worldId, char: e.charId } });
  } else if (!(e.t6 && e.t6.afterwinAllowed)) {   // T6 §9.3: a win that may continue keeps its (finished) save until the player decides
    // review MINOR-2: the branch test needs no rewind.js (a failed lazy load must never clear the original slot)
    // T6: a practice branch clears its OWN slot (rr2-save-branch-<w>), never the original's learn / free slot
    const key = e.branch && typeof e.saveKey === 'string' && /^rr2-save-branch-/.test(e.saveKey) ? e.saveKey : hist ? { mode: 'history', worldId: 'h', scenarioId: e.scenarioId, seed } : slotKey(e.worldId, learnMode);
    game().then((g) => g && g.clearSave && safe(() => g.clearSave(key)));
    // T6 review nit: the rr2-branches entry goes with its slot; the end screen keeps it (endCtx.t6meta) for "↩ חזרה למשחק המקורי"
    if (e.branch && RW && RW.isBranchKey(key)) endCtx.t6meta = safe(() => RW.forgetBranch(e.worldId), null);
  }
  setTimeout(() => {
    ensureCss(); install();
    const o = overlay(); if (!o) return;
    o.hidden = false; o.classList.add('lb-open'); document.body.classList.add('lb-lobby-open');
    if (!booted) { booted = true; boot(); }
    view = { k: 'end' }; trace('end');
    renderEnd(true); focusView();   // a11y K-7: the end screen replaced the lobby — focus its title, not the removed node
    if (ranked) submitResult();
  }, delay);
}
function renderEnd(animate = false) {
  if (!endCtx) return renderHome();
  if (flag('recap2') && endCtx.e && endCtx.e.t6 && !T6S && !t6Failed) { const c = endCtx; t6Mods().then(() => { if (endCtx === c && view.k === 'end') renderEnd(animate); }); return; }   // CR-33
  view = { k: 'end' }; ++token;
  const { e, res, ranked, duel, hist, learn } = endCtx;
  const sc = hist ? scenById(e.scenarioId) : null;
  const w = hist ? { id: 'h', name: sc ? sc.name : 'מכונת הזמן', lesson: (sc && sc.lesson) || '', goal: { type: 'netWorth', target: (e.end && e.end.benchmark && e.end.benchmark.netWorth) || 0 } } : worldOf(e.worldId);
  const c = hist ? null : charOf(w, e.charId); const end = e.end || {};
  const won = e.status === 'won'; const bankrupt = end.reason === 'bankrupt';
  const sprint = e.mode === 'daily';
  const stars = hist ? Math.max(0, Math.min(3, e.stars | 0)) : won ? Math.max(0, Math.min(3, e.stars | 0)) : 0;
  const title = learn ? (won ? T4.L1 : T4.L2) : hist ? (won ? 'ניצחת את המדד!' : bankrupt ? 'פשטת רגל' : 'המדד ניצח הפעם') : won ? (stars >= 3 ? 'משחק מושלם!' : 'יצאת מהמירוץ!') : bankrupt ? 'פשטת רגל' : sprint ? 'הספרינט נגמר' : 'נגמר הזמן';
  const prog = Math.max(0, Math.min(1, e.progress ?? end.progress ?? 0));
  const near = nearMissText(end);
  const nextW = hist ? null : nextMapEntry(w.id);   // 2026-11-25: the next built map in the order of the game (linear unlocks)
  const nextOpen = nextW && P.isUnlocked(nextW.id);
  const modeName = hist ? '⏳ מכונת הזמן' : duel ? '⚔️ דו־קרב' : learn ? '🎓 תרגול' : e.mode === 'free' ? 'משחק חופשי' : (e.title || MODE_NAME[e.mode] || '');
  const kicker = [w.name, c ? c.name : '', modeName].filter(Boolean).map(esc).join(' · ');
  const g = w.goal || {};
  const cell = (label, value, cls = '') => `<span><small>${label}</small><b class="${cls}">${iso(value)}</b></span>`;
  const statCells = [cell('חודשים', String(e.months))];
  if (g.type === 'passive') statCells.push(cell('הכנסה פסיבית', fmtM(e.passive || 0), won ? 'pos' : ''), cell('הוצאות', fmtM(e.expenses || 0)));
  else if (g.type === 'passive12') statCells.push(cell('שווי נקי', fmtM(e.netWorth || 0), (e.netWorth || 0) < 0 ? 'neg' : ''), cell('יעד: ממוצע לחודש', fmtM(g.target || 0)));   // w5: a 12-month average of asset income
  else if (g.type === 'all') {   // w7: net worth AND liquidity (months of the chain's fixed costs) — the end screen shows both targets
    const nwT = ((g.of || []).find((x) => x.type === 'nw' || x.type === 'netWorth') || {}).target || 0; const lq = (g.of || []).find((x) => x.type === 'liquidity');
    statCells.push(cell('שווי נקי', fmtM(e.netWorth || 0), won ? 'pos' : (e.netWorth || 0) < 0 ? 'neg' : ''), cell('יעד', fmtM(nwT)));
    if (lq) statCells.push(cell('יעד קופה', `${lq.months} חודשי עלויות קבועות`));
  }
  else statCells.push(cell('שווי נקי', fmtM(e.netWorth || 0), won ? 'pos' : (e.netWorth || 0) < 0 ? 'neg' : ''), cell('יעד', fmtM(g.target || 0)));
  if (hist) { statCells.length = 1; statCells.push(cell('שווי נקי', fmtM(e.netWorth || 0), won ? 'pos' : (e.netWorth || 0) < 0 ? 'neg' : ''), cell('קנה והחזק', fmtM((end.benchmark && end.benchmark.netWorth) || 0))); }
  else if (g.type === 'netWorthImpact') statCells.push(`<span><small>השפעה</small><b>${num((end.impact ?? 0) + '/' + g.impact)}</b></span>`);
  else if (g.type === 'passive') statCells.push(cell('שווי נקי', fmtM(e.netWorth || 0), (e.netWorth || 0) < 0 ? 'neg' : ''));
  const leaks = won ? [] : leaksOf(e);
  const resisted = resistedOf(e);
  const maxLeak = Math.max(1, ...leaks.filter((l) => !l.forced).map((l) => l.amount), ...(leaks.every((l) => l.forced) ? leaks.map((l) => l.amount) : [0]));
  const leaksHtml = !won && (leaks.length || resisted) ? `<section class="end-leaks" aria-label="הדליפות שלך">
      ${leaks.length ? `<h3>🕳️ הדליפות שלך</h3><ol>${leaks.map((l) => `<li class="${l.forced ? 'forced' : ''}"><span class="lk-l">${iso(l.label)}${l.note ? `<small>${iso(l.note)}</small>` : ''}</span><span class="lk-bar" aria-hidden="true"><i style="width:${Math.max(6, Math.min(100, Math.round((l.amount / maxLeak) * 100)))}%"></i></span><b class="lk-a">${iso('−' + fmtM(l.amount))}</b></li>`).join('')}</ol>${leaks[0] && !leaks[0].forced ? `<p class="lk-hint">🎯 הדליפה הכי גדולה: ${iso(leaks[0].label)}. סתום אותה — ותגיע רחוק יותר.</p>` : ''}` : ''}
      ${resisted ? `<p class="end-resist">💪 ${iso(resisted)} — יפה!</p>` : ''}
    </section>` : '';
  let duelHtml = '';
  if (duel) {
    const mine = { won, months: e.months, stars, pct: Math.round(prog * 100) };
    const v = duelVerdict(mine, duel.r);
    duelHtml = `<div class="end-duel"><div class="dl-side me"><small>אתה</small><b>${esc(resText(mine))}</b></div><div class="dl-vs">VS</div><div class="dl-side"><small>${esc(duel.by || 'החבר')}</small><b>${duel.r ? esc(resText(duel.r)) : '?'}</b></div>
      ${duel.r ? `<p class="dl-verdict ${v > 0 ? 'win' : v < 0 ? 'lose' : ''}">${v > 0 ? 'ניצחת בדו־קרב! 🏆' : v < 0 ? 'הפעם הוא ניצח. החזר לו אתגר!' : 'תיקו מושלם 🤝'}</p>` : ''}</div>`;
  }
  const analysis = safe(() => (UIm && UIm.endAnalysisHtml ? UIm.endAnalysisHtml(end) : ''), '') || '';   // T2 §15.9 (was a MutationObserver in game.js)
  if (flag('recap2') && e.t6 && T6S && GH && RW) return renderEndT6({ e, res, w, c, end, won, stars, title, kicker, near, learn, ranked, hist, duelHtml, leaksHtml, analysis, nextW, nextOpen, animate, prog, sprint, g });
  html(`<div class="lb-shell lb-end ${won ? 'is-won' : 'is-lost'} ${animate ? 'anim' : ''}">
    <article class="end-card">
      <div class="end-art ${hist ? 'hist' : ''}">${hist || PAINTED.has(w.id) ? `<img src="${hist ? HIST_ART : cardArt(w.id)}" alt="" data-fallback="remove">` : artHtml(w.id)}</div>
      <p class="end-kicker">${kicker}</p>
      <h1 class="end-title">${title}</h1>
      ${learn ? learnStarsHtml(won ? res.wouldStars || stars : 0) : `<div class="end-stars" role="img" aria-label="${stars} כוכבים מתוך 3">${[0, 1, 2].map((i) => `<span class="end-star ${!animate && i < stars ? 'on' : ''}" data-i="${i}" aria-hidden="true">★</span>`).join('')}</div>`}
      ${ranked ? `<div class="end-rank" id="endRank">${rankHtml()}</div>` : ''}
      ${duelHtml}
      ${near && !(learn && /★/.test(near)) ? `<p class="end-near">${iso(near)}</p>` : ''}
      ${!won ? `<div class="end-prog"><div class="lb-bar-track big"><i style="width:${Math.round(prog * 100)}%"></i></div><small>${sprint ? 'הגעת ל־' : 'עשית '}${num(Math.round(prog * 100) + '%')} ${sprint ? 'מהחופש' : g.type === 'passive' ? 'מהדרך לחופש' : 'מהדרך ליעד'}</small></div>` : ''}
      ${hist ? benchHtml(e) : ''}
      ${learn ? '' : happyGateHtml(e, w, stars)}
      ${leaksHtml}
      <div class="end-stats">${statCells.join('')}</div>
      ${learnHtml(e, res)}
      ${analysis}
      ${practiceEndHtml(e)}
      ${dreamEndHtml(e)}
      ${mentorEndHtml(e)}
      ${lifeHtml(e, won)}
      <div class="end-new">${newsHtml(e, res, won ? resisted : '')}</div>
      <div class="end-lesson"><b>📚 השיעור ${esc(P.inW(w.name))}</b><p>${iso(end.lesson || w.lesson || '')}</p>${end.tip ? `<p class="end-tip">💡 ${iso(end.tip)}</p>` : ''}</div>
      ${endButtons(e, res, nextW, nextOpen)}
    </article>
  </div>`);
  if (animate) animateEnd(learn ? 0 : stars, won, res);
  else document.querySelectorAll('.end-new > *').forEach((x) => x.classList.add('in'));
}
/* -------- T6 §6: the personal end summary (flag recap2). The old layout above stays the fallback. */
let UIm = null; setTimeout(() => ui().then((m) => { UIm = m; }).catch(() => {}), 0);   // CR-33: after the first lobby render, not during it
const T6END = { awLines: (A) => [`${A.months} חודשים אחרי היציאה`, `שווי נקי ${fmtSgn(A.nwDelta)} מאז היציאה`, `הכנסה פסיבית ${fmtSgn(A.passiveDelta)} מאז היציאה`,
  A.hap0 != null && A.hap1 != null ? `אושר ${A.hap0} → ${A.hap1}` : A.happinessDelta != null ? `אושר ${A.happinessDelta > 0 ? '+' : ''}${Math.round(A.happinessDelta)} מאז היציאה` : '',
  A.reason === 'afterWinBroke' && A.brokeM ? `החופש לא החזיק: בחודש ${A.brokeM} נגמר הכסף.` : A.stillFree ? 'ההכנסה הפסיבית עדיין מכסה את ההוצאות' : 'ההכנסה הפסיבית כבר לא מכסה את ההוצאות'].filter(Boolean) };
const fmtSgn = (n) => (Math.round(+n || 0) > 0 ? '+' : '') + fmtM(+n || 0);
/** the original of a finished branch (live learning slot) — only while it is still the same game (T6 M2) */
function t6Origin(e) {
  const meta = (endCtx && endCtx.e === e && endCtx.t6meta) || safe(() => RW.branchFor(e.worldId), null); if (!meta || meta.origin !== 'live') return null;
  const o = safe(() => RW.originOf(meta), null); return o && o.cfg && !(o.state && o.state.over) ? o : null;
}
function t6Ctx() {
  const { e } = endCtx; const t6 = e.t6 || {};
  const ghostsOn = endCtx.rivals !== 'off';
  const lg = safe(() => RW.lastGame(), null);
  return { ghosts: endCtx.ghosts, rivals: ghostsOn ? (endCtx.ghosts ? 'done' : 'pending') : 'off', personas: safe(() => GH.personas(), T6S.PERSONAS_FALLBACK),
    // M4: from the end of a finished free / learn game (rr2-last-game), never from a branch end (its log is not the last game)
    rewindAllowed: !e.branch && !endCtx.ranked && RW.endAllowed({ mode: e.mode || 'free', worldId: e.worldId, learn: !!endCtx.learn, resultId: e.resultId || null }), lastGame: !!lg && !e.branch, afterwinAllowed: !!t6.afterwinAllowed, branchTl: t6.branchTl || null, graphId: 'end' };
}
/** director decision 5: a finished practice branch, side by side with its original (only while the original is still the same game —
 *  T6 M2; game.js builds e.t6.branchCmp). Months, net worth, decision quality, luck; the luck row says that it was not held constant. */
function branchCmpHtml(C) {
  if (!C || !C.orig || !C.branch) return '';
  const O = C.orig, B = C.branch;
  const mo = (x) => (x.done ? (x.status === 'won' ? `יצאת בחודש ${x.months}` : `${x.months} חודשים`) : `עדיין משחק · חודש ${x.months}`);
  const money = (v) => (v == null ? '—' : num(fmtM(v)));
  const q = (v) => (v == null ? '—' : num(`${v}/100`));
  const lk = (v) => (v == null ? '—' : num(v >= 0 ? `+${fmtM(v)}` : `−${fmtM(-v)}`));
  const better = (a, b) => (a == null || b == null || a === b ? '' : b > a ? ' class="pos"' : ' class="neg"');
  const rows = [['⏱️ זמן', mo(O), mo(B), ''], ['💰 שווי נקי', money(O.nw), money(B.nw), better(O.nw, B.nw)],
    O.q != null || B.q != null ? ['🧠 איכות ההחלטות', q(O.q), q(B.q), better(O.q, B.q)] : null,
    O.luck != null || B.luck != null ? ['🍀 מזל', lk(O.luck), lk(B.luck), ''] : null].filter(Boolean);
  return `<section class="t6-bcmp" aria-label="הענף מול המשחק המקורי"><h3>🧪 הענף מול המשחק המקורי</h3>
    <table><thead><tr><th scope="col"></th><th scope="col">המקורי</th><th scope="col">הענף</th></tr></thead><tbody>${rows.map(([l, a, b, c]) => `<tr><th scope="row">${l}</th><td>${a}</td><td${c}>${b}</td></tr>`).join('')}</tbody></table>
    ${O.luck != null && B.luck != null && Math.abs(O.luck - B.luck) > 0 ? '<p class="t6-note">המזל לא נשאר זהה אחרי נקודת הפיצול — חלק מההבדל הוא מזל, לא רק ההחלטה.</p>' : ''}</section>`;
}
function renderEndT6(o) {
  const { e, res, w, end, won, stars, title, kicker, near, learn, ranked, hist, duelHtml, leaksHtml, analysis, nextW, nextOpen, animate } = o;
  const ctx = t6Ctx();
  const A = end.afterWin || e.afterWin || null;
  const head = `<p class="end-kicker">${kicker}</p>
      <h1 class="end-title">${A ? esc(A.title || T6S.T6.afterwinTitle) : title}</h1>
      ${A ? `<ul class="t6-awl">${(Array.isArray(A.lines) && A.lines.length ? A.lines : T6END.awLines(A)).map((l) => `<li>${iso(l)}</li>`).join('')}</ul>`
        : learn ? learnStarsHtml(won ? res.wouldStars || stars : 0) : `<div class="end-stars" role="img" aria-label="${stars} כוכבים מתוך 3">${[0, 1, 2].map((i) => `<span class="end-star ${!animate && i < stars ? 'on' : ''}" data-i="${i}" aria-hidden="true">★</span>`).join('')}</div>`}
      ${ranked ? `<div class="end-rank" id="endRank">${rankHtml()}</div>` : ''}
      ${duelHtml}
      ${near && !(learn && /★/.test(near)) && !A ? `<p class="end-near">${iso(near)}</p>` : ''}
      ${hist ? benchHtml(e) : ''}`;
  const more = T6S.renderMore(e, { ...ctx, learnHtml: leaksHtml + learnHtml(e, res), lifeHtml: lifeHtml(e, won), analysisHtml: analysis + mentorEndHtml(e) + practiceEndHtml(e),
    newsHtml: `<div class="end-new">${newsHtml(e, res, won ? resistedOf(e) : '')}</div>${dreamEndHtml(e)}`, lessonHtml: `<div class="end-lesson"><b>📚 השיעור ${esc(P.inW(w.name))}</b><p>${iso(end.lesson || w.lesson || '')}</p>${end.tip && !(T6S.suggestionOf(end) || {}).text ? `<p class="end-tip">💡 ${iso(end.tip)}</p>` : ''}</div>`,
    achOpen: !!(res.unlockedWorld || res.gained > 0) });
  html(`<div class="lb-shell lb-end t6-end ${won ? 'is-won' : 'is-lost'} ${animate ? 'anim' : ''}">
    <article class="end-card">
      <div id="endTop">${head}${learn ? '' : happyGateHtml(e, w, stars)}${e.branch && !ctx.branchTl && !(e.t6 && e.t6.branchCmp) ? '<p class="t6-note">המשחק המקורי כבר לא זמין להשוואה.</p>' : ''}${e.branch ? branchCmpHtml(e.t6 && e.t6.branchCmp) : ''}${T6S.renderTop(e, ctx)}</div>
      <div class="t6-btns">${endButtons(e, res, nextW, nextOpen)}</div>
      ${more}
      ${learn || A ? '' : ''}
    </article>
  </div>`);
  const r = root(); T6S.wireSummary(r, (id) => (id === 'end' ? t6Graph() : null));
  if (animate) animateEnd(learn ? 0 : stars, won, res);
  else document.querySelectorAll('.end-new > *').forEach((x) => x.classList.add('in'));
  if (ctx.rivals === 'pending') { const ends = safe(() => GH.ends(), null); if (ends && GH.status().state === 'done') onGhostsDone({ ends }); }
}
function t6Graph() {
  const { e } = endCtx; const end = e.end || {}; const t6 = e.t6 || {};
  const tl = (end.recap && end.recap.graph && end.recap.graph.tl) || t6.tl; if (!tl) return null;
  const notes = (end.recap && end.recap.graph && end.recap.graph.notes) || [];
  return { tl, opts: { alt: T6S.altOf(tl, end), recessions: T6S.recessionsOf(end), lowCushion: end.recap && end.recap.graph ? end.recap.graph.lowCushion : null, notes, compareTl: t6.branchTl || null, compareLabel: T6S.T6.lg.orig } };
}
/** ghosts finished (bus 'ghosts:done'): fill the comparison lines and the "מול היריבים" section in place */
function onGhostsDone({ ends } = {}) {
  if (!T6S || !endCtx || !endCtx.e || !endCtx.e.t6 || endCtx.rivals === 'off') return;
  endCtx.ghosts = ends || null;
  if (view.k !== 'end' || !flag('recap2')) return;
  const ctx = t6Ctx(); const end = endCtx.e.end || {};
  const dims = (end.recap && end.recap.dims) || endCtx.e.t6.dims;
  const box = document.getElementById('t6Dims'); if (box && dims) box.outerHTML = T6S.dimRowsHtml(dims, ctx);
  const sec = [...document.querySelectorAll('.t6-sec')].find((d) => d.querySelector('summary')?.textContent === T6S.T6.sec.rivals);
  if (sec) { const b = sec.querySelector('.t6-secb'); if (b) b.innerHTML = T6S.rivalsSection(endCtx.e, ctx); }
}
bus.on('ghosts:done', onGhostsDone);
/* -------- v3 end-screen blocks */
/* "החלטות מול מזל" (spec §8): engine end.learning = {decisionQuality 0..100, luck:{total ₪}, principles:{id:{mastery,n}}, top, sentence}.
   Hidden when the block is missing (older engine / v2 saves). Principle names: local table, then the lesson library. */
const PRINCIPLES = {
  cashflow: ['💧', 'תזרים מזומנים', 'נכס טוב מכניס כל חודש יותר ממה שהוא עולה — כולל ההלוואה.'],
  cushion: ['🛟', 'כרית ביטחון', 'כמה חודשי הוצאות נשארים בצד כשמשהו משתבש.'],
  debt_cost: ['💳', 'עלות החוב', 'הלוואה שווה רק אם מה שהיא קונה מכניס יותר מהריבית.'],
  opportunity_cost: ['⚖️', 'עלות אלטרנטיבית', 'כל שקל על פיתוי הוא שקל שלא קנה נכס.'],
  risk_size: ['🎯', 'גודל הסיכון', 'לא לשים על הימור אחד יותר ממה שמותר להפסיד.'],
  rate_risk: ['📉', 'סיכון ריבית', 'ריבית משתנה יכולה לעלות — ותזרים שנראה טוב נעלם.'],
  diversification: ['🧺', 'פיזור', 'לא כל הביצים בסל אחד.'],
  time: ['⏳', 'זמן וכוח', 'הזמן הוא הנכס הכי יקר, ושחיקה עולה כסף.'],
  time_in_market: ['📈', 'זמן בשוק', 'מי שנשאר מושקע לאורך זמן מנצח את מי שמנסה לתזמן.'],
  fees_tax: ['🧾', 'מסים ועמלות', 'מה שקובע זה מה שנשאר אחרי מס.'],
  knowledge: ['📚', 'ידע פיננסי', 'להבין את המושג לפני שהכסף על השולחן.'],
  leverage: ['🏗️', 'מינוף', 'כסף של הבנק מגדיל את הרווח — וגם את ההפסד.'],
};
let lessonTitles = {};
LIB.lessons().then((L) => { lessonTitles = Object.fromEntries((L || []).map((l) => [l.id, l.title])); }).catch(() => {});
const prInfo = (id) => PRINCIPLES[id] || ['•', lessonTitles[id] || String(id).replace(/_/g, ' '), ''];
const pctTxt = (x) => Math.round(Math.max(0, Math.min(1, +x || 0)) * 100) + '%';
function dqWord(q) { return q >= 80 ? 'מצוינות' : q >= 65 ? 'טובות' : q >= 50 ? 'סבירות' : 'יש מה לשפר'; }
function learnHtml(e, res) {
  const L = (e.end && e.end.learning) || (e.summary && e.summary.learning) || null;
  if (!L || L.decisionQuality == null || !Number.isFinite(+L.decisionQuality)) return '';
  const q = Math.max(0, Math.min(100, Math.round(+L.decisionQuality)));
  const luck = Math.round(+(L.luck && typeof L.luck === 'object' ? L.luck.total : L.luck) || 0);
  const E = Math.max(1000, +e.expenses || +(e.end && e.end.expenses) || 0);
  const lr = Math.tanh(luck / (6 * E));                       // ±6 months of expenses ≈ a full bar
  const lw = Math.round(Math.abs(lr) * 50);
  const luckTxt = Math.abs(lr) < 0.08 ? 'ניטרלי' : luck > 0 ? `+${fmtM(luck)}` : `−${fmtM(-luck)}`;
  const luckWord = Math.abs(lr) < 0.08 ? 'המזל לא הכריע' : luck > 0 ? 'המזל עזר לך' : 'המזל היה נגדך';
  const sentence = L.sentence || (q >= 70 && luck < 0 ? 'ההחלטות שלך היו טובות — המזל פחות. עם אותן החלטות, בפעם הבאה סביר שתצא מהר יותר.'
    : q >= 70 ? 'החלטות טובות. ככה בונים הצלחה שחוזרת על עצמה.' : luck > 0 ? 'המזל עזר יותר מההחלטות. בפעם הבאה: תזרים, כרית וחוב לפני כל קנייה.'
    : 'יש מקום לשפר: תסתכל על הכרית, על עלות החוב ועל מה שכל נכס מכניס באמת.');
  const lr2 = (res && res.learn) || {};
  const ps = P.gamePrinciples(L);
  const improved = lr2.improved; const strongest = lr2.strongest || (ps.length ? ps.reduce((a, b) => (b.mastery > a.mastery ? b : a)) : null);
  const missed = lr2.missed || (ps.length ? (() => { const w = ps.reduce((a, b) => (b.mastery < a.mastery ? b : a)); return w.mastery < 0.6 ? w : null; })() : null);
  const lines = [];
  if (improved) { const [ic, name] = prInfo(improved.id); lines.push(`<p class="lr-pr up"><i aria-hidden="true">${ic}</i><span>השתפרת ב<b>${esc(name)}</b> ${num(pctTxt(improved.from) + ' → ' + pctTxt(improved.to))}</span></p>`); }
  else if (strongest && (!missed || strongest.id !== missed.id) && strongest.mastery >= 0.7) { const [ic, name] = prInfo(strongest.id); lines.push(`<p class="lr-pr up"><i aria-hidden="true">${ic}</i><span>הכי חזק אצלך: <b>${esc(name)}</b> ${num(pctTxt(strongest.mastery))}</span></p>`); }
  if (missed) { const [ic, name, hint] = prInfo(missed.id); lines.push(`<p class="lr-pr miss"><i aria-hidden="true">${ic}</i><span>כדאי לחזק: <b>${esc(name)}</b>${hint ? ` — ${esc(hint)}` : ''}</span></p>`); }
  const top = Array.isArray(L.top) ? L.top.find((t) => t && t.c && +t.score < 60) : null;
  if (top) lines.push(`<p class="lr-pr tip"><i aria-hidden="true">💡</i><span>ההחלטה ששווה לחשוב עליה שוב: <b>${iso(String(top.c).slice(0, 40))}</b>${top.why ? ` — ${iso(String(top.why).slice(0, 80))}` : ''}</span></p>`);
  return `<section class="end-learn" aria-label="החלטות מול מזל">
    <h3>🧠 החלטות מול מזל</h3>
    <div class="lr-row"><span class="lr-l">איכות ההחלטות</span><span class="lr-bar dq" role="img" aria-label="${q} מתוך 100"><i style="width:${Math.max(3, q)}%"></i></span><b>${num(q + '/100')}</b></div>
    <small class="lr-sub">${dqWord(q)}${L.decisions ? ` · ${int(L.decisions)} החלטות` : ''}</small>
    <div class="lr-row"><span class="lr-l">מזל</span><span class="lr-bar luck" role="img" aria-label="${esc(luckWord)}"><i class="${luck >= 0 ? 'pos' : 'neg'}" style="width:${lw}%"></i></span><b>${iso(luckTxt)}</b></div>
    <small class="lr-sub">${luckWord}</small>
    <p class="lr-why">${iso(sentence)}</p>
    ${lines.join('')}
  </section>`;
}
const MONTHS_HE = (n) => (n === 1 ? 'חודש' : `${n} חודשים`);
function benchHtml(e) {
  const b = (e.end && e.end.benchmark) || null; if (!b) return '';
  const me = +e.netWorth || 0; const them = +b.netWorth || 0; const max = Math.max(1, Math.abs(me), Math.abs(them));
  return `<section class="end-bench"><h3>📈 אתה מול "קנה והחזק"</h3>
    <div class="bn-row me"><span>אתה</span><span class="bn-bar"><i style="width:${Math.max(4, Math.round((Math.max(0, me) / max) * 100))}%"></i></span><b>${iso(fmtM(me))}</b></div>
    <div class="bn-row"><span>קנה והחזק</span><span class="bn-bar idx"><i style="width:${Math.max(4, Math.round((Math.max(0, them) / max) * 100))}%"></i></span><b>${iso(fmtM(them))}</b></div>
    ${b.text ? `<p>${iso(b.text)}</p>` : ''}</section>`;
}
/** ★ rule v3.2: ★★★ needs speed AND happiness ≥ T.happy AND an emergency fund of T.fundMonths months — show which part was missing. */
const FUND_MSG = 'חסרה קרן חירום של 3 חודשים — חופש שלא שורד משבר הוא לא חופש';
function happyGateHtml(e, w, stars) {
  const end = e.end || {}; if (e.status !== 'won' || stars >= 3) return '';
  const ls = end.lifeSummary || {};
  const happy = end.happiness ?? ls.happiness;
  const byFund = !!end.starsBlockedByFund; const byHappy = !!end.starsBlockedByHappiness;
  const byMod = end.starsBlockedBy && end.starsBlockedBy.label ? end.starsBlockedBy : null;   // worlds: a module's own star rule (w6: no safety stop in 12 months)
  if (happy == null && !byFund && !byMod) return '';
  const T = e.worldId === 'h' ? null : safe(() => starThresholds(w, e.charId));
  const need = int(T && T.happy, 60); const fundNeed = int(T && T.fundMonths, 3);
  const timeOk = T ? e.months <= T.t3 : true; const happyOk = happy == null ? true : happy >= need;
  if (!byHappy && !byFund && !byMod && happyOk) return '';
  // fund months are not always in the end payload: ✗ when the engine says so, ✓ when known, otherwise neutral
  const fm = end.emergency && end.emergency.months != null ? +end.emergency.months : ls.emergencyMonths != null ? +ls.emergencyMonths : null;
  const fundCls = byFund ? 'no' : fm != null ? (fm >= fundNeed ? 'ok' : 'no') : 'na';
  const fundMark = byFund ? '✗' : fm != null ? (fm >= fundNeed ? '✓' : '✗') : '';
  const head = byMod && !byFund && !byHappy ? 'מה חסר ל־★★★' : byFund && !byHappy ? FUND_MSG.replace('3 חודשים', `${fundNeed} חודשים`) : byHappy ? 'הכסף היה שם — האושר לא.' : 'מה חסר ל־★★★';
  return `<div class="end-gate ${byFund ? 'fund' : ''}"><b>${esc(head)}</b>
    <span class="${timeOk ? 'ok' : 'no'}">⏱️ ${T ? `לצאת תוך ${int(T.t3)} חודשים` : 'מהירות'} ${timeOk ? '✓' : `✗ (${int(e.months)})`}</span>
    ${happy != null ? `<span class="${happyOk ? 'ok' : 'no'}">😊 אושר ${need}+ ${happyOk ? '✓' : `✗ (${Math.round(happy)})`}</span>` : ''}
    <span class="${fundCls}">🐷 קרן חירום ${fundNeed} חודשים ${fundMark}</span>
    ${byMod ? `<span class="no">🦺 ${esc(byMod.label.replace(/^★+\s*/, ''))} ✗</span>` : ''}
    ${byFund && byHappy ? `<small>${esc(FUND_MSG.replace('3 חודשים', `${fundNeed} חודשים`))}</small>` : ''}</div>`;
}
const decText = (d) => [d.c, d.o].filter(Boolean).join(' ← ');
function lifeHtml(e, won) {
  const L = (e.end && e.end.lifeSummary) || null; if (!L) return '';
  const age = L.age != null ? Math.floor(L.age) : null;
  const cells = [
    ['🎂', 'גיל', L.startAge != null && age != null ? `${Math.floor(L.startAge)} ← ${age}` : age != null ? String(age) : null],
    ['💰', 'שווי ריאלי', L.realNetWorth != null ? fmtM(L.realNetWorth) : null],
    ['🏖️', 'זמן חופשי', L.freeTimeMonths != null ? MONTHS_HE(L.freeTimeMonths) : null],
    ['👨‍👩‍👧', 'משפחה', L.family || null],
    ['😊', 'אושר ממוצע', L.avgHappiness != null ? Math.round(L.avgHappiness) + '/100' : L.happiness != null ? Math.round(L.happiness) + '/100' : null],
    ['🏦', 'פנסיה', L.pension != null ? fmtM(L.pension) : null],
    ['🔥', 'שחיקות', L.burnouts ? String(L.burnouts) : null],
  ].filter((x) => x[2] != null && x[2] !== '');
  const dec = (L.topDecisions || []).slice(0, 3);
  return `<section class="life-card" id="lifeCard">
    <div class="life-kicker">📖 סיפור החיים שלך</div>
    ${age != null ? `<div class="life-age">בגיל <b>${age}</b> ${won ? (e.worldId === 'h' ? 'סיימת את המסע בזמן' : 'יצאת מהמירוץ') : 'עדיין במירוץ'}</div>` : ''}
    <div class="life-grid">${cells.map(([ic, l, v]) => `<span><i aria-hidden="true">${ic}</i><small>${l}</small><b>${iso(v)}</b></span>`).join('')}</div>
    ${dec.length ? `<div class="life-dec"><small>ההחלטות הגדולות שלך</small><ol>${dec.map((d) => `<li>${iso(decText(d))}</li>`).join('')}</ol></div>` : ''}
    ${L.sentence ? `<blockquote class="life-q">“${iso(L.sentence)}”<cite>— אבא עשיר</cite></blockquote>` : ''}
    <button class="chip life-save" data-act="life-image">📸 לשמור כתמונה</button>
  </section>`;
}
/** A 1080×1350 PNG of the life story (share sheet on phones, download elsewhere). */
async function lifeImage() {
  const { e } = endCtx; const L = (e.end && e.end.lifeSummary) || {}; const won = e.status === 'won';
  const W = 1080, H = 1350; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#ffd9a0'); grd.addColorStop(0.6, '#f7a77a'); grd.addColorStop(1, '#d9785c'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fffaf0'; const r = 48; const x0 = 70, y0 = 70, w0 = W - 140, h0 = H - 140;
  g.beginPath(); g.moveTo(x0 + r, y0); g.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, r); g.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, r); g.arcTo(x0, y0 + h0, x0, y0, r); g.arcTo(x0, y0, x0 + w0, y0, r); g.fill();
  g.direction = 'rtl'; g.textAlign = 'center';
  const font = (px, bold) => `${bold ? '800 ' : ''}${px}px "Secular One", Rubik, Arial, sans-serif`;
  g.font = font(44, true); g.fillStyle = '#c98a12'; g.fillText('📖 סיפור החיים שלי · מירוץ העכברים', W / 2, 170);
  const w = e.worldId === 'h' ? { name: (scenById(e.scenarioId) || {}).name || 'מכונת הזמן' } : worldOf(e.worldId);
  g.fillStyle = '#1d1a2b'; g.font = font(80, true);
  g.fillText(L.age != null ? `בגיל ${Math.floor(L.age)} ${won ? 'יצאתי מהמירוץ' : 'עדיין במירוץ'}` : (won ? 'יצאתי מהמירוץ!' : 'נשארתי במירוץ'), W / 2, 300);
  g.font = font(46); g.fillStyle = '#6b6478'; g.fillText(`${w.name} · ${e.months} חודשים · ${starStr(e.stars | 0)}`, W / 2, 380);
  const rows = [['💰 שווי ריאלי', L.realNetWorth != null ? fmtM(L.realNetWorth) : fmtM(e.netWorth || 0)], ['🏖️ זמן חופשי', L.freeTimeMonths != null ? MONTHS_HE(L.freeTimeMonths) : '—'], ['👨‍👩‍👧 משפחה', L.family || '—'], ['😊 אושר', L.avgHappiness != null ? Math.round(L.avgHappiness) + '/100' : L.happiness != null ? Math.round(L.happiness) + '/100' : '—']];
  let y = 500;
  for (const [k, v] of rows) { g.font = font(48); g.textAlign = 'right'; g.fillStyle = '#6b6478'; g.fillText(k, W - 140, y); g.textAlign = 'left'; g.fillStyle = '#1d1a2b'; g.font = font(52, true); g.fillText('⁦' + v + '⁩', 140, y); y += 100; }
  if (L.sentence) {
    g.textAlign = 'center'; g.fillStyle = '#7a4b00'; g.font = font(44, true);
    const words = ('“' + L.sentence + '”').split(' '); let line = ''; y += 30;
    for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > W - 260) { g.fillText(line, W / 2, y); y += 62; line = wd; } else line = t; }
    if (line) g.fillText(line, W / 2, y);
  }
  g.font = font(38); g.fillStyle = '#2f6fdb'; g.textAlign = 'center'; g.fillText('חושב שתעשה יותר טוב? 👇 ' + location.host, W / 2, H - 130);
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  window.__lifePng = blob ? blob.size : 0;
  const file = new File([blob], 'my-life-rat-race.png', { type: 'image/png' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: shareText() }); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('התמונה נשמרה — שלח אותה לחברים');
}
function newsHtml(e, res, resisted = '') {
  const out = [];
  if (res.unlockedWorld) {
    const nw = worldOf(res.unlockedWorld); const g = newWorldOf(res.worldId || e.worldId, nw.id);
    // 2026-11-25: crossing into another world says the world and its first map; inside a world, the new map
    out.push(g ? `<button class="end-news end-unlock is-world" data-act="end-next" data-id="${nw.id}">${artHtml(nw.id)}<span><small>🔓 נפתח עולם חדש: ${esc(g.name)}</small><b><span class="sr"> — </span>מפה ראשונה: ${esc(nw.name)}</b><em>${esc(g.learn || nw.tagline)}</em></span></button>`
      : `<button class="end-news end-unlock" data-act="end-next" data-id="${nw.id}">${artHtml(nw.id)}<span><small>🔓 נפתחה מפה חדשה${groupOf(nw.id) ? ` · ${esc(groupLabel(groupOf(nw.id)))}` : ''}</small><b>${esc(nw.name)}</b><em>${esc(nw.tagline)}</em></span></button>`);
  }
  if (res.bankedLocked) out.push(`<div class="end-news"><span class="end-news-ic">🏦</span><span><small>הכוכבים נשמרו</small><b>${starStr(res.newStars)} ${esc(P.inW(worldOf(res.worldId).name))}</b><em>יחכו לך כשהמפה הזו תיפתח</em></span></div>`);
  else if (res.gained > 0 && !res.unlockedWorld) out.push(`<div class="end-news"><span class="end-news-ic">⭐</span><span><small>שיא כוכבים חדש</small><b>${starStr(res.newStars)}</b><em>${esc(P.nextStarLine(res.worldId))}</em></span></div>`);
  if (res.newBest) out.push(`<div class="end-news"><span class="end-news-ic">🏁</span><span><small>שיא אישי חדש</small><b>${res.best} חודשים</b><em>היה ${res.prevBest}</em></span></div>`);
  if (res.titleAfter !== res.titleBefore) out.push(`<div class="end-news end-title-up"><span class="end-news-ic">🎖️</span><span><small>עלית דרגה!</small><b>${titleBadge(res.totalAfter)}</b><em>מ${esc(res.titleBefore)} ל${esc(res.titleAfter)}</em></span></div>`);
  if (res.newLessons && res.newLessons.length) out.push(`<button class="end-news end-lessons" data-act="library"><span class="end-news-ic">📚</span><span><small>הספרייה גדלה</small><b>+${res.newLessons.length} ${res.newLessons.length === 1 ? 'שיעור חדש' : 'שיעורים חדשים'}</b><em>${num(LIB.counts().have + '/' + (LIB.counts().total || '?'))} בספרייה · לחץ לקרוא</em></span></button>`);
  if (res.energy) out.push(`<div class="end-news"><span class="end-news-ic">⚡</span><span><small>בונוס זריקות</small><b>+${EN.label(res.energy)} ⚡</b><em>${esc(res.energyWhy || '')}</em></span></div>`);
  if (res.quizEnergy) out.push(`<div class="end-news"><span class="end-news-ic">🧠</span><span><small>הבנה שווה זריקות</small><b>+${EN.label(int(res.quizEnergy))} ⚡</b><em>על תשובות נכונות לשאלות של אבא עשיר</em></span></div>`);
  if (resisted) out.push(`<div class="end-news"><span class="end-news-ic">💪</span><span><small>שליטה עצמית</small><b>${iso(resisted)}</b><em>כל פיתוי שוויתרת עליו קירב אותך לחופש</em></span></div>`);
  for (const id of res.newPawns) {
    const pw = P.PAWNS.find((x) => x.id === id);
    out.push(`<button class="end-news end-pawn" data-act="end-pawn" data-id="${id}">${pawnHtml(id, P.getProgress().pawnColor, 'lg')}<span><small>כלי חדש נפתח!</small><b>${esc(pw.name)}</b><em>לחץ כדי לשחק איתו</em></span></button>`);
  }
  const ach = res.newAchievements;
  if (ach.length === 1) out.push(`<div class="end-news end-ach"><span class="end-news-ic">${ACH_ICON[ach[0].icon] || '🏅'}</span><span><small>הישג חדש</small><b>${esc(ach[0].name)}</b><em>${esc(ach[0].desc)}</em></span></div>`);
  else if (ach.length > 1) {
    out.push(`<details class="end-news end-ach end-achs"><summary><span class="end-news-ic">🏅</span><span><small>הישגים</small><b>+${ach.length} הישגים חדשים</b><em>${ach.map((a) => ACH_ICON[a.icon] || '🏅').join(' ')} · לחץ לפרטים</em></span></summary>
      <ul>${ach.map((a) => `<li><span>${ACH_ICON[a.icon] || '🏅'}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></li>`).join('')}</ul></details>`);
  }
  return out.join('');
}
/** §7.4: instead of the stars row in learning mode. */
function learnStarsHtml(would) {
  return `<div class="end-learnmode"><p class="end-would">${esc(would > 0 ? T4.L3(starStr(would).replace(/☆/g, '')) : T4.L4)}</p><p class="lb-note">${esc(T4.L5)}</p></div>`;
}
/** §10.1 S-P9: practice answered this game (engine end.learning.transfer, E-10; hidden until the engine sends it). */
function practiceEndHtml(e) {
  const T = (e.end && e.end.learning && e.end.learning.transfer) || null; if (!T || typeof T !== 'object') return '';
  let n = 0, r = 0; for (const v of Object.values(T)) { n += int(v && v.n); r += int(v && v.right); }
  return n ? `<p class="end-practice">💡 ${esc(T4.P9(r, n))}</p>` : '';
}
/** §6.3/§6.4: the dream line (S-D18) in free/learn games, or the invitation (S-D10) when no dream is set yet. */
function dreamEndHtml(e) {
  if ((e.mode || 'free') !== 'free' || endCtx.hist || endCtx.duel || !dreamsList()) return '';
  const d = e.dream || (e.end && e.end.dream) || null;
  if (d && d.id && dreamById(d.id)) {
    const meta = dreamById(d.id); const ms = Array.isArray(d.missions) ? d.missions : [];
    const done = ms.filter((m) => m && m.done);
    return `<section class="end-dream"><p><b>${esc(T4.D18(meta.icon, meta.name, done.length))}</b></p>${done.length ? `<ul>${done.map((m) => `<li>✓ ${esc(m.title || '')}</li>`).join('')}</ul>` : ''}</section>`;
  }
  const p = P.getProgress();
  if (endCtx.dreamSaved && dreamById(endCtx.dreamSaved)) return `<section class="end-dream saved" role="status"><p>${esc(T4.D11(dreamById(endCtx.dreamSaved).name))}</p></section>`;
  if (p.dream) return '';
  return `<section class="end-dream ask"><h3>${T4.D10}</h3><div class="t4-dgrid">${dreamsList().map((x) => `<button class="t4-dbtn" data-act="end-dream" data-id="${x.id}"><span class="t4-dic" aria-hidden="true">${esc(x.icon)}</span><span><b>${esc(x.name)}</b><small>${esc(x.line || '')}</small></span></button>`).join('')}</div></section>`;
}
/** §6.5 S-G1: after the first completed game, offer less help (only when T2's mentor levels exist). */
function mentorEndHtml(e) {
  const p = P.getProgress();
  if (!mentorLevels() || endCtx.hist || (e.mode || 'free') !== 'free' || (p.gamesPlayed + p.learnGames) !== 1 || p.mentorPref) return '';
  return `<div class="end-mentor"><span>${esc(T4.G1)}</span><button class="lb-toggle" data-act="mentor-hint" role="switch" aria-checked="false"><span>${T4.G4}</span><i></i></button></div>`;
}
function endButtons(e, res, nextW, nextOpen) {
  if (e.branch) {   // T6 review M1: from a branch end the way back is the original, never a silent new practice over it
    const o = t6Origin(e);
    return `<div class="end-acts">${o && o.cfg ? '<button class="primary lb-big" data-act="t6-origin">↩ חזרה למשחק המקורי</button>' : ''}<button class="${o && o.cfg ? '' : 'primary lb-big'}" data-act="end-learn">${T4.L7}</button></div>
      <div class="end-more"><button class="chip" data-act="end-normal">${T4.L6}</button><button class="chip" data-act="end-lobby">ללובי</button></div>`;
  }
  if (endCtx.learn) {   // §7.4: no duel / share; normal game or more practice, same world and character
    // P0 2026-11-24: a practice escape opens the next world — offer it first
    const nextL = nextW && nextOpen && e.status === 'won' ? `<button class="primary lb-big" data-act="end-next" data-id="${nextW.id}">למפה הבאה: ${esc(nextW.name)} ←</button>` : '';
    return `<div class="end-acts">${nextL}<button class="${nextL ? '' : 'primary lb-big'}" data-act="end-normal">${T4.L6}</button><button data-act="end-learn">${T4.L7}</button></div>
      <div class="end-more"><button class="chip" data-act="world" data-id="${e.worldId}">דמות אחרת</button><button class="chip" data-act="end-lobby">ללובי</button></div>`;
  }
  const btns = [];
  const free = e.mode === 'free' || e.mode === 'history'; const won = e.status === 'won';
  const sameOk = free && !!endCtx.seed;
  const showNext = nextW && nextOpen && !endCtx.duel && (res.unlockedWorld === nextW.id || won);
  const againLabel = free ? (endCtx.duel ? '↻ לוח חדש' : '↻ עוד פעם') : e.mode === 'challenge' ? 'לטבלת הקבוצה' : 'לטבלה';
  const same = `<button class="${!won ? 'primary lb-big' : ''}" data-act="end-same">${!won ? '↻ עוד פעם — אותו לוח' : '↻ אותו לוח שוב'}</button>`;
  if (showNext && res.unlockedWorld) btns.push(`<button class="primary lb-big" data-act="end-next" data-id="${nextW.id}">למפה הבאה: ${esc(nextW.name)} ←</button>`, `<button data-act="end-again">${againLabel}</button>`);
  else if (sameOk && !won) btns.push(same, `<button data-act="end-again">${againLabel === '↻ עוד פעם' ? '↻ לוח חדש' : againLabel}</button>`);
  else btns.push(`<button class="primary lb-big" data-act="end-again">${againLabel}</button>`);
  if (showNext && !res.unlockedWorld) btns.push(`<button data-act="end-next" data-id="${nextW.id}">למפה הבאה: ${esc(nextW.name)} ←</button>`);
  const shareL = free ? (endCtx.duel ? 'להחזיר אתגר' : 'לאתגר חבר') : 'לשתף';   // T7 AX-2 label-in-name: the name starts with the visible words
  btns.push(`<a class="lb-wa" id="endShare" href="${waHref(shareText())}" target="_blank" rel="noopener" aria-label="${shareL} בוואטסאפ"><span aria-hidden="true">📲 </span>${shareL}<span class="lb-hide-sm"> בוואטסאפ</span></a>`);
  const more = [];
  if (sameOk && won) more.push(`<button class="chip" data-act="end-same">↻ אותו לוח שוב</button>`);
  if (e.mode === 'history') more.push(`<button class="chip" data-act="history">תקופה אחרת</button>`);
  else if (free) more.push(`<button class="chip" data-act="world" data-id="${e.worldId}">דמות אחרת</button>`);
  more.push(`<button class="chip" data-act="end-lobby">ללובי</button>`);
  return `<div class="end-acts">${btns.join('')}</div><div class="end-more">${more.join('')}</div>`;
}
function duelLink(e) {
  const me = net.me();
  const q = new URLSearchParams({ duel: `${e.worldId}.${e.charId}.${endCtx.seed}` });
  if (me && me.nickname) q.set('by', me.nickname);
  q.set('r', resCode(e));
  return withRef(`${baseUrl()}?${q.toString()}`);
}
function shareText() {
  const { e } = endCtx; const w = worldOf(e.worldId); const c = charOf(w, e.charId); const won = e.status === 'won'; const s = won ? e.stars | 0 : 0;
  const pct = Math.round(Math.max(0, Math.min(1, e.progress ?? e.end?.progress ?? 0)) * 100);
  const ls = (e.end && e.end.lifeSummary) || null;
  if (e.mode === 'history') {
    const sc = scenById(e.scenarioId);
    return `⏳ מכונת הזמן · ${sc ? sc.name : ''} · ${starStr(e.stars | 0)}\n${won ? 'ניצחתי משקיע שרק קנה והחזיק 🏆' : 'המשקיע המשעמם ניצח אותי הפעם 😅'}${ls && ls.sentence ? `\n📖 ${ls.sentence}` : ''}\nתנסה לנצח את ההיסטוריה 👇\n${withRef(baseUrl())}`;
  }
  if (e.mode === 'free') {
    // Wordle-style line + a duel link: the friend gets the exact same board
    const line = `🐭 ${w.name} · ${c ? c.name : ''} · ${won ? `${e.months} חודשים ${starStr(s)}` : `${pct}% מהדרך ${starStr(0)}`}`;
    let vs = '';
    if (endCtx.duel && endCtx.duel.r) { const v = duelVerdict({ won, months: e.months, stars: s, pct }, endCtx.duel.r); vs = `\n⚔️ דו־קרב מול ${endCtx.duel.by || 'חבר'}: ${v > 0 ? 'ניצחתי' : v < 0 ? 'הפסדתי — הפעם' : 'תיקו'}`; }
    const tail = endCtx.seed ? `חושב שתעשה יותר טוב? אותו לוח בדיוק 👇\n${duelLink(e)}` : `בוא לנסות 👇\n${withRef(baseUrl())}`;
    const life = ls && ls.age != null ? `\n🎂 ${won ? 'יצאתי מהמירוץ' : 'עדיין במירוץ'} בגיל ${Math.floor(ls.age)}${ls.avgHappiness != null ? ` · 😊 ${Math.round(ls.avgHappiness)}` : ''}` : '';
    return `${line}${life}${vs}\n${tail}`;
  }
  let link = withRef(baseUrl());
  let pre = '';
  if (e.mode === 'daily') pre = `🎲 האתגר היומי (${P.israelDate().split('-').reverse().slice(0, 2).join('.')}): `;
  else if (e.mode === 'weekly') pre = '🗓️ האתגר השבועי: ';
  else if (e.mode === 'challenge') { pre = `⚔️ ${e.title || 'אתגר'}${endCtx.groupName ? ` בקבוצה "${endCtx.groupName}"` : ''}: `; if (endCtx.groupCode) link += '?join=' + endCtx.groupCode; }
  const rank = endCtx.submit && endCtx.submit.rank ? ` · מקום ${endCtx.submit.rank}` : '';
  const body = won
    ? `יצאתי ממירוץ העכברים ${P.inW(w.name)} תוך ${e.months} חודשים ${starStr(s)}${rank}`
    : `${e.mode === 'daily' ? 'הגעתי ל־' : 'נשארתי במירוץ, '}${pct}% ${e.mode === 'daily' ? 'מהחופש' : 'מהדרך'} ${P.inW(w.name)}${rank}. חושב שתעשה יותר טוב?`;
  return `${pre}${body} 🐭💰\nאותן קוביות לכולם — נראה אותך 👇\n${link}`;
}
function animateEnd(stars, won, res) {
  const reduce = reducedMotion();   // T5 CR-L1: the in-app motion setting wins over the OS

  sfx(won ? 'win' : 'lose');
  const els = [...document.querySelectorAll('.end-star')];
  let t = reduce ? 0 : 450;
  for (let i = 0; i < stars; i++) {
    setTimeout(() => { els[i]?.classList.add('on', 'pop'); sfx(i === 2 ? 'golden' : 'coin'); if (navigator.vibrate) safe(() => navigator.vibrate(30)); }, t);
    t += reduce ? 0 : 420;
  }
  const news = [...document.querySelectorAll('.end-new > *')];
  news.forEach((n, k) => setTimeout(() => {
    n.classList.add('in');
    if (n.classList.contains('end-unlock')) sfx('unlock'); else if (n.classList.contains('end-ach') || n.classList.contains('end-pawn') || n.classList.contains('end-title-up')) sfx('achievement');
  }, t + (reduce ? 0 : 200 + k * 380)));
}
function rankHtml() {
  const s = endCtx.submit; if (!s) return '';
  if (s.state === 'saving') return '<p class="lb-note">⏳ שומר את התוצאה בטבלה…</p>';
  if (s.state === 'error') return `<p class="err">התוצאה לא נשמרה: ${esc(s.error)}</p><button class="primary" data-act="end-retry">לנסות שוב</button><p class="lb-note">לא נורא — ננסה שוב לבד בפעם הבאה שתפתח את המשחק.</p>`;
  const { e } = endCtx; const w = worldOf(e.worldId);
  const head = s.rank ? `<div class="end-place"><span>המקום שלך</span><b>${s.rank}</b><small>מתוך ${s.finished}</small></div>` : '<h3 class="lb-sub">הטבלה</h3>';
  return `${head}${boardHtml(s.board, { worldId: w.id, charId: e.charId, maxMonths: s.maxMonths, limit: 5, sprint: e.mode === 'daily' })}${verifyNote(s.verify)}`;
}
const VERIFY_NOTE = {
  ok: ['ok', '✓ התוצאה אומתה בשרת'],
  later: ['wait', '⏳ האימות בשרת יסתיים מאוחר יותר — התוצאה שלך כבר שמורה, ננסה שוב לבד.'],
  bad: ['bad', '⚠ התוצאה לא אומתה בשרת, ולכן היא מופיעה בסוף הטבלה.'],
};
function verifyNote(v) { const n = VERIFY_NOTE[v]; return n ? `<p class="end-ver ${n[0]}" data-verify="${v}">${n[1]}</p>` : ''; }
async function submitResult() {
  const ctx = endCtx; if (!ctx || !ctx.ranked) return;
  const { e } = ctx; ctx.submit = { state: 'saving' };
  const box = () => (endCtx === ctx ? $('#endRank') : null);
  if (box()) box().innerHTML = rankHtml();
  if (flushing) await flushing.catch(() => {});
  const args = pendingList().find((x) => x.resultId === e.resultId);
  const prev = verifyOutcome.get(e.resultId);
  let verify = ctx.verify || (prev ? (prev.verified === true ? 'ok' : prev.verified === false ? 'bad' : prev.retry ? 'later' : null) : null);
  if (args) {
    let r;
    try { r = await sendResult(args); }
    catch (err) {
      ctx.submit = { state: 'error', error: err.message };
      if (box()) box().innerHTML = rankHtml();
      return;
    }
    if (r.drop) dropPending(e.resultId); else { addPending(args); scheduleVerifyRetry(); }
    verify = r.verified === true ? 'ok' : r.verified === false ? 'bad' : r.retry ? 'later' : null;
    ctx.verify = verify;
  }
  game().then((g) => g && g.clearSave && safe(() => g.clearSave(rankedKey(e.resultId))));
  let board = []; let maxMonths;
  try {
    if (e.mode === 'daily') { const d = await net.daily(); cache.daily = d; board = d.board; maxMonths = int(d.max_months, 24) || 24; P.setDaily({ streak: d.streak, last: P.israelDate() }); }
    else if (e.mode === 'weekly') { const wk = await net.weekly(); cache.weekly = wk; board = wk.board; }
    else if (e.groupId) {
      const g = await net.group(e.groupId); cache.group[g.id] = g; ctx.groupCode = g.code; ctx.groupName = g.name;
      board = (g.challenges.find((c) => c.id === e.challengeId) || {}).board || [];
    }
  } catch (err) { /* board is a bonus — the result is saved */ }
  const fin = (board || []).filter((r) => r.status !== 'playing');
  const mine = fin.findIndex((r) => r.me);
  ctx.submit = { state: 'done', board, rank: mine >= 0 ? mine + 1 : null, finished: fin.length, maxMonths, verify };
  if (endCtx !== ctx) return;
  if (box()) box().innerHTML = rankHtml();
  const a = $('#endShare'); if (a) a.href = waHref(shareText());
  if (ctx.submit.rank === 1 && fin.length > 1) sfx('golden');
}
function endAgain(sameBoard = false) {
  const { e, seed, duel } = endCtx;
  if (e.mode === 'history') {
    if (sameBoard && seed) { P.setHistorySeed(e.scenarioId, seed); return launch(launchCfg({ mode: 'history', scenarioId: e.scenarioId, worldId: 'h', seed, tutorial: false, resume: false, bailout: P.bailoutAvailable(), title: (scenById(e.scenarioId) || {}).name || 'מכונת הזמן' })); }
    return startHistory(e.scenarioId, false);
  }
  if (e.mode === 'free') {
    if (sameBoard && seed) return startFree(e.worldId, e.charId, { seed, title: duel ? 'דו־קרב' : undefined, duel: duel || undefined, noAsk: true });
    return startFree(e.worldId, e.charId, { noAsk: true });
  }
  if (e.mode === 'challenge' && e.groupId) return go({ k: 'group', id: e.groupId });
  return go({ k: e.mode === 'daily' ? 'daily' : 'home' });
}

/* ============================================================ events */
function install() {
  if (installed) return;
  const r = root(); if (!r) return;
  installed = true;
  window.__rrLobby = true;   // game.js: the end card renders ui.endAnalysisHtml itself (no MutationObserver)
  r.addEventListener('click', onClick);
  r.addEventListener('submit', onSubmit);
  r.addEventListener('change', onChange);
  r.addEventListener('error', (ev) => { if (ev.target && ev.target.tagName === 'IMG') imgFallback(ev.target); }, true);
  r.addEventListener('pointerdown', () => { pointerAt = Date.now(); }, true);
  safe(() => initMotion());   // <html data-motion> also when the lobby runs without game.js (T5 CR-S1 note)
  // A11Y-1: keep the in-game DOM inert whenever #start covers it, whoever shows / hides it (lobby, game.js, main.js)
  const o = overlay(); if (o && typeof MutationObserver === 'function') new MutationObserver(syncInert).observe(o, { attributes: true, attributeFilter: ['hidden'] });
  const wake = () => { if (view.k === 'group' && !document.hidden) refreshGroup(view.id); };
  document.addEventListener('visibilitychange', wake);
  addEventListener('focus', wake);
  addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !lobbyVisible()) return;
    if (!document.getElementById('gm')?.hidden && document.getElementById('gm')) return;   // a ui.modal on top owns Escape
    // A11Y-2: topmost first — the lesson / legend sheet, then an open "עוד פרטים", then the view itself
    if ($('#lbLesson')) { ev.preventDefault(); closeLesson(); return; }
    const more = document.activeElement && document.activeElement.closest && document.activeElement.closest('.wv-char');
    const openMore = more && more.querySelector('.wv-more[aria-expanded="true"]');
    if (openMore) { ev.preventDefault(); openMore.click(); openMore.focus({ preventScroll: true }); return; }
    if (view.k === 'world' || view.k === 'group' || view.k === 'profile' || view.k === 'library') { ev.preventDefault(); go({ k: 'home' }); }
  });
}
async function onClick(ev) {
  // §5.1: the card is an <article> with two buttons; a tap on its plain area still plays (as the old whole-card button did)
  const card = ev.target.closest('.wv-char');
  if (card && !ev.target.closest('[data-act], .wv-details, a, input, label, summary')) { ev.preventDefault(); return startFree(card.dataset.w, card.dataset.c, { learn: modeNow() === 'learn' }); }
  // review m-4: a locked mentor level explains itself on tap (phones hide the inline reason; title= never shows on touch)
  const lk = ev.target.closest('.t4-mopt.is-locked'); if (lk && lk.title) { toast(lk.title); return; }
  const b = ev.target.closest('[data-act]'); if (!b || !root().contains(b)) return;
  const act = b.dataset.act; const id = b.dataset.id;
  if (b.tagName === 'A') { if (act === 'share') sfx('click'); return; }
  ev.preventDefault();
  switch (act) {
    case 'home': sfx('click'); return go({ k: 'home' });
    case 'reload-home': cache.daily = null; return renderHome();
    case 'profile': sfx('click'); return go({ k: 'profile' });
    case 'admin-give': {
      const n = +b.dataset.n || 0; if (!P.isAdmin() || !n) return;
      b.disabled = true;
      try { await net.adminGive(id, n); sfx('coin'); toast(`נשלחו ${EN.label(n)} ⚡ ל${b.dataset.nick}. הן יגיעו כשייכנס ללובי.`); }
      catch (e) { toast('השליחה נכשלה. נסה שוב.'); }
      finally { b.disabled = false; }
      return;
    }
    case 'world': sfx('click'); return go({ k: 'world', id });
    case 'char': return startFree(b.dataset.w, b.dataset.c, { learn: modeNow() === 'learn' });
    case 'continue-free': return continueFree(id, { learn: b.dataset.learn === '1' });
    case 'char-more': {   // §5.1 disclosure inside the card (aria-expanded / aria-controls)
      const el = document.getElementById(b.getAttribute('aria-controls')); if (!el) return;
      const open = b.getAttribute('aria-expanded') !== 'true';
      el.hidden = !open; b.setAttribute('aria-expanded', String(open)); b.textContent = open ? T4.Kless : T4.Kmore; return;
    }
    case 'dream-open': dreamOpen = true; if (view.k === 'profile') renderProfile(); else rerender(); return focusSoon('input[name="t4dream"]:checked, input[name="t4dream"]');   // A11Y-3
    case 'learn-now': { sfx('click'); const p = P.getProgress(); const wid = P.isUnlocked(p.lastSeenWorld) ? p.lastSeenWorld : 'w1'; worldMode = 'learn'; return go({ k: 'world', id: wid, learn: true }); }
    case 'end-normal': sfx('click'); return startFree(endCtx.e.worldId, endCtx.e.charId, {});
    case 'end-learn': sfx('click'); return startFree(endCtx.e.worldId, endCtx.e.charId, { learn: true, noAsk: true });
    case 'end-dream': { P.setDream(id); endCtx.dreamSaved = id; sfx('click'); const box = $('.end-dream'); if (box) { box.outerHTML = dreamEndHtml(endCtx.e); focusSoon('.end-dream'); } return; }
    case 'mentor-hint': { const on = b.getAttribute('aria-checked') !== 'true'; P.setMentorPref(on ? 'hint' : null); b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on); return; }
    case 'lite': {
      const on = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on);
      const g = await game(); if (g && g.setLite) safe(() => g.setLite(on));   // T1: off → page reload into 3D
      return;
    }
    case 'help-tour': writeReveal({ tourNext: true }); toast('🎬 הסיור יתחיל בפעם הבאה שתיכנס למשחק'); return;
    case 'help-legend': return openSheet(esc(T4.T2), legendHtml());
    case 'help-tutorial': P.requestTutorialReplay(); toast(T4.H6); return;
    case 'help-welcome': sfx('click'); return go({ k: 'welcome' });
    case 'welcome-pick': sfx('click'); safe(() => localStorage.setItem(ONBK, '1')); return go({ k: 'world', id: 'w1' });
    case 'welcome-restore': sfx('click'); safe(() => localStorage.setItem(ONBK, '1')); go({ k: 'profile' }); return focusSoon('#pfRestore');
    case 'resume-active': sfx('click'); return closeLobby();
    case 'daily': return playRanked('daily');
    case 'weekly': return playRanked('weekly');
    case 'chal': return playRanked('challenge', id, b.dataset.g, b.dataset.t);
    case 'group': sfx('click'); return go({ k: 'group', id });
    case 'wk-all': view.wkAll = true; { const box = $('#lbWeekly'); if (box) box.innerHTML = weeklyHtml(cache.weekly); } return;
    case 'focus-nick': return needNick();
    case 'copy': return copyText(b.dataset.text, 'הקישור הועתק — שלח לחברים');
    case 'mute': return toggleMute();
    case 'leave': {
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'בטוח? לחץ שוב כדי לעזוב'; b.classList.add('danger'); return; }
      try { await net.leaveGroup(id); delete cache.group[id]; cache.groups = null; toast('עזבת את הקבוצה'); renderHome(); } catch (e) { toast(e.message); }
      return;
    }
    case 'pawn': {
      if (b.getAttribute('aria-disabled') === 'true') { const pw = P.PAWNS.find((x) => x.id === id); toast(`🔒 ייפתח ב־${pw.need}★ (יש לך ${P.totalStars()})`); return; }
      P.setPawn(id); sfx('click'); return renderProfile();
    }
    case 'color': P.setPawnColor(b.dataset.hex); sfx('click'); return renderProfile();
    case 'rename-open': { const f = $('[data-form="rename"]'); if (f) { f.hidden = !f.hidden; if (!f.hidden) f.querySelector('input').select(); } return; }
    case 'code-show': { const box = $('#pfCode'); if (box) { box.hidden = !box.hidden; box.textContent = net.recoveryCode() || ''; b.textContent = box.hidden ? '👁️ להציג את הקוד' : '🙈 להסתיר'; } return; }
    case 'code-copy': return copyText(net.recoveryCode() || '', 'קוד השחזור הועתק. שמור אותו במקום בטוח');
    case 't6-rewind': sfx('click'); return bus.emit('t6:rewind', { k0: +b.dataset.k0, origin: 'last' });       // T6 §7.4 (rewind.js refuses ranked)
    case 't6-moments': sfx('click'); return bus.emit('t6:moments', { origin: 'last' });
    case 't6-afterwin': sfx('click'); return bus.emit('game:afterwin', {});                                       // T6 §9.3
    case 't6-branch': sfx('click'); { if (!(await t6Mods())) return; const bs = RW.branchSave(id); if (bs) return launch({ ...bs.cfg, resume: true }); return; }
    case 't6-branch-del': { if (!(await t6Mods())) return; const ok = await ui().then((u) => (u.confirmBox ? u.confirmBox(RW.STR.deleteQ, { yes: RW.STR.del, no: RW.STR.cancel }) : true)); if (ok) { RW.deleteBranch(id); rerender(); } return; }
    case 't6-last': sfx('click'); return bus.emit('t6:moments', { origin: 'last' });
    case 't6-origin': { sfx('click'); const o = endCtx && endCtx.e ? t6Origin(endCtx.e) : null; if (o) return launch({ ...o.cfg, resume: true }); toast('המשחק המקורי כבר לא זמין'); return; }
    case 'end-again': sfx('click'); return endAgain(false);
    case 'end-same': sfx('click'); return endAgain(true);
    case 'life-image': return lifeImage();
    case 'energy': return toast(`⚡ ${EN.get()}/${EN.MAX} זריקות. כל הטלת קוביות עולה זריקה אחת.${EN.get() >= EN.MAX ? '' : ` עוד זריקה בעוד ${EN.fmtWait(EN.msUntilNext())}.`}`);
    case 'library': sfx('click'); return go({ k: 'library' });
    case 'lesson': sfx('click'); return openLesson(id);
    case 'lesson-close': closeLesson(); return;
    case 'welcome-go': {   // F1: straight into the first game (teacher, w1, tutorial). A returning player goes home instead.
      sfx('click'); safe(() => localStorage.setItem(ONBK, '1'));
      if (completedAny()) return go({ k: 'home' });
      worldMode = 'normal';
      return startFree('w1', 'teacher', { quick: true });   // review M-4: asks before replacing a saved game, like every new game
    }
    case 'groups-view': return go({ k: 'groups' });
    case 'rooms': sfx('click'); return go({ k: 'rooms' });
    case 'history': sfx('click'); return go({ k: 'history' });
    case 'history-go': return startHistory(id, false);
    case 'history-continue': return startHistory(id, true);
    case 'send-energy': {
      if (b.disabled) return;
      b.disabled = true;
      try { await net.sendEnergy(b.dataset.g, b.dataset.n); sfx('coin'); toast(`⚡ שלחת 3 זריקות ל${b.dataset.n}`); b.textContent = '✓ נשלח'; b.classList.add('sent'); }
      catch (e) { toast(e.message); b.disabled = false; if (/כבר שלחת/.test(e.message)) { b.textContent = '✓ נשלח היום'; b.disabled = true; } }
      return;
    }
    case 'duel-go': { const d = pendingDuel; if (!d) return renderHome(); const ok = await startFree(d.worldId, d.charId, { seed: d.seed, title: 'דו־קרב', duel: { by: d.by, r: d.r } }); if (ok) { pendingDuel = null; clearDuelParam(); } return; }
    case 'duel-skip': pendingDuel = null; clearDuelParam(); return go({ k: 'home' });
    case 'end-next': sfx('click'); return go({ k: 'world', id });
    case 'end-lobby': sfx('click'); return go({ k: 'home' });
    case 'end-retry': return submitResult();
    case 'end-pawn': P.setPawn(id); sfx('click'); toast('הכלי החדש מחכה לך במשחק הבא'); b.querySelector('em').textContent = 'נבחר ✓'; return;
    default: return;
  }
}
async function onSubmit(ev) {
  const f = ev.target.closest('form[data-form]'); if (!f) return;
  ev.preventDefault();
  const kind = f.dataset.form; const err = f.querySelector('.err') || $('#lbGErr'); if (err) err.textContent = '';
  const btn = f.querySelector('button'); if (btn) btn.disabled = true;
  try {
    if (kind === 'nick') {
      const n = f.nick.value.trim();
      if (n.length < 2) throw new Error('כינוי צריך להיות 2–20 תווים');
      await net.register(n, pendingRef());
      safe(() => localStorage.removeItem(REFK));
      await P.pushNow();
      sfx('unlock'); toast(`ברוך הבא, ${n}!`);
      if (pendingJoin) return joinCode(pendingJoin);
      if (pendingRoom && roomsOn()) return go({ k: 'rooms', code: pendingRoom });   // wave 3b: ?room=CODE after choosing a nickname
      return rerender();
    }
    if (kind === 'rename') {
      const n = f.nick.value.trim();
      if (n.length < 2) throw new Error('כינוי צריך להיות 2–20 תווים');
      await net.rename(n); toast('הכינוי עודכן'); return renderProfile();
    }
    if (kind === 'newgroup') {
      const name = f.name.value.trim(); if (name.length < 2) throw new Error('שם קבוצה צריך להיות 2–40 תווים');
      const g = await net.createGroup(name); cache.groups = null; sfx('unlock'); toast('הקבוצה נפתחה! עכשיו שלח את הקישור לחברים'); return renderGroup(g.id);
    }
    if (kind === 'join') { const code = f.code.value.trim(); if (!code) throw new Error('הקלד קוד קבוצה'); return joinCode(code); }
    if (kind === 'newchal') {
      const gid = f.dataset.g; const title = f.title.value.trim() || 'מי יוצא ראשון?';
      const made = await net.createChallenge({ groupId: gid, title, world: f.world.value, charId: f.char.value, days: +f.days.value });
      if (made && made.id) markSeen(gid, [made.id]);
      sfx('unlock'); toast('האתגר נפתח! שתף אותו בקבוצה'); delete cache.group[gid]; return renderGroup(gid);
    }
    if (kind === 'admin-claim') {
      const code = f.code.value.trim(); if (!code) throw new Error('הקלד את הקוד');
      try { await net.adminClaim(code); } catch (e2) { throw new Error(e2 && e2.code === 'bad_code' ? 'הקוד לא נכון' : (e2 && e2.message) || 'לא הצלחנו לאשר. נסה שוב.'); }
      P.setAdmin(true); await checkAdmin(); sfx('unlock'); toast('🛡️ אתה המנהל. הכל פתוח אצלך.'); return renderProfile();
    }
    if (kind === 'admin-search') { await loadAdminList(f.q.value.trim()); return; }
    if (kind === 'restore') {
      const code = f.code.value.trim(); if (!code) throw new Error('הדבק קוד שחזור');
      const prof = await net.restore(code);
      P.mergeProfile(prof); await P.pushNow(); revealAfterMerge();
      cache.daily = cache.weekly = cache.groups = null; cache.group = {};
      checkAdmin(); sfx('unlock'); toast(`השחקן שוחזר. ברוך שובך, ${prof.nickname}!`); return renderProfile();
    }
  } catch (e) {
    if (err) err.textContent = e.message; else toast(e.message);
  } finally { if (btn && btn.isConnected) btn.disabled = false; }
}
function onChange(ev) {
  const s = ev.target;
  if (s.name === 't4mode') { worldMode = s.value === 'learn' ? 'learn' : 'normal'; P.setLastMode(worldMode); document.querySelectorAll('.t4-opt').forEach((l) => l.classList.toggle('on', l.contains(s))); $('.lb-world')?.classList.toggle('is-learn', worldMode === 'learn'); return; }
  if (s.name === 't4dream') {
    P.setDream(s.value || null); sfx('click');
    s.closest('fieldset')?.querySelectorAll('.t4-dopt').forEach((l) => l.classList.toggle('on', l.contains(s)));
    // collapse to one line only after a pointer choice: arrow keys fire 'change' on every step (A11Y-4)
    if (Date.now() - pointerAt < 800 && s.value) { dreamOpen = false; const f = s.closest('fieldset'); if (f) { f.outerHTML = dreamRowHtml(P.getProgress()); focusSoon('[data-act="dream-open"]'); } }
    return;
  }
  if (s.name === 't4mentor') { P.setMentorPref(s.value); document.querySelectorAll('.t4-mopt').forEach((l) => l.classList.toggle('on', l.contains(s))); return; }
  if (s.name === 'motion') { setMotionPref(s.value); return; }
  if (s.name === 'quality' && QM) { const t = safe(() => QM.setQualityPref(s.value), null); const n = $('[data-q="now"]'); if (n && t) n.textContent = 'עכשיו: ' + (QM.TIER_LABEL[t] || ''); return; }
  if (s.name === 'world' && s.closest('[data-form="newchal"]')) {
    const cs = s.form.char; cs.innerHTML = charOptions(worldOf(s.value));
  }
}

/* ============================================================ bus wiring */
// game.js already plays its celebration before emitting, so the end screen follows almost immediately
bus.on('game:end', (e) => onGameEnd(e, 250));
bus.on('reward', onQuizReward);
bus.on('achievement', (p) => {
  const cfg = G && G.activeConfig ? safe(() => G.activeConfig()) : null;
  if (cfg && cfg.learn) return;                            // T4 §7.1: learning games record no achievements and grant no ⚡
  const fresh = P.addAchievements((p && p.ids) || []); fresh.forEach((a, i) => { EN.grantOnce('ach:' + a.id, ACH_ENERGY, 'achievement'); setTimeout(() => achToast(a), i * 900); });
});
// T4 §4.6: the tutorial counts as done when the intro card closes (onboard.js), not when the game is launched
bus.on('onboard:done', () => P.setTutorialDone());
LIB.onUnlock((ids) => { if (!lobbyVisible()) LIB.lessons().then((L) => { const l = L.find((x) => x.id === ids[0]); if (l) ui().then((u) => u.toast && u.toast(`📚 שיעור חדש בספרייה: ${l.title}`)); }); });
