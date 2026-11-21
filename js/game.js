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
import { flag } from './flags.js';
import * as saves from './saves.js';
import { initMotion, reducedMotion } from './motion.js';
import * as onboard from './onboard.js';   // T4 IR-T4-3: tutorial / world coaches, tour, practice chip
import { assetInfo } from './render/assetinfo.js';          // T5 CR-B2: data behind a tapped city item (reads metrics only)
import { CHAR_STYLE, CHAR_FALLBACK } from './render/vocab.js'; // T5 CR-B5: the pawn's ring colour per character
import { suspendAudio, resumeAudio } from './audio.js';      // T5 CR-B7

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
  if (v === 'R3') OV.showRecover({ title: STR.R3t, body: STR.R3b, actions: [{ label: STR.Rlite, primary: true, fn: () => recover({ lite: true }) }, { label: STR.R3d, fn: () => reloadInto3D() }, lobby] });
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
  if ((cfg.mode === 'free' || !cfg.mode) && cfg.learn) return `rr2-save-learn-${cfg.worldId || 'w1'}`; // T4 IR-T4-1: learning mode's own slot
  if (cfg.mode === 'free' || !cfg.mode) return `rr2-save-free-${cfg.worldId || 'w1'}`;
  if (cfg.mode === 'history') return cfg.scenarioId ? `rr2-save-history-${cfg.scenarioId}` : `rr2-save-history-seed-${cfg.seed >>> 0}`;
  if (cfg.resultId) return `rr2-save-${cfg.resultId}`;
  return `rr2-save-${cfg.mode}-${cfg.worldId || 'w1'}-${cfg.seed >>> 0}`;
}
const keyOf = (k) => (typeof k === 'string' ? k : saveKeyFor(k));
let quotaWarned = false;
function persist() {
  if (!S || !CFG) return;
  const r = saves.write(saveKeyFor(CFG), CFG, S);
  // full (quota) or blocked storage (SecurityError, review m-2): tell the player once per game; a refused future-save
  // overwrite is not a storage failure (the future save is kept on purpose)
  if (!r.ok && !r.future && !quotaWarned) { quotaWarned = true; toastWhenIdle(r.quota ? SS.S7 : SS.S7b, { kind: 'bad', ms: 8000 }); }
}
/** ui.js keeps only the newest 4 queued toasts: hand an important one over when the toast pill has been idle twice in a row */
function toastWhenIdle(text, opts, tries = 0) {
  const idle = () => { const t = $('#toast'); return !t || !t.className.includes('on'); };
  if (tries >= 60 || (idle() && tries > 0)) { ui.toast(text, opts); return; }
  setTimeout(() => (idle() ? setTimeout(() => (idle() ? ui.toast(text, opts) : toastWhenIdle(text, opts, tries + 1)), 350) : toastWhenIdle(text, opts, tries + 1)), 500);
}

/* ============================================================ ranked server checkpoint (anti-replay) */
// After every landing (the drawn card is then on the server) and every decision we push the whole state with a
// monotonic counter S.ui.seq (saved with the state, never decreases). One request in flight; the newest state wins.
// 'stale_checkpoint' (the server already has a newer one) is ignored; network errors retry later.
let ckBusy = false, ckNext = null, ckTimer = 0;
const ranked = () => !!(CFG && CFG.resultId && CFG.mode && CFG.mode !== 'free' && (!net.hasMe || net.hasMe()));
function checkpoint() {
  if (!S || !ranked()) return;
  S.ui.seq = (S.ui.seq || 0) + 1;
  persist();
  ckNext = { rid: CFG.resultId, seq: S.ui.seq, state: JSON.parse(JSON.stringify(S)) };
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
    else if (!code) retry = true; // network / no answer
    else console.warn('checkpoint rejected', code);
  }
  ckBusy = false;
  if (retry && !ckNext) { ckNext = job; clearTimeout(ckTimer); ckTimer = setTimeout(pumpCheckpoint, 8000); return; }
  if (ckNext) pumpCheckpoint();
}
addEventListener('online', () => pumpCheckpoint());
/** Saved unfinished game for a key (or cfg) → {cfg, month, worldId, charName, future?} | null. */
export function savedGame(k) {
  const c = saves.peek(keyOf(k));
  if (c.status !== 'current' && c.status !== 'old' && c.status !== 'future') return null;
  const out = { cfg: c.wrapper.cfg, month: c.state.month, worldId: c.state.worldId, charName: c.state.charName };
  if (c.status === 'future') out.future = true; // the lobby still offers "להמשיך"; startGame explains (S-S1)
  return out;
}
export function clearSave(k) { saves.clear(keyOf(k)); }
export function hasActiveGame() { return !!(S && !S.over); }
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
  rendererInfo = { kind: r.kind, reason: r.reason };
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
  const { kind, reason } = rendererInfo;
  if (kind === 'none') { noticeDone = true; ui.toast(STR.N5, { ms: 6000 }); return; }
  if (kind === '2d') {
    noticeDone = true;
    if (reason === 'no-webgl') ui.toast(STR.N1, { ms: 6000 });
    else if (reason === 'three-failed' || reason === 'three-timeout') ui.toast(STR.N2, { ms: 6000, action: { label: STR.N2a, fn: () => reloadInto3D() } });
    else if (reason === 'webgl-init-failed') ui.toast(STR.N3, { ms: 6000 });
    return;
  }
  let failed = [];
  try { failed = scene.failedModels(); } catch (e) { failed = []; }
  if (failed.length) { noticeDone = true; ui.toast(STR.N6, { ms: 6000 }); return; }
  if (scene.lowPower && !settings.liteOffered && flag('board2d') !== 'off') {
    noticeDone = true; settings.liteOffered = true; writeSettings({ liteOffered: true });
    ui.toast(STR.N7, { ms: 6000, action: { label: STR.N7a, fn: () => setLite(true) } });
  }
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
  $('#roll').onclick = () => { unlock(); ui.hideCoach(); turn(); };
  wireHold();
  $('#hLife').onclick = (e) => { const b = e.target.closest('[data-life]'); if (!b || !S) return; sfx('click'); lifeChip(b.dataset.life); };
  $('#hEnergy').onclick = async () => { const en = await energyMod(); if (en) showNoEnergy(en, true); };
  bus.on('energy:change', () => updateRollEnergy());
  setInterval(() => { if (!document.hidden && S && usesEnergy() && $('#start').hidden) updateRollEnergy(); }, 1000);
  $('#camBtn').innerHTML = ui.ICON.overview;
  const lb = $('#liteBtn'); if (lb) lb.onclick = () => { sfx('click'); setLite(scene.kind === '3d'); }; // T1: מצב קל
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
      e.preventDefault(); unlock(); ui.hideCoach(); turn();
    }
  });
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { frame(); if (S) render(false); }, 120); });
}
function frame() { scene.frame(ui.freeRect()); }

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
let rolling = false;   // T5 CR-B3: dice / hops are animating — a tap or Space / Enter skips the animation (never the outcome)

/* ============================================================ start */
/**
 * Start (or resume) a game.
 * cfg = {worldId, charId, seed, mode:'free'|'daily'|'weekly'|'challenge', maxMonths?, resultId?, challengeId?, groupId?, title?,
 *        pawn, pawnColor, tutorial, resume}
 */
export async function startGame(cfg = {}) {
  const my = ++gen;
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
  initShell();
  if (endObs) { endObs.disconnect(); endObs = null; }
  prevLevels.clear();
  busy = true; quotaWarned = false;
  closeCard(); ui.hideCoach(); ui.toggleSheet(false); ui.setRollEnabled(false);
  // WebGL died while the lobby was up: this start uses the 2D board
  if (ctxDead && scene.kind === '3d') { ctxDead = false; try { scene.dispose(); } catch (e) { /* ignore */ } scene = nullScene; initDone = false; initP = null; forced2d = 'webgl-init-failed'; }
  cfg = {
    worldId: 'w1', mode: 'free', pawn: 'classic', pawnColor: '#e2483d', tutorial: false, resume: false,
    ...cfg,
  };
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
  if (cfg.state || cfg.resume) {
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
      st = local && local.seed === srv.seed && ((local.ui && local.ui.seq) || 0) > ((srv.ui && srv.ui.seq) || 0) ? local : srv;
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
      // T2 review B1 (CR-29): a ranked game takes its rule set from the day key the server stores (the lobby passes it);
      // free / history games and a missing key keep the engine default (rules 4). mentor undefined → engine default (w1 guide, else hint).
      dateKey: RANKED.has(cfg.mode) && cfg.dateKey ? cfg.dateKey : undefined });
    st.ui = saves.normalizeUi({});
    cfg.charId = st.charId;
  }
  cfg.resume = false;
  if (ckFloor > (st.ui.seq || 0)) st.ui.seq = ckFloor;
  S = st; CFG = cfg; UIS = S.ui; W = E.getWorld(S.worldId);
  ui.applyTheme(W);

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
    scene.syncCity(E.cityModels(S), { silent: true });
    syncLevels(false);
    OV.hideLoading();
    ui.resetHud();
    frame(); scene.resetCamera();
    try { scene.setPawnRing?.(CHAR_STYLE[S.charId] || CHAR_FALLBACK); } catch (e) { console.warn(e); }   // T5 CR-B5
    if (!resumed && !S.over && !onboard.worldCoached(W.id)) { try { scene.introWorld?.(); } catch (e) { console.warn(e); } } // first game in this world
    render(false);
    ui.showDice(S.lastRoll ? (S.lastRoll.dice || [S.lastRoll.die]) : [1, 1]);
    const intro = E.intro(S, resumed);
    ui.mentor(intro.mentor);
    ui.worldBanner(W, resumed ? `חזרת לחודש ${S.month}` : ui.goalWords(W.goalLabel));
    if (!resumed) sfx('card');
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

/* ============================================================ render */
function ctx() { return { world: W, st: S, cfg: CFG, isRevealed: onboard.isRevealed }; }
let opsSeen = false;
function render(animate = true) {
  if (!S) return;
  const m = E.metrics(S);
  track(m);
  ui.renderHUD(m, ctx(), { animate });
  ui.renderSheet(m, ctx());
  if (typeof ui.worldTag === 'function') ui.worldTag(!!(CFG && CFG.learn));       // T4 S-M7
  if (typeof ui.renderDream === 'function') ui.renderDream(m.dream || null);      // T4 §6.4 (feature-detected: needs the engine's E-7)
  // T2: an "ops" focus from the agenda is ready → offer to open the business panel between rolls (once per month)
  const ops = !!(m.focus && m.focus.opsOpen);
  if (ops && !opsSeen && !busy && !ui.isEventOpen()) ui.toast('🏪 יום העבודה על העסק מחכה', { action: { label: 'לפתוח את לוח העסק', fn: () => openOps() } });
  opsSeen = ops;
  const wi = m.worldIndicators || {};
  ui.historyStrip(wi.indexHist ? wi.indexHist.map((x) => ({ index: x })) : S.ui.hist, wi.ymText ? wi : null);
  syncLifeCity(m);
}
/** Client-side monthly series (saved in st.ui): pension balance and, in history mode, the market path. */
function track(m) {
  const u = S.ui; if (u.trackMonth === m.month) return; u.trackMonth = m.month;
  if (m.life && m.life.pension != null) { (u.pensionHist ||= []).push(Math.round(m.life.pension)); if (u.pensionHist.length > 120) u.pensionHist.shift(); }
  const wi = m.worldIndicators || {};
  if (wi.ymText) { (u.hist ||= []).push({ ym: wi.ym, index: wi.index }); if (u.hist.length > 240) u.hist.shift(); }
}
/* life models in the city: family house, university, pension island, index-fund building */
function syncLifeCity(m) {
  const L = m.life; if (!L) return;
  const fam = L.family || {};
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
  const MODEL = { 'L:home': 'life/home_family', 'L:wedding': 'life/wedding', 'L:uni': 'life/university', 'L:pension': 'life/pension', 'L:index': 'life/index_fund', 'L:side': 'life/side_hustle', 'L:hospital': 'life/hospital' };
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
  if (!CFG || RANKED.has(CFG.mode) || CFG.resultId) return false;
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
  const p = ui.modal({
    tag: '⚡ זריקות', color: '#f2b632', title: 'נגמרו הזריקות ⚡',
    html: `<div class="noen"><div class="noen-ring"><b id="noenT" class="num">${fmtMs(left())}</b><small>עד הזריקה הבאה</small></div>
      <p class="d">כל הטלה עולה זריקה אחת ⚡. הזריקות מתמלאות לבד — ${g.max ? `עד ${g.max}` : ''}, אחת כל כמה דקות. המשחק שלך שמור ומחכה.</p>
      <p class="note">בינתיים אפשר:</p>
      <div class="noen-acts"><button data-go="learn">🎓 לתרגל בלי הגבלה</button><button data-go="library">📚 ספריית השיעורים</button><button data-go="daily">📅 האתגר היומי (בלי ⚡)</button><button data-go="groups">🎁 לשלוח זריקות לחברים</button><button data-go="sheet">📄 לעבור על הדוח שלי</button></div></div>`,
    actions: [{ label: 'סגירה', cls: 'primary', v: 'close' }],
    dismissable: true,
    onExtra: (e) => {
      const b = e.target.closest('[data-go]'); if (!b) return;
      const go = b.dataset.go;
      document.querySelector('#gm .acts button')?.click();
      if (go === 'sheet') setTimeout(() => ui.toggleSheet(true), 50);
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
  if (!S || !usesEnergy()) { ui.renderRollEnergy(null); return; }
  const en = await energyMod(); if (!en) { ui.renderRollEnergy(null); return; }
  ui.renderRollEnergy(safeCall(en, 'get', null), safeCall(en, 'msUntilNext', 0));
}
/* life chips: details, or change the monthly plan between events */
async function lifeChip(kind) {
  const m = E.metrics(S);
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
      html: `<p class="d">התוכנית חלה מיום המשכורת הבא. זמן וכוח (🔋) הם משאב — בחר על מה לבזבז אותם.</p><div class="plans">${plans.map((p) => `<button class="plan ${p.id === L.plan ? 'cur' : ''}" data-plan="${p.id}"><span class="pi">${ICON[p.id] || '📅'}</span><b>${ui.esc(p.label)}</b>${p.id === L.plan ? '<small class="tagc">עכשיו</small>' : ''}<small class="pn">${ui.esc(p.desc || '')}</small></button>`).join('')}</div>`,
      actions: [{ label: 'ביטול', v: null }], dismissable: true,
      onExtra: (e) => { const b = e.target.closest('[data-plan]'); if (!b) return; chosenPlan = b.dataset.plan; document.querySelector('#gm .acts button').click(); } });
    void v;
    if (chosenPlan && chosenPlan !== L.plan) {
      const id = chosenPlan; chosenPlan = null;
      try { const out = E.setPlan(S, id); if (out && out.ok === false) { ui.toast(out.error || 'לא אפשרי עכשיו'); return; } if (out && out.mentor) ui.mentor(out.mentor); }
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
    try { out = E.setFocus(S, pick.id, pick.slot); } catch (e) { console.error(e); ui.toast('לא אפשרי עכשיו'); return; }
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
  let out; try { out = E.setFocus(S, 'ops', 0); } catch (e) { console.error(e); return; }
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
/** T2 §15.1: the mentor level, from the ❓ menu (free and history games; ranked shows the fixed level). */
async function mentorMenu() {
  if (!S || S.over || typeof E.setMentorLevel !== 'function' || !E.MN) return;
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
  if (stuck || busy || !S || S.over || ui.isEventOpen() || !$('#start').hidden) return;
  const my = gen; busy = true; ui.setRollEnabled(false); ui.toggleSheet(false); ui.hidePractice?.();
  flows++; flowTick++;
  try { await turnBody(my); }
  catch (e) { if (my === gen && !stuck) enterStuck(e, 'turn'); }
  finally { flows--; flowTick++; rolling = false; }
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
  try { out = E.rollDice(S); } catch (e) { console.error(e); scene.cancelHold(); busy = false; ui.setRollEnabled(true); return; }
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
  // remaining roll results: news (exits, signals), auto-loans, achievements…
  const skip = (out.paydays || []).map((p) => (p.amount >= 0 ? 'coin' : 'loss'));
  await applyOut(out, { skipSounds: ['roll', ...skip], skipPawnCash: true });
  render();
  persist();
  flowTick++;
  if (out.bailout) { await bailoutCard(out.bailout); flowTick++; if (my !== gen) return; render(); }
  const burn = out.burnout || (out.news || []).find((n) => n.kind === 'burnout');
  if (burn) { await burnoutCard(burn); flowTick++; if (my !== gen) return; render(); }
  await handleLanding(my);
  if (my !== gen || stuck) return;
  busy = false;
  if (S.over) return;
  ui.setRollEnabled(true); ui.focusRoll();
  await onboard.afterTurn(hooks(my)); // T4 IR-T4-3
}

/** Payday while hopping: floating number, coins to the HUD, count-up. No modal. */
function paydayFx(pd, runningCash) {
  const pos = pd.amount >= 0;
  scene.floatLabel((pos ? 'משכורת ' : '') + E.sgn(pd.amount), pos ? 'green' : 'red', 'pawn');
  if (pos) { ui.flyCoins(scene.project('pawn'), 7); sfx('coin'); ui.vibrate(12); } else sfx('loss');
  ui.setCash(runningCash, true);
  ui.setMonth(pd.month, S.mode === 'free' ? 0 : S.maxMonths);
}

/** Resolve the landing event(s) of this turn (or of a resumed save). A broken flow → recover bar (callers check `stuck`). */
async function handleLanding(my) {
  flows++; flowTick++;
  try { await landingBody(my); }
  catch (e) { if (my === gen && !stuck) enterStuck(e, 'landing'); }
  finally { flows--; flowTick++; }
}
async function landingBody(my) {
  let ev = E.landing(S) || E.currentEvent(S);
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
      const res = E.choose(S, ev, opt);
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
    let cur = ev, working = false;
    // T2 card API: the UI asks, the engine answers (no finance math in ui.js). A hint is an action (['H']): saved like a decision.
    const api = {
      mentor: () => (S ? E.metrics(S).mentor : null),
      hint: () => {
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
      try { res = E.choose(S, cur, optId, params || {}); }
      catch (e) {
        console.error(e);
        cur = E.currentEvent(S);
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
      if (res.done) resolve(res);
      else { cur = res.event; ctl.update(cur); }
      working = false; ctl.busy(false);
    }
    card = { ctl, resolve };
    let closedRes = null;
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
  if (out.dream && out.dream.length && typeof ui.dreamToast === 'function') ui.dreamToast(out.dream); // T4 IR-T4-4 (E-7)
  if (out.decision && !opts.noVerdict) ui.verdict(out.decision, { inCard: !!opts.inCard });
  if (out.double && out.double.text) ui.toast('🎲 ' + out.double.text, { kind: 'gold' });
  for (const n of out.news || []) {
    if (n.kind === 'bailout' || n.kind === 'double' || n.kind === 'burnout' || (out.double && n.text === out.double.text)) continue; // own cards / toasts
    if (n.kind === 'headline') { ui.newspaper(n); continue; }
    if (n.kind === 'exit' && n.big) { ui.achievementToast({ label: 'אקזיט!', name: n.name, desc: n.text, sound: 'none' }); continue; }
    if (n.kind === 'business') { // monthly result of a managed business (no top-level text in the engine news)
      ui.toast(`🏪 ${n.name}: ${n.headline || ''}${n.net ? ` · לכיס שלך ${E.sgn(n.net)}` : ''}`, { kind: n.netProfit < 0 ? 'bad' : '' });
      for (const ev2 of (n.events || []).slice(0, 1)) if (ev2.title) ui.toast(`🏪 ${ev2.title}${ev2.text ? ': ' + ev2.text : ''}`);
      continue;
    }
    if (n.kind === 'inflation' && n.reality && S && S.ui) S.ui.inflReality = n.reality;
    if (n.kind === 'goalHold') { ui.toast('⏳ ' + n.text, { kind: 'gold' }); continue; }
    if (n.kind === 'goal') { ui.toast('🎯 ' + n.text, { kind: 'gold' }); continue; } // T4 IR-T4-4: tutorial goal chain (E-4)
    if (n.kind === 'econ') { ui.toast(`📰 ${n.text}${n.label ? ` · מד הכלכלה: ${n.label}` : ''}`); continue; }   // T2 cycle headline
    if (n.kind === 'focus') { ui.toast('🎯 ' + n.text, { kind: n.disabled ? 'bad' : '' }); continue; }
    if (n.kind === 'dd') { ui.toast('🔎 ' + n.text, { kind: n.repair > 0 || n.surprise ? 'bad' : '' }); continue; }
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
    <p class="note">זה קורה רק פעם אחת במשחק. מעכשיו התזרים שלך לא שלילי — תשמור עליו ככה.</p>`;
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
    let o; try { o = E.setSideReport(S, true); } catch (e) { console.error(e); return; }
    if (o && o.ok === false) { ui.toast(o.error || 'לא אפשרי עכשיו'); return; }
    applyOut(o); render(); persist(); checkpoint(); ui.toast('🧾 נפתח תיק: מעכשיו מקדמות כל חודש');
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
function doLoan(act) {
  let out;
  try { out = act === 'loan' ? E.takeLoan(S) : act === 'repay' ? E.repayLoan(S) : act === 'credit' ? E.payCredit(S) : null; }
  catch (e) { console.error(e); return; }
  if (!out) return;
  if (out.ok === false) { ui.toast(out.error); sfx('loss'); return; }
  applyOut(out);
  render(); persist(); checkpoint();
  if (out.end) { ui.toggleSheet(false); const my = gen; busy = true; ui.setRollEnabled(false); endGame(out.end, my).catch((e) => { if (my === gen && !stuck) enterStuck(e, 'end'); }); }
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
    if (qty) { const out = E.invest(S, qty > 0 ? 'buy' : 'sell', Math.abs(qty)); if (out && out.ok === false) { ui.toast(out.error || 'לא אפשרי'); } else if (out) await applyOut(out); }
    if (typeof E.setAutoInvest === 'function' && auto !== ((m.index && m.index.autoInvest) || 0)) { const o2 = E.setAutoInvest(S, auto); if (o2 && o2.mentor) ui.mentor(o2.mentor); ui.toast(auto ? `הוראת קבע: ${E.fmtM(auto)} בחודש לקרן` : 'הוראת הקבע בוטלה'); }
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
  let out; try { out = E.moveSavings(S, deposit ? amt : -amt); } catch (e2) { console.error(e2); ui.toast('לא אפשרי עכשיו'); return; }
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
  bus.emit('lobby:open', {});
}

/* ============================================================ end of game */
const safe0 = (fn) => { try { return fn(); } catch (e) { return null; } };
async function endGame(end, my) {
  busy = true; ui.setRollEnabled(false); closeCard(); ui.hideCoach(); onboard.hidePractice(); // IR-T4-9
  const win = end.status === 'won';
  if (win) ui.vibrate([30, 60, 30, 60, 80]);
  await scene.celebrate(win);
  if (my !== gen) return;
  if (end.lifeSummary) { await ui.lifeStory(end.lifeSummary, { won: win }); if (my !== gen) return; }
  await pause(win ? 350 : 250);
  persist();
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
  };
  busy = false;
  bus.emit('game:end', payload);
  attachEndAnalysis(end, my);
}
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

