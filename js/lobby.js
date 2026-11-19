// Lobby / meta layer for מירוץ העכברים 2.0: world map (home), world + character picker, daily & weekly challenges,
// groups & group challenges, profile (pawns, achievements, recovery code) and the END SCREEN.
// Renders into #lobby-root inside #start (owned by index.html). Talks to the game only through the contract:
//   game.js: startGame(cfg), savedGame(key), clearSave(key), hasActiveGame(), activeConfig()
//   bus:     'game:end' (→ end screen), 'achievement' (→ store + toast)
// Exports: openLobby(view?), closeLobby(), showEndScreen(payload)  (view: 'home'|'profile'|'world:w2'|{k:'world',id}|{k:'group',id})
import { net } from './net.js';
import { bus } from './bus.js';
import { WORLDS, getWorld } from './worlds/index.js';
import { characterCard, starThresholds, starsFor, fmt, fmtM } from './engine.js';
import { ACHIEVEMENTS, titleFor, TITLES } from './achievements.js';
import * as P from './progress.js';

/* ============================================================ small helpers */
const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const asset = (p) => new URL('../' + p, import.meta.url).href;
/** Escape + isolate every money token ("−₪79,790", "+₪7,500", "$9,000", "₪1.25" of "₪1.25 מיליון") so RTL never flips it. */
const MONEY_RE = /[−+-]?[₪$]\d{1,3}(?:,\d{3})*(?:\.\d+)?/g;
const iso = (t) => esc(t).replace(MONEY_RE, (m) => `<bdi dir="ltr" class="lb-num">${m}</bdi>`);
/** Isolate a whole short LTR token (numbers, "6 / 12", percentages). */
const num = (t) => `<bdi dir="ltr" class="lb-num">${esc(t)}</bdi>`;
const cardArt = (wid) => asset(`assets/${wid}/card.png`);
const freeKey = (wid) => 'rr2-save-free-' + wid;
const rankedKey = (rid) => 'rr2-save-' + rid;
const randSeed = () => Math.floor(Math.random() * 2147483646) + 1;
const worldOf = (id) => { try { return getWorld(id || 'w1'); } catch (e) { return WORLDS[0]; } };
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

const CHAR_ICON = { book: '📚', truck: '🚚', laptop: '💻', stethoscope: '🩺', scale: '⚖️', chef: '🧑‍🍳', chip: '📱', box: '📦', avocado: '🥑', anchor: '⚓', rocket: '🚀', gear: '⚙️', heart: '💗' };
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
const MODE_NAME = { free: 'משחק חופשי', daily: 'האתגר היומי', weekly: 'האתגר השבועי', challenge: 'אתגר קבוצתי' };
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
const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
function titleIdx(total) { let k = 0; TITLES.forEach((t, i) => { if (total >= t.min) k = i; }); return k; }
function titleBadge(total) { return `<span class="lb-title lb-t${titleIdx(total || 0)}">${esc(titleFor(total || 0))}</span>`; }
function pawnHtml(id, color, cls = '') {
  const i = PAWN_INDEX[id] ?? 0;
  return `<span class="lb-pawn ${cls} ${color ? '' : 'raw'}" style="--pi:${i};${color ? `--pc:${color}` : ''}" aria-hidden="true"></span>`;
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
let UIp = null;
const ui = () => (UIp ||= import('./ui.js').catch(() => ({})));
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
  const o = overlay(); if (o) o.scrollTop = 0;
}

/* ============================================================ state */
let view = { k: 'home' };
let token = 0;
let booted = false; let installed = false;
let pendingJoin = safe(() => new URLSearchParams(location.search).get('join'));
const cache = { daily: null, weekly: null, groups: null, group: {} };
let endCtx = null;
let duelShown = false;
let lastEndSig = null;

function normalize(v) {
  if (!v) return { k: 'home' };
  if (typeof v === 'string') { const [k, id] = v.split(':'); return { k, id }; }
  if (v.view) return normalize(v.view);
  return v.k ? v : { k: 'home' };
}

/* ============================================================ public API */
export function openLobby(v) {
  ensureCss(); install();
  const o = overlay(); if (!o) { console.error('lobby: #start not found'); return; }
  o.hidden = false; o.classList.add('lb-open'); document.body.classList.add('lb-lobby-open');
  if (!booted) { booted = true; boot(); }
  const nv = normalize(v);
  if (nv.k === 'end' && !endCtx) nv.k = 'home';
  if (pendingDuel && nv.k === 'home' && !duelShown) { duelShown = true; nv.k = 'duel'; }
  go(nv);
}
export function closeLobby() {
  stopGroupRefresh();
  const o = overlay(); if (o) { o.hidden = true; o.classList.remove('lb-open'); }
  document.body.classList.remove('lb-lobby-open');
}
function go(v) {
  view = v;
  if (v.k !== 'group') stopGroupRefresh();
  switch (v.k) {
    case 'world': return renderWorld(v.id);
    case 'group': return renderGroup(v.id);
    case 'profile': return renderProfile();
    case 'end': return renderEnd();
    case 'duel': return renderDuel();
    case 'groups': renderHome(); return setTimeout(() => $('#lbGroups')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    case 'daily': renderHome(); return setTimeout(() => $('#lbDaily')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    default: return renderHome();
  }
}
const rerender = () => { if (lobbyVisible() && view.k !== 'end') go(view); };

function boot() {
  game().then((m) => { if (m && lobbyVisible() && (view.k === 'home' || view.k === 'world')) rerender(); });
  P.syncFromServer().then((ch) => { if (ch && lobbyVisible() && (view.k === 'home' || view.k === 'profile')) rerender(); });
  flushPending();
  if (pendingJoin) {
    if (net.hasMe()) { const c = pendingJoin; setTimeout(() => joinCode(c), 0); }
  }
}

/* ============================================================ starting games */
function launchCfg(extra) { const p = P.getProgress(); return { pawn: p.pawn, pawnColor: p.pawnColor, ...extra }; }
async function launch(cfg) {
  const g = await game();
  if (!g || !g.startGame) { toast('המשחק עוד נטען… נסה שוב בעוד רגע'); return false; }
  lastEndSig = null;
  P.beginSession();
  closeLobby();
  try { await g.startGame(cfg); return true; }
  catch (e) { console.error(e); openLobby(view); toast('משהו השתבש בפתיחת המשחק'); return false; }
}
async function confirmAsk(text, yes, no = 'ביטול') {
  const u = await ui();
  if (u.confirmBox) { try { return !!(await u.confirmBox(text, { yes, no })); } catch (e) { /* fall through */ } }
  return window.confirm(text);
}
/** Free game. opts: {seed, title, duel, sameBoard} — sameBoard/duel reuse a known seed. Asks before replacing a save. */
async function startFree(worldId, charId, opts = {}) {
  if (!P.isUnlocked(worldId) && !opts.duel) return go({ k: 'world', id: worldId });
  const g = await game();
  const sv = g && safe(() => g.savedGame(freeKey(worldId)));
  if (sv && !opts.noAsk) {
    const ok = await confirmAsk(`יש לך משחק שמור ${P.inW(worldOf(worldId).name)} (${sv.charName || ''}, חודש ${sv.month}). משחק חדש ימחק אותו.`, 'משחק חדש');
    if (!ok) return false;
  }
  if (sv) safe(() => g.clearSave(freeKey(worldId)));
  P.markWorldSeen(worldId); if (!opts.duel) P.setLastChar(worldId, charId);
  sfx('click');
  const tutorial = !opts.duel && !opts.seed && !P.getProgress().tutorialDone && worldId === 'w1';
  const cfg = { worldId, charId, seed: opts.seed || randSeed(), mode: 'free', tutorial, resume: false, bailout: P.bailoutAvailable() };
  if (opts.title) cfg.title = opts.title;
  if (opts.duel) cfg.duel = opts.duel;
  const ok = await launch(launchCfg(cfg));
  if (ok && tutorial) P.setTutorialDone();
  return ok;
}
async function continueFree(worldId) {
  const g = await game(); const sv = g && safe(() => g.savedGame(freeKey(worldId)));
  if (!sv) { toast('לא מצאנו משחק שמור'); return rerender(); }
  return launch(launchCfg({ ...sv.cfg, resume: true, bailout: P.bailoutAvailable() }));
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
let flushing = null;
function flushPending() {
  if (flushing) return flushing;
  flushing = (async () => {
    const me = net.me();
    for (const a of pendingList()) {
      if (!me || (a.pid && a.pid !== me.id)) continue;
      try { await net.finish(a); dropPending(a.resultId); }
      catch (e) { if (['already_finished', 'result_not_found', 'unauthorized'].includes(e.code)) dropPending(a.resultId); }
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

/* ============================================================ shared fragments */
function topBar() {
  const p = P.getProgress(); const me = net.me(); const total = P.totalStars(p); const si = P.streakInfo();
  const streak = si.streak;
  return `<header class="lb-top">
    <div class="lb-logo" aria-label="מירוץ העכברים">מירוץ<br>העכברים</div>
    <button class="lb-player" data-act="profile" aria-label="הפרופיל שלי">
      ${pawnHtml(p.pawn, p.pawnColor, 'md')}
      <span class="lb-pl-txt"><b class="lb-pl-name">${me ? esc(me.nickname) : 'אורח'}</b>${titleBadge(total)}</span>
      <span class="lb-pl-stats"><span class="lb-pl-star" title="כוכבים">★ ${total}</span>${streak ? `<span class="lb-pl-fire ${si.playedToday ? '' : 'warn'}" title="ימים ברצף באתגר היומי">🔥 ${streak}</span>` : ''}</span>
    </button>
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
    const pr = Math.max(0, Math.min(1, r.status === 'won' ? 1 : r.progress != null ? +r.progress : (r.passive || 0) / Math.max(1, r.expenses || 1)));
    const pct = Math.round(pr * 100);
    if (ctx.sprint) {
      // daily sprint: everyone is ranked by how close to freedom they got; escapees also show their month
      if (r.status === 'won') res = `<span class="lb-rs-won">${num('100%')}</span><span class="lb-rs-st">✓ יצא בחודש ${r.months}</span>`;
      else if (r.status === 'lost') res = `<span class="lb-rs-won">${num(pct + '%')}</span>`;
      else res = `<span class="lb-rs-play">${r.progress != null ? num(pct + '%') + ' · ' : ''}משחק עכשיו…</span>`;
    } else if (r.status === 'won') {
      const s = safe(() => starsFor(w, r.months, ctx.maxMonths ?? undefined, ctx.charId), 0);
      res = `<span class="lb-rs-won">חודש ${r.months}</span>${s ? `<span class="lb-rs-st">${starStr(s)}</span>` : ''}`;
    } else if (r.status === 'lost') {
      res = `<span class="lb-rs-lost">${num(pct + '%')} מהדרך</span>`;
    } else res = '<span class="lb-rs-play">משחק עכשיו…</span>';
    return { me: !!r.me, h: `<li class="${r.me ? 'me' : ''} ${n <= 3 && done ? 'top' + n : ''}"><span class="rk">${done ? (n <= 3 ? ['🥇', '🥈', '🥉'][n - 1] : n) : '·'}</span>${pawnHtml(r.pawn || 'classic', null, 'xs')}<span class="nm">${esc(r.nickname)}${r.me ? ' <small>(אתה)</small>' : ''}</span>${titleBadge(r.stars || 0)}<span class="rs">${res}</span></li>` };
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
  return `<button class="lb-resume" data-act="resume-active"><span class="lb-resume-ic">▶</span><span><b>חזרה למשחק</b><small>${esc(w.name)}${c ? ' · ' + esc(c.name) : ''}${cfg.mode && cfg.mode !== 'free' ? ' · ' + esc(cfg.title || MODE_NAME[cfg.mode]) : ''}</small></span></button>`;
}
const sigOf = (o) => [o.worldId, o.charId, o.mode, o.resultId || ''].join('|');

/* ============================================================ HOME (world map) */
function renderHome() {
  view = { k: 'home' }; const t = ++token;
  const p = P.getProgress(); const me = net.me(); const goal = P.nextGoal();
  html(`<div class="lb-shell lb-home">
    ${activeBanner()}
    ${pendingJoin && !me ? `<section class="lb-invite"><div class="lb-invite-ic">💌</div><div><h2>הוזמנת לקבוצה!</h2><p>בחר כינוי ונכניס אותך ישר לקבוצה.</p>${nickForm('איך יקראו לך בטבלאות?', 'lb-root-nick')}</div></section>` : ''}
    ${topBar()}
    <div class="lb-mission" role="note"><span class="lb-mission-ic" aria-hidden="true">🎯</span><span><small>המשימה הבאה</small><b>${esc(goal.text)}</b><em>${esc(goal.sub)}</em></span>${goal.worldId && P.isUnlocked(goal.worldId) ? `<button class="primary lb-mission-go" data-act="world" data-id="${goal.worldId}">יאללה</button>` : ''}</div>
    <div class="lb-grid ${me ? '' : 'is-guest'}">
      <section class="lb-map" aria-labelledby="lbMapH">
        <div class="map-head"><h2 id="lbMapH">המפה</h2>${trailHtml(p)}</div>
        <div class="map-grid">${WORLDS.map((w, i) => worldCard(w, i, p)).join('')}</div>
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
  return `<ol class="map-trail" aria-label="ההתקדמות שלך">${WORLDS.map((w, i) => {
    const un = P.isUnlocked(w.id); const s = p.stars[w.id] || 0;
    return `<li class="${un ? 'un' : ''} ${un && !s ? 'cur' : ''} ${un && s ? 'done' : ''}" title="${esc(w.name)}"><span>${!un ? '🔒' : s ? '★'.repeat(s) : i + 1}</span></li>`;
  }).join('')}</ol>`;
}
function worldCard(w, i, p) {
  const un = P.isUnlocked(w.id); const s = p.stars[w.id] || 0; const best = p.best[w.id];
  const prev = i ? WORLDS[i - 1] : null;
  const sv = un && G && G.savedGame ? safe(() => G.savedGame(freeKey(w.id))) : null;
  const d = cache.daily; const isDaily = !!(d && d.world === w.id);
  const isNew = un && i > 0 && !p.seenWorlds.includes(w.id);
  const next = un && !s;
  const tags = [
    isNew ? '<span class="map-tag-new">חדש!</span>' : '',
    isDaily ? '<span class="map-tag-daily">🎲 היומי של היום</span>' : '',
    sv ? `<span class="map-tag-save">▶ שמור · חודש ${esc(sv.month)}</span>` : '',
  ].join('');
  return `<button class="map-card ${un ? '' : 'is-locked'} ${next ? 'is-next' : ''} ${s >= 3 ? 'is-max' : ''}" data-act="world" data-id="${w.id}" style="--i:${i}">
    <span class="map-art"><img src="${cardArt(w.id)}" alt="" loading="lazy" decoding="async"><span class="map-num">${i + 1}</span>${un ? '' : '<span class="map-lock" aria-hidden="true">🔒</span>'}<span class="map-tags">${tags}</span></span>
    <span class="map-body">
      <span class="map-row"><b class="map-name">${esc(w.name)}</b>${starsHtml(s)}</span>
      <span class="map-tagline">${esc(w.tagline)}</span>
      ${un ? `<span class="map-line">${esc(P.nextStarLine(w.id))}</span>` : `<span class="map-line lock">לפתוח: לצאת ${esc(P.fromW(prev.name))}</span>`}
      ${un ? (best ? `<span class="map-best">🏁 שיא: ${best} חודשים</span>` : '') : `<span class="map-tease">${isDaily ? 'אפשר לטעום היום באתגר היומי!' : 'טעימה דרך האתגר היומי'}</span>`}
    </span>
  </button>`;
}

/* ---------------- daily */
function dailyHtml(d) {
  const me = net.me();
  if (!me) {
    return `<div class="lb-dh lb-dh-anon"><span class="lb-pill">🎲 האתגר היומי</span></div>
      <div class="lb-db"><h2>ספרינט יומי: כמה קרוב לחופש תגיע?</h2><p class="lb-note">כל יום עולם אחר, אותן קוביות לכולם — גם עולמות נעולים. בונים רצף 🔥 ומטפסים בטבלה.</p>
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
      ? `<div class="lb-streak warn"><span class="fire">🔥</span><b>${streak}</b><span>${streak === 1 ? 'יום ברצף' : 'ימים ברצף'} — אל תשבור את הרצף!</span></div>`
      : '<div class="lb-streak cold"><span class="fire">🔥</span><span>שחק היום ותתחיל רצף</span></div>';
  return `<div class="lb-dh" style="background-image:url('${cardArt(w.id)}')">
      <span class="lb-pill">🎲 האתגר היומי</span>${un ? '' : '<span class="lb-pill lock">🔒 עולם נעול — טעימה!</span>'}<span class="lb-timer">⏳ ${timeLeft(d.ends_at)}</span>
      <div class="lb-dh-txt"><b>${esc(w.name)}</b><span>${esc(c.name)} · ⚡ ספרינט ${d.max_months || 24} חודשים</span></div>
    </div>
    <div class="lb-db">
      ${played ? '' : `<p class="lb-sprint">⚡ ספרינט ${d.max_months || 24} חודשים — כמה קרוב לחופש תגיע?</p>`}
      ${streakLine}
      ${cta}
      <h3 class="lb-sub">הטבלה של היום · הכי קרוב לחופש</h3>
      ${boardHtml(d.board, { worldId: w.id, charId: c.id, maxMonths: d.max_months || 24, limit: 10, sprint: true })}
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
  const grid = $('.map-grid'); if (grid) grid.innerHTML = WORLDS.map((w, i) => worldCard(w, i, P.getProgress())).join('');
  const top = $('.lb-top'); if (top) top.outerHTML = topBar();
}

/* ---------------- weekly */
function weeklyHtml(wk) {
  const me = net.me();
  const head = '<div class="lb-ch-head"><h2>האתגר השבועי</h2>';
  if (!me) return `${head}</div><p class="lb-note">כל השחקנים, אותו עולם ואותה דמות, שבוע שלם. צריך רק כינוי.</p>`;
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
  const list = !gs ? '<p class="lb-note">טוען…</p>' : gs.error ? `<p class="err">${esc(gs.error)}</p>` : gs.length
    ? `<div class="lb-glist">${gs.map((g) => `<button class="lb-gitem" data-act="group" data-id="${esc(g.id)}"><span class="lb-gav" aria-hidden="true">${esc([...g.name][0] || '?')}</span><span><b>${esc(g.name)}</b><small>${g.members === 1 ? 'רק אתה — הזמן חברים' : g.members + ' שחקנים'}${g.active ? ` · ${g.active === 1 ? 'אתגר פעיל' : g.active + ' אתגרים פעילים'}` : ''}</small></span><span class="lb-chev" aria-hidden="true">‹</span></button>`).join('')}</div>`
    : '<p class="lb-empty">עוד אין לך קבוצות. פתח אחת ושלח לחברים.</p>';
  return `<div class="lb-ch-head"><h2>הקבוצות שלי</h2></div>${list}
    <form class="lb-form" data-form="newgroup"><label for="lbGname">קבוצה חדשה</label><div class="inl"><input id="lbGname" name="name" maxlength="40" placeholder="למשל: ט׳3 בורסה"><button class="primary">לפתוח</button></div></form>
    <form class="lb-form" data-form="join"><label for="lbJcode">קיבלת קוד מחבר?</label><div class="inl"><input id="lbJcode" name="code" maxlength="6" placeholder="קוד" class="lb-code-in"><button>להצטרף</button></div></form>
    <p class="err" id="lbGErr" aria-live="polite"></p>`;
}
async function loadGroups(t) {
  try { cache.groups = await net.myGroups(); } catch (e) { cache.groups = { error: e.message }; }
  if (t !== token) return;
  const box = $('#lbGroups'); if (box) box.innerHTML = groupsHtml(cache.groups);
}
async function joinCode(code) {
  pendingJoin = null;
  safe(() => history.replaceState(null, '', location.pathname));
  try { const g = await net.joinGroup(String(code).trim().toUpperCase()); toast('הצטרפת ל' + g.name + ' 🎉'); sfx('unlock'); cache.groups = null; renderGroup(g.id); }
  catch (e) { renderHome(); setTimeout(() => { const el = $('#lbGErr'); if (el) el.textContent = e.message; toast(e.message); }, 0); }
}

/* ============================================================ WORLD (character picker / locked preview) */
function renderWorld(id) {
  const w = worldOf(id); view = { k: 'world', id: w.id }; ++token;
  const i = WORLDS.indexOf(w); const p = P.getProgress(); const un = P.isUnlocked(w.id); const s = p.stars[w.id] || 0;
  if (un) P.markWorldSeen(w.id);
  const sv = un && G && G.savedGame ? safe(() => G.savedGame(freeKey(w.id))) : null;
  const prev = i ? WORLDS[i - 1] : null;
  const d = cache.daily; const isDaily = !!(d && d.world === w.id && d.my_status !== 'won' && d.my_status !== 'lost');
  const diffs = difficulty(w);
  let body;
  if (un) {
    body = `${sv ? `<button class="lb-continue" data-act="continue-free" data-id="${w.id}"><span class="lb-resume-ic">▶</span><span><b>להמשיך מאיפה שעצרת</b><small>${esc(sv.charName || '')} · חודש ${esc(sv.month)}</small></span></button>` : ''}
      <h2 class="wv-h">${sv ? 'או משחק חדש — ' : ''}בחר דמות</h2>
      <div class="wv-chars">${w.characters.map((c) => charCard(w, c, diffs[c.id])).join('')}</div>`;
  } else {
    const frontier = WORLDS.find((x) => P.isUnlocked(x.id) && !(p.stars[x.id] > 0)) || prev;
    body = `<div class="wv-locked">
      <div class="wv-lock-ic" aria-hidden="true">🔒</div>
      <h2>העולם הזה עוד נעול</h2>
      <p>לפתוח: לצאת ${esc(P.fromW(prev.name))} עם ★ אחד לפחות.</p>
      <p class="lb-note">מה מחכה כאן: ${esc(NEW_HERE[w.mechanic] || w.tagline)}</p>
      <div class="lb-acts">${isDaily ? '<button class="primary" data-act="daily">🎲 לטעום עכשיו באתגר היומי</button>' : ''}
      ${frontier && P.isUnlocked(frontier.id) ? `<button class="${isDaily ? '' : 'primary'}" data-act="world" data-id="${frontier.id}">לשחק ${esc(P.inW(frontier.name))}</button>` : ''}</div>
      ${isDaily ? '' : '<p class="lb-note">טיפ: כל יום האתגר היומי בעולם אחר — גם בעולמות נעולים.</p>'}
    </div>`;
  }
  html(`<div class="lb-shell lb-world">
    <div class="lb-bar"><button class="chip" data-act="home">› למפה</button>${topMini()}</div>
    <header class="wv-hero ${un ? '' : 'is-locked'}"><img src="${cardArt(w.id)}" alt="">
      <div class="wv-hero-txt"><span class="map-num">${i + 1}</span><h1>${esc(w.name)}</h1><p>${esc(w.tagline)}</p>${starsHtml(s, 'lg')}</div></header>
    <div class="wv-goal">
      <div><span>🎯 המטרה</span><b>${esc(w.goalLabel)}</b></div>
      <div><span>🧠 חדש כאן</span><b>${esc(NEW_HERE[w.mechanic] || '')}</b></div>
      ${p.best[w.id] ? `<div><span>🏁 השיא שלך</span><b>${p.best[w.id]} חודשים</b></div>` : ''}
    </div>
    ${body}
  </div>`);
}
function topMini() {
  const p = P.getProgress(); const me = net.me();
  return `<button class="lb-mini-player" data-act="profile">${pawnHtml(p.pawn, p.pawnColor, 'sm')}<span>${me ? esc(me.nickname) : 'אורח'}</span>${titleBadge(P.totalStars(p))}</button>`;
}
function charCard(w, c, d) {
  const cc = characterCard(w, c); const T = starThresholds(w, c.id);
  const salary = cc.salaryUsd ? `$${cc.salaryUsd.toLocaleString('en-US')}` : fmtM(cc.salary);
  const extras = [];
  for (const a of c.assets || []) extras.push(`🏷️ כבר יש לך: ${esc(a.n)}`);
  for (const [tk, q] of Object.entries(c.holdings || {})) extras.push(`📈 ${q.toLocaleString('en-US')} מניות ${esc(tk)}`);
  if (c.impact) extras.push(`💗 ${c.impact} נקודות השפעה מההתחלה`);
  if (cc.perk) extras.push(`✨ ${esc(cc.perk)}`);
  return `<button class="wv-char" data-act="char" data-w="${w.id}" data-c="${c.id}">
    <span class="wv-top"><span class="wv-ic" aria-hidden="true">${CHAR_ICON[c.icon] || '🙂'}</span><span class="wv-cname"><b>${esc(c.name)}</b>${diffHtml(d || 2)}</span></span>
    <span class="wv-desc">${esc(c.desc || '')}</span>
    <span class="wv-nums">
      <span><small>משכורת</small><b>${iso(salary)}</b></span>
      <span><small>הוצאות</small><b>${iso(fmtM(cc.expenses))}</b></span>
      <span><small>נשאר בחודש</small><b class="${cc.surplus > 0 ? 'pos' : cc.surplus < 0 ? 'neg' : ''}">${iso((cc.surplus > 0 ? '+' : '') + fmtM(cc.surplus))}</b></span>
      <span><small>מזומן</small><b>${iso(fmtM(cc.cash))}</b></span>
    </span>
    <span class="wv-th"><i>★ עד ${T.maxMonths}</i><i>★★ עד ${T.t2}</i><i>★★★ עד ${T.t3}</i><small>חודשים</small></span>
    ${extras.length ? `<span class="wv-extra">${extras.map((x) => `<span>${x}</span>`).join('')}</span>` : ''}
    <span class="wv-go">לשחק ←</span>
  </button>`;
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
    html(groupHtml(g));
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
    const g = await net.group(id);
    if (view.k !== 'group' || view.id !== id) return;
    const prev = cache.group[id]; cache.group[id] = g; noteNew(g);
    if (prev && JSON.stringify(prev) === JSON.stringify(g)) return;
    const a = $('#gpChals'); if (a) a.outerHTML = chalsSection(g);
    const m = $('#gpMembers'); if (m) m.innerHTML = membersHtml(g);
    const cnt = $('#gpCount'); if (cnt) cnt.textContent = countText(g);
  } catch (e) { /* offline — try again next tick */ } finally { refreshing = false; }
}
const countText = (g) => (g.members.length === 1 ? 'רק אתה כאן — שלח את הקישור לחברים' : g.members.length + ' שחקנים');
function membersHtml(g) {
  const members = [...g.members].sort((a, b) => (b.stars || 0) - (a.stars || 0));
  return members.map((m) => `<li class="${m.me ? 'me' : ''}">${pawnHtml(m.pawn || 'classic', null, 'sm')}<span class="nm">${esc(m.nickname)}${m.me ? ' <small>(אתה)</small>' : ''}${m.owner ? ' <span title="מנהל הקבוצה">👑</span>' : ''}</span>${titleBadge(m.stars || 0)}<span class="gp-st">★ ${m.stars || 0}</span></li>`).join('');
}
function chalsSection(g) {
  return `<section class="gp-chals" id="gpChals"><h2>אתגרים</h2>
      ${g.challenges.length ? g.challenges.map((c) => chalHtml(g, c)).join('') : '<p class="lb-empty">אין עדיין אתגרים. פתח את הראשון למטה — ותשלח לקבוצה 👇</p>'}
    </section>`;
}
function groupLink(g) { return `${baseUrl()}?join=${g.code}`; }
function groupHtml(g) {
  const link = groupLink(g); const me = net.me();
  const wa = waHref(`בוא להתחרות איתי במירוץ העכברים 🐭💰 הצטרף לקבוצה "${g.name}": ${link}`);
  const un = P.unlockedWorlds();
  const w0 = worldOf(un[0]);
  return `<div class="lb-shell lb-group">
    <div class="lb-bar"><button class="chip" data-act="home">› ללובי</button><button class="chip" data-act="group" data-id="${esc(g.id)}">↻ רענון</button></div>
    <header class="gp-head"><span class="lb-gav lg" aria-hidden="true">${esc([...g.name][0] || '?')}</span><div><h1>${esc(g.name)}</h1><p id="gpCount">${countText(g)}</p></div></header>
    ${chalsSection(g)}
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
        <p class="lb-note">כולם משחקים באותו עולם, עם אותה דמות, אותן קוביות ואותם קלפים. מנצח מי שיוצא מהמירוץ בפחות חודשים.</p>
        <form data-form="newchal" data-g="${esc(g.id)}" class="gp-form">
          <input name="title" maxlength="50" placeholder="שם האתגר (למשל: מי יוצא ראשון?)" aria-label="שם האתגר">
          <div class="gp-sel">
            <label><span>עולם</span><select name="world">${un.map((id) => `<option value="${id}">${esc(worldOf(id).name)}</option>`).join('')}</select></label>
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
  view = { k: 'profile' }; ++token;
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
    <section class="lb-card pf-worlds"><h2>כוכבים לפי עולם</h2>
      <div class="pf-wlist">${WORLDS.map((w) => { const un = P.isUnlocked(w.id); return `<button class="pf-w ${un ? '' : 'is-locked'}" data-act="world" data-id="${w.id}"><img src="${cardArt(w.id)}" alt=""><span><b>${esc(w.name)}</b><small>${un ? (p.best[w.id] ? `שיא: ${p.best[w.id]} חודשים` : 'עוד לא יצאת') : '🔒 נעול'}</small></span>${starsHtml(p.stars[w.id] || 0)}</button>`; }).join('')}</div>
    </section>
    <section class="lb-card pf-pawns"><h2>הכלי שלך</h2>
      <div class="pf-pgrid">${P.PAWNS.map((x) => { const ok = P.pawnUnlocked(x.id, p); const on = p.pawn === x.id; return `<button class="pf-pc ${ok ? '' : 'is-locked'} ${on ? 'on' : ''}" data-act="pawn" data-id="${x.id}" ${ok ? '' : 'aria-disabled="true"'} aria-pressed="${on}">${pawnHtml(x.id, ok ? p.pawnColor : null, 'lg')}<b>${esc(x.name)}</b><small>${ok ? (on ? 'נבחר ✓' : 'לבחור') : `🔒 ${x.need}★`}</small></button>`; }).join('')}</div>
      <h3 class="lb-sub">צבע</h3>
      <div class="pf-colors" role="radiogroup" aria-label="צבע הכלי">${P.PAWN_COLORS.map((c) => `<button class="pf-col ${p.pawnColor === c.hex ? 'on' : ''}" data-act="color" data-hex="${c.hex}" style="--c:${c.hex}" role="radio" aria-checked="${p.pawnColor === c.hex}" aria-label="${c.name}"></button>`).join('')}</div>
    </section>
    <section class="lb-card pf-ach"><h2>הישגים <small>${num(p.achievements.filter((id) => achs.some((a) => a.id === id)).length + '/' + achs.length)}</small></h2>
      <div class="pf-agrid">${achs.map((a) => { const got = have.has(a.id); const hid = !got && a.hidden; const wn = a.world ? worldOf(a.world).name : a.meta ? 'מסע' : ''; return `<div class="pf-a ${got ? 'got' : ''} ${hid ? 'hid' : ''}" title="${hid ? 'הישג סודי' : esc(a.desc)}"><span class="pf-aic">${hid ? '?' : ACH_ICON[a.icon] || '🏅'}</span><b>${hid ? 'הישג סודי' : esc(a.name)}</b><small>${hid ? 'תגלה כשתשיג' : esc(a.desc)}</small>${wn && !hid ? `<em>${esc(wn)}</em>` : ''}</div>`; }).join('')}</div>
    </section>
    <section class="lb-card pf-set"><h2>הגדרות</h2>${muteToggle()}</section>
    <section class="lb-card pf-recover"><h2>להעביר את השחקן למכשיר אחר</h2>
      ${me ? `<p class="lb-note">קוד השחזור מעביר את השחקן, הכוכבים והקבוצות למכשיר אחר. <b>אל תשלח אותו לאף אחד</b> — מי שמחזיק בו שולט בשחקן שלך.</p>
        <div class="pf-code"><button class="chip" data-act="code-show">👁️ להציג את הקוד</button><button class="chip" data-act="code-copy">📋 להעתיק</button></div><div id="pfCode" class="pf-codebox" hidden></div>` : '<p class="lb-note">יש לך שחקן במכשיר אחר? הדבק כאן את קוד השחזור שלו.</p>'}
      <form class="lb-form" data-form="restore"><label for="pfRestore">שחזור מקוד</label><div class="inl"><input id="pfRestore" name="code" placeholder="הדבק קוד שחזור" dir="ltr" autocomplete="off"><button>לשחזר</button></div><p class="err" aria-live="polite"></p></form>
    </section>
  </div>`);
  refreshMuted();
}

/* ============================================================ END SCREEN */
export function showEndScreen(e) { onGameEnd(e, 0); }
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
      <div class="end-art"><img src="${cardArt(w.id)}" alt=""></div>
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
  const cfg = (G && G.activeConfig && safe(() => G.activeConfig())) || null;
  const same = !!(cfg && cfg.worldId === e.worldId && cfg.charId === e.charId && (cfg.mode || 'free') === (e.mode || 'free'));
  // the engine's one-time bail-out may have been used mid-game: it only shows in the saved state's flags
  const saved = localSaveState(e.resultId ? rankedKey(e.resultId) : freeKey(e.worldId));
  if (saved && saved.flags && saved.flags.bailoutUsed) P.markBankruptcy();
  const res = P.recordGame(e);
  lastEndSig = sigOf(e);
  const ranked = e.mode && e.mode !== 'free' && !!e.resultId;
  endCtx = { e, res, ranked, seed: e.seed ?? (e.summary && e.summary.seed) ?? (same ? cfg.seed : null), duel: e.duel || (same && cfg.duel) || null, submit: ranked ? { state: 'saving' } : null, groupCode: null, groupName: null };
  if (ranked) {
    addPending({ pid: net.me()?.id, resultId: e.resultId, status: e.status, months: e.months, passive: e.passive || 0, expenses: e.expenses || 0, netWorth: e.netWorth || 0,
      stats: { ...(e.summary || { stats: e.stats || {} }), progress: e.progress ?? null, stars: e.stars || 0, world: e.worldId, char: e.charId } });
  } else game().then((g) => g && g.clearSave && safe(() => g.clearSave(freeKey(e.worldId))));
  setTimeout(() => {
    ensureCss(); install();
    const o = overlay(); if (!o) return;
    o.hidden = false; o.classList.add('lb-open'); document.body.classList.add('lb-lobby-open');
    if (!booted) { booted = true; boot(); }
    view = { k: 'end' };
    renderEnd(true);
    if (ranked) submitResult();
  }, delay);
}
function renderEnd(animate = false) {
  if (!endCtx) return renderHome();
  view = { k: 'end' }; ++token;
  const { e, res, ranked, duel } = endCtx;
  const w = worldOf(e.worldId); const c = charOf(w, e.charId); const end = e.end || {};
  const won = e.status === 'won'; const bankrupt = end.reason === 'bankrupt';
  const sprint = e.mode === 'daily';
  const stars = won ? Math.max(0, Math.min(3, e.stars | 0)) : 0;
  const title = won ? (stars >= 3 ? 'משחק מושלם!' : 'יצאת מהמירוץ!') : bankrupt ? 'פשטת רגל' : sprint ? 'הספרינט נגמר' : 'נגמר הזמן';
  const prog = Math.max(0, Math.min(1, e.progress ?? end.progress ?? 0));
  const near = end.nearMiss && end.nearMiss.text;
  const nextIdx = WORLDS.indexOf(w) + 1; const nextW = WORLDS[nextIdx] || null;
  const nextOpen = nextW && P.isUnlocked(nextW.id);
  const modeName = duel ? '⚔️ דו־קרב' : e.mode === 'free' ? 'משחק חופשי' : (e.title || MODE_NAME[e.mode] || '');
  const kicker = `${esc(w.name)} · ${esc(c ? c.name : '')} · ${esc(modeName)}`;
  const g = w.goal || {};
  const cell = (label, value, cls = '') => `<span><small>${label}</small><b class="${cls}">${iso(value)}</b></span>`;
  const statCells = [cell('חודשים', String(e.months))];
  if (g.type === 'passive') statCells.push(cell('הכנסה פסיבית', fmtM(e.passive || 0), won ? 'pos' : ''), cell('הוצאות', fmtM(e.expenses || 0)));
  else statCells.push(cell('שווי נקי', fmtM(e.netWorth || 0), won ? 'pos' : (e.netWorth || 0) < 0 ? 'neg' : ''), cell('יעד', fmtM(g.target || 0)));
  if (g.type === 'netWorthImpact') statCells.push(`<span><small>השפעה</small><b>${num((end.impact ?? 0) + '/' + g.impact)}</b></span>`);
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
  html(`<div class="lb-shell lb-end ${won ? 'is-won' : 'is-lost'} ${animate ? 'anim' : ''}">
    <article class="end-card">
      <div class="end-art"><img src="${cardArt(w.id)}" alt=""></div>
      <p class="end-kicker">${kicker}</p>
      <h1 class="end-title">${title}</h1>
      <div class="end-stars" aria-label="${stars} כוכבים">${[0, 1, 2].map((i) => `<span class="end-star ${!animate && i < stars ? 'on' : ''}" data-i="${i}">★</span>`).join('')}</div>
      ${ranked ? `<div class="end-rank" id="endRank">${rankHtml()}</div>` : ''}
      ${duelHtml}
      ${near ? `<p class="end-near">${iso(near)}</p>` : ''}
      ${!won ? `<div class="end-prog"><div class="lb-bar-track big"><i style="width:${Math.round(prog * 100)}%"></i></div><small>${sprint ? 'הגעת ל־' : 'עשית '}${num(Math.round(prog * 100) + '%')} ${sprint ? 'מהחופש' : g.type === 'passive' ? 'מהדרך לחופש' : 'מהדרך ליעד'}</small></div>` : ''}
      ${leaksHtml}
      <div class="end-stats">${statCells.join('')}</div>
      <div class="end-new">${newsHtml(e, res, won ? resisted : '')}</div>
      <div class="end-lesson"><b>📚 השיעור ${esc(P.inW(w.name))}</b><p>${iso(end.lesson || w.lesson || '')}</p>${end.tip ? `<p class="end-tip">💡 ${iso(end.tip)}</p>` : ''}</div>
      ${endButtons(e, res, nextW, nextOpen)}
    </article>
  </div>`);
  if (animate) animateEnd(stars, won, res);
  else document.querySelectorAll('.end-new > *').forEach((x) => x.classList.add('in'));
}
function newsHtml(e, res, resisted = '') {
  const out = [];
  if (res.unlockedWorld) {
    const nw = worldOf(res.unlockedWorld);
    out.push(`<button class="end-news end-unlock" data-act="end-next" data-id="${nw.id}"><img src="${cardArt(nw.id)}" alt=""><span><small>🔓 נפתח עולם חדש!</small><b>${esc(nw.name)}</b><em>${esc(nw.tagline)}</em></span></button>`);
  }
  if (res.bankedLocked) out.push(`<div class="end-news"><span class="end-news-ic">🏦</span><span><small>הכוכבים נשמרו</small><b>${starStr(res.newStars)} ${esc(P.inW(worldOf(res.worldId).name))}</b><em>יחכו לך כשתפתח את העולם הזה</em></span></div>`);
  else if (res.gained > 0 && !res.unlockedWorld) out.push(`<div class="end-news"><span class="end-news-ic">⭐</span><span><small>שיא כוכבים חדש</small><b>${starStr(res.newStars)}</b><em>${esc(P.nextStarLine(res.worldId))}</em></span></div>`);
  if (res.newBest) out.push(`<div class="end-news"><span class="end-news-ic">🏁</span><span><small>שיא אישי חדש</small><b>${res.best} חודשים</b><em>היה ${res.prevBest}</em></span></div>`);
  if (res.titleAfter !== res.titleBefore) out.push(`<div class="end-news end-title-up"><span class="end-news-ic">🎖️</span><span><small>עלית דרגה!</small><b>${titleBadge(res.totalAfter)}</b><em>מ${esc(res.titleBefore)} ל${esc(res.titleAfter)}</em></span></div>`);
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
function endButtons(e, res, nextW, nextOpen) {
  const btns = [];
  const free = e.mode === 'free'; const won = e.status === 'won';
  const sameOk = free && !!endCtx.seed;
  const showNext = nextW && nextOpen && !endCtx.duel && (res.unlockedWorld === nextW.id || won);
  const againLabel = free ? (endCtx.duel ? '↻ לוח חדש' : '↻ עוד פעם') : e.mode === 'challenge' ? 'לטבלת הקבוצה' : 'לטבלה';
  const same = `<button class="${!won ? 'primary lb-big' : ''}" data-act="end-same">${!won ? '↻ עוד פעם — אותו לוח' : '↻ אותו לוח שוב'}</button>`;
  if (showNext && res.unlockedWorld) btns.push(`<button class="primary lb-big" data-act="end-next" data-id="${nextW.id}">לעולם הבא: ${esc(nextW.name)} ←</button>`, `<button data-act="end-again">${againLabel}</button>`);
  else if (sameOk && !won) btns.push(same, `<button data-act="end-again">${againLabel === '↻ עוד פעם' ? '↻ לוח חדש' : againLabel}</button>`);
  else btns.push(`<button class="primary lb-big" data-act="end-again">${againLabel}</button>`);
  if (showNext && !res.unlockedWorld) btns.push(`<button data-act="end-next" data-id="${nextW.id}">לעולם הבא ←</button>`);
  btns.push(`<a class="lb-wa" id="endShare" href="${waHref(shareText())}" target="_blank" rel="noopener" aria-label="לשתף בוואטסאפ">📲 ${free ? (endCtx.duel ? 'להחזיר אתגר' : 'לאתגר חבר') : 'לשתף'}<span class="lb-hide-sm"> בוואטסאפ</span></a>`);
  const more = [];
  if (sameOk && won) more.push(`<button class="chip" data-act="end-same">↻ אותו לוח שוב</button>`);
  if (free) more.push(`<button class="chip" data-act="world" data-id="${e.worldId}">דמות אחרת</button>`);
  more.push(`<button class="chip" data-act="end-lobby">ללובי</button>`);
  return `<div class="end-acts">${btns.join('')}</div><div class="end-more">${more.join('')}</div>`;
}
function duelLink(e) {
  const me = net.me();
  const q = new URLSearchParams({ duel: `${e.worldId}.${e.charId}.${endCtx.seed}` });
  if (me && me.nickname) q.set('by', me.nickname);
  q.set('r', resCode(e));
  return `${baseUrl()}?${q.toString()}`;
}
function shareText() {
  const { e } = endCtx; const w = worldOf(e.worldId); const c = charOf(w, e.charId); const won = e.status === 'won'; const s = won ? e.stars | 0 : 0;
  const pct = Math.round(Math.max(0, Math.min(1, e.progress ?? e.end?.progress ?? 0)) * 100);
  if (e.mode === 'free') {
    // Wordle-style line + a duel link: the friend gets the exact same board
    const line = `🐭 ${w.name} · ${c ? c.name : ''} · ${won ? `${e.months} חודשים ${starStr(s)}` : `${pct}% מהדרך ${starStr(0)}`}`;
    let vs = '';
    if (endCtx.duel && endCtx.duel.r) { const v = duelVerdict({ won, months: e.months, stars: s, pct }, endCtx.duel.r); vs = `\n⚔️ דו־קרב מול ${endCtx.duel.by || 'חבר'}: ${v > 0 ? 'ניצחתי' : v < 0 ? 'הפסדתי — הפעם' : 'תיקו'}`; }
    const tail = endCtx.seed ? `חושב שתעשה יותר טוב? אותו לוח בדיוק 👇\n${duelLink(e)}` : `בוא לנסות 👇\n${baseUrl()}`;
    return `${line}${vs}\n${tail}`;
  }
  let link = baseUrl();
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
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  return `${head}${boardHtml(s.board, { worldId: w.id, charId: e.charId, maxMonths: s.maxMonths, limit: 5, sprint: e.mode === 'daily' })}`;
}
async function submitResult() {
  const ctx = endCtx; if (!ctx || !ctx.ranked) return;
  const { e } = ctx; ctx.submit = { state: 'saving' };
  const box = () => (endCtx === ctx ? $('#endRank') : null);
  if (box()) box().innerHTML = rankHtml();
  const args = pendingList().find((x) => x.resultId === e.resultId);
  try { if (args) await net.finish(args); }
  catch (err) {
    if (err.code !== 'already_finished' && err.code !== 'result_not_found') {
      ctx.submit = { state: 'error', error: err.message };
      if (box()) box().innerHTML = rankHtml();
      return;
    }
  }
  dropPending(e.resultId);
  game().then((g) => g && g.clearSave && safe(() => g.clearSave(rankedKey(e.resultId))));
  let board = []; let maxMonths;
  try {
    if (e.mode === 'daily') { const d = await net.daily(); cache.daily = d; board = d.board; maxMonths = d.max_months || 24; P.setDaily({ streak: d.streak, last: P.israelDate() }); }
    else if (e.mode === 'weekly') { const wk = await net.weekly(); cache.weekly = wk; board = wk.board; }
    else if (e.groupId) {
      const g = await net.group(e.groupId); cache.group[g.id] = g; ctx.groupCode = g.code; ctx.groupName = g.name;
      board = (g.challenges.find((c) => c.id === e.challengeId) || {}).board || [];
    }
  } catch (err) { /* board is a bonus — the result is saved */ }
  const fin = (board || []).filter((r) => r.status !== 'playing');
  const mine = fin.findIndex((r) => r.me);
  ctx.submit = { state: 'done', board, rank: mine >= 0 ? mine + 1 : null, finished: fin.length, maxMonths };
  if (endCtx !== ctx) return;
  if (box()) box().innerHTML = rankHtml();
  const a = $('#endShare'); if (a) a.href = waHref(shareText());
  if (ctx.submit.rank === 1 && fin.length > 1) sfx('golden');
}
function endAgain(sameBoard = false) {
  const { e, seed, duel } = endCtx;
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
  r.addEventListener('click', onClick);
  r.addEventListener('submit', onSubmit);
  r.addEventListener('change', onChange);
  const wake = () => { if (view.k === 'group' && !document.hidden) refreshGroup(view.id); };
  document.addEventListener('visibilitychange', wake);
  addEventListener('focus', wake);
  addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !lobbyVisible()) return;
    if (view.k === 'world' || view.k === 'group' || view.k === 'profile') { ev.preventDefault(); go({ k: 'home' }); }
  });
}
async function onClick(ev) {
  const b = ev.target.closest('[data-act]'); if (!b || !root().contains(b)) return;
  const act = b.dataset.act; const id = b.dataset.id;
  if (b.tagName === 'A') { if (act === 'share') sfx('click'); return; }
  ev.preventDefault();
  switch (act) {
    case 'home': sfx('click'); return go({ k: 'home' });
    case 'reload-home': cache.daily = null; return renderHome();
    case 'profile': sfx('click'); return go({ k: 'profile' });
    case 'world': sfx('click'); return go({ k: 'world', id });
    case 'char': return startFree(b.dataset.w, b.dataset.c);
    case 'continue-free': return continueFree(id);
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
    case 'end-again': sfx('click'); return endAgain(false);
    case 'end-same': sfx('click'); return endAgain(true);
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
      await net.register(n);
      await P.pushNow();
      sfx('unlock'); toast(`ברוך הבא, ${n}!`);
      if (pendingJoin) return joinCode(pendingJoin);
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
    if (kind === 'restore') {
      const code = f.code.value.trim(); if (!code) throw new Error('הדבק קוד שחזור');
      const prof = await net.restore(code);
      P.mergeProfile(prof); await P.pushNow();
      cache.daily = cache.weekly = cache.groups = null; cache.group = {};
      sfx('unlock'); toast(`השחקן שוחזר. ברוך שובך, ${prof.nickname}!`); return renderProfile();
    }
  } catch (e) {
    if (err) err.textContent = e.message; else toast(e.message);
  } finally { if (btn && btn.isConnected) btn.disabled = false; }
}
function onChange(ev) {
  const s = ev.target;
  if (s.name === 'world' && s.closest('[data-form="newchal"]')) {
    const cs = s.form.char; cs.innerHTML = charOptions(worldOf(s.value));
  }
}

/* ============================================================ bus wiring */
// game.js already plays its celebration before emitting, so the end screen follows almost immediately
bus.on('game:end', (e) => onGameEnd(e, 250));
bus.on('achievement', (p) => { const fresh = P.addAchievements((p && p.ids) || []); fresh.forEach((a, i) => setTimeout(() => achToast(a), i * 900)); });
