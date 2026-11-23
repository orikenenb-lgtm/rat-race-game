// מירוץ העכברים 2.0 — the game controller: engine ⇄ scene ⇄ ui. Turn flow, saves, end of game.
// Public API (contract with the lobby):
//   initGame(), startGame(cfg) → Promise<boolean>, savedGame(keyOrCfg), hasActiveGame(), activeConfig(), clearSave(keyOrCfg), saveKeyFor(cfg)
//   T1: isStuck(), recover({lite}), setLite(on), reloadInto3D()
// Emits on the bus: 'game:end' {…}, 'achievement' {ids}, 'lobby:open' {}.
// T1: the renderer is chosen at run time (js/render/select.js): 3D scene.js, the flat 2D board (מצב קל) or none.
// Every renderer implements the same scene API (js/render/null.js SCENE_API); the engine and this flow are identical.
import * as E from './engine.js';
import { bus } from './bus.js';
import * as ui from './ui.js';
import { sfx, setMuted, isMuted, unlock } from './audio.js';
import { net } from './net.js';
import * as nullScene from './render/null.js';
import { loadRenderer, preferredChoice, prefetch3D } from './render/select.js';
import * as OV from './render/overlay.js';
import { flag, flagFor } from './flags.js';
import * as ghosts from './ghosts.js';                    // T6 §2: ghost players (worker + cache + the clamped view)
import * as rewind from './rewind.js';                    // T6 §7: practice rewind (branches; never ranked)
import { tlNew, tlPush, tlRowOf, tlOf, dimsOf, endLite } from './summary.js';   // T6 timeline + success dimensions
import * as saves from './saves.js';
import { initMotion, reducedMotion } from './motion.js';
import * as onboard from './onboard.js';   // T4 IR-T4-3: tutorial / world coaches, tour, practice chip
import { assetInfo } from './render/assetinfo.js';          // T5 CR-B2: data behind a tapped city item (reads metrics only)
import { CHAR_STYLE, CHAR_FALLBACK } from './render/vocab.js'; // T5 CR-B5: the pawn's ring colour per character
import { suspendAudio, resumeAudio } from './audio.js';      // T5 CR-B7
import { tileSheet, tileText, whereText, stepsTo, landedText } from './render/tiles.js';
import { packCheckpoint, unpackCheckpoint } from './ckcodec.js';
import { nextMilestone, moneyHubModel } from './hudgoal.js';
import { debtSnap, newDebt } from './hudgoal.js';   // wave 2 (A2 G-07): new-debt chip = difference of two engine snapshots   // 3D upgrade wave 1: tile names / descriptions (render-side)
/* wave 3b — live rooms: a RemoteDriver (js/remote.js) holds the game on the server. D = null → a local game, nothing changes.
 * With D: every engine mutation is an intent (await), S is replaced in place by the server's redacted view, no saves/⚡/ghosts. */
let D = null;
export function setDriver(d) {
  D = d || null;
  if (D && D.on) D.on((k) => { if (D !== d || k !== 'change' || !S || !CFG || !CFG.room || busy || card) return; D.adopt(S); render(); ui.setRollEnabled(!S.over && D.canRoll()); });
}
const mut = (name, ...a) => (D ? D.call(name, S, ...a) : E[name](S, ...a));   // → the engine's result (a promise in a room)

const STR = OV.STR, SS = saves.STR;
/** the active renderer: starts as the no-op scene so nothing can crash before init */
let scene = nullScene;
// keep three.js downloading in parallel with game.js when 3D is the likely renderer
try { if (preferredChoice().kind === '3d') prefetch3D(); } catch (e) { /* ignore */ }

const SETTINGS = 'rr2-settings';
const readSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS) || '{}') || {}; } catch (e) { return {}; } };
const writeSettings = (patch) => { try { localStorage.setItem(SETTINGS, JSON.stringify({ ...readSettings(), ...patch })); } catch (e) { /* ignore */ } };
const settings = { turbo: false, voice: false, ...readSettings() };

let S = null;          // engine state
let CFG = null;        // start config
let UIS = null;        // = S.ui — ui progress that travels with the state (also to the server): {seq, coach, firstPayday}
let W = null;          // world data
let gen = 0;           // bumps on every start / lobby — stale async flows check it and stop
let busy = false;      // rolling / hopping / ending
let card = null;       // open event card controller
let initP = null;
const $ = (s) => document.querySelector(s);
const speed = () => (settings.turbo ? 0.5 : 1);
const pause = (ms) => new Promise((r) => setTimeout(r, ms * speed()));

/* ============================================================ error boundary (T1) */
let stuck = false; const stuckLog = [];           // timestamps of stuck moments
let flows = 0, flowTick = 0;                      // running turn/landing flows; bumps on every step of a flow
window.__rrErrors = window.__rrErrors || [];      // capped at 20 {msg, where, at}; read by tests; never stored
function logErr(err, where) {
  const msg = String((err && err.message) || err).slice(0, 300);
  window.__rrErrors.push({ msg, where, at: Date.now() }); if (window.__rrErrors.length > 20) window.__rrErrors.shift();
  console.warn('[rr] error in', where, err);
}
/** keep a locally caught error visible to devtools / monitoring as an uncaught error (the global handler skips it) */
function resurface(err) { if (err instanceof Error) { err.__rrHandled = true; setTimeout(() => { throw err; }, 0); } }
/** A flow broke mid-turn: save, freeze the roll, offer to continue from the save. variant 'R3' = WebGL context lost. */
function enterStuck(err, where, variant = null) {
  logErr(err, where);
  if (err && typeof err === 'object') err.__rrHandled = true;
  if (!flag('recover')) { // rollback path: the old silent behaviour + a toast
    busy = false; ui.setRollEnabled(!!(S && !S.over && S.phase === 'roll' && !ui.isEventOpen()));
    ui.toast(STR.R4); resurface(err); return;
  }
  try { if (S && CFG) persist(); } catch (e) { /* ignore */ } // engine mutators throw before mutating → S is consistent
  stuck = true; busy = true; ui.setRollEnabled(false);
  if (variant === 'R3') showRecoverBar('R3');
  else { stuckLog.push(Date.now()); showRecoverBar(stuckLog.filter((t) => Date.now() - t < OV.RECOVER_WINDOW_MS).length >= 3 ? 'R2' : 'R1'); }
  if (where !== 'global' && where !== 'context') resurface(err);
}
function barLobby() { try { persist(); } catch (e) { /* ignore */ } OV.hideRecover(); bus.emit('lobby:open', {}); } // stuck stays true: resume-active recovers
function showRecoverBar(v) {
  const lobby = { label: STR.Rlobby, fn: barLobby };
  if (v === 'R3') OV.showRecover({ title: STR.R3t, body: STR.R3b, details: STR.tech('context-lost', rendererInfo && rendererInfo.gpu), actions: [{ label: STR.Rlite, primary: true, fn: () => recover({ lite: true }) }, { label: STR.R3d, fn: () => reloadInto3D() }, lobby] });
  else if (v === 'R2' && scene.kind !== '3d') OV.showRecover({ title: STR.R1t, body: STR.R2b2d, actions: [{ label: STR.Rsave, primary: true, fn: () => recover() }, lobby] }); // already מצב קל / none: nothing lighter to offer
  else if (v === 'R2') OV.showRecover({ title: STR.R1t, body: STR.R2b, actions: [{ label: STR.Rlite, primary: true, fn: () => recover({ lite: true }) }, { label: STR.Rsave, fn: () => recover() }, lobby] });
  else {
    // phones (≤600px) have no HUD lite button (CR-S2): offer מצב קל on the bar while in 3D
    const phoneLite = scene.kind === '3d' && flag('board2d') !== 'off' && matchMedia('(max-width: 600px)').matches;
    OV.showRecover({ title: STR.R1t, body: STR.R1b, actions: [{ label: STR.Rsave, primary: true, fn: () => recover() }, ...(phoneLite ? [{ label: STR.Rlite, fn: () => recover({ lite: true }) }] : []), lobby] });
  }
}
export function isStuck() { return stuck; }
/** Continue from the save (the save was written when the flow broke). lite → continue in מצב קל. */
export async function recover({ lite = false } = {}) {
  OV.hideRecover(); stuck = false; busy = false; closeCard();
  // מצב קל is a live 3D → 2D switch; in 2D / none there is nothing to switch, so resume from the save (review B-1)
  if (lite && scene.kind === '3d' && flag('board2d') !== 'off') return setLite(true);
  if (!CFG) return false;
  return startGame({ ...CFG, resume: true });
}
// global listeners: count only while a game is on screen and the error comes from the game's own modules
const OWN = /\/js\/(game|ui|scene|engine)\.js|\/js\/render\//;
function onGlobalError(err, src) {
  if (err && err.__rrHandled) return;
  if (!(S && !S.over && $('#start') && $('#start').hidden) || stuck) return;
  if (!OWN.test(String(src || ''))) return;
  logErr(err, 'global');
  const t0 = flowTick;
  const looksStuck = () => {
    if (stuck || !S || S.over || !$('#start').hidden) return false;
    if (ui.isEventOpen() || !$('#gm').hidden || !$('#story').hidden || !$('#coach').hidden) return false;
    if (busy) return flows === 0 || flowTick === t0;
    return $('#roll').disabled && S.phase === 'roll';
  };
  setTimeout(() => { if (looksStuck()) setTimeout(() => { if (looksStuck()) enterStuck(err, 'global'); }, OV.STUCK_CHECK_MS); }, OV.STUCK_CHECK_MS);
}
addEventListener('error', (ev) => onGlobalError(ev.error || ev.message, [ev.filename, ev.error && ev.error.stack].join(' ')));
addEventListener('unhandledrejection', (ev) => onGlobalError(ev.reason, (ev.reason && ev.reason.stack) || ''));

/* ============================================================ saves (T1: js/saves.js — backup, quarantine, quota) */
/** localStorage key for a config: free → rr2-save-free-<world>; learning → rr2-save-learn-<world>; ranked → rr2-save-<resultId>. */
export function saveKeyFor(cfg) {
  if (!cfg) return null;
  if (cfg.slot === 'branch' && (cfg.mode === 'free' || !cfg.mode)) return rewind.branchKey(cfg.worldId || 'w1'); // T6 §7.2: the practice branch's own slot
  if ((cfg.mode === 'free' || !cfg.mode) && cfg.learn) return `rr2-save-learn-${cfg.worldId || 'w1'}`; // T4 IR-T4-1: learning mode's own slot
  if (cfg.mode === 'free' || !cfg.mode) return `rr2-save-free-${cfg.worldId || 'w1'}`;
  if (cfg.mode === 'history') return cfg.scenarioId ? `rr2-save-history-${cfg.scenarioId}` : `rr2-save-history-seed-${cfg.seed >>> 0}`;
  if (cfg.resultId) return `rr2-save-${cfg.resultId}`;
  return `rr2-save-${cfg.mode}-${cfg.worldId || 'w1'}-${cfg.seed >>> 0}`;
}
const keyOf = (k) => (typeof k === 'string' ? k : saveKeyFor(k));
let quotaWarned = false;
function persist() {
  if (!S || !CFG || D) return;
  const r = saves.write(saveKeyFor(CFG), CFG, S);
  // full (quota) or blocked storage (SecurityError, review m-2): tell the player once per game; a refused future-save
  // overwrite is not a storage failure (the future save is kept on purpose)
  if (!r.ok && !r.future && !quotaWarned) { quotaWarned = true; toastWhenIdle(r.quota ? SS.S7 : SS.S7b, { kind: 'bad', ms: 8000 }); }
  branchNotice();
}
/** T6 verify D4: a practice branch that saves.js removed to make room (this write, a backup, a new branch) is never silent */
function branchNotice() {
  const gone = typeof saves.takeRemovedBranches === 'function' ? saves.takeRemovedBranches() : [];
  for (const w of gone) { let name = w; try { name = E.getWorld(w).name || w; } catch (e) { /* unknown world id */ } toastWhenIdle(SS.S13.replace('{w}', name), { kind: 'bad', ms: 8000 }); }
}
/** an important warning: ui.js never drops 'bad' toasts, and `urgent` puts it at the front of the queue (it used to wait for an
 *  idle pill, which could take a minute behind a burst of lesson toasts — stability S10) */
function toastWhenIdle(text, opts) { ui.toast(text, { ...opts, urgent: true }); }

/* ============================================================ ranked server checkpoint (anti-replay) */
// After every landing (the drawn card is then on the server) and every decision we push the whole state with a
// monotonic counter S.ui.seq (saved with the state, never decreases). One request in flight; the newest state wins.
// 'stale_checkpoint' (the server already has a newer one) is ignored; network errors retry later.
let ckBusy = false, ckNext = null, ckTimer = 0;
const ranked = () => !!(CFG && CFG.resultId && CFG.mode && CFG.mode !== 'free' && (!net.hasMe || net.hasMe()));
function checkpoint() {
  if (!S || D || !ranked()) return;
  S.ui.seq = (S.ui.seq || 0) + 1;
  persist();
  ckNext = { rid: CFG.resultId, seq: S.ui.seq, state: packCheckpoint(S) };   // wave 3a (ONLINE §13): key-order safe (js/ckcodec.js)
  pumpCheckpoint();
}
async function pumpCheckpoint() {
  if (ckBusy || !ckNext) return;
  const job = ckNext; ckNext = null; ckBusy = true;
  let retry = false;
  try { await net.checkpoint(job.rid, job.seq, job.state); }
  catch (e) {
    const code = e && e.code;
    if (code === 'stale_checkpoint') { /* a newer state is already on the server */ }
    else if (code === 'diverged_checkpoint') { ckNext = null; ckBusy = false; divergedFromServer(e); return; } // T6 §8.1 (server trigger awaiting the owner)
    else if (!code) retry = true; // network / no answer
    else console.warn('checkpoint rejected', code);
  }
  ckBusy = false;
  if (retry && !ckNext) { ckNext = job; clearTimeout(ckTimer); ckTimer = setTimeout(pumpCheckpoint, 8000); return; }
  if (ckNext) pumpCheckpoint();
}
addEventListener('online', () => pumpCheckpoint());
/** T6 §8.1: the server refused a checkpoint that does not extend its log — stop this line, the next resume loads the server state
 *  (the V3 rule below prefers the server unless the local log extends it). */
function divergedFromServer(e) {
  gen++; busy = false; closeCard(); ui.setRollEnabled(false);
  ui.toast((e && e.message) || 'המשחק הזה המשיך במכשיר אחר — טוענים את השמירה מהשרת', { kind: 'bad', ms: 6000 });
  bus.emit('lobby:open', {});
}
export const { isPrefix, pickRankedState } = rewind;   // T6 §8.1 V3 (pure, tested in tests/t6_client.test.mjs)
/** Saved unfinished game for a key (or cfg) → {cfg, month, worldId, charName, future?} | null. */
export function savedGame(k) {
  const c = saves.peek(keyOf(k));
  if (c.status !== 'current' && c.status !== 'old' && c.status !== 'future') return null;
  const out = { cfg: c.wrapper.cfg, month: c.state.month, worldId: c.state.worldId, charName: c.state.charName };
  if (c.status === 'future') out.future = true; // the lobby still offers "להמשיך"; startGame explains (S-S1)
  return out;
}
export function clearSave(k) { saves.clear(keyOf(k)); }
export function hasActiveGame() { return !!(S && !S.over && !summarized); }   // wave 3a: a summarised run has ended (E.endNow)
export function activeConfig() { return CFG ? { ...CFG } : null; }

/* ============================================================ init */
/** Renderer + world-1 board (shown behind the lobby). Safe to call twice; runs in the background while the lobby is up —
 * startGame() waits for it with honest loading stages. Practically never rejects (the renderer falls back 3D → 2D → none). */
export function initGame() {
  if (!initP) initP = doInit().then(() => { initDone = true; }, (e) => { initP = null; throw e; });
  return initP;
}
let initDone = false;
let rendererInfo = null;                        // {kind, reason} for the notices
let initPhase = 'idle';                         // 'renderer' | 'models' | 'done'
const initModels = { done: 0, total: 0 };       // GLBs of the init set (world 1 + pawn + dice), settled / total
const initWatchers = new Set();
const emitInit = (ev) => { for (const f of initWatchers) { try { f(ev); } catch (e) { console.error(e); } } };
export const gameReady = () => initDone;
let lifeP = null, lifeSettled = false; const lifeProg = { done: 0, total: 0 }; const lifeWatchers = new Set();
let curPawn = '';                               // pawn id|colour currently on the board
let forced2d = null;                            // reason when the next init must use 2D (context lost)
let ctxDead = false, ctxT = 0;
async function doInit() {
  initShell();
  initMotion(); // T5 CR-S1: <html data-motion> + follows the OS while the setting is 'auto'
  await initRenderer();
  applyMotion(reducedMotion());
}
/** T5 CR-S1: reduced motion. Scenes without setMotion (3D) simply get no camera shake from here (fxShake). */
let motionReduced = false, motionWired = false;
function applyMotion(reduced) {
  motionReduced = !!reduced;
  try { scene.setMotion?.(motionReduced); } catch (e) { console.warn(e); }
  try { ui.setMotion?.(motionReduced); } catch (e) { console.warn(e); }
  if (!motionWired) { motionWired = true; bus.on('motion:change', ({ reduced: r } = {}) => applyMotion(r)); }
}
function fxShake(amp, dur) { if (!motionReduced) scene.shake(amp, dur); }
let shellDone = false;
/** once per page: wiring, settings, the #start observer, the lite button */
function initShell() {
  if (shellDone) return; shellDone = true;
  wireUI();
  applySettings();
  // the lobby covers the board: stop rendering while it is up (game flows simply wait underneath).
  // Lobby → "חזרה למשחק" only hides #start: when the game is stuck, that is the moment to recover.
  const start = $('#start');
  const sync = () => { scene.setPaused(!start.hidden); if (start.hidden && stuck && S && CFG) recover(); };
  new MutationObserver(sync).observe(start, { attributes: true, attributeFilter: ['hidden'] });
  sync();
  // T5 CR-B3: a tap on the board, Space or Enter while the dice / pawn animate finishes the animation at once
  for (const el of [$('#c'), $('#board2d')]) if (el) el.addEventListener('pointerdown', () => { if (busy && rolling) scene.skip?.(); });
  addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.code === 'Enter') && busy && rolling && $('#start').hidden) { e.preventDefault(); scene.skip?.(); } });
  // T5 CR-B4: the quality governor stepped down (or the player changed it in the lobby)
  let qToast = false;
  bus.on('quality:change', ({ tier, auto } = {}) => {
    try { scene.setQuality?.(tier); } catch (e) { console.warn(e); }
    if (auto && !qToast) { qToast = true; ui.toast('הורדנו את איכות הגרפיקה כדי שהמשחק ירוץ חלק. אפשר לשנות בהגדרות.'); }
  });
  // T5 CR-B7: no sound while the tab is hidden (the renderer already stops its loop)
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspendAudio(); else resumeAudio(); });
}
/** re-runnable: choose and start a renderer, then the world-1 board */
async function initRenderer() {
  initPhase = 'renderer'; initModels.done = initModels.total = 0;
  const ch = forced2d ? { kind: '2d', reason: forced2d } : preferredChoice();
  forced2d = null;
  const r = await loadRenderer({ want: ch.kind, reason: ch.reason, canvas: $('#c'), root: $('#board2d'), onSlow: () => emitInit({ type: 'slow' }) });
  scene = r.scene;
  try { scene.onPick?.(onAssetPick); } catch (e) { console.warn(e); }   // T5 CR-B2
  try { scene.onTilePick?.(onTilePick); } catch (e) { console.warn(e); }   // wave 1: tap / Enter on a board tile → the tile sheet
  rendererInfo = { kind: r.kind, reason: r.reason, gpu: r.gpu || '' };
  initPhase = 'models';
  emitInit({ type: 'renderer', kind: r.kind });
  try { scene.setSpeed(speed()); } catch (e) { console.error(e); }
  await Promise.race([Promise.all([document.fonts.load('800 40px Rubik'), document.fonts.load('40px "Secular One"')]), new Promise((res) => setTimeout(res, 2500))]).catch(() => {});
  const w1 = E.getWorld('w1');
  if (scene.kind === '3d') {
    // T5 CR-B6: no world models at boot — the world being started is loaded by startGame (its models stage); only the pawn here
    let dT = 0, dD = 0, pD = 0;
    const upd = () => { initModels.total = dT + 1; initModels.done = dD + pD; emitInit({ type: 'model' }); };
    upd();
    await Promise.all([
      Promise.resolve(scene.setPawn('classic', '#e2483d')).catch((e) => console.warn(e)).finally(() => { pD = 1; upd(); }),
      scene.preloadDice((p, d) => { if (d) { dT = d.total; dD = d.done; } upd(); }),
    ]);
  } else await scene.setPawn('classic', '#e2483d');
  curPawn = 'classic|#e2483d';
  W = w1;
  if (scene.kind !== '3d') { scene.buildWorld(w1); scene.placePawn(0); }
  ui.applyTheme(w1);
  frame();
  if (!S) $('#mText').textContent = 'בחר עולם ודמות, ונתחיל.';
  initPhase = 'done';
  // life / history models (~2.5 MB) are not needed for the lobby: fetch them after boot, off the critical path
  // (startGame awaits the same promise, with its own loading stage)
  if (scene.kind === '3d') {
    lifeSettled = false; lifeProg.done = lifeProg.total = 0;
    lifeP = scene.preloadLife((p, d) => { if (d) { lifeProg.done = d.done; lifeProg.total = d.total; } for (const f of lifeWatchers) f(); })
      .catch(() => null).finally(() => { lifeSettled = true; });
    scene.onContextLost(onContext);
  } else { lifeP = Promise.resolve(); lifeSettled = true; }
  const cam = $('#camBtn'); if (cam) { cam.hidden = scene.kind !== '3d'; cam.dataset.kind = scene.kind; }
  ui.boardTools({ onHome: homeView, onList: () => openTileList() }); ui.turnChip();
  ui.moneyHubBtn?.(() => openMoneyHub());   // wave 3a (J1 P0-4): one "💼 ניהול כסף" entry   // wave 1: "מבט ראשי", the tile list, the turn chip
  lastRect = ''; frame();
  syncLiteBtn();
  scene.setPaused(!$('#start').hidden);
}
/** WebGL context lost: keep the save; no restore within CONTEXT_RESTORE_WAIT_MS → offer מצב קל (S-R3). */
function onContext(ev) {
  if (ev === 'lost') {
    try { persist(); } catch (e) { /* ignore */ }
    clearTimeout(ctxT);
    ctxT = setTimeout(() => { ctxDead = true; if (S && !S.over && $('#start').hidden) enterStuck(new Error('webgl_context_lost'), 'context', 'R3'); }, OV.CONTEXT_RESTORE_WAIT_MS);
  } else { clearTimeout(ctxT); ctxDead = false; }
}

/* ============================================================ מצב קל (lite) switch + notices */
let liteJustOn = false, noticeDone = false;
function syncLiteBtn() {
  const b = $('#liteBtn'); if (!b) return;
  const on = scene.kind !== '3d';
  b.hidden = flag('board2d') === 'off';
  b.setAttribute('aria-pressed', String(on));
  const t = on ? STR.liteOn : STR.liteOff; b.setAttribute('aria-label', t); b.title = t;
}
/** Turn מצב קל on (3D → 2D live, same page) or off (2D → 3D through a page reload). */
export async function setLite(on) {
  settings.lite = !!on; writeSettings({ lite: !!on });
  if (!on) { if (scene.kind !== '3d') reloadInto3D(); return; }
  if (scene.kind !== '3d') { syncLiteBtn(); return CFG && S && !S.over && stuck ? recover() : undefined; }
  liteJustOn = true;
  try { persist(); } catch (e) { /* ignore */ }
  gen++; closeCard(); OV.hideRecover(); stuck = false; busy = false;
  try { scene.dispose(); } catch (e) { console.warn(e); }
  scene = nullScene; initDone = false; initP = null;
  if (S && CFG && !S.over) return startGame({ ...CFG, resume: true });
  initGame().catch((e) => console.warn(e));
}
/** 2D → 3D: re-initialising three in the same page is not supported, so save and reload; main.js resumes the game. */
export function reloadInto3D() {
  try { persist(); } catch (e) { /* ignore */ }
  settings.lite = false; writeSettings({ lite: false });
  try { if (CFG && S && !S.over) sessionStorage.setItem('rr2-resume-once', JSON.stringify(CFG)); } catch (e) { /* ignore */ }
  location.reload();
}
/** renderer notices: once per page load, after the board is shown */
function rendererNotice() {
  if (!rendererInfo) return;
  if (liteJustOn && scene.kind === '2d') { liteJustOn = false; ui.toast(STR.N4, { ms: 6000 }); return; }
  if (noticeDone) return;
  // team ב: one notice per real cause (render/overlay.js noticeFor) + a "פרטים טכניים" line
  let failed = [];
  if (rendererInfo.kind === '3d') { try { failed = scene.failedModels(); } catch (e) { failed = []; } }
  const n = OV.noticeFor({ ...rendererInfo, failed: failed.length, lowPower: !!scene.lowPower, liteOffered: !!settings.liteOffered, liteAllowed: flag('board2d') !== 'off' });
  if (!n) return;
  noticeDone = true;
  if (!n.text) return;
  if (n.id === 'N7') { settings.liteOffered = true; writeSettings({ liteOffered: true }); }
  const fn = n.action === 'reload3d' ? () => reloadInto3D() : n.action === 'lite' ? () => setLite(true) : null;
  ui.toast(n.text, { ms: n.ms, sub: n.sub, ...(fn ? { action: { label: n.actionLabel, fn } } : {}) });
}
function applySettings() {
  scene.setSpeed(speed()); ui.setSpeed(speed());
  const tb = $('#turboBtn'); tb.setAttribute('aria-pressed', String(!!settings.turbo)); tb.title = settings.turbo ? 'טורבו: פועל' : 'טורבו: כבוי';
  const mb = $('#muteBtn'); mb.innerHTML = isMuted() ? ui.ICON.soundOff : ui.ICON.soundOn; mb.setAttribute('aria-pressed', String(isMuted())); mb.title = isMuted() ? 'צלילים: כבויים' : 'צלילים: פועלים';
  mb.setAttribute('aria-label', isMuted() ? 'הפעלת צלילים' : 'השתקה');
  ui.setVoice(settings.voice && ui.voiceAvailable());
}

let wired = false;
function wireUI() {
  if (wired) return; wired = true;
  $('#homeBtn').innerHTML = ui.ICON.home + '<span>לובי</span>';
  $('#turboBtn').innerHTML = ui.ICON.bolt;
  $('#voiceBtn').innerHTML = ui.ICON.voice;
  $('#sheetBtn').innerHTML = ui.ICON.doc + '<span>הדוח שלי</span>';
  $('#roll').onclick = () => { unlock(); ui.hideCoach('roll'); turn(); };   // T4: a coach closed by the roll resolves 'roll' (a tip that just opened is not "seen")
  wireHold();
  $('#hLife').onclick = (e) => { const b = e.target.closest('[data-life]'); if (!b || !S) return; sfx('click'); lifeChip(b.dataset.life); };
  $('#hEnergy').onclick = async () => { const en = await energyMod(); if (en) showNoEnergy(en, true); };
  bus.on('energy:change', () => updateRollEnergy());
  setInterval(() => { if (!document.hidden && S && usesEnergy() && $('#start').hidden) updateRollEnergy(); }, 1000);
  $('#camBtn').innerHTML = ui.ICON.overview;
  const lb = $('#liteBtn'); if (lb) lb.onclick = () => { if (outPending) { ui.toast('אפשר לעבור למצב קל כשהחייל עוצר'); return; } sfx('click'); setLite(scene.kind === '3d'); }; // T1: מצב קל (wave 3a MINOR-4: not mid-roll)
  $('#camBtn').onclick = () => { const o = scene.getCameraMode() !== 'overview'; scene.setCameraMode(o ? 'overview' : 'follow'); $('#camBtn').setAttribute('aria-pressed', String(o)); $('#camBtn').title = o ? 'חזרה למצלמה שעוקבת אחרי החייל' : 'מבט על כל הלוח'; sfx('click'); };
  $('#homeBtn').onclick = () => { sfx('click'); goLobby(); };
  $('#turboBtn').onclick = () => { settings.turbo = !settings.turbo; writeSettings({ turbo: settings.turbo }); applySettings(); sfx('click'); ui.toast(settings.turbo ? 'טורבו פועל: הכל זז פי 2' : 'מהירות רגילה'); };
  $('#muteBtn').onclick = () => { unlock(); setMuted(!isMuted()); applySettings(); sfx('click'); };
  $('#voiceBtn').onclick = () => {
    if (!ui.voiceAvailable()) { ui.toast('לא נמצא קול עברי בדפדפן הזה'); return; }
    settings.voice = !settings.voice; writeSettings({ voice: settings.voice }); applySettings();
    if (settings.voice) ui.speakLast();
  };
  $('#mentor').onclick = (e) => { if (!e.target.closest('button')) ui.finishMentor(); };
  $('#sheetBtn').onclick = () => { sfx('click'); ui.toggleSheet(); };
  $('#sheetBack').onclick = () => ui.toggleSheet(false);
  $('#sheet').onclick = (e) => {
    const ab = e.target.closest('[data-asset-open]');
    if (ab) { sfx('click'); if (innerWidth <= 820) ui.toggleSheet(false); onAssetPick(ab.dataset.assetOpen); return; }   // T5 CR-B2 keyboard path
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    if (b.dataset.act === 'close') { ui.toggleSheet(false); return; }
    sheetAction(b.dataset.act);
  };
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#sheet').classList.contains('open')) { ui.toggleSheet(false); return; }
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
      const a = document.activeElement;
      const free = !a || a === document.body || a.id === 'c' || a.id === 'roll';
      if (!free || !$('#evm').hidden || !$('#gm').hidden || !$('#start').hidden) return;
      if (a && a.id === 'roll') return; // native button activation handles it
      e.preventDefault(); unlock(); ui.hideCoach('roll'); turn();
    }
  });
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { frame(); if (S) render(false); }, 120); });
  // T1 verify D-1: the HUD's second row (life chips) and the mentor bar settle after the first paint and change height without a
  // window resize — re-frame the board whenever their size changes (2D needs it; 3D only re-fits). Only a changed free rect counts.
  if (typeof ResizeObserver === 'function') {
    let raf = 0; const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!S) return; frame(false); try { ui.placeBoardUi?.(null, { kind: scene.kind, show: true }); } catch (e) { console.warn(e); } }); });
    for (const id of ['hud', 'bar']) { const el = document.getElementById(id); if (el) ro.observe(el); }
  }
}
let lastRect = '';
function frame(force = true) {
  const r = ui.freeRect(); const k = [r.x0, r.y0, r.x1, r.y1].map(Math.round).join(',');
  if (!force && k === lastRect) return;
  lastRect = k; scene.frame(r);
  try { ui.placeBoardUi?.(r, { kind: scene.kind, show: true }); } catch (e) { console.warn(e); }   // wave 3a (NIT-3): the list is the board's text alternative — also with no renderer
}
/** wave 1 (B1 G7): "מבט ראשי" — the follow camera at its starting angle and distance (the overview toggle goes back to off) */
function homeView() {
  try { scene.homeView?.(); } catch (e) { console.warn(e); }
  const c = $('#camBtn'); if (c) { c.setAttribute('aria-pressed', 'false'); c.title = 'מבט על כל הלוח'; }
}

/* ============================================================ wave 1 (B1 G5/G6, A2 G-05): board tiles */
function boardTiles() { try { return E.boardInfo(S ? S.worldId : (W && W.id) || 'w1'); } catch (e) { return []; } }
/** tap / click / Enter on a tile (3D raycast or a 2D tile button) → the tile sheet. Never over a card, dialog, coach or the lobby. */
function onTilePick(i) {
  const coach = document.querySelector('#coach:not([hidden])');
  if (!S || busy || ui.isEventOpen() || !$('#gm').hidden || !$('#start').hidden || coach) return;
  const tiles = boardTiles(); const t = tiles[i]; if (!t) return;
  sfx('click');
  ui.tileSheet?.(tileSheet(t, i, S.pos, tiles.length, W), { onList: () => openTileList() });   // wave 3a (MAJOR-2): the world's own decks
}
/** the text alternative of the board (3D canvas and 2D): every tile in play order → its sheet */
async function openTileList() {
  // wave 3a (review MAJOR-1): never during a move or under / over a card — the list would stack with the landing card
  if (!S || busy || ui.isEventOpen() || !$('#gm').hidden || !$('#start').hidden || document.querySelector('#coach:not([hidden])')) return;
  const tiles = boardTiles(); const pos = S.pos;
  const items = tiles.map((t, i) => { const tx = tileText(t); return { index: i, name: tx.name, emoji: tx.emoji, where: whereText(stepsTo(pos, i, tiles.length)) }; });
  const i = await ui.tileList?.(items, { pos });
  if (i != null && S) onTilePick(i);
}
/** the landing: markers + the turn chip + the live region */
function landed(pos) {
  try { scene.markTile?.('dest', null); scene.markTile?.('current', pos); } catch (e) { console.warn(e); }
  const t = boardTiles()[pos]; if (!t) return;
  const txt = landedText(t);
  ui.turnChip?.(txt, { quiet: true, ms: 2600 }); ui.announce?.(txt);
}
/** A2 G-03: the city always equals E.cityModels(S) (+ the life markers syncLifeCity keeps). Idempotent; engine spawns keep their
 *  animation (they are already in the scene, so this changes nothing then). Dev fixtures (?fx=, perf) are ignored. */
const DEV_KEY = /^(fx|perf)/;
let cityGen = -1;   // the gen whose world + city the scene shows (startGame); reconcile only then
function cityWant() { return [...E.cityModels(S)]; }
function reconcileCity() {
  // wave 3a (review MINOR-3): never between E.rollDice and applyOut(out) of that roll — the roll already changed cityModels(S), the
  // exit / despawn animation is still to play; the render() right after applyOut reconciles
  if (!S || outPending || cityGen !== gen || typeof scene.cityKeys !== 'function' || scene.kind === 'none') return;
  try {
    const want = cityWant(); const have = (scene.cityKeys?.() || []).filter((k) => !DEV_KEY.test(k));
    const life = have.filter((k) => k.startsWith('L:'));
    const wantKeys = new Set([...want.map((m) => m.key), ...life]);
    if (have.length === wantKeys.size && have.every((k) => wantKeys.has(k))) return;
    const MODEL = lifeModels();
    scene.syncCity([...want, ...life.map((k) => ({ key: k, model: MODEL[k] }))], { silent: true });
    syncLevels(false);
  } catch (e) { console.warn('[game] reconcileCity', e); }
}
/** test hook (not part of the lobby contract): the city the engine wants vs the one on screen, the position and the turn */
export function cityAudit() {
  if (!S) return null;
  const have = (scene.cityKeys?.() || []).filter((k) => !DEV_KEY.test(k)).sort();
  const want = [...new Set([...E.cityModels(S).map((m) => m.key), ...have.filter((k) => k.startsWith('L:'))])].sort();
  let pawnTile = S.pos; try { const u = scene.boardUx?.(); if (u) pawnTile = u.pawnTile; } catch (e) { /* ignore */ }
  return { want, scene: have, pos: S.pos, turn: S.turn || 0, pawnTile };
}

/* ============================================================ T5 CR-B1: business stages / upgrade levels in the city */
const prevLevels = new Map();
function levelOf(entry, m) {
  const a = (m.assets || []).find((x) => x.id === entry.key); if (!a) return null;
  const stage = a.business ? (a.business.stage ?? (m.businesses || []).find((b) => b.assetId === entry.key)?.stage) : undefined;
  if (a.business && Number.isFinite(stage)) return { kind: 'biz', n: stage, of: 3, type: a.business.type, activity: a.business.activity || null };
  if (W && W.upgrade && W.upgrade.kinds && W.upgrade.kinds[a.kind]) return { kind: 'upgrade', n: a.upgrades || 0, of: W.upgrade.max };
  return null;
}
function syncLevels(animate) {
  if (!S || typeof scene.setLevel !== 'function') return;
  const m = E.metrics(S);
  for (const e of E.cityModels(S)) {
    const L = levelOf(e, m); const prev = prevLevels.get(e.key); const changed = JSON.stringify(L) !== JSON.stringify(prev ?? null);
    if (!changed) continue;
    try { scene.setLevel(e.key, L, { animate: animate && prev !== undefined }); } catch (x) { console.warn(x); }
    const name = ((m.assets || []).find((a) => a.id === e.key) || {}).name || '';
    if (animate && prev && L && L.kind === 'biz' && L.n > prev.n) { ui.feedback?.('levelUp', { key: e.key, level: L, name }); sfx('unlock'); }
    if (animate && prev && L && L.kind === 'biz' && L.n < prev.n) ui.feedback?.('levelDown', { key: e.key, level: L, name });
    prevLevels.set(e.key, L);
  }
}
/** T5 CR-B2: tap / click / Enter on a city item (3D or 2D) or a sheet row → "פרטי הנכס". Never over a card, modal, coach or the lobby. */
function onAssetPick(key) {
  const coach = document.querySelector('#coach:not([hidden])');
  if (busy || ui.isEventOpen() || !$('#gm').hidden || !$('#start').hidden || coach || !S) { scene.highlight?.(key); setTimeout(() => scene.highlight?.(null), 600); return; }
  const m = E.metrics(S);
  const info = assetInfo(key, m, { level: prevLevels.get(key) });
  if (info) ui.assetInfo?.(key, info, { world: W, opsOpen: !!(m.focus && m.focus.opsOpen) });
}
bus.on('asset:ops', () => openOps());
let outPending = false;   // wave 3a (MINOR-3 / MINOR-4): a roll's out is drawn but not applied yet (dice, hops, applyOut)
/** while a roll is in flight: no city reconcile, and 🪶 waits (the roll's payday fx / news / bailout payload would be dropped) */
function setOutPending(v) {
  outPending = !!v;
  const b = $('#liteBtn'); if (b) { b.disabled = outPending; b.setAttribute('aria-disabled', String(outPending)); }
}
let rolling = false;   // T5 CR-B3: dice / hops are animating — a tap or Space / Enter skips the animation (never the outcome)

/* ============================================================ start */
/**
 * Start (or resume) a game.
 * cfg = {worldId, charId, seed, mode:'free'|'daily'|'weekly'|'challenge', maxMonths?, resultId?, challengeId?, groupId?, title?,
 *        pawn, pawnColor, tutorial, resume}
 */
export async function startGame(cfg = {}) {
  const my = ++gen; cityGen = -1;   // no city reconcile until this start has built its world (G-03)
  stuck = false; OV.hideRecover();
  const orig = { ...cfg };
  try { return await startInner(cfg, my); }
  catch (e) {
    logErr(e, 'start');
    if (my !== gen) return false;
    busy = false;
    OV.showFatal({
      title: STR.E1, body: STR.E2, details: e && e.message ? e.message : String(e),
      actions: [
        { label: STR.E3, primary: true, fn: () => startGame(orig) },
        ...(flag('board2d') !== 'off' ? [{ label: STR.E4, fn: () => {
          settings.lite = true; writeSettings({ lite: true }); liteJustOn = true;
          if (scene.kind === '3d') { try { scene.dispose(); } catch (x) { /* ignore */ } }
          scene = nullScene; initDone = false; initP = null; startGame(orig);
        } }] : []),
        { label: STR.E5, fn: () => bus.emit('lobby:open', {}) },
      ],
    });
    return false;
  }
}
/** ranked game whose saved progress can't be loaded: never restart it from turn 0 (S-S5) */
function rankedFail() { OV.hideLoading(); busy = false; ui.toast(SS.S5, { kind: 'bad' }); bus.emit('lobby:open', {}); return false; }
function futureModal() {
  OV.hideLoading(); busy = false;
  ui.modal({ tag: SS.S1tag, color: '#2f6fdb', title: SS.S1t, html: `<p class="d">${ui.esc(SS.S1b)}</p>`,
    actions: [{ label: SS.reload, cls: 'primary', v: 'reload' }, { label: SS.lobby, v: 'lobby' }] })
    .then((v) => { if (v === 'reload') location.reload(); else bus.emit('lobby:open', {}); });
  return false;
}
async function noBackupModal(allowGo = true) {
  OV.hideLoading();
  const v = await ui.modal({ title: SS.S6t, html: `<p class="d">${ui.esc(SS.S6b)}</p>`,
    actions: [...(allowGo ? [{ label: SS.S6go, v: 'go' }] : []), { label: SS.lobby, cls: 'primary', v: 'lobby' }] });
  return v === 'go';
}
async function startInner(cfg, my) {
  // T7 CR-33: css/game-play.css is enabled once the lobby is open; a game never starts before it has loaded (normally long done)
  if (window.__rrPlayCss && !window.__rrPlayCssDone) { await window.__rrPlayCss(); if (my !== gen) return false; }
  initShell();
  if (endObs) { endObs.disconnect(); endObs = null; }
  prevLevels.clear();
  busy = true; quotaWarned = false;
  closeCard(); ui.hideCoach(); ui.toggleSheet(false); ui.setRollEnabled(false);
  // WebGL died while the lobby was up: this start uses the 2D board
  if (ctxDead && scene.kind === '3d') { ctxDead = false; try { scene.dispose(); } catch (e) { /* ignore */ } scene = nullScene; initDone = false; initP = null; forced2d = 'context-lost'; noticeDone = false; }
  cfg = {
    worldId: 'w1', mode: 'free', pawn: 'classic', pawnColor: '#e2483d', tutorial: false, resume: false,
    ...cfg,
  };
  if (!cfg.room) D = null;   // wave 3b: only a room start keeps the driver
  if (cfg.seed == null) cfg.seed = (Math.floor(Math.random() * 2147483646) + 1) >>> 0;
  let Wt = null; try { Wt = E.getWorld(cfg.worldId); } catch (e) { Wt = null; }
  const pawnKey = (cfg.pawn || 'classic') + '|' + (cfg.pawnColor || '#e2483d');

  /* ---------- loading stages: only what is still pending (renderer → models → life → board) */
  const initPending = !initDone;
  const want3d = initPending ? !forced2d && preferredChoice().kind === '3d' : scene.kind === '3d';
  const plan = [];
  if (initPending) plan.push({ id: 'renderer', label: STR.L1 });
  if (want3d && (initPending || (Wt && !scene.worldLoaded(Wt)) || pawnKey !== curPawn)) plan.push({ id: 'models', label: STR.L2(Wt ? Wt.name : ''), countable: true });
  if (want3d && !lifeSettled) plan.push({ id: 'life', label: STR.L3, countable: true });
  if (plan.length) { plan.push({ id: 'board', label: STR.L4 }); OV.showStages(plan); }
  $('#start').hidden = true;
  // models stage = init set (if init is still running) + the target world's files + a new pawn; counts settled files
  const M = { initD: 0, initT: 0, extraT: 0, wD: 0, wT: null, pD: 0, pT: 0 };
  let slowAt = 0; // S-L6 shown at… (the overlay then stays long enough to be read)
  const pushM = () => OV.stageProgress('models', M.initD + M.wD + M.pD, M.initT + (M.wT ?? M.extraT) + M.pT);
  if (initPending) {
    const watch = (ev) => {
      if (ev.type === 'slow') { slowAt = Date.now(); OV.stageNote('renderer', STR.L6); }
      if (initPhase === 'renderer') return;
      OV.stageDone('renderer');
      if (scene.kind !== '3d') { OV.stageDone('models'); OV.stageDone('life'); return; }
      if (ev.type === 'renderer' || ev.type === 'sync') {
        const far = Wt && typeof scene.worldModelNames === 'function'; // CR-B6: boot loads no world, so every world's files count here
        try { M.extraT = far ? scene.worldModelNames.call(scene, Wt).length : 0; } catch (e) { M.extraT = 0; } // 3D-only helper, outside SCENE_API
        M.pT = pawnKey !== 'classic|#e2483d' ? 1 : 0;
      }
      M.initD = initModels.done; M.initT = initModels.total; pushM();
    };
    initWatchers.add(watch);
    watch({ type: 'sync' });
    try { await initGame(); } finally { initWatchers.delete(watch); }
    if (my !== gen) return false;
    OV.stageDone('renderer');
    if (scene.kind !== '3d') { OV.stageDone('models'); OV.stageDone('life'); }
    else { M.initD = initModels.done; M.initT = initModels.total; }
  }
  // history mode needs the real market series (lazy-loaded real.js) before createGame / save migration
  if (cfg.mode === 'history' && typeof E.loadRealData === 'function') {
    let ok = false;
    try { ok = await E.loadRealData(); } catch (e) { ok = false; }
    if (my !== gen) return false;
    if (ok === false) { busy = false; OV.hideLoading(); ui.toast('לא הצלחנו לטעון את נתוני השוק. בדוק את האינטרנט ונסה שוב.'); $('#start').hidden = false; return false; }
  }

  /* ---------- load or create the state (js/saves.js: backup before migrating, never touch a future save) */
  const key = saveKeyFor(cfg);
  const isRanked = !!cfg.resultId;
  let st = null, srcCfg = null, srcUi = null, note = null;
  if (cfg.state != null) { cfg.state = unpackCheckpoint(cfg.state); if (!cfg.state) return rankedFail(); }   // wave 3a: v2 wrapper or the old bare state
  if (D && cfg.room) st = D.adopt({ ui: {} });   // wave 3b: the server's view is the state (no local save)
  else if (cfg.state || cfg.resume) {
    let lr = saves.load(key);
    if (lr.status === 'backup_failed') {
      const go = await noBackupModal(true);
      if (my !== gen) return false;
      if (!go) { busy = false; bus.emit('lobby:open', {}); return false; }
      lr = saves.load(key, { allowNoBackup: true });
    }
    if (lr.status === 'future' || (cfg.state && saves.classifyState(cfg.state).status === 'future')) return futureModal();
    const local = lr.status === 'ok' || lr.status === 'migrated' ? lr.state : null;
    if (local) { srcCfg = lr.cfg; srcUi = lr.ui; }
    if (cfg.state) {
      // server checkpoint: the source of truth for ranked games — unless this device already got further
      let srv = null;
      try { srv = E.deserialize(cfg.state); } catch (e) { console.warn('bad server checkpoint', e); }
      if (!srv || !srv.worldId) return rankedFail();
      st = rewind.pickRankedState(local, srv);
      if (st === local && lr.status === 'migrated') note = 'migrated';
    } else {
      st = local;
      if (lr.status === 'migrated') note = 'migrated';
      if (lr.status === 'corrupt' || lr.status === 'incompatible') { if (isRanked) return rankedFail(); note = lr.status; }
    }
  }
  if (st) {
    st.ui = saves.normalizeUi({ ...(srcUi || {}), ...(st.ui || {}) }); // (older saves kept ui beside the state)
    cfg = { ...(srcCfg || {}), ...cfg, worldId: st.worldId, charId: st.charId, seed: st.seed, mode: st.mode };
  }
  // never send a checkpoint number the server already has (it would be rejected as stale)
  const ckFloor = Math.max(0, Number(cfg.checkpointTurn) || 0);
  delete cfg.state; delete cfg.checkpointTurn;
  const resumed = !!st;
  if (!st) {
    // a new game: whatever unfinished game this slot holds is backed up first (future saves are never overwritten)
    const cl = saves.claimSlot(saveKeyFor(cfg), cfg.seed);
    if (!cl.ok) {
      const go = await noBackupModal(!cl.keep); // future / unreadable saves are never overwritten without a backup
      if (my !== gen) return false;
      if (!go) { busy = false; bus.emit('lobby:open', {}); return false; }
    }
    // T4 IR-T4-2: learn / dream / mentor (free games only; an engine without them simply ignores the keys)
    st = E.createGame({ worldId: cfg.worldId, charId: cfg.charId, seed: cfg.seed, mode: cfg.mode, maxMonths: cfg.maxMonths, tutorial: !!cfg.tutorial && cfg.mode === 'free', bailout: !!cfg.bailout, scenarioId: cfg.scenarioId,
      learn: !!cfg.learn && cfg.mode === 'free', dream: cfg.mode === 'free' ? cfg.dream : undefined, mentor: cfg.mentor,
      tutorialFree: !!cfg.tutorialFree && cfg.mode === 'free',   // T4 CR-E1 / review M-2: the engine's rollCost owns the 10 free rolls now (st.tutorialFree)
      // T2 review B1 (CR-29): a ranked game takes its rule set from the day key the server stores (the lobby passes it);
      // free / history games and a missing key keep the engine default (rules 4). mentor undefined → engine default (w1 guide, else hint).
      dateKey: RANKED.has(cfg.mode) && cfg.dateKey ? cfg.dateKey : undefined });
    st.ui = saves.normalizeUi({});
    cfg.charId = st.charId;
  }
  cfg.resume = false; summarized = false;
  if (ckFloor > (st.ui.seq || 0)) st.ui.seq = ckFloor;
  S = st; CFG = cfg; UIS = S.ui; W = E.getWorld(S.worldId);
  ui.setGender(S.gender);   // T3 verify D4: the UI's own strings in the player's gender
  ui.applyTheme(W);
  t6Start();

  /* ---------- world models (lazy) + pawn + life models */
  if (scene.kind === '3d') {
    const loads = [];
    // the init of THIS start already tried world 1's files (also used by history mode): don't wait for a failed one twice
    const needW = !scene.worldLoaded(W), needP = pawnKey !== curPawn; // CR-B6: boot no longer tries world 1's files
    if ((needW || needP) && !OV.hasStage('models')) OV.showStages([{ id: 'models', label: STR.L2(W.name), countable: true }, ...(lifeSettled ? [] : [{ id: 'life', label: STR.L3, countable: true }]), { id: 'board', label: STR.L4 }]);
    if (needP) M.pT = 1;
    if (needW) loads.push(scene.preloadWorld(W, (p, d) => { if (d) { M.wT = d.total; M.wD = d.done; } pushM(); }));
    else M.wT = 0;
    if (needP) loads.push(Promise.resolve(scene.setPawn(cfg.pawn || 'classic', cfg.pawnColor || '#e2483d')).catch((e) => console.warn(e)).finally(() => { M.pD = 1; pushM(); }));
    pushM();
    await Promise.all(loads);
  } else await scene.setPawn(cfg.pawn || 'classic', cfg.pawnColor || '#e2483d');
  curPawn = pawnKey;
  OV.stageDone('models');
  if (!lifeP) lifeP = Promise.resolve();
  if (!lifeSettled) {
    const lw = () => OV.stageProgress('life', lifeProg.done, lifeProg.total);
    lifeWatchers.add(lw); lw();
    try { await lifeP; } finally { lifeWatchers.delete(lw); }
  }
  OV.stageDone('life');
  if (slowAt) await new Promise((r) => setTimeout(r, Math.max(0, 1200 - (Date.now() - slowAt))));
  if (my !== gen) return false;

  /* ---------- board + the game on screen (errors from here on → recover bar, the save is safe) */
  try {
    scene.buildWorld(W);
    scene.placePawn(S.pos);
    try { scene.markTile?.('dest', null); scene.markTile?.('current', S.pos); } catch (e) { console.warn(e); }   // wave 1 (G6)
    ui.turnChip?.(null);
    scene.syncCity(E.cityModels(S), { silent: true });
    cityGen = my;
    syncLevels(false);
    OV.hideLoading();
    ui.flushFeedback?.({ toasts: false });   // T5 §4.2: the last game's queued cards / verdicts / reveal lines are not this game's
    ui.resetHud(); debtPrev = null;
    frame(); scene.resetCamera();
    try { scene.setPawnRing?.(CHAR_STYLE[S.charId] || CHAR_FALLBACK); } catch (e) { console.warn(e); }   // T5 CR-B5
    const firstInWorld = !resumed && !S.over && !onboard.worldCoached(W.id);
    if (firstInWorld) { try { scene.introWorld?.(); } catch (e) { console.warn(e); } } // first game in this world
    onboard.prepare?.(S, CFG, W);   // T4 §4.3: the gradual-reveal state of a new tutorial game (before the first HUD paint)
    render(false);
    frame(false);   // T1 verify D-1: the first render added the HUD's life row — frame the board to the settled free rect
    ui.showDice(S.lastRoll ? (S.lastRoll.dice || [S.lastRoll.die]) : [1, 1]);
    const intro = E.intro(S, resumed);
    ui.mentor(intro.mentor);
    if (firstInWorld && ui.feedback) { ui.feedback('worldEntry', { world: W }); sfx('unlock'); }   // T5 §4.1 world entry: T5-W1 "עולם חדש נפתח"
    else { ui.worldBanner(W, resumed ? `חזרת לחודש ${S.month}` : ui.goalWords(W.goalLabel)); if (!resumed) sfx('card'); }
    syncLiteBtn();
    rendererNotice();
    if (note === 'migrated') ui.toast(SS.S2);
    else if (note === 'corrupt') ui.toast(SS.S4);
    else if (note === 'incompatible') ui.toast(SS.S3, { kind: 'bad' });
    persist();
    if (S.over) { busy = false; return true; }
    // resume mid-event
    if (S.phase === 'land' || S.phase === 'event' || S.pending) {
      await handleLanding(my);
      if (my !== gen || stuck) return true;
    }
    busy = false;
    if (S.over) return true;
    ui.setRollEnabled(true); ui.focusRoll();
    updateRollEnergy();
    offerTurbo();
    await onboard.afterStart(hooks(my)); // T4 IR-T4-3
    return true;
  } catch (e) {
    OV.hideLoading();
    if (my === gen && !stuck) enterStuck(e, 'start');
    return true;
  }
}

/* ============================================================ T4 onboarding hooks (js/onboard.js owns the coaches, WORLD_COACH and rr2-coach) */
/** IR-T4-3: built per start; IR-T4-8: the practice answer path (free/learn only — no checkpoint, practice never runs in ranked). */
// F4: the in-game ❓ button (injected by ui.js, in-game UI lane) only emits this; onboard.js owns the modal
bus.on('onboard:help', () => { if (S && CFG && !S.over) onboard.help(hooks(gen)).catch((e) => console.warn(e)); });
function hooks(my) {
  return { S, CFG, W, my, gen: () => gen, persist, render, isBusy: () => busy, mentorMenu, mentorLabel: () => (S && E.metrics(S).mentor ? E.metrics(S).mentor.label : null),
    answerPractice: (qid, idx) => { if (typeof E.answerPractice !== 'function') return null; const r = E.answerPractice(S, qid, idx); render(); persist(); return r; } };
}

/* ============================================================ turbo offer (once, after the 2nd game) */
function offerTurbo() {
  if (settings.turbo || settings.turboOffered || (settings.games || 0) < 2) return;
  settings.turboOffered = true; writeSettings({ turboOffered: true });
  setTimeout(() => ui.toast('רוצה פי 2 מהירות?', { action: { label: 'טורבו!', fn: () => { if (!settings.turbo) $('#turboBtn').click(); } } }), 2600);
}

/* ============================================================ playtest: ★★★ needs the 🛟 fund, not cash */
/** Once per game, the first time the freedom meter is ≥ 75% while the emergency fund is under its 3 months: say that ★★★ needs the
 *  fund (cash in the till does not count). Never in learning mode (no stars) and never after the game ended. */
function fundWarn(m) {
  if (!S || S.over || !S.ui || S.ui.fundWarn || !CFG || CFG.learn || !m || !m.emergency) return;
  if (!((m.goalProgress || 0) >= 0.75 && (m.emergency.months || 0) < (m.emergency.target || 3))) return;
  S.ui.fundWarn = S.month;
  const t = `⭐ ★★★ דורש קרן חירום: ${m.emergency.target || 3} חודשי הוצאות ב־🛟 (יש לך ${m.emergency.months}). מזומן בקופה לא נחשב — מעבירים לקרן במשכורת.`;
  ui.toast(t, { kind: 'gold', keep: true, ms: 6500 }); ui.announce?.(t);
}

/* ============================================================ render */
function ctx() { return { world: W, st: S, cfg: CFG, isRevealed: onboard.isRevealed, t6: t6Hud() }; }
let opsSeen = false;
let debtPrev = null;   // wave 2 (G-07): the last render's {total liabilities, loan + card interest} (engine values; never saved)
function render(animate = true) {
  if (!S) return;
  const m = E.metrics(S);
  track(m);
  fundWarn(m);
  onboard.revealTick?.(S, { m, cfg: CFG });   // T4 §4.3: month thresholds (fund 4, happy / tools 6, credit 10, age 12) and ⚡ after the free rolls
  ui.renderHUD(m, ctx(), { animate });
  ui.renderSheet(m, ctx());
  { const ds = debtSnap(m); const nd = newDebt(debtPrev, ds); debtPrev = ds; if (nd && typeof ui.debtChip === 'function') ui.debtChip(nd); }   // wave 2 (G-07)
  if (typeof ui.worldTag === 'function') ui.worldTag(!!(CFG && CFG.learn));       // T4 S-M7
  const goalOn = !!(m.nextGoal && !m.nextGoal.done);
  // T4 §4.3 `next` (the tutorial chain); wave 3a (J1 P0-2): after it — and in every other world / mode — the near-goal ladder's next rung
  if (typeof ui.renderNext === 'function') ui.renderNext(goalOn ? m.nextGoal : nextMilestone(m), { show: goalOn ? onboard.isRevealed('next') : !S.afterWin });
  if (typeof ui.renderDream === 'function') ui.renderDream(goalOn ? null : m.dream || null);      // T4 §6.4: the dream card replaces #hNext once the goal chain is done
  // T2: an "ops" focus from the agenda is ready → offer to open the business panel between rolls (once per month)
  const ops = !!(m.focus && m.focus.opsOpen);
  if (ops && !opsSeen && !busy && !ui.isEventOpen()) ui.toast('🏪 יום העבודה על העסק מחכה', { action: { label: 'לפתוח את לוח העסק', fn: () => openOps() } });
  opsSeen = ops;
  const wi = m.worldIndicators || {};
  ui.historyStrip(wi.indexHist ? wi.indexHist.map((x) => ({ index: x })) : S.ui.hist, wi.ymText ? wi : null);
  syncLifeCity(m);
  try { ui.placeBoardUi?.(null, { kind: scene.kind, show: true }); } catch (e) { console.warn(e); }   // wave 3a (MINOR-1): the HUD rows may have grown
  if (typeof ui.sumRunBtn === 'function') ui.sumRunBtn(canSummarize(), () => summarizeRun(false));   // wave 3a (J1 P0-1)
  reconcileCity();   // wave 1 (A2 G-03): after every applied decision / roll the city equals cityModels(S) (+ L:*)
}
/** Client-side monthly series (saved in st.ui): pension balance and, in history mode, the market path. */
function track(m) {
  const u = S.ui; if (u.trackMonth === m.month) return; u.trackMonth = m.month;
  // T6 §4.1 fallback: no engine st.tl yet → the same row per month in S.ui.tl (saved with the slot); then the ghosts may advance
  if (!S.tl) { if (!(u.tl && Array.isArray(u.tl.m))) u.tl = tlNew(m.month); tlPush(u.tl, tlRowOf(m)); }
  try { if (!S.over) ghosts.advance(S); } catch (e) { console.warn(e); }
  if (m.life && m.life.pension != null) { (u.pensionHist ||= []).push(Math.round(m.life.pension)); if (u.pensionHist.length > 120) u.pensionHist.shift(); }
  const wi = m.worldIndicators || {};
  if (wi.ymText) { (u.hist ||= []).push({ ym: wi.ym, index: wi.index }); if (u.hist.length > 240) u.hist.shift(); }
}
/* life models in the city: family house, university, pension island, index-fund building */
const LIFE_MODEL = { 'L:home': 'life/home_family', 'L:wedding': 'life/wedding', 'L:uni': 'life/university', 'L:pension': 'life/pension', 'L:index': 'life/index_fund', 'L:side': 'life/side_hustle', 'L:hospital': 'life/hospital' };
const lifeModels = () => LIFE_MODEL;
function syncLifeCity(m) {
  const L = m.life; if (!L) return;
  const fam = L.family || {};
  // A2 G-09 (display only): the wedding age is set BEFORE L:home reads it — an old save without it showed home + wedding together
  if (fam.partner === 'married') S.ui.weddingAge ??= L.age;
  const want = {
    'L:home': (fam.kids || 0) > 0 || (fam.partner === 'married' && (L.age - (S.ui.weddingAge || 0)) > 0.5),
    'L:wedding': fam.partner === 'married' && !(fam.kids > 0) && (L.age - (S.ui.weddingAge ??= L.age)) <= 0.5,
    'L:side': L.plan === 'side' || (L.sideLevel || 0) > 0,
    'L:hospital': ((S.life && S.life.burnouts) || 0) > (S.ui.burnSeen || 0) && L.plan === 'rest',
    'L:uni': L.plan === 'study' || (L.studyProgress > 0 && L.studyProgress < 1),
    'L:pension': (L.pension || 0) > 0,
    'L:index': !!(m.index && m.index.qty > 0),
  };
  if (fam.partner !== 'married') delete S.ui.weddingAge;
  if (!want['L:hospital'] && L.plan !== 'rest') S.ui.burnSeen = (S.life && S.life.burnouts) || 0;
  const MODEL = LIFE_MODEL;
  const LABEL = { 'L:home': 'הבית של המשפחה', 'L:wedding': 'מזל טוב!', 'L:uni': 'לומד!', 'L:pension': 'קרן הפנסיה', 'L:index': 'קרן מחקה מדד', 'L:side': 'העסק הצדדי', 'L:hospital': 'מנוחה והחלמה' };
  for (const [k, on] of Object.entries(want)) {
    if (on && !scene.hasKey(k)) scene.spawn(k, MODEL[k], { label: busy || ui.isEventOpen() ? LABEL[k] : null, color: 'gold', silent: !S.ui.lifeSeen });
    else if (!on && scene.hasKey(k)) scene.despawn(k);
  }
  S.ui.lifeSeen = true;
}

/* ============================================================ ⚡ energy gate (js/energy.js is owned by the lobby lead) */
let enP = null;
function energyMod() {
  if (!enP) enP = import('./energy.js').then((m) => m.energy || m.default || m).catch(() => null);
  return enP;
}
function safeCall(o, fn, dflt) {
  try {
    if (typeof o[fn] !== 'function') return dflt;
    const v = o[fn]();
    // get() may be a number (current js/energy.js) or {value, max} (contract) — normalise
    if (fn === 'get') return typeof v === 'number' ? { value: v, max: o.MAX || 25 } : v ? { value: v.value ?? v.energy ?? 0, max: v.max ?? o.MAX ?? 25 } : dflt;
    return v;
  } catch (e) { console.error(e); return dflt; }
}
const RANKED = new Set(['daily', 'weekly', 'challenge']);
const TUTORIAL_FREE_ROLLS = typeof E.TUTORIAL_FREE_ROLLS === 'number' ? E.TUTORIAL_FREE_ROLLS : 10;
const usesEnergy = () => {
  if (!CFG || D || RANKED.has(CFG.mode) || CFG.resultId) return false;
  if (CFG.learn) return false; // T4 §7.1: learning mode never costs ⚡ (also before the engine's rollCost knows st.learn)
  // T4 D-9 (P1): the first 10 rolls of a brand-new player's first game are free (cfg.tutorialFree, set once per player by the lobby;
  // a replayed tutorial does not get it — review M-2); the engine's rollCost takes over once it exports the constant
  if (S && CFG.tutorialFree && W && W.id === 'w1' && typeof E.TUTORIAL_FREE_ROLLS !== 'number' && (S.turn || 0) < TUTORIAL_FREE_ROLLS) return false;
  if (S && typeof E.rollCost === 'function') { try { return E.rollCost(S) > 0; } catch (e) { /* fall through */ } }
  return true;
};
let noEnTimer = 0;
function showNoEnergy(en, info = false) {
  if (info && safeCall(en, 'canRoll', true)) {
    const g0 = safeCall(en, 'get', null) || { value: 0, max: 25 };
    ui.modal({ tag: '⚡ זריקות', color: '#f2b632', title: `⚡ ${g0.value}/${g0.max}`, html: '<p class="d">כל הטלה במשחק רגיל עולה זריקה אחת ⚡, והזריקות מתמלאות לבד עם הזמן. אתגרים מדורגים (יומי, שבועי, קבוצות) ותרגול חופשי לא עולים זריקות. בונוסים: האתגר היומי, חברים שמצטרפים, ורצף ימים.</p>', actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true });
    return;
  }
  sfx('loss');
  const fmtMs = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
  const left = () => safeCall(en, 'msUntilNext', 0);
  const g = safeCall(en, 'get', null) || { value: 0, max: 25 };
  // director decision 6 (playtest B3, the ⚡ wall): the game is saved FIRST and the card says so — a beginner's game is never lost.
  // Two clear ways on: continue later (back to the lobby; "להמשיך" resumes this exact turn) or free practice in learning mode
  // (its own slot rr2-save-learn-<w>; this game's slot is not touched).
  persist();
  const sv = safe0(() => saves.peek(saveKeyFor(CFG)));
  const saved = !!(sv && (sv.status === 'current' || sv.status === 'old'));
  const who = S ? `${ui.esc(S.charName || '')} · חודש ${S.month}` : '';
  const p = ui.modal({
    tag: '⚡ זריקות', color: '#f2b632', title: 'נגמרו הזריקות ⚡',
    html: `<div class="noen"><div class="noen-ring"><b id="noenT" class="num">${fmtMs(left())}</b><small>עד הזריקה הבאה</small></div>
      <p class="d noen-saved">${saved ? `💾 <b>המשחק שלך שמור</b>${who ? ` (${who})` : ''}. כשתחזור זריקה ממשיכים בדיוק מכאן — שום דבר לא הולך לאיבוד.` : ui.esc(SS.S7)}</p>
      <p class="note">כל הטלה במשחק רגיל עולה זריקה אחת ⚡. הן מתמלאות לבד${g.max ? ` עד ${g.max}` : ''}, אחת כל כמה דקות.</p>
      <div class="noen-acts main"><button class="primary" data-go="later">⏸️ להמשיך אחר כך — המשחק נשמר</button><button data-go="learn">🎓 לתרגל בינתיים בחינם (מצב תרגול, בלי ⚡) — המשחק הזה נשאר שמור</button></div>
      <p class="note">ועוד:</p>
      <div class="noen-acts"><button data-go="library">📚 ספריית השיעורים</button><button data-go="daily">📅 האתגר היומי (בלי ⚡)</button><button data-go="groups">🎁 לשלוח זריקות לחברים</button><button data-go="sheet">📊 להציץ בדוח</button></div></div>`,
    actions: [{ label: 'סגירה', cls: '', v: 'close' }],
    dismissable: true,
    onExtra: (e) => {
      const b = e.target.closest('[data-go]'); if (!b) return;
      const go = b.dataset.go;
      document.querySelector('#gm .acts button')?.click();
      if (go === 'sheet') setTimeout(() => ui.toggleSheet(true), 50);
      else if (go === 'later') { persist(); bus.emit('lobby:open', { view: 'world', id: W.id }); }   // the world view shows "להמשיך" for this game
      else if (go === 'learn') { persist(); bus.emit('lobby:open', { view: 'world', id: W.id, learn: true }); } // T4 IR-T4-6
      else { persist(); bus.emit('lobby:open', { view: go }); }
    },
  });
  clearInterval(noEnTimer);
  noEnTimer = setInterval(() => {
    const el = document.getElementById('noenT'); if (!el) { clearInterval(noEnTimer); return; }
    el.textContent = fmtMs(left());
    if (safeCall(en, 'canRoll', false)) { el.textContent = '⚡ יש זריקה!'; clearInterval(noEnTimer); }
  }, 500);
  p.then(() => clearInterval(noEnTimer));
}

async function updateRollEnergy() {
  if (!S || !usesEnergy() || !onboard.isRevealed('zr')) { ui.renderRollEnergy(null); return; }   // T4 §4.3 `zr`
  const en = await energyMod(); if (!en) { ui.renderRollEnergy(null); return; }
  ui.renderRollEnergy(safeCall(en, 'get', null), safeCall(en, 'msUntilNext', 0));
}
/* life chips: details, or change the monthly plan between events */
async function lifeChip(kind) {
  if (kind === 'rivals') { openRivals(); return; }          // T6 §12.2
  if (kind === 'moments') { openMoments(); return; }        // T6 §7.4
  if (kind === 'afterwin') { retireFlow(); return; }        // T6 §9.2
  if (kind === 'inbox') { openInbox(); return; }            // T3 UI-3
  const m = E.metrics(S);
  if (kind === 'cal') { if (m.calendar) ui.calendarModal(m.calendar, { biz: (m.assets || []).some((a) => a.business) }); return; }   // T3 UI-7
  if (kind === 'econ') { if (m.econ) ui.econModal(m.econ); return; }
  if (kind === 'focus') {
    if (m.focus && m.focus.opsOpen) { openOps(); return; }
    if (busy || ui.isEventOpen()) { ui.toast('אפשר לבחור מוקד בין תורות, או בכרטיס המשכורת'); return; }
    focusFlow({}); return;
  }
  if (kind === 'plan') {
    if (busy || ui.isEventOpen() || typeof E.setPlan !== 'function') { ui.toast('אפשר לשנות תוכנית בין תורות, או ביום המשכורת'); return; }
    const L = m.life || {}; const plans = L.plans || [];
    const ICON = { work: '💼', overtime: '⏱️', study: '🎓', side: '🛠️', rest: '🌿' };
    const v = await ui.modal({ tag: 'התוכנית החודשית', color: '#0e7490', title: 'איך תעביר את החודשים הבאים?',
      html: `<p class="d">התוכנית חלה מיום המשכורת הבא. זמן וכוח (🔋) הם משאב — ${ui.gw('בחר', 'בחרי')} על מה לבזבז אותם.</p><div class="plans">${plans.map((p) => `<button class="plan ${p.id === L.plan ? 'cur' : ''}" data-plan="${p.id}"><span class="pi">${ICON[p.id] || '📅'}</span><b>${ui.esc(p.label)}</b>${p.id === L.plan ? '<small class="tagc">עכשיו</small>' : ''}<small class="pn">${ui.esc(p.desc || '')}</small></button>`).join('')}</div>`,
      actions: [{ label: 'ביטול', v: null }], dismissable: true,
      onExtra: (e) => { const b = e.target.closest('[data-plan]'); if (!b) return; chosenPlan = b.dataset.plan; document.querySelector('#gm .acts button').click(); } });
    void v;
    if (chosenPlan && chosenPlan !== L.plan) {
      const id = chosenPlan; chosenPlan = null;
      try { const out = await mut('setPlan', id); if (out && out.ok === false) { ui.toast(out.error || 'לא אפשרי עכשיו'); return; } if (out && out.mentor) ui.mentor(out.mentor); }
      catch (e) { console.error(e); return; }
      sfx('card'); render(); persist(); checkpoint(); ui.toast('התוכנית עודכנה — מהמשכורת הבאה');
    }
    chosenPlan = null; return;
  }
  const T = ui.lifeDetails(kind, m, { inflReality: S.ui && S.ui.inflReality }); if (!T) return;
  ui.modal({ tag: 'החיים שלך', color: '#0e7490', title: T[0], html: `<p class="d">${T[1]}</p>`, actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true });
}
let chosenPlan = null;

/* ============================================================ T2: monthly focus (E.setFocus) — HUD chip or the payday / education card */
let focusBusy = false;
async function focusFlow({ inCard = false, cur = null, update = null } = {}) {
  if (!S || S.over || focusBusy || typeof E.setFocus !== 'function') return;
  const F = E.metrics(S).focus; if (!F) return;
  const my = gen; focusBusy = true;
  try {
    const pick = await ui.focusPicker(F, { level: (E.metrics(S).mentor || {}).level });
    if (!pick || my !== gen || !S || S.over) return;
    if (!inCard && (busy || ui.isEventOpen())) { ui.toast('אפשר לבחור מוקד בין תורות, או בכרטיס המשכורת'); return; }
    let out;
    try { out = await mut('setFocus', pick.id, pick.slot); } catch (e) { console.error(e); ui.toast('לא אפשרי עכשיו'); return; }
    if (!out || out.ok === false) { ui.toast((out && out.error) || 'לא אפשרי עכשיו', { kind: 'bad' }); return; }
    sfx('card');
    await applyOut(out, { inCard });
    if (pick.slot) ui.toast(`🎯 ${pick.id === 'none' ? 'התכנון נוקה' : 'נשמר בתכנון'}: ${pick.slot === 1 ? 'בחודש הבא' : 'בעוד חודשיים'}`);
    render(); persist(); checkpoint();
    if (inCard && update && out.event) update(out.event);
    else if (!inCard && out.event && S.pending) await runPending(my);   // 'ops' opened the business panel
    if (out.end) { const my2 = gen; busy = true; ui.setRollEnabled(false); await endGame(out.end, my2); }
  } finally { focusBusy = false; }
}
/** 'ops' from the agenda: open the business panel once, between rolls (E.setFocus('ops', 0)). */
async function openOps() {
  if (!S || S.over || busy || ui.isEventOpen() || typeof E.setFocus !== 'function') { if (busy) ui.toast('רגע, החייל עוד זז'); return; }
  let out; try { out = await mut('setFocus', 'ops', 0); } catch (e) { console.error(e); return; }
  if (!out || out.ok === false) { ui.toast((out && out.error) || 'לא אפשרי עכשיו'); return; }
  await applyOut(out); render(); persist(); checkpoint();
  if (S.pending) await runPending(gen);
}
/** Resolve a card the player opened between rolls (focus 'ops'): the normal landing flow, then the roll button again. */
async function runPending(my) {
  busy = true; ui.setRollEnabled(false);
  await handleLanding(my);
  if (my !== gen || stuck) return;
  busy = false;
  if (!S.over) { ui.setRollEnabled(true); ui.focusRoll(); }
}
/* ============================================================ T3: the story inbox (E.inbox / E.resolveStory = action Q) */
const inboxOf = () => { try { return S && typeof E.inbox === 'function' ? E.inbox(S) || [] : []; } catch (e) { console.warn('inbox', e); return []; } };
let storyBusy = false;
/** 📬 chip / the business toast: between rolls only. One item → straight to its card; more → the list. */
async function openInbox({ assetId = null } = {}) {
  if (!S || S.over || storyBusy) return;
  if (busy || ui.isEventOpen()) { ui.toast('אפשר לפתוח את ההחלטות בין תורות'); return; }
  const cards = inboxOf(); if (!cards.length) { ui.toast('אין החלטות פתוחות'); return; }
  const pick = (assetId && cards.find((c) => c.assetId === assetId)) || (cards.length === 1 ? cards[0] : await ui.inboxList(cards, { month: S.month }));
  if (!pick || !S || S.over || busy || ui.isEventOpen()) return;
  const my = gen; busy = true; ui.setRollEnabled(false);
  try { await storyFlow(pick, my); }
  catch (e) { if (my === gen && !stuck) enterStuck(e, 'story'); }
  finally { if (my === gen && S && !S.over && !stuck) { busy = false; ui.setRollEnabled(true); ui.focusRoll(); } }
}
/** One inbox card in the event modal. "אחר כך" closes it untouched (the default applies at its payday; no timer). Resolves after the
 *  result was applied (and after the end screen when the decision ended the game). */
function storyFlow(card0, my) {
  return new Promise((resolve) => {
    storyBusy = true;
    let working = false, closed = false;
    const cur = card0;
    if (cur.mentor) ui.mentor(cur.mentor);
    sfx('card');
    const closeUi = () => { if (closed) return; closed = true; if (card && card.ctl === ctl) card = null; ctl.close(); storyBusy = false; setTimeout(() => ui.focusRoll(), 30); };
    const api = { mentor: () => (S ? E.metrics(S).mentor : null), later: () => { if (working) return; closeUi(); resolve(null); } };
    const ctl = ui.openEvent(cur, { ...ctx(), api }, async (optId) => {
      if (working || my !== gen) return;
      working = true; ctl.busy(true);
      let res;
      try { res = await mut('resolveStory', cur.itemId, optId); }
      catch (e) { console.error(e); working = false; ctl.busy(false); ctl.error('לא אפשרי עכשיו'); return; }
      if (!res || res.ok === false) { working = false; ctl.busy(false); if (res && res.error === 'stale') { closeUi(); render(); resolve(null); return; } ctl.error((res && res.error) || 'לא אפשרי עכשיו'); sfx('loss'); return; }
      checkpoint(); closeUi();
      await applyOut(res); render(); persist();
      onboard.revealTick?.(S, { out: res, cfg: CFG });
      if (res.end) { busy = true; ui.setRollEnabled(false); await endGame(res.end, my); }
      resolve(res);
    });
    card = { ctl, resolve: () => { closeUi(); resolve(null); } };
  });
}
/** After the roll's paydays: the first NEW chain item opens before the landing card (others wait for the next rolls).
 *  Business items get the "יש החלטה בעסק" toast (UI-4) and the 📬 badge instead. */
async function autoInbox(my) {
  const cards = inboxOf(); if (!cards.length || !UIS) return;
  const seen = (UIS.ibSeen ||= []);
  const fresh = cards.filter((c) => !seen.includes(c.itemId)); if (!fresh.length) return;
  for (const c of fresh) if (c.kind === 'biz') seen.push(c.itemId);
  const ch = fresh.find((c) => c.kind !== 'biz');
  if (ch) seen.push(ch.itemId);
  if (seen.length > 40) seen.splice(0, seen.length - 40);
  persist();
  if (!ch) return;
  await pause(250); if (my !== gen || !S || S.over) return;
  await storyFlow(ch, my);
  render();
}
/** T2 §15.1: the mentor level, from the ❓ menu (free and history games; ranked shows the fixed level). */
async function mentorMenu() {
  if (!S || S.over || D || typeof E.setMentorLevel !== 'function' || !E.MN) return;   // a room's help level is a room setting
  const M = E.metrics(S).mentor; const locked = !(S.mode === 'free' || S.mode === 'history');
  const lv = await ui.mentorPicker(M, { locked, levels: E.MN.LEVEL_TEXT });
  if (!lv || !S || S.over) return;
  let out; try { out = E.setMentorLevel(S, lv); } catch (e) { console.error(e); return; }
  if (!out || out.ok === false) { ui.toast((out && out.error) || 'לא אפשרי עכשיו'); return; }
  render(); persist(); checkpoint();
  ui.toast(`🧭 רמת המנטור: ${out.mentor || lv}`);
  bus.emit('mentor:level', { level: lv });
}

/* ============================================================ hold-to-shake (touch & mouse) */
const holdState = { down: false, held: false, t: 0 };
function wireHold() {
  const r = $('#roll');
  r.addEventListener('pointerdown', (e) => {
    if (r.disabled || busy || !S || S.over) return;
    unlock(); holdState.down = true; holdState.held = false;
    clearTimeout(holdState.t);
    holdState.t = setTimeout(() => {
      if (!holdState.down || busy) return;
      holdState.held = true; scene.holdDice(2); ui.shakeDomDice(true);
      const rattle = () => { if (holdState.down && holdState.held) { sfx('rattle'); setTimeout(rattle, 210); } };
      rattle(); ui.vibrate(6);
    }, 170);
  });
  const up = () => { holdState.down = false; clearTimeout(holdState.t); };
  r.addEventListener('pointerup', up); r.addEventListener('pointercancel', () => { up(); if (holdState.held && !busy) { holdState.held = false; scene.cancelHold(); ui.shakeDomDice(false); } });
  r.addEventListener('pointerleave', () => { if (holdState.down) { up(); if (holdState.held && !busy) { turn(); } } });
}

/* ============================================================ turn */
async function turn() {
  if (stuck || busy || !S || S.over || summarized || ui.isEventOpen() || !$('#start').hidden) return;
  if (D && !D.canRoll()) { ui.toast(D.waiting() ? 'סיימת את הסבב — מחכים ליריבים' : 'רגע…'); return; }
  const my = gen; busy = true; ui.setRollEnabled(false); ui.toggleSheet(false); ui.hidePractice?.(); ui.clearStickyNews?.();
  flows++; flowTick++;
  try { await turnBody(my); }
  catch (e) { if (my === gen && !stuck) enterStuck(e, 'turn'); }
  finally { flows--; flowTick++; rolling = false; setOutPending(false); }
}
async function turnBody(my) {
  const m0 = E.metrics(S);
  let out;
  // ⚡ the real-time limit (free/story play only — ranked modes never pay energy)
  if (usesEnergy()) {
    const en = await energyMod();
    if (my !== gen) return;
    if (en) setTimeout(updateRollEnergy, 50);
    if (en && (!safeCall(en, 'canRoll', true) || !safeCall(en, 'spend', true))) {
      scene.cancelHold(); ui.shakeDomDice(false); busy = false; ui.setRollEnabled(true);
      showNoEnergy(en); return;
    }
  }
  ui.turnChip?.('זורקים…');   // §13 turn state
  ui.debtChip?.(null);          // wave 2 (G-07): the new-debt chip stays until the next roll (no timed dismissal)
  try { out = D ? await D.roll(S) : E.rollDice(S); } catch (e) { console.error(e); scene.cancelHold(); busy = false; ui.setRollEnabled(true); ui.turnChip?.(null); return; }
  setOutPending(true);
  persist(); // T1: save the rolled state before any scene/ui work (a reload or a broken flow resumes at the landing, same dice, no extra ⚡)
  flowTick++;
  const faces = Array.isArray(out.dice) && out.dice.length ? out.dice : [out.die];
  ui.shakeDomDice(false);
  sfx('roll'); ui.vibrate(10);
  let bounces = 0;
  rolling = true;
  await scene.throwDice(faces, { held: holdState.held, onBounce: () => { sfx('clack'); if (!bounces++) ui.vibrate(8); } });
  flowTick++;
  holdState.held = false;
  ui.landDice(faces);
  if (faces.length === 2 && faces[0] === faces[1]) { sfx('golden'); ui.vibrate([12, 30, 12]); }
  if (my !== gen) return;
  // wave 1 (B1 G6): the destination is marked before the first hop; the current-tile outline leaves with the pawn
  const dest = out.steps.length ? out.steps[out.steps.length - 1] : S.pos;
  try { scene.markTile?.('current', null); scene.markTile?.('dest', dest); } catch (e) { console.warn(e); }
  ui.turnChip?.(out.steps.length === 1 ? 'זזים צעד אחד' : `זזים ${out.steps.length} צעדים`, { quiet: true });   // #dieSr already says the total
  await pause(180);
  let cash = m0.cash;
  for (let i = 0; i < out.steps.length; i++) {
    const from = i ? out.steps[i - 1] : out.from;
    await scene.hop(from, out.steps[i], i === out.steps.length - 1);
    flowTick++;
    if (my !== gen) return;
    sfx('hop');
    const pd = (out.paydays || []).find((p) => p.step === i);
    if (pd) { cash += pd.amount; paydayFx(pd, cash); }
  }
  rolling = false;
  landed(S.pos);
  // remaining roll results: news (exits, signals), auto-loans, achievements…
  const skip = (out.paydays || []).map((p) => (p.amount >= 0 ? 'coin' : 'loss'));
  await applyOut(out, { skipSounds: ['roll', ...skip], skipPawnCash: true });
  setOutPending(false);
  render();
  persist();
  flowTick++;
  if (out.bailout) { await bailoutCard(out.bailout); flowTick++; if (my !== gen) return; render(); }
  const burn = out.burnout || (out.news || []).find((n) => n.kind === 'burnout');
  if (burn) { await burnoutCard(burn); flowTick++; if (my !== gen) return; render(); }
  onboard.revealTick?.(S, { out, cfg: CFG });   // T4 §4.3 (paydays passed, inflation, loans)
  await autoInbox(my);   // T3 UI-3: a new chain item opens after the roll and BEFORE the landing card (at most one per roll)
  if (my !== gen || stuck || S.over) return;
  await handleLanding(my);
  if (my !== gen || stuck) return;
  busy = false;
  if (S.over) return;
  ui.setRollEnabled(!D || D.canRoll()); ui.focusRoll();
  if (!D && await offerSummary(my)) return;   // wave 3a (J1 P0-1): the ★ month limit just passed in a free run
  await onboard.afterTurn(hooks(my)); // T4 IR-T4-3
}

/** Payday while hopping: floating number, coins to the HUD, count-up. No modal. */
function paydayFx(pd, runningCash) {
  const pos = pd.amount >= 0;
  scene.floatLabel((pos ? 'משכורת ' : '') + E.sgn(pd.amount), pos ? 'green' : 'red', 'pawn');
  if (pos) { ui.flyCoins(scene.project('pawn'), 7); sfx('coin'); ui.vibrate(12); } else sfx('loss');
  ui.setCash(runningCash, true);
  ui.setMonth(pd.month, S.mode === 'free' ? 0 : S.maxMonths, starLimit());
}

/** Resolve the landing event(s) of this turn (or of a resumed save). A broken flow → recover bar (callers check `stuck`). */
async function handleLanding(my) {
  flows++; flowTick++;
  try { await landingBody(my); }
  catch (e) { if (my === gen && !stuck) enterStuck(e, 'landing'); }
  finally { flows--; flowTick++; }
}
async function landingBody(my) {
  let ev = D ? D.landing(S) : (E.landing(S) || E.currentEvent(S));
  render(); // drawing a card can move the world (rate / dollar / prices) before any decision
  persist();
  if (ev) checkpoint();
  while (ev && my === gen) {
    // landed paydays with plan choices (v3) open the plan picker; passed paydays keep the remembered plan silently
    const routinePayday = ev.type === 'payday' && !(CFG.tutorial && !UIS.firstPayday) && !ev.options.some((o) => o.id.startsWith('plan:') || o.id === 'raise');
    if (routinePayday || ev.auto) {
      // no card: routine payday (coins already flew) or an event that does not touch you (engine marks it auto)
      if (ev.auto) { ui.toast(ev.toastText || ev.title, { ms: 1300 * speed() + 200 }); sfx(ev.sound === 'loss' ? 'card' : ev.sound || 'card'); }
      const opt = ev.auto ? ev.options[0].id : 'ok';
      const res = D ? await D.choose(S, ev, opt) : E.choose(S, ev, opt);
      if (ev.mentor && !ev.auto) ui.mentor(ev.mentor);
      await applyOut(res, { noVerdict: true });
      render(); persist(); checkpoint(); flowTick++;
      if (ev.auto) await pause(900);
      if (res.end) { await endGame(res.end, my); return; }
      ev = res.event;
      continue;
    }
    if (ev.type === 'payday') { UIS.firstPayday = true; persist(); }
    const res = await resolveCard(ev, my);
    flowTick++;
    if (!res || my !== gen || stuck) return;
    render(); persist();
    if (res.end) { await endGame(res.end, my); return; }
    ev = null;
  }
}

/** Open a card for an event; resolves with the closing ChooseResult (or null when aborted). */
function resolveCard(ev, my) {
  return new Promise((resolve) => {
    if (ev.mentor) ui.mentor(ev.mentor);
    const jackpot = ev.type === 'mystery' && ev.data && ev.data.kind === 'cash' && ev.data.amount > 0;
    sfx(jackpot ? 'golden' : ev.sound || 'card');
    if (ev.golden || jackpot) { scene.sparkle('pawn'); ui.vibrate([15, 40, 15]); }
    else if (ev.sound === 'loss' && ['market', 'bank', 'fx', 'shipping'].includes(ev.type)) fxShake(0.18, 380);
    let cur = ev, working = false, closedRes = null;
    // T2 card API: the UI asks, the engine answers (no finance math in ui.js). A hint is an action (['H']): saved like a decision.
    const api = {
      mentor: () => (S ? E.metrics(S).mentor : null),
      hint: D ? undefined : () => {   // wave 3b: a room's hint is an intent (async) — the room screen's 💡 asks for it
        if (working || my !== gen || typeof E.requestHint !== 'function') return null;
        const r = E.requestHint(S);
        if (r && r.ok !== false) { persist(); checkpoint(); }
        return r;
      },
      impact: (ref) => (typeof E.impactFor === 'function' ? E.impactFor(S, ref, { event: cur }) : null),
      focus: () => { if (!working && my === gen) focusFlow({ inCard: true, cur: () => cur, update: (nev) => { cur = nev; ctl.update(nev); } }); },
    };
    const ctl = ui.openEvent(cur, { ...ctx(), api }, (optId, params) => onChoose(optId, params).catch((e) => {
      if (my !== gen || stuck) return;
      try { close(); } catch (x) { /* ignore */ }
      enterStuck(e, 'card'); resolve(null);
    }));
    async function onChoose(optId, params) {
      if (working || my !== gen) return;
      working = true; ctl.busy(true); flowTick++;
      let res;
      try { res = D ? await D.choose(S, cur, optId, params || {}) : E.choose(S, cur, optId, params || {}); }
      catch (e) {
        console.error(e);
        cur = D ? D.currentEvent(S) : E.currentEvent(S);
        if (!cur) { close(); resolve({ done: true, end: E.checkEnd(S) }); }
        else ctl.update(cur);
        working = false; ctl.busy(false); return;
      }
      if (!res.ok) { ctl.error(res.error); sfx('loss'); working = false; ctl.busy(false); return; }
      checkpoint();
      closedRes = res;
      if (res.done) close();
      await applyOut(res, { inCard: !res.done });
      render(); persist();
      if (res.done && res.rival && res.rival.lost) await ui.rivalLost({ ...res.rival, dd: res.rival.dd != null ? res.rival.dd : res.rival.how === 'inspect' && res.mentor ? res.mentor : null });   // T6 §12.1: no timed dismissal; a lost inspection still shows its result
      if (res.done) resolve(res);
      else { cur = res.event; ctl.update(cur); }   // the engine fills the manage card's report (data.l1 / l2) itself
      working = false; ctl.busy(false);
    }
    card = { ctl, resolve };
    function close() { if (card && card.ctl === ctl) card = null; ctl.close(); try { onboard.onCardClosed(cur, closedRes, hooks(my)); } catch (e) { console.warn(e); } setTimeout(() => ui.focusRoll(), 30); }
    try { onboard.onCard(cur, ctl, hooks(my)); } catch (e) { console.warn(e); } // T4 IR-T4-3: in-card coaches (ROI)
  });
}
function closeCard() { if (card) { const c = card; card = null; c.ctl.close(); c.resolve(null); } ui.closeEvent(); }

/* ============================================================ results → juice */
async function applyOut(out, opts = {}) {
  if (!out) return;
  const skipSounds = [...(opts.skipSounds || [])];
  const exits = new Map();
  for (const e of out.effects || []) if (e.type === 'exit') exits.set(e.angelId, e);
  // achievements: progress.js stores + toasts them
  if (out.achievements && out.achievements.length) bus.emit('achievement', { ids: out.achievements.map((a) => a.id), list: out.achievements });
  let sIdx = 0;
  for (const e of out.effects || []) {
    switch (e.type) {
      case 'sound': {
        const i = skipSounds.indexOf(e.name);
        if (i >= 0) { skipSounds.splice(i, 1); break; }
        if (e.name === 'achievement') break; // the achievement toast plays its own fanfare
        const n = e.name; setTimeout(() => sfx(n), sIdx++ * 110);
        break;
      }
      case 'cash':
        if (opts.skipPawnCash && e.at === 'pawn') break;
        if (!(out.spawn && out.spawn.length && e.amount < 0)) scene.floatLabel(e.label || E.sgn(e.amount), e.amount >= 0 ? 'green' : 'red', e.at || 'pawn');
        if (e.amount > 0) ui.flyCoins(scene.project(e.at || 'pawn'), Math.min(10, 4 + Math.round(Math.log10(Math.max(10, e.amount)))));
        break;
      case 'float': scene.floatLabel(e.text, e.color || 'green', e.at || 'pawn'); break;
      case 'loan': ui.bumpCash(); break;
      case 'shake': fxShake(0.4, 520); ui.vibrate([25, 40, 25]); break;
      case 'sparkle': if (!(out.spawn || []).some((x) => (x.key || x.assetId) === e.at)) scene.sparkle(e.at || 'pawn'); ui.vibrate([15, 40, 15]); break; // spawned golden assets sparkle after their drop
      case 'confetti': scene.confetti(); break;
      case 'upgrade': scene.bump(e.assetId); scene.floatLabel('שדרוג!', 'gold', e.assetId); break;
      case 'hedge': scene.shield(e.assetIds); break;
      case 'savings': if (e.amount) scene.floatLabel(`🛟 ${E.sgn(e.amount)}`, e.amount >= 0 ? 'green' : 'gold', 'pawn'); break;
      case 'impact': scene.hearts(scene.hasKey('f') ? 'f' : 'pawn'); scene.floatLabel(`+${Math.round(e.amount * 10) / 10} השפעה`, '#db2777', scene.hasKey('f') ? 'f' : 'pawn'); break;
      case 'exit': break; // handled with despawn
      case 'bizPulse': scene.pulse?.(e.at, e.kind); break; // T5 CR-B1
      default: break;
    }
  }
  // despawns (startup exits launch / fizzle instead of shrinking)
  for (const k of out.despawn || []) { const x = exits.get(k); if (x) scene.launch(k, x.mult > 0); else scene.despawn(k); }
  // spawns
  for (const s of out.spawn || []) { scene.spawn(s.key || s.assetId, s.model, { label: s.label, color: s.color, golden: s.golden }); ui.vibrate(14); }
  syncLevels(true); // T5 CR-B1: stages / upgrades after the city changed
  if (out.lessons && out.lessons.length) {
    bus.emit('lesson', { ids: out.lessons.map((l) => l.id), list: out.lessons });
    ui.lessonToast(out.lessons, (l) => ui.lessonCard(l));
  }
  if (out.reward) bus.emit('reward', out.reward); // quiz: reward = understanding (+1⚡ via the lobby; never in learning mode)
  if (out.dream && out.dream.length && typeof ui.dreamToast === 'function') ui.dreamToast(out.dream, S ? safe0(() => E.metrics(S).dream) : null); // T4 IR-T4-4 (E-7)
  if (out.decision && !opts.noVerdict) ui.verdict(out.decision, { inCard: !!opts.inCard });
  if (out.double && out.double.text) ui.toast('🎲 ' + out.double.text, { kind: 'gold' });
  for (const n of out.news || []) {
    if (n.kind === 'bailout' || n.kind === 'double' || n.kind === 'burnout' || (out.double && n.text === out.double.text)) continue; // own cards / toasts
    if (n.kind === 'headline') { ui.newspaper(n); continue; }
    if (n.kind === 'exit' && n.big) { ui.achievementToast({ label: 'אקזיט!', name: n.name, desc: n.text, sound: 'none' }); continue; }
    if (n.kind === 'business') { // monthly result of a managed business (no top-level text in the engine news)
      if (n.decision) { if (n.text) ui.toast(`🏪 ${n.name ? n.name + ': ' : ''}${n.text}`); continue; }   // T3 verify D2: a decision's outcome (never "undefined")
      if (n.why && typeof ui.bizNews === 'function') { ui.bizNews(n, { decide: () => openInbox({ assetId: n.assetId }) }); continue; }   // T3 UI-4
      ui.toast(`🏪 ${n.name}: ${n.headline || ''}${n.net ? ` · לכיס שלך ${E.sgn(n.net)}` : ''}`, { kind: n.netProfit < 0 ? 'bad' : '' });
      for (const ev2 of (n.events || []).slice(0, 1)) if (ev2.title) ui.toast(`🏪 ${ev2.title}${ev2.text ? ': ' + ev2.text : ''}`);
      continue;
    }
    if (n.kind === 'rival' && out.rival && out.rival.lost && n.text === out.rival.text) continue;   // T6: the lost panel says it (no second, sticky copy)
    if (n.kind === 'inflation' && n.reality && S && S.ui) S.ui.inflReality = n.reality;
    if (n.kind === 'goalHold') { ui.toast('⏳ ' + n.text, { kind: 'gold' }); continue; }
    if (n.kind === 'goal') { ui.toast('🎯 ' + n.text, { kind: 'gold' }); continue; } // T4 IR-T4-4: tutorial goal chain (E-4)
    if (n.kind === 'econ') { ui.toast(`📰 ${n.text}${n.label ? ` · מד הכלכלה: ${n.label}` : ''}`); continue; }   // T2 cycle headline
    if (n.kind === 'focus') { ui.toast('🎯 ' + n.text, { kind: n.disabled ? 'bad' : '' }); continue; }
    if (n.kind === 'dd') { ui.toast('🔎 ' + n.text, { kind: n.repair > 0 || n.surprise ? 'bad' : '' }); continue; }
    if (n.kind === 'rival') { ui.stickyNews?.(n.text); continue; }   // T6 §12.1: stays until tapped or the next roll
    // playtest B4: the outcome of the player's own odds choice (job search, rent negotiation, ask for a raise…) is never dropped by the
    // toast cap and is read out — it is the answer to "what happened?"
    if (n.kind === 'story') { ui.toast('📖 ' + n.text, { keep: true, ms: 4200 }); ui.announce?.(n.text); continue; }
    ui.toast(n.text, { kind: n.kind === 'exit' ? (n.mult >= 1 ? 'gold' : 'bad') : '' });
  }
  if (out.mentor) ui.mentor(out.mentor);
  if (out.toast) ui.toast(out.toast, { kind: 'bad' });
}

/* ============================================================ burnout */
async function burnoutCard(b) {
  sfx('loss'); fxShake(0.25, 450); ui.vibrate([20, 40, 20]);
  await ui.modal({ tag: 'שחיקה', color: '#b45309', title: b.title || 'נשרפת. חודש בבית.', html: `<div class="say static"><span class="av sm" aria-hidden="true">אע</span><span class="st">${ui.esc(b.mentor || 'הזמן והכוח שלך הם הנכס הכי יקר. כשרצים בלי עצירה — הגוף עוצר בשבילך.')}</span></div>
    <p class="d">${ui.esc(b.text || 'עבדת יותר מדי בלי מנוחה. החודש אין משכורת, יש הוצאות רפואיות, והתוכנית שלך עוברת למנוחה.')}</p>
    ${b.cost ? `<div class="grid"><div class="row"><span>עלות החודש הזה</span><b class="num neg">${E.fmtM(-Math.abs(b.cost))}</b></div></div>` : ''}
    <p class="note">🔋 בפעם הבאה: כשהכוח יורד מתחת ל־40 — חודש של מנוחה ומשפחה זול יותר מחודש של שחיקה.</p>`, actions: [{ label: 'הבנתי, נוח קצת', cls: 'primary' }] });
}

/* ============================================================ bail-out (first bankruptcy → the bank restructures; a teaching moment) */
async function bailoutCard(b) {
  sfx('loss'); fxShake(0.3, 500); ui.vibrate([30, 50, 30]);
  if (b.mentor) ui.mentor(b.mentor);
  const E2 = E; const leaks = (b.leaks || []).filter((l) => l.amount > 0).slice(0, 4);
  const html = `${b.mentor ? `<div class="say static"><span class="av sm" aria-hidden="true">אע</span><span class="st">${ui.esc(b.mentor)}</span></div>` : ''}
    <p class="d">${ui.esc(b.text || '')}</p>
    <div class="grid">${(b.sold || []).length ? `<div class="row"><span>נמכרו (נכסים שהפסידו כסף)</span><span>${b.sold.map(ui.esc).join(', ')}</span></div>` : ''}
    ${b.creditFolded ? `<div class="row"><span>חוב האשראי הועבר להלוואה זולה יותר</span><span class="num">${E2.fmtM(b.creditFolded)}</span></div>` : ''}
    ${b.writtenOff ? `<div class="row"><span>הבנק מחק לך חוב</span><b class="num pos">${E2.fmtM(b.writtenOff)}</b></div>` : ''}</div>
    ${leaks.length ? `<h3 class="lk">לאן הכסף דלף</h3><div class="grid">${leaks.map((l) => `<div class="row"><span>${ui.esc(l.label)}</span><span class="num neg">${E2.fmtM(l.amount)}</span></div>`).join('')}</div>` : ''}
    <p class="note">זה קורה רק פעם אחת במשחק. מעכשיו התזרים שלך לא שלילי — ${ui.gw('תשמור', 'תשמרי')} עליו ככה.</p>`;
  await ui.modal({ tag: 'הבנק נכנס לתמונה', color: '#3b3f4e', title: b.title || 'הבנק עשה לך ארגון מחדש', html, actions: [{ label: 'הבנתי, ממשיכים', cls: 'primary' }] });
}

/* ============================================================ sheet actions (loans / credit) */
function sheetAction(act) {
  try { sheetBody(act); } catch (e) { if (!stuck) enterStuck(e, 'sheet'); }
}
function sheetBody(act) {
  if (!S || S.over || busy || ui.isEventOpen()) { if (busy) ui.toast('רגע, החייל עוד זז'); return; }
  if (act === 'invest') { indexModal(); return; }
  if (act === 'save' || act === 'unsave') { savingsModal(act === 'save'); return; }
  if (act === 'report') {
    if (typeof E.setSideReport !== 'function') return;
    Promise.resolve(mut('setSideReport', true)).then((o) => {
      if (o && o.ok === false) { ui.toast(o.error || 'לא אפשרי עכשיו'); return; }
      applyOut(o); render(); persist(); checkpoint(); ui.toast('🧾 נפתח תיק: מעכשיו מקדמות כל חודש');
    }).catch((e) => console.error(e));
    return;
  }
  if ((act === 'loan' || act === 'repay' || act === 'credit') && typeof E.impactFor === 'function') { loanWithImpact(act); return; }
  doLoan(act);
}
/** T2 §15.7: HUD money actions show the impact panel (act:* refs) before they happen. */
async function loanWithImpact(act) {
  const ref = act === 'loan' ? 'act:loan' : act === 'repay' ? 'act:repay' : 'act:payCredit';
  let I = null; try { I = E.impactFor(S, ref); } catch (e) { I = null; }
  if (!I) { doLoan(act); return; }
  const m = E.metrics(S);
  const title = act === 'loan' ? `לקחת הלוואה ${E.fmtM(m.loanUnit)}?` : act === 'repay' ? `להחזיר ${E.fmtM(m.loanUnit)} מההלוואה?` : 'לסגור את חוב האשראי?';
  const v = await ui.modal({ tag: 'מה זה עושה לי?', color: '#2459b8', title, html: `<div class="imp-body">${ui.impactHtml(I)}</div>`,
    actions: [{ label: act === 'loan' ? 'לקחת' : act === 'repay' ? 'להחזיר' : 'לסגור', cls: 'primary', v: 'go' }, { label: 'ביטול', v: null }], dismissable: true });
  if (v !== 'go' || !S || S.over || busy || ui.isEventOpen()) return;
  try { doLoan(act); } catch (e) { if (!stuck) enterStuck(e, 'sheet'); }
}
async function doLoan(act) {
  let out;
  try { out = act === 'loan' ? await mut('takeLoan') : act === 'repay' ? await mut('repayLoan') : act === 'credit' ? await mut('payCredit') : null; }
  catch (e) { console.error(e); return; }
  if (!out) return;
  if (out.ok === false) { ui.toast(out.error); sfx('loss'); return; }
  applyOut(out);
  render(); persist(); checkpoint();
  if (out.end) { ui.toggleSheet(false); const my = gen; busy = true; ui.setRollEnabled(false); endGame(out.end, my).catch((e) => { if (my === gen && !stuck) enterStuck(e, 'end'); }); }
}

/* ============================================================ wave 3a (J1 P0-4): the money hub — a menu over the existing actions */
async function openMoneyHub() {
  if (!S || S.over || summarized) return;
  if (busy || ui.isEventOpen() || !$('#gm').hidden) { ui.toast(busy ? 'רגע, החייל עוד זז' : 'אפשר לנהל את הכסף בין תורות'); return; }
  const H = moneyHubModel(E.metrics(S));
  // past the ★ limit of a free run: "לסכם את הריצה" is here too (on phones the HUD has no room for the 🏁 button)
  if (canSummarize()) H.rows.push({ id: 'sum', icon: '🏁', title: 'הריצה', value: `עבר מועד הכוכבים (חודש ${S.maxMonths})`, acts: [{ act: 'summarize', label: 'לסכם את הריצה', on: true }] });
  const act = await ui.moneyHub?.(H);
  if (!act || !S || S.over || busy || ui.isEventOpen()) return;
  if (act === 'summarize') { summarizeRun(false); return; }
  if (act === 'plan' || act === 'focus') { lifeChip(act); return; }
  sheetAction(act);   // save / unsave / loan / repay / credit / invest — the same flows as the report's buttons
}

/* ============================================================ index fund any time (E.invest / E.setAutoInvest) */
async function indexModal() {
  if (typeof E.invest !== 'function') { ui.toast('אפשר להשקיע בקרן במשבצת "קרן מדד ופנסיה"'); return; }
  const m = E.metrics(S); const ix = m.index || {}; const price = ix.price || 100;
  let qty = 0, auto = (m.index && m.index.autoInvest) || 0;
  const maxBuy = ix.maxBuy ?? Math.floor(Math.max(0, S.cash) / price), maxSell = ix.qty || 0; // input limit only — the engine validates
  const v = await ui.modal({ tag: 'קרן מחקה מדד', color: '#0f766e', title: 'להשקיע בקרן מדד',
    html: `<p class="d">מחיר יחידה ${ui.esc(E.fmtP(price))}. יש לך ${maxSell} יחידות. מזומן ${ui.esc(E.fmtM(S.cash))}.</p>
      <label class="note" for="ixq">כמות (+ קנייה, − מכירה)</label><input id="ixq" type="number" inputmode="numeric" dir="ltr" value="${Math.min(10, maxBuy)}" min="${-maxSell}" max="${maxBuy}">
      ${typeof E.setAutoInvest === 'function' ? `<label class="note" for="ixa" style="display:block;margin-top:10px">הוראת קבע חודשית לקרן (₪, 0 = בלי)</label><input id="ixa" type="number" inputmode="numeric" dir="ltr" step="100" min="0" value="${auto}">` : ''}
      <p class="note">על רווח במכירה משלמים מס רווחי הון (במשחק 25% מכל הרווח; במציאות 25% מהרווח הריאלי, אחרי אינפלציה). הוראת קבע = השקעה אוטומטית בכל יום משכורת — הדרך הכי פשוטה לתת לזמן לעבוד.</p>
      ${ui.indexBox ? ui.indexBox(ix) : ''}<p class="err" id="ixe"></p>`,
    actions: [{ label: 'לבצע', cls: 'primary', v: 'go', fn: () => { qty = Math.trunc(+document.getElementById('ixq').value || 0); const a = document.getElementById('ixa'); if (a) auto = Math.max(0, Math.round(+a.value || 0)); if (qty > maxBuy || -qty > maxSell) { document.getElementById('ixe').textContent = 'הכמות לא אפשרית'; return false; } } }, { label: 'ביטול', v: null }], dismissable: true });
  if (v !== 'go') return;
  try {
    if (qty) { const out = await mut('invest', qty > 0 ? 'buy' : 'sell', Math.abs(qty)); if (out && out.ok === false) { ui.toast(out.error || 'לא אפשרי'); } else if (out) await applyOut(out); }
    if (typeof E.setAutoInvest === 'function' && auto !== ((m.index && m.index.autoInvest) || 0)) { const o2 = await mut('setAutoInvest', auto); if (o2 && o2.mentor) ui.mentor(o2.mentor); ui.toast(auto ? `הוראת קבע: ${E.fmtM(auto)} בחודש לקרן` : 'הוראת הקבע בוטלה'); }
  } catch (e) { console.error(e); ui.toast('לא אפשרי עכשיו'); }
  render(); persist(); checkpoint();
}

/* ============================================================ 🛟 emergency fund any time (E.moveSavings) */
async function savingsModal(deposit) {
  if (typeof E.moveSavings !== 'function') return;
  const m = E.metrics(S); const e = m.emergency || { months: 0, target: 3, balance: 0 };
  const max = deposit ? Math.max(0, Math.floor(S.cash)) : Math.max(0, Math.floor(m.savings || 0)); // input limit only — the engine validates
  // suggestion: fill up to the target, keep one month of expenses in cash (the engine's own payday rule is the same idea)
  const sug = deposit ? Math.max(0, Math.min(max, Math.round((e.target * m.expenses - (m.savings || 0)) / 100) * 100, Math.floor((S.cash - m.expenses) / 100) * 100)) : Math.min(max, Math.round(m.expenses / 100) * 100);
  let amt = 0;
  const v = await ui.modal({ tag: 'קרן חירום', color: '#0e7490', title: deposit ? 'להפקיד לקרן החירום' : 'למשוך מקרן החירום',
    html: `<p class="d">${ui.esc(e.text || '')}. ${deposit ? 'כסף בקרן לא משמש לקניות — הוא שם בשביל ההפתעות.' : 'משיכה מהקרן מקטינה את הכרית שלך.'}</p>
      <label class="note" for="svq">סכום (₪) — עד ${ui.esc(E.fmtM(max))}</label><input id="svq" type="number" inputmode="numeric" dir="ltr" step="100" min="0" max="${max}" value="${sug > 0 ? sug : Math.min(max, 1000)}"><p class="err" id="sve"></p>`,
    actions: [{ label: deposit ? 'להפקיד' : 'למשוך', cls: 'primary', v: 'go', fn: () => { amt = Math.round(+document.getElementById('svq').value || 0); if (amt <= 0 || amt > max) { document.getElementById('sve').textContent = 'הסכום לא אפשרי'; return false; } } }, { label: 'ביטול', v: null }], dismissable: true });
  if (v !== 'go' || !amt) return;
  let out; try { out = await mut('moveSavings', deposit ? amt : -amt); } catch (e2) { console.error(e2); ui.toast('לא אפשרי עכשיו'); return; }
  if (out && out.ok === false) { ui.toast(out.error || 'לא אפשרי'); return; }
  await applyOut(out); render(); persist(); checkpoint();
}

/* ============================================================ lobby button */
/**
 * Save and show the lobby. The game keeps living underneath the #start overlay (the roll is blocked while it is
 * visible; an open card waits behind it), so the lobby can resume by simply hiding #start — or call startGame()
 * for another game (which aborts this flow via `gen`).
 */
function goLobby() {
  persist();
  ui.hideCoach(); onboard.hidePractice(); ui.toggleSheet(false); // IR-T4-9
  bus.emit('lobby:open', D && CFG && CFG.room ? { k: 'room', id: CFG.room } : {});   // wave 3b: back to the room screen
}

/* ============================================================ T6: ghosts, practice rewind, after the win (spec §2, §7, §9) */
function t6Start() {
  try { if (E.RIVALS) ui.setPersonas?.(E.RIVALS); } catch (e) { /* ignore */ }
  try { if (S && !S.over && !D) ghosts.start(S); else ghosts.stop(); } catch (e) { console.warn('ghosts', e); }
  const br = S && S.ui && S.ui.branch;
  ui.branchBanner?.(br ? { back: () => backToOrigin(), compare: () => openCompare() } : null);
}
function t6Hud() {
  if (!S || S.over) return null;
  const aw = S.afterWin ? { n: Math.max(0, (S.month | 0) - (S.afterWin.m | 0)) } : null;
  return { rivals: ghosts.enabledFor(S) && ghosts.status().state !== 'unavailable', moments: !!(CFG && rewind.allowed(CFG)), afterWin: aw && flagFor('afterwin', CFG) ? aw : null };
}
function rivalsData() {
  const m = E.metrics(S); const parts = m.goalParts || [];
  const pct = Math.max(0, Math.min(100, Math.floor((parts.length ? Math.min(...parts.map((p) => p.progress)) : m.goalProgress || 0) * 100)));
  return { me: { nw: m.netWorth, pas: m.passive, pct }, view: ghosts.view(S.month), personas: ghosts.personas(), lost: m.rivals && m.rivals.deals, month: S.month };
}
function openRivals() { if (!S || S.over) return; sfx('click'); ui.rivalsPanel(rivalsData()); }
bus.on('ghosts:update', () => { if (S && !S.over && ui.rivalsPanelOpen?.()) ui.rivalsPanelUpdate(rivalsData()); });
bus.on('ghosts:state', () => { if (S && !S.over) { try { render(false); } catch (e) { /* ignore */ } } });
/** in-game "רגעי החלטה" (free / learn only) */
async function openMoments() {
  if (!S || S.over || !CFG || !rewind.allowed(CFG)) return;
  if (busy || ui.isEventOpen()) { ui.toast('אפשר לחזור לרגע של החלטה בין תורות'); return; }
  sfx('click');
  const k0 = await ui.momentsSheet(rewind.decisionPoints(S));
  if (k0 == null || !S || S.over) return;
  for (let i = 0; i < 40 && busy; i++) await new Promise((r) => setTimeout(r, 100));   // a flow that was finishing under the sheet
  if (busy) { ui.toast('אפשר לחזור לרגע של החלטה בין תורות'); return; }
  await branchFrom({ origin: 'live', k0 });
}
/** create a branch and start it. origin 'live' = this game (saved first), 'last' = rr2-last-game. Never ranked (rewind.js throws). */
export async function branchFrom({ origin = 'live', k0 }) {
  try {
    if (origin === 'live') { if (!S || !CFG || !rewind.allowed(CFG)) throw new Error('rewind_ranked'); persist(); }
    else if (!flag('rewind')) return false;
    const confirmReplace = async () => { ui.hideLoading(); const ok = await ui.confirmBox(rewind.STR.replaceQ, { yes: rewind.STR.replace, no: rewind.STR.cancel }); if (ok) ui.showLoading(rewind.STR.overlay); return ok; };
    ui.showLoading(rewind.STR.overlay);
    await new Promise((r) => setTimeout(r, 30));   // paint the overlay before the replay
    const r = await rewind.createBranch(origin === 'live' ? { origin, w: S.worldId, k0, originKey: saveKeyFor(CFG), cfg: CFG } : { origin: 'last', k0 }, { confirmReplace });
    ui.hideLoading();
    window.__t6branchErr = r.ok ? null : r.error;   // read by tests/t6_e2e.py
    if (!r.ok) { if (r.error !== 'cancelled') ui.toast(r.error === 'quota' ? rewind.STR.errQuota : rewind.STR.errFail, { kind: 'bad' }); return false; }
    window.__t6branchMs = r.ms;
    return startGame(r.cfg);
  } catch (e) { ui.hideLoading(); console.warn('rewind', e); window.__t6branchErr = String(e && e.message); ui.toast(rewind.STR.errFail, { kind: 'bad' }); return false; }
}
bus.on('t6:rewind', ({ k0, origin = 'last' } = {}) => { branchFrom({ origin, k0: +k0 }); });
bus.on('t6:moments', async ({ origin = 'last' } = {}) => {
  const L = origin === 'last' ? rewind.lastGame() : null; if (!L || !flag('rewind')) return;
  let st = null; try { st = E.replay(L.rcfg, L.actions); } catch (e) { st = null; }
  if (!st) { ui.toast(rewind.STR.errFail, { kind: 'bad' }); return; }
  const k0 = await ui.momentsSheet(rewind.decisionPoints(st));
  if (k0 != null) branchFrom({ origin: 'last', k0 });
});
function backToOrigin() {
  const b = S && S.ui && S.ui.branch; if (!b) return;
  persist();
  const sv = b.origin === 'live' ? savedGame(b.originKey) : null;
  if (sv && sv.cfg) startGame({ ...sv.cfg, resume: true }); else goLobby();
}
function openCompare() {
  const d = S ? rewind.compareData(S) : null;
  // T6 review M2: the original changed or is gone. The answer to a tap goes to the FRONT of the toast queue (urgent): behind a new branch's
  // first-month toasts (focus, turbo, library) it waited > 15 s — the t6_e2e rewind failure after the branch-from-the-oldest-decision fix
  if (!d || !d.originTl) { ui.toast('המשחק המקורי כבר לא זמין להשוואה', { urgent: true }); return; }
  ui.compareSheet({ branchTl: tlOf(S), originTl: d.originTl, month: S.month });
}
/** T6 §9.2: keep living after the win (engine W) — only when the engine exports it and the flag is on (free / learn) */
bus.on('game:afterwin', () => {
  if (!S || S.over !== 'won' || !CFG || typeof E.continueAfterWin !== 'function' || !flagFor('afterwin', CFG)) return;
  let r; try { r = E.continueAfterWin(S); } catch (e) { r = { ok: false, error: e.message }; }
  if (!r || r.ok === false) { ui.toast((r && r.error) || 'לא אפשרי עכשיו'); return; }
  persist();
  startGame({ ...CFG, resume: true });
});
async function retireFlow() {
  if (!S || S.over || !S.afterWin || typeof E.retire !== 'function') return;
  if (busy || ui.isEventOpen()) { ui.toast('אפשר לפרוש בין תורות'); return; }
  const ok = await ui.confirmBox('לסיים כאן ולראות מה החופש נתן לך?', { yes: 'לסיים', no: 'להמשיך לשחק' });
  if (!ok || !S || S.over || busy) return;
  let r; try { r = E.retire(S); } catch (e) { r = null; }
  if (!r || r.ok === false || !r.end) { ui.toast('לא אפשרי עכשיו'); return; }
  persist(); const my = gen; busy = true; ui.setRollEnabled(false);
  endGame(r.end, my).catch((e) => { if (my === gen && !stuck) enterStuck(e, 'end'); });
}
/** director decision 5: the branch end compares with its original — {orig, branch} each {months, status, stars, nw, q, luck, done}.
 *  The original comes from rewind.compareData (null when its M2 identity no longer matches): a finished original (rr2-last-game)
 *  brings its own end numbers (stored by cmpSide); a live one (learning slot, still playing) is shown at the branch's month. */
const luckOf = (L) => { const x = L && L.luck; const v = x && typeof x === 'object' ? x.total : x; return Number.isFinite(+v) ? Math.round(+v) : null; };
function cmpSide(end) { const L = end && end.learning; return { nw: end && Number.isFinite(+end.netWorth) ? Math.round(+end.netWorth) : null, q: L && Number.isFinite(+L.decisionQuality) ? Math.round(+L.decisionQuality) : null, luck: luckOf(L) }; }
function branchCmp(d, end) {
  if (!d || !end) return null;
  const branch = { months: end.months, status: end.status, stars: end.stars || 0, ...cmpSide(end), done: true };
  const tl = d.originTl; const nwAt = (m) => { if (!tl || !Array.isArray(tl.m) || !Array.isArray(tl.nw)) return null; let v = null; for (let i = 0; i < tl.m.length; i++) if (tl.m[i] <= m) v = tl.nw[i]; return v == null ? null : Math.round(v); };
  const L = d.endLite;
  const orig = L && L.months != null ? { months: L.months, status: L.status, stars: L.stars || 0, nw: L.nw ?? nwAt(L.months), q: L.q ?? null, luck: L.luck ?? null, done: true }
    : { months: d.upTo, status: null, stars: null, nw: nwAt(d.upTo), q: null, luck: null, done: false };
  return { orig, branch };
}
/** end-of-game T6 data for the lobby: timeline, the five dimensions, ghost state, rewind / after-win gates; rr2-last-game */
function t6End(end) {
  const out = { tl: null, dims: null, rivals: 'off', rewindAllowed: false, afterwinAllowed: false, branchTl: null };
  try {
    const m = E.metrics(S);
    if (!S.tl) { if (!(S.ui.tl && Array.isArray(S.ui.tl.m))) S.ui.tl = tlNew(m.month); tlPush(S.ui.tl, tlRowOf(m)); }   // the graph ends where the game ended
    out.tl = tlOf(S);
    out.dims = dimsOf(end, { m, tl: out.tl, worldId: S.worldId, charId: S.charId });
    const branch = !!(S.ui && S.ui.branch);
    // T6 review nit: the END gate is RW.endAllowed (free and learning games; the lobby uses the same rule), not the live gate
    // RW.allowed (learning games only); a branch's end never offers a rewind (its log is not the last game)
    out.rewindAllowed = !branch && rewind.endAllowed(CFG);
    out.afterwinAllowed = end.status === 'won' && !S.afterWin && !end.afterWin && typeof E.continueAfterWin === 'function' && flagFor('afterwin', CFG) && CFG.mode === 'free';
    if (ghosts.enabledFor(S)) { ghosts.finish(S); const st0 = ghosts.status().state; out.rivals = st0 === 'unavailable' ? 'off' : 'pending'; out.ghostsKey = ghosts.status().key; }
    if (branch) { const d = rewind.compareData(S); out.branchTl = d && d.originTl; out.branchCmp = branchCmp(d, end); }
    else if (out.rewindAllowed) out.lastSaved = rewind.saveLastGame({ cfg: CFG, state: S, endLite: { ...endLite(end, out), ...cmpSide(end) }, ghostsKey: out.ghostsKey || null });
    persist();
  } catch (e) { console.warn('t6 end', e); }
  return out;
}

/* ============================================================ wave 3a (J1 P0-1, brief §17): summarise a free run after the ★ limit */
// In a free game nothing happens at the month limit (engine checkEnd ends on time only outside free mode), so a losing run never
// reached the end screen: 18–34 more months without a decision that changes the outcome, or a new game that deletes the save (no
// summary, no "רגעי החלטה"). Once the ★ limit (S.maxMonths) passes, the player may end the run here: E.endNow(S) (pure, the
// engine's own 'capped' result: recap, graph, learning — state untouched) goes through the normal endGame path, so the end screen,
// the summary and rr2-last-game (rewind) are the usual ones. Nothing new in the save: "offered once" lives in rr2-sum-offered.
let summarized = false;
const SUM_KEY = 'rr2-sum-offered';
/** the ★ limit shown in the HUD in a free game with stars ("★ עד חודש N"); 0 elsewhere (ranked shows month / max already) */
function starLimit() { return S && S.mode === 'free' && !S.afterWin && !(CFG && CFG.learn) && S.worldId !== 'h' && S.maxMonths > 0 ? S.maxMonths : 0; }
function canSummarize() { return !!(S && !S.over && !summarized && CFG && !CFG.resultId && CFG.slot !== 'branch' && starLimit() && S.month > S.maxMonths && typeof E.endNow === 'function'); }
const runId = () => `${S.worldId}|${S.charId}|${S.seed >>> 0}`;
function offeredRuns() { try { const v = JSON.parse(localStorage.getItem(SUM_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function markOffered() { try { const v = offeredRuns().filter((x) => x !== runId()); v.push(runId()); localStorage.setItem(SUM_KEY, JSON.stringify(v.slice(-30))); } catch (e) { /* storage full / blocked: offered again next time */ } }
/** after a turn: the one-time offer (true when the run was summarised — the caller stops) */
async function offerSummary(my) {
  if (!canSummarize() || offeredRuns().includes(runId()) || ui.isEventOpen() || !$('#gm').hidden) return false;
  markOffered();
  const v = await ui.summaryOffer?.({ limit: S.maxMonths, month: S.month, gender: S.gender });
  if (my !== gen || !S) return true;
  if (v === 'sum') { await summarizeRun(true); return true; }
  return false;
}
async function summarizeRun(confirmed = false) {
  if (!canSummarize()) return;
  if (busy || ui.isEventOpen()) { ui.toast('אפשר לסכם את הריצה בין תורות'); return; }
  if (!confirmed) {
    const v = await ui.summaryOffer?.({ limit: S.maxMonths, month: S.month, gender: S.gender });
    if (v !== 'sum' || !canSummarize() || busy || ui.isEventOpen()) return;
  }
  let end = null; try { end = E.endNow(S); } catch (e) { console.warn('endNow', e); }
  if (!end) { ui.toast('לא אפשרי עכשיו'); return; }
  summarized = true; ui.sumRunBtn?.(false);
  persist(); const my = gen; busy = true; ui.setRollEnabled(false);
  await endGame(end, my).catch((e) => { if (my === gen && !stuck) enterStuck(e, 'end'); });
}

/* ============================================================ end of game */
const safe0 = (fn) => { try { return fn(); } catch (e) { return null; } };
async function endGame(end, my) {
  busy = true; ui.setRollEnabled(false); closeCard(); ui.hideCoach(); onboard.hidePractice(); // IR-T4-9
  const win = end.status === 'won';
  if (win) ui.vibrate([30, 60, 30, 60, 80]);
  await scene.celebrate(win);
  if (my !== gen) return;
  if (D && CFG && CFG.room) { busy = false; bus.emit('lobby:open', { k: 'room', id: CFG.room }); return; }   // wave 3b: the room's results are server-ranked
  // T6 §6.1: with the new summary (flag recap2) the life story is a section of the end screen, not an overlay
  if (end.lifeSummary && !flag('recap2')) { await ui.lifeStory(end.lifeSummary, { won: win }); if (my !== gen) return; }
  await pause(win ? 350 : 250);
  persist();
  const t6 = t6End(end);
  settings.games = (settings.games || 0) + 1; writeSettings({ games: settings.games });
  const payload = {
    status: end.status, stars: end.stars || 0, months: end.months, netWorth: end.netWorth, passive: end.passive, expenses: end.expenses,
    progress: end.progress, worldId: S.worldId, charId: S.charId, mode: CFG.mode, resultId: CFG.resultId || null,
    challengeId: CFG.challengeId || null, groupId: CFG.groupId || null, title: CFG.title || '', end, stats: S.stats ? { ...S.stats } : null,
    achievements: (S.ach || []).slice(),
    summary: typeof E.summaryForServer === 'function' ? { seed: S.seed, ...E.summaryForServer(S) } : null,
    bailoutUsed: !!(S.flags && S.flags.bailoutUsed),
    lifeSummary: end.lifeSummary || null, benchmark: end.benchmark || null, scenarioId: (S.history && S.history.scenarioId) || CFG.scenarioId || null, seed: S.seed >>> 0,
    learn: !!CFG.learn, dream: S.dream ? safe0(() => E.metrics(S).dream) : null, // T4 IR-T4-5
    t6, saveKey: saveKeyFor(CFG), branch: !!(S.ui && S.ui.branch), afterWin: end.afterWin || null,   // T6 (lobby: end summary, which slot to clear)
  };
  busy = false;
  bus.emit('game:end', payload);
  if (!hasLobby()) attachEndAnalysis(end, my);   // the lobby's renderEnd calls ui.endAnalysisHtml itself (T6 brief); main.js fallback too
}
const hasLobby = () => !!document.querySelector('#start .lb-shell, #lobby-root .lb-shell') || !!window.__rrLobby;
/** T2 §15.9: the "ניתוח" block (ui.endAnalysisHtml — learning review, hints, luck parts, claimed vs actual, the real cycle path)
 *  goes into the lobby's end card, which the lobby lane renders (and may re-render). Stops at the next game.
 *  CR for the lobby lane: call ui.endAnalysisHtml(e.end) inside renderEnd instead (then this observer finds it present). */
let endObs = null;
function attachEndAnalysis(end, my) {
  if (endObs) { endObs.disconnect(); endObs = null; }
  if (typeof ui.endAnalysisHtml !== 'function') return;
  const html = ui.endAnalysisHtml(end); const start = $('#start'); if (!html || !start) return;
  const put = () => {
    if (my !== gen) { if (endObs) { endObs.disconnect(); endObs = null; } return; }
    const card = start.querySelector('.lb-end .end-card') || start.querySelector('.fb.end'); if (!card || card.querySelector('.end-analysis')) return;
    const at = card.querySelector('.end-learn') || card.querySelector('.end-stats');
    if (at) at.insertAdjacentHTML('afterend', html); else (card.querySelector('.end-new, .end-lesson, .acts') || card.lastElementChild)?.insertAdjacentHTML('beforebegin', html);
  };
  endObs = new MutationObserver(put); endObs.observe(start, { childList: true, subtree: true });
  put();
}

