// מירוץ העכברים 2.0 — the game controller: engine ⇄ scene ⇄ ui. Turn flow, saves, end of game.
// Public API (contract with the lobby):
//   initGame(), startGame(cfg), savedGame(keyOrCfg), hasActiveGame(), activeConfig(), clearSave(keyOrCfg), saveKeyFor(cfg)
// Emits on the bus: 'game:end' {…}, 'achievement' {ids}, 'lobby:open' {}.
import * as E from './engine.js';
import { bus } from './bus.js';
import * as scene from './scene.js';
import * as ui from './ui.js';
import { sfx, setMuted, isMuted, unlock } from './audio.js';
import { net } from './net.js';

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

/* ============================================================ saves */
/** localStorage key for a config: free → rr2-save-free-<world>; ranked → rr2-save-<resultId>. */
export function saveKeyFor(cfg) {
  if (!cfg) return null;
  if (cfg.mode === 'free' || !cfg.mode) return `rr2-save-free-${cfg.worldId || 'w1'}`;
  if (cfg.mode === 'history') return `rr2-save-history-${cfg.scenarioId || 'x'}`;
  if (cfg.resultId) return `rr2-save-${cfg.resultId}`;
  return `rr2-save-${cfg.mode}-${cfg.worldId || 'w1'}-${cfg.seed >>> 0}`;
}
const keyOf = (k) => (typeof k === 'string' ? k : saveKeyFor(k));
function readSave(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
function persist() {
  if (!S || !CFG) return;
  try { localStorage.setItem(saveKeyFor(CFG), JSON.stringify({ v: 2, cfg: CFG, state: S, savedAt: Date.now() })); } catch (e) { /* quota / private mode */ }
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
const newUi = (o = {}) => ({ seq: 0, coach: {}, firstPayday: false, ...o, coach: { ...((o && o.coach) || {}) } });
/** Saved unfinished game for a key (or cfg) → {cfg, month, worldId, charName} | null. */
export function savedGame(k) {
  const s = readSave(keyOf(k));
  if (!s || !s.state || s.state.over) return null;
  return { cfg: s.cfg, month: s.state.month, worldId: s.state.worldId, charName: s.state.charName };
}
export function clearSave(k) { try { localStorage.removeItem(keyOf(k)); } catch (e) { /* ignore */ } }
export function hasActiveGame() { return !!(S && !S.over); }
export function activeConfig() { return CFG ? { ...CFG } : null; }

/* ============================================================ init */
/** Renderer, scene, lights, world-1 models + board (shown behind the lobby). Safe to call twice; runs in the
 * background while the lobby is already up — startGame() waits for it with a loading bar. */
export function initGame() {
  if (!initP) initP = doInit().then(() => { initDone = true; }, (e) => { initP = null; throw e; });
  return initP;
}
let initDone = false, initPct = 0;
const initWatchers = new Set();
const initProgress = (p) => { initPct = p; for (const f of initWatchers) f(p); };
export const gameReady = () => initDone;
async function doInit() {
  initProgress(0.05);
  wireUI();
  applySettings();
  await scene.init($('#c'));
  await Promise.race([Promise.all([document.fonts.load('800 40px Rubik'), document.fonts.load('40px "Secular One"')]), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
  const w1 = E.getWorld('w1');
  await Promise.all([
    scene.preloadWorld(w1, (p) => initProgress(0.1 + p * 0.85)),
    scene.setPawn('classic', '#e2483d'),
    scene.preloadDice(),
    scene.preloadLife(),
  ]);
  W = w1;
  scene.buildWorld(w1); scene.placePawn(0);
  ui.applyTheme(w1);
  frame();
  $('#mText').textContent = 'בחר עולם ודמות, ונתחיל.';
  initProgress(1);
  // the lobby covers the board: stop rendering while it is up (game flows simply wait underneath)
  const start = $('#start');
  const sync = () => scene.setPaused(!start.hidden);
  new MutationObserver(sync).observe(start, { attributes: true, attributeFilter: ['hidden'] });
  sync();
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

/* ============================================================ start */
/**
 * Start (or resume) a game.
 * cfg = {worldId, charId, seed, mode:'free'|'daily'|'weekly'|'challenge', maxMonths?, resultId?, challengeId?, groupId?, title?,
 *        pawn, pawnColor, tutorial, resume}
 */
export async function startGame(cfg = {}) {
  const my = ++gen;
  if (!initDone) {
    $('#start').hidden = true;
    ui.showLoading('טוען את העולם…', initPct);
    const f = (p) => ui.showLoading(null, p);
    initWatchers.add(f);
    try { await initGame(); } catch (e) { ui.hideLoading(); throw e; } finally { initWatchers.delete(f); }
    if (my !== gen) return;
  }
  busy = true; closeCard(); ui.hideCoach(); ui.toggleSheet(false); ui.setRollEnabled(false);
  cfg = {
    worldId: 'w1', mode: 'free', pawn: 'classic', pawnColor: '#e2483d', tutorial: false, resume: false,
    ...cfg,
  };
  if (cfg.seed == null) cfg.seed = (Math.floor(Math.random() * 2147483646) + 1) >>> 0;
  $('#start').hidden = true;
  // load or create the state
  let st = null;
  const local = readSave(saveKeyFor(cfg));
  const localSt = local && local.state && !local.state.over ? local.state : null;
  let src = null;
  if (cfg.state) {
    // server checkpoint: the source of truth for ranked games — unless this device already got further
    src = cfg.state;
    if (localSt && localSt.seed === src.seed && ((localSt.ui && localSt.ui.seq) || 0) > ((src.ui && src.ui.seq) || 0)) src = localSt;
  } else if (cfg.resume) src = localSt;
  if (src) {
    try {
      st = E.deserialize(src);
      st.ui = newUi({ ...((local && local.ui) || {}), ...(st.ui || {}) }); // (older saves kept ui beside the state)
      cfg = { ...((local && local.cfg) || {}), ...cfg, worldId: st.worldId, charId: st.charId, seed: st.seed, mode: st.mode };
    } catch (e) {
      console.warn('bad save, starting fresh', e); st = null;
      if (String(e && e.message).includes('save_incompatible')) { clearSave(cfg); ui.toast('המשחק השמור מגרסה ישנה — מתחילים מחדש'); }
    }
  }
  // never send a checkpoint number the server already has (it would be rejected as stale)
  const ckFloor = Math.max(0, Number(cfg.checkpointTurn) || 0);
  delete cfg.state; delete cfg.checkpointTurn;
  const resumed = !!st;
  if (!st) {
    st = E.createGame({ worldId: cfg.worldId, charId: cfg.charId, seed: cfg.seed, mode: cfg.mode, maxMonths: cfg.maxMonths, tutorial: !!cfg.tutorial && cfg.mode === 'free', bailout: !!cfg.bailout, scenarioId: cfg.scenarioId });
    st.ui = newUi();
    cfg.charId = st.charId;
  }
  cfg.resume = false;
  if (ckFloor > (st.ui.seq || 0)) st.ui.seq = ckFloor;
  S = st; CFG = cfg; UIS = S.ui; W = E.getWorld(S.worldId);
  ui.applyTheme(W);
  // world models (lazy) + board
  if (!scene.worldLoaded(W)) {
    ui.showLoading(`טוען את ${W.name}…`, 0.02);
    await scene.preloadWorld(W, (p) => ui.showLoading(`טוען את ${W.name}…`, 0.05 + p * 0.9));
  }
  await scene.setPawn(cfg.pawn || 'classic', cfg.pawnColor || '#e2483d');
  if (my !== gen) return;
  scene.buildWorld(W);
  scene.placePawn(S.pos);
  scene.syncCity(E.cityModels(S), { silent: true });
  ui.hideLoading();
  ui.resetHud();
  frame(); scene.resetCamera();
  render(false);
  ui.showDice(S.lastRoll ? (S.lastRoll.dice || [S.lastRoll.die]) : [1, 1]);
  const intro = E.intro(S, resumed);
  ui.mentor(intro.mentor);
  ui.worldBanner(W, resumed ? `חזרת לחודש ${S.month}` : ui.goalWords(W.goalLabel));
  if (!resumed) sfx('card');
  persist();
  if (S.over) { busy = false; return; }
  // resume mid-event
  if (S.phase === 'land' || S.phase === 'event' || S.pending) {
    await handleLanding(my);
    if (my !== gen) return;
  }
  busy = false;
  if (S.over) return;
  ui.setRollEnabled(true); ui.focusRoll();
  updateRollEnergy();
  offerTurbo();
  const tutorialHere = CFG.tutorial && W.id === 'w1';
  if (tutorialHere) markWorldCoached(W.id); // the tutorial explains w1
  if (wantCoach('roll')) {
    await new Promise((r) => setTimeout(r, 700));
    if (my !== gen || busy || ui.isEventOpen()) return;
    await showCoach('roll', { target: '#roll', title: 'מטילים קובייה', text: 'לחץ כאן (או על רווח) כדי להטיל. החייל מתקדם, ועל כל משבצת מחכה הזדמנות, הוצאה או הפתעה.' });
  } else if (!worldCoached(W.id)) {
    await new Promise((r) => setTimeout(r, 900));
    await worldCoach(my);
  }
}

/* ============================================================ first visit to a world: 2 coach marks about its mechanic */
const COACH_KEY = 'rr2-coach';
const readCoach = () => { try { return JSON.parse(localStorage.getItem(COACH_KEY) || '{}') || {}; } catch (e) { return {}; } };
const worldCoached = (wid) => !!readCoach()[wid];
function markWorldCoached(wid) { try { localStorage.setItem(COACH_KEY, JSON.stringify({ ...readCoach(), [wid]: true })); } catch (e) { /* ignore */ } }
const narrow = () => innerWidth <= 820;
const WORLD_COACH = {
  w1: [
    { target: '#hGoal', title: 'מד החופש', text: 'המטרה בשכונה: הכנסה פסיבית — כסף שנכסים מכניסים בלי שתעבוד — שמכסה את כל ההוצאות. כשהפס מתמלא, יצאת מהמירוץ.' },
    { target: () => (narrow() ? '#sheetBtn' : '#sheet .total'), title: 'הדוח הכספי', text: 'כאן רואים מה נכנס, מה יוצא, מה יש לך ומה אתה חייב. לפני כל החלטה — תציץ בשורה התחתונה: התזרים החודשי.' },
  ],
  w2: [
    { target: '#hWorld', title: 'הריבית', text: 'בעיר הגדולה הריבית זזה. משכנתא משתנה עולה ויורדת איתה; קבועה ננעלת ולא מפתיעה. משבצות הבנק (תכלת) מזיזות אותה.' },
    { target: '#hGoal', title: 'יעד רחוק', text: 'סגנון החיים כאן יקר, אז היעד רחוק. משבצות השדרוג (כתומות) מגדילות הכנסה מנכס או מקצצות הוצאה — לתמיד.' },
  ],
  w3: [
    { target: '#hWorld', title: 'שער הדולר', text: 'בנמל הכל תלוי בדולר: דולר חזק טוב ליצואנים ולספינות, ורע ליבואנים. גידור נועל את השער לשנה — קונים אותו כשהשער נוח, לא באמצע סערה.' },
    { target: '#hGoal', title: 'היעד: שווי נקי', text: 'כאן לא סופרים תזרים אלא שווי: כל מה שיש לך פחות כל מה שאתה חייב. וזהב? הוא קופץ במשברים — ביטוח טוב לתיק.' },
  ],
  w4: [
    { target: '#hGoal', title: 'שני יעדים', text: 'בעמק העתיד צריך גם שווי נקי וגם נקודות השפעה. שני הפסים חייבים להתמלא.' },
    { target: '#hWorld', title: 'סטארט־אפים והשפעה', text: 'במשבצות הפיץ\' (סגולות) רוב הסטארט־אפים נכשלים ומעטים עושים פי 20 — אז מפזרים הרבה צ\'קים קטנים. משבצות הנתינה (ורודות) בונות השפעה שגדלה עם הזמן.' },
  ],
};
async function worldCoach(my) {
  const marks = WORLD_COACH[W.id]; if (!marks) return;
  markWorldCoached(W.id);
  for (let i = 0; i < marks.length; i++) {
    if (my !== gen || busy || ui.isEventOpen() || !$('#start').hidden) return;
    const m = marks[i]; const target = typeof m.target === 'function' ? m.target() : m.target;
    const v = await ui.coach({ target, title: m.title, text: m.text, step: i + 1, total: marks.length, label: `${W.name} ·`, skipLabel: 'דלג' });
    if (v === 'skip') return;
  }
}

/* ============================================================ turbo offer (once, after the 2nd game) */
function offerTurbo() {
  if (settings.turbo || settings.turboOffered || (settings.games || 0) < 2) return;
  settings.turboOffered = true; writeSettings({ turboOffered: true });
  setTimeout(() => ui.toast('רוצה פי 2 מהירות?', { action: { label: 'טורבו!', fn: () => { if (!settings.turbo) $('#turboBtn').click(); } } }), 2600);
}

/* ============================================================ tutorial coach marks (roll → meter → ROI, any order, skippable) */
const COACH_TOTAL = 3;
function wantCoach(k) { return !!(CFG && CFG.tutorial && UIS && UIS.coach && !UIS.coach.skip && !UIS.coach[k]); }
async function showCoach(k, o) {
  UIS.coach[k] = true; persist();
  const step = ['roll', 'meter', 'roi'].filter((x) => UIS.coach[x]).length;
  const v = await ui.coach({ ...o, step, total: COACH_TOTAL });
  if (v === 'skip') UIS.coach.skip = true;
  persist();
}

/* ============================================================ render */
function ctx() { return { world: W, st: S, cfg: CFG }; }
function render(animate = true) {
  if (!S) return;
  const m = E.metrics(S);
  track(m);
  ui.renderHUD(m, ctx(), { animate });
  ui.renderSheet(m, ctx());
  const wi = m.worldIndicators || {};
  ui.historyStrip(S.ui.hist, wi.ymText ? wi : null);
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
const usesEnergy = () => {
  if (!CFG || RANKED.has(CFG.mode) || CFG.resultId) return false;
  if (S && typeof E.rollCost === 'function') { try { return E.rollCost(S) > 0; } catch (e) { /* fall through */ } }
  return true;
};
let noEnTimer = 0;
function showNoEnergy(en, info = false) {
  if (info && safeCall(en, 'canRoll', true)) {
    const g0 = safeCall(en, 'get', null) || { value: 0, max: 25 };
    ui.modal({ tag: 'אנרגיה', color: '#f2b632', title: `⚡ ${g0.value}/${g0.max}`, html: '<p class="d">כל הטלה במשחק חופשי עולה ⚡ אחת, והאנרגיה מתמלאת לבד עם הזמן. אתגרים מדורגים (יומי, שבועי, קבוצות) לא עולים אנרגיה. בונוסים: האתגר היומי, חברים שמצטרפים, ורצף ימים.</p>', actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true });
    return;
  }
  sfx('loss');
  const fmtMs = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
  const left = () => safeCall(en, 'msUntilNext', 0);
  const g = safeCall(en, 'get', null) || { value: 0, max: 25 };
  const p = ui.modal({
    tag: 'אנרגיה', color: '#f2b632', title: 'נגמרה האנרגיה ⚡',
    html: `<div class="noen"><div class="noen-ring"><b id="noenT" class="num">${fmtMs(left())}</b><small>עד ⚡ הבאה</small></div>
      <p class="d">כל הטלה עולה ⚡ אחת. האנרגיה מתמלאת לבד — ${g.max ? `עד ${g.max}` : ''}, אחת כל כמה דקות. המשחק שלך שמור ומחכה.</p>
      <p class="note">בינתיים אפשר:</p>
      <div class="noen-acts"><button data-go="library">📚 ספריית השיעורים</button><button data-go="daily">📅 האתגר היומי (בלי ⚡)</button><button data-go="groups">⚡ לשלוח אנרגיה לחברים</button><button data-go="sheet">📄 לעבור על הדוח שלי</button></div></div>`,
    actions: [{ label: 'סגירה', cls: 'primary', v: 'close' }],
    dismissable: true,
    onExtra: (e) => {
      const b = e.target.closest('[data-go]'); if (!b) return;
      const go = b.dataset.go;
      document.querySelector('#gm .acts button')?.click();
      if (go === 'sheet') setTimeout(() => ui.toggleSheet(true), 50);
      else { persist(); bus.emit('lobby:open', { view: go }); }
    },
  });
  clearInterval(noEnTimer);
  noEnTimer = setInterval(() => {
    const el = document.getElementById('noenT'); if (!el) { clearInterval(noEnTimer); return; }
    el.textContent = fmtMs(left());
    if (safeCall(en, 'canRoll', false)) { el.textContent = '⚡ מוכן!'; clearInterval(noEnTimer); }
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
  if (kind === 'plan') {
    if (busy || ui.isEventOpen() || typeof E.setPlan !== 'function') { ui.toast('אפשר לשנות תוכנית בין תורות, או ביום המשכורת'); return; }
    const L = m.life || {}; const plans = L.plans || [];
    const ICON = { work: '💼', overtime: '⏱️', study: '🎓', side: '🛠️', rest: '🌿' };
    const v = await ui.modal({ tag: 'התוכנית החודשית', color: '#0e7490', title: 'איך תעביר את החודשים הבאים?',
      html: `<p class="d">התוכנית חלה מיום המשכורת הבא. זמן ואנרגיה הם משאב — בחר על מה לבזבז אותם.</p><div class="plans">${plans.map((p) => `<button class="plan ${p.id === L.plan ? 'cur' : ''}" data-plan="${p.id}"><span class="pi">${ICON[p.id] || '📅'}</span><b>${ui.esc(p.label)}</b>${p.id === L.plan ? '<small class="tagc">עכשיו</small>' : ''}<small class="pn">${ui.esc(p.desc || '')}</small></button>`).join('')}</div>`,
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
  const T = ui.lifeDetails(kind, m); if (!T) return;
  ui.modal({ tag: 'החיים שלך', color: '#0e7490', title: T[0], html: `<p class="d">${T[1]}</p>`, actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true });
}
let chosenPlan = null;

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
  if (busy || !S || S.over || ui.isEventOpen() || !$('#start').hidden) return;
  const my = gen; busy = true; ui.setRollEnabled(false); ui.toggleSheet(false);
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
  const faces = Array.isArray(out.dice) && out.dice.length ? out.dice : [out.die];
  ui.shakeDomDice(false);
  sfx('roll'); ui.vibrate(10);
  let bounces = 0;
  await scene.throwDice(faces, { held: holdState.held, onBounce: () => { sfx('clack'); if (!bounces++) ui.vibrate(8); } });
  holdState.held = false;
  ui.landDice(faces);
  if (faces.length === 2 && faces[0] === faces[1]) { sfx('golden'); ui.vibrate([12, 30, 12]); }
  if (my !== gen) return;
  await pause(180);
  let cash = m0.cash;
  for (let i = 0; i < out.steps.length; i++) {
    const from = i ? out.steps[i - 1] : out.from;
    await scene.hop(from, out.steps[i], i === out.steps.length - 1);
    if (my !== gen) return;
    sfx('hop');
    const pd = (out.paydays || []).find((p) => p.step === i);
    if (pd) { cash += pd.amount; paydayFx(pd, cash); }
  }
  // remaining roll results: news (exits, signals), auto-loans, achievements…
  const skip = (out.paydays || []).map((p) => (p.amount >= 0 ? 'coin' : 'loss'));
  await applyOut(out, { skipSounds: ['roll', ...skip], skipPawnCash: true });
  render();
  persist();
  if (out.bailout) { await bailoutCard(out.bailout); if (my !== gen) return; render(); }
  const burn = out.burnout || (out.news || []).find((n) => n.kind === 'burnout');
  if (burn) { await burnoutCard(burn); if (my !== gen) return; render(); }
  await handleLanding(my);
  if (my !== gen) return;
  busy = false;
  if (S.over) return;
  ui.setRollEnabled(true); ui.focusRoll();
  if (wantCoach('meter')) {
    await showCoach('meter', { target: '#hGoal', title: W.goal.type === 'passive' ? 'מד החופש' : 'היעד של העולם', text: W.goal.type === 'passive' ? 'כשההכנסה הפסיבית (כסף מנכסים) מכסה את כל ההוצאות — הפס מתמלא ויצאת מהמירוץ. זו המטרה.' : 'כשהפס מתמלא — ניצחת. כל החלטה מזיזה אותו.' });
  }
}

/** Payday while hopping: floating number, coins to the HUD, count-up. No modal. */
function paydayFx(pd, runningCash) {
  const pos = pd.amount >= 0;
  scene.floatLabel((pos ? 'משכורת ' : '') + E.sgn(pd.amount), pos ? 'green' : 'red', 'pawn');
  if (pos) { ui.flyCoins(scene.project('pawn'), 7); sfx('coin'); ui.vibrate(12); } else sfx('loss');
  ui.setCash(runningCash, true);
  ui.setMonth(pd.month, S.mode === 'free' ? 0 : S.maxMonths);
}

/** Resolve the landing event(s) of this turn (or of a resumed save). */
async function handleLanding(my) {
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
      await applyOut(res);
      render(); persist(); checkpoint();
      if (ev.auto) await pause(900);
      if (res.end) { await endGame(res.end, my); return; }
      ev = res.event;
      continue;
    }
    if (ev.type === 'payday') { UIS.firstPayday = true; persist(); }
    const res = await resolveCard(ev, my);
    if (!res || my !== gen) return;
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
    else if (ev.sound === 'loss' && ['market', 'bank', 'fx', 'shipping'].includes(ev.type)) scene.shake(0.18, 380);
    let cur = ev, working = false;
    const ctl = ui.openEvent(cur, ctx(), async (optId, params) => {
      if (working || my !== gen) return;
      working = true; ctl.busy(true);
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
      if (res.done) close();
      await applyOut(res, { inCard: !res.done });
      render(); persist();
      if (res.done) resolve(res);
      else { cur = res.event; ctl.update(cur); }
      working = false; ctl.busy(false);
    });
    card = { ctl, resolve };
    function close() { if (card && card.ctl === ctl) card = null; ctl.close(); setTimeout(() => ui.focusRoll(), 30); }
    // coach mark 3: the ROI button on the first deal
    if (wantCoach('roi') && cur.type === 'deal' && cur.data && cur.data.down) {
      setTimeout(async () => {
        if (my !== gen || !card || card.ctl !== ctl) return;
        await showCoach('roi', { target: '#evCard [data-roi]', title: 'הסוד של המשקיעים', text: 'לפני שקונים: כמה אחוז בשנה הכסף שלך מרוויח? לחץ כאן ותראה את החישוב. אם התשואה גבוהה ממה שעולה ההלוואה — העסקה עובדת בשבילך. אם נמוכה — היא עובדת נגדך.' });
      }, 450);
    }
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
      case 'shake': scene.shake(0.4, 520); ui.vibrate([25, 40, 25]); break;
      case 'sparkle': if (!(out.spawn || []).some((x) => (x.key || x.assetId) === e.at)) scene.sparkle(e.at || 'pawn'); ui.vibrate([15, 40, 15]); break; // spawned golden assets sparkle after their drop
      case 'confetti': scene.confetti(); break;
      case 'upgrade': scene.bump(e.assetId); scene.floatLabel('שדרוג!', 'gold', e.assetId); break;
      case 'hedge': scene.shield(e.assetIds); break;
      case 'impact': scene.hearts(scene.hasKey('f') ? 'f' : 'pawn'); scene.floatLabel(`+${Math.round(e.amount * 10) / 10} השפעה`, '#db2777', scene.hasKey('f') ? 'f' : 'pawn'); break;
      case 'exit': break; // handled with despawn
      default: break;
    }
  }
  // despawns (startup exits launch / fizzle instead of shrinking)
  for (const k of out.despawn || []) { const x = exits.get(k); if (x) scene.launch(k, x.mult > 0); else scene.despawn(k); }
  // spawns
  for (const s of out.spawn || []) { scene.spawn(s.key || s.assetId, s.model, { label: s.label, color: s.color, golden: s.golden }); ui.vibrate(14); }
  if (out.lessons && out.lessons.length) {
    bus.emit('lesson', { ids: out.lessons.map((l) => l.id), list: out.lessons });
    ui.lessonToast(out.lessons, (l) => ui.lessonCard(l));
  }
  if (out.double && out.double.text) ui.toast('🎲 ' + out.double.text, { kind: 'gold' });
  for (const n of out.news || []) {
    if (n.kind === 'bailout' || n.kind === 'double' || n.kind === 'burnout' || (out.double && n.text === out.double.text)) continue; // own cards / toasts
    if (n.kind === 'headline') { ui.newspaper(n); continue; }
    if (n.kind === 'exit' && n.big) { ui.achievementToast({ label: 'אקזיט!', name: n.name, desc: n.text, sound: 'none' }); continue; }
    ui.toast(n.text, { kind: n.kind === 'exit' ? (n.mult >= 1 ? 'gold' : 'bad') : '' });
  }
  if (out.mentor) ui.mentor(out.mentor);
  if (out.toast) ui.toast(out.toast, { kind: 'bad' });
}

/* ============================================================ burnout */
async function burnoutCard(b) {
  sfx('loss'); scene.shake(0.25, 450); ui.vibrate([20, 40, 20]);
  await ui.modal({ tag: 'שחיקה', color: '#b45309', title: b.title || 'נשרפת. חודש בבית.', html: `<div class="say static"><span class="av sm" aria-hidden="true">אע</span><span class="st">${ui.esc(b.mentor || 'הזמן והכוח שלך הם הנכס הכי יקר. כשרצים בלי עצירה — הגוף עוצר בשבילך.')}</span></div>
    <p class="d">${ui.esc(b.text || 'עבדת יותר מדי בלי מנוחה. החודש אין משכורת, יש הוצאות רפואיות, והתוכנית שלך עוברת למנוחה.')}</p>
    ${b.cost ? `<div class="grid"><div class="row"><span>עלות החודש הזה</span><b class="num neg">${E.fmtM(-Math.abs(b.cost))}</b></div></div>` : ''}
    <p class="note">🔋 בפעם הבאה: כשהאנרגיה יורדת מתחת ל־40 — חודש של מנוחה ומשפחה זול יותר מחודש של שחיקה.</p>`, actions: [{ label: 'הבנתי, נוח קצת', cls: 'primary' }] });
}

/* ============================================================ bail-out (first bankruptcy → the bank restructures; a teaching moment) */
async function bailoutCard(b) {
  sfx('loss'); scene.shake(0.3, 500); ui.vibrate([30, 50, 30]);
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
  if (!S || S.over || busy || ui.isEventOpen()) { if (busy) ui.toast('רגע, החייל עוד זז'); return; }
  if (act === 'invest') { indexModal(); return; }
  let out;
  try { out = act === 'loan' ? E.takeLoan(S) : act === 'repay' ? E.repayLoan(S) : act === 'credit' ? E.payCredit(S) : null; }
  catch (e) { console.error(e); return; }
  if (!out) return;
  if (out.ok === false) { ui.toast(out.error); sfx('loss'); return; }
  applyOut(out);
  render(); persist(); checkpoint();
  if (out.end) { ui.toggleSheet(false); const my = gen; busy = true; ui.setRollEnabled(false); endGame(out.end, my); }
}

/* ============================================================ index fund any time (E.invest / E.setAutoInvest) */
async function indexModal() {
  if (typeof E.invest !== 'function') { ui.toast('אפשר להשקיע בקרן במשבצת "קרן מדד ופנסיה"'); return; }
  const m = E.metrics(S); const ix = m.index || {}; const price = ix.price || 100;
  let qty = 0, auto = (m.index && m.index.autoInvest) || 0;
  const maxBuy = Math.floor(Math.max(0, S.cash) / price), maxSell = ix.qty || 0;
  const v = await ui.modal({ tag: 'קרן מחקה מדד', color: '#0f766e', title: 'להשקיע בקרן מדד',
    html: `<p class="d">מחיר יחידה ${ui.esc(E.fmtP(price))}. יש לך ${maxSell} יחידות. מזומן ${ui.esc(E.fmtM(S.cash))}.</p>
      <label class="note" for="ixq">כמות (+ קנייה, − מכירה)</label><input id="ixq" type="number" inputmode="numeric" dir="ltr" value="${Math.min(10, maxBuy)}" min="${-maxSell}" max="${maxBuy}">
      ${typeof E.setAutoInvest === 'function' ? `<label class="note" for="ixa" style="display:block;margin-top:10px">הוראת קבע חודשית לקרן (₪, 0 = בלי)</label><input id="ixa" type="number" inputmode="numeric" dir="ltr" step="100" min="0" value="${auto}">` : ''}
      <p class="note">רווח במכירה ממוסה ב־25% (מס רווחי הון). הוראת קבע = השקעה אוטומטית בכל יום משכורת — הדרך הכי פשוטה לתת לריבית דריבית לעבוד.</p><p class="err" id="ixe"></p>`,
    actions: [{ label: 'לבצע', cls: 'primary', v: 'go', fn: () => { qty = Math.trunc(+document.getElementById('ixq').value || 0); const a = document.getElementById('ixa'); if (a) auto = Math.max(0, Math.round(+a.value || 0)); if (qty > maxBuy || -qty > maxSell) { document.getElementById('ixe').textContent = 'הכמות לא אפשרית'; return false; } } }, { label: 'ביטול', v: null }], dismissable: true });
  if (v !== 'go') return;
  try {
    if (qty) { const out = E.invest(S, qty > 0 ? 'buy' : 'sell', Math.abs(qty)); if (out && out.ok === false) { ui.toast(out.error || 'לא אפשרי'); } else if (out) await applyOut(out); }
    if (typeof E.setAutoInvest === 'function' && auto !== ((m.index && m.index.autoInvest) || 0)) { const o2 = E.setAutoInvest(S, auto); if (o2 && o2.mentor) ui.mentor(o2.mentor); ui.toast(auto ? `הוראת קבע: ${E.fmtM(auto)} בחודש לקרן` : 'הוראת הקבע בוטלה'); }
  } catch (e) { console.error(e); ui.toast('לא אפשרי עכשיו'); }
  render(); persist(); checkpoint();
}

/* ============================================================ lobby button */
/**
 * Save and show the lobby. The game keeps living underneath the #start overlay (the roll is blocked while it is
 * visible; an open card waits behind it), so the lobby can resume by simply hiding #start — or call startGame()
 * for another game (which aborts this flow via `gen`).
 */
function goLobby() {
  persist();
  ui.hideCoach(); ui.toggleSheet(false);
  bus.emit('lobby:open', {});
}

/* ============================================================ end of game */
async function endGame(end, my) {
  busy = true; ui.setRollEnabled(false); closeCard(); ui.hideCoach();
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
    lifeSummary: end.lifeSummary || null, benchmark: end.benchmark || null, scenarioId: (S.history && S.history.scenarioId) || CFG.scenarioId || null,
  };
  busy = false;
  bus.emit('game:end', payload);
}

