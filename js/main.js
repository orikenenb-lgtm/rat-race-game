// מירוץ העכברים 2.0 — boot: load the 3D world, then hand over to the lobby (js/lobby.js).
// If the lobby module is missing or fails, a minimal built-in picker (world + character + free play) keeps the game playable.
import { bus } from './bus.js';
import { unlock, sfx } from './audio.js';
import { esc, achievementToast, goalWords, toast, endAnalysisHtml } from './ui.js';
import { flag } from './flags.js';
import * as T6S from './summary.js';   // T6: graph + five dimensions in the built-in end screen too (flag recap2)
import * as EN from './engine.js';
import * as saves from './saves.js';
import { hideLoading } from './render/overlay.js';
const { worldList, getWorld, fmtM, sgn, achievementById, starThresholds } = EN;

// T1: boot sweep — quarantine unparsable saved data BEFORE game.js / lobby.js (or anything they import) read it.
// Nothing is dropped: corrupt slots go to rr2-bak:, other keys to rr2-quarantine:. The toasts come after the lobby opens.
let SWEEP = null;
try { SWEEP = saves.sweep(); } catch (e) { console.warn('save sweep failed', e); }

// mobile audio needs a gesture
addEventListener('pointerdown', unlock, { passive: true });
addEventListener('keydown', unlock);

// theme: <html data-theme> wins, else prefers-color-scheme (handled by CSS light-dark())
try { const t = JSON.parse(localStorage.getItem('rr2-settings') || '{}').theme; if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }

let openLobby = null;
// three.js + the 3D world load in the background while the lobby is already on screen; startGame() waits for them.
const gameMod = import('./game.js');
let G = null;
// T1: no error text on screen at boot — startGame() reports problems itself (loading stages / error panel)
const gameP = gameMod.then((g) => { G = g; g.initGame().catch((e) => console.warn('init failed (startGame will report it)', e)); return g; });
gameP.catch((e) => console.warn('game.js failed to load', e));

async function boot() {
  await Promise.race([Promise.all([document.fonts.load('800 20px Rubik'), document.fonts.load('20px "Secular One"')]), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  try {
    const mod = await import('./lobby.js');
    if (typeof mod.openLobby !== 'function') throw new Error('lobby.js has no openLobby()');
    openLobby = mod.openLobby;
  } catch (e) {
    console.warn('lobby.js not available — using the built-in picker.', e);
    await gameP.catch(() => null);
    useFallback();
  }
  bus.on('lobby:open', (p) => safeOpen(p || {}));
  safeOpen({});
  hideLoading();
  window.__rrBooted = 1;
  afterBoot();
}
/** sweep messages, auto-restored future saves, and the one-shot resume after a 2D → 3D reload */
function afterBoot() {
  const r = SWEEP || { quarantined: [], corruptSlots: 0, pendingItems: 0 };
  if (r.corruptSlots) toast(saves.STR.S4);
  if (r.quarantined.includes('rr2-progress')) toast(saves.STR.S8);
  if (r.quarantined.includes('rr-player')) toast(saves.STR.S9);
  if (r.quarantined.includes('rr2-pending-finish')) toast(saves.STR.S10);
  try { if (saves.autoRestoreFuture() > 0) toast(saves.STR.S11); } catch (e) { console.warn(e); }
  let cfg = null;
  try { const raw = sessionStorage.getItem('rr2-resume-once'); if (raw != null) { sessionStorage.removeItem('rr2-resume-once'); cfg = JSON.parse(raw); } } catch (e) { cfg = null; }
  // ranked games are not auto-resumed: the lobby re-runs rr_begin (anti-replay path unchanged)
  if (cfg && typeof cfg === 'object' && !cfg.resultId && cfg.worldId) {
    gameP.then((g) => g && g.startGame({ ...cfg, resume: true })).catch((e) => console.warn(e));
  }
}
function safeOpen(p) {
  try { const r = openLobby(p); if (r && r.catch) r.catch((e) => { console.error(e); useFallback(); fallbackLobby(p); }); }
  catch (e) { console.error(e); useFallback(); fallbackLobby(p); }
}

/* ============================================================ built-in picker (no lobby.js) */
let fbOn = false;
function useFallback() {
  if (fbOn) return; fbOn = true;
  openLobby = fallbackLobby;
  bus.on('game:end', fallbackEnd);
  bus.on('achievement', ({ ids = [] } = {}) => ids.forEach((id) => { const a = achievementById(id); if (a) achievementToast({ name: a.name, desc: a.desc }); }));
}
const root = () => document.getElementById('lobby-root');
const show = () => { document.getElementById('start').hidden = false; };
let pick = { worldId: 'w1', charId: null, tutorial: false };
try { pick = { ...pick, ...JSON.parse(localStorage.getItem('rr2-fallback') || '{}') }; } catch (e) { /* ignore */ }

let realAsked = false;
function fallbackLobby() {
  show();
  // history scenarios load lazily — re-draw the picker once the real-market data is in
  if (!realAsked && typeof EN.loadRealData === 'function' && !(EN.scenarioList() || []).length) {
    realAsked = true;
    EN.loadRealData().then((ok) => { if (ok && fbOn && !document.getElementById('start').hidden && root().querySelector('.fb')) fallbackLobby(); }).catch(() => {});
  }
  const worlds = worldList();
  const w = worlds.find((x) => x.id === pick.worldId) || worlds[0];
  if (!w.characters.some((c) => c.id === pick.charId)) pick.charId = w.characters[0].id;
  const sv = G ? G.savedGame(G.saveKeyFor({ mode: 'free', worldId: w.id })) : null;
  root().innerHTML = `<div class="intro fb">
    <div class="lh"><h1>מירוץ העכברים</h1><span class="tag" style="--c:#2f6fdb">משחק חופשי</span></div>
    <p class="lead">משכורת נכנסת, הוצאות יוצאות. בונים נכסים שעובדים בשבילך — עד שיוצאים מהמירוץ.</p>
    <h3 class="fbh">בחר עולם</h3>
    <div class="fbw" role="radiogroup" aria-label="עולם">${worlds.map((x) => `<button class="fbworld ${x.id === w.id ? 'on' : ''}" role="radio" aria-checked="${x.id === w.id}" data-w="${x.id}" style="--s1:${x.theme.sky[0]};--s2:${x.theme.sky[1]}"><small>עולם ${x.order}</small><b>${esc(x.name)}</b><span>${esc(goalWords(x.goalLabel))}</span></button>`).join('')}</div>
    <p class="note">${esc(w.tagline)}</p>
    ${sv ? `<button class="primary wide" id="fbCont">להמשיך · ${esc(sv.charName)}, חודש ${sv.month}</button>` : ''}
    <h3 class="fbh">בחר דמות</h3>
    <div class="profs">${w.characters.map((c) => { const t = starThresholds(w.id, c.id); return `<button class="prof ${c.id === pick.charId ? 'on' : ''}" data-c="${c.id}"><h3>${esc(c.name)}</h3><p class="note">${esc(c.desc)}</p>
      <div class="row"><span>משכורת</span><span class="num">${c.salaryUsd ? '$' + c.salaryUsd.toLocaleString('en-US') : fmtM(c.salary)}</span></div><div class="row"><span>הוצאות</span><span class="num">${fmtM(c.expenses)}</span></div>
      <div class="row"><span>נשאר בחודש</span><b class="num ${c.surplus >= 0 ? 'pos' : 'neg'}">${sgn(c.surplus)}</b></div><div class="row"><span>מזומן בהתחלה</span><span class="num">${fmtM(c.cash)}</span></div>
      <div class="row"><span>★★★</span><span class="num">עד חודש ${t.t3}</span></div></button>`; }).join('')}</div>
    <label class="fbt"><input type="checkbox" id="fbTut" ${pick.tutorial ? 'checked' : ''}> משחק ראשון? הדרכה קצרה + עסקה ראשונה קלה</label>
    ${(typeof EN.scenarioList === 'function' ? EN.scenarioList() : []).length ? `<h3 class="fbh">🕰️ מכונת הזמן — שוק אמיתי</h3><div class="fbw">${EN.scenarioList().map((x) => `<button class="fbworld histw" data-h="${esc(x.id)}" style="--s1:#efe2c4;--s2:#c9b089"><small>${esc(x.start || '')}</small><b>${esc(x.name)}</b><span>${esc(x.blurb || '')}</span></button>`).join('')}</div>` : ''}
    <button class="primary wide" id="fbGo">${sv ? 'משחק חדש' : 'יאללה, משחקים'}</button>
    <p class="note">המספרים מפושטים כדי שהמשחק יזרום — העקרונות אמיתיים.</p></div>`;
  const r = root();
  r.onclick = (e) => {
    const wb = e.target.closest('[data-w]'); if (wb) { pick.worldId = wb.dataset.w; pick.charId = null; save(); sfx('click'); fallbackLobby(); return; }
    const hb = e.target.closest('[data-h]'); if (hb) { G.startGame({ worldId: 'h', mode: 'history', scenarioId: hb.dataset.h, seed: (Math.random() * 2 ** 31) >>> 0, pawn: 'tophat', pawnColor: '#8b5e34', tutorial: false, bailout: true, resume: false }); return; }
    const cb = e.target.closest('[data-c]'); if (cb) { pick.charId = cb.dataset.c; save(); sfx('click'); r.querySelectorAll('.prof').forEach((b) => b.classList.toggle('on', b === cb)); return; }
  };
  const go = r.querySelector('#fbGo'); go.onclick = () => {
    pick.tutorial = r.querySelector('#fbTut').checked; save();
    G.startGame({ worldId: pick.worldId, charId: pick.charId, mode: 'free', seed: (Math.random() * 2 ** 31) >>> 0, pawn: 'classic', pawnColor: '#e2483d', tutorial: pick.tutorial, bailout: true, resume: false });
  };
  const cont = r.querySelector('#fbCont'); if (cont) cont.onclick = () => G.startGame({ ...sv.cfg, resume: true });
  setTimeout(() => (cont || go).focus({ preventScroll: true }), 50);
}
function save() { try { localStorage.setItem('rr2-fallback', JSON.stringify(pick)); } catch (e) { /* ignore */ } }

function fallbackEnd(p) {
  const w = getWorld(p.worldId); const e = p.end || {};
  show();
  const stars = [1, 2, 3].map((i) => `<span class="${i <= p.stars ? 'on' : ''}">★</span>`).join('');
  root().innerHTML = `<div class="intro fb end">
    <span class="tag" style="--c:${p.status === 'won' ? '#c98a12' : '#3b3f4e'}">${p.status === 'won' ? 'ניצחון' : e.reason === 'bankrupt' ? 'פשיטת רגל' : 'נגמר הזמן'}</span>
    <h1>${p.status === 'won' ? 'יצאת מהמירוץ!' : 'נשארת במירוץ'}</h1>
    <div class="stars" role="img" aria-label="${p.stars | 0} כוכבים מתוך 3">${stars}</div>
    <p class="lead">${esc(e.nearMiss ? e.nearMiss.text : '')}</p>
    ${e.starsBlockedByFund ? `<p class="warn">🛟 ★★★ נעצר בגלל קרן החירום: צריך לפחות ${starThresholds(p.worldId, p.charId).fundMonths || 3} חודשי הוצאות בצד. חופש בלי כרית נשבר במשבר הראשון.</p>` : ''}
    ${e.starsBlockedByHappiness ? `<p class="warn">😐 ★★★ נעצר בגלל האושר: צריך לפחות ${starThresholds(p.worldId, p.charId).happy || 60}. כסף זה לא הכל.</p>` : ''}
    ${flag('recap2') && p.t6 ? T6S.renderTop(p, { rivals: 'off', graphId: 'fb' }) : ''}
    ${learnHtml(e.learning)}
    ${endAnalysisHtml ? endAnalysisHtml(e) : ''}
    <div class="grid"><div class="row"><span>חודשים</span><b class="num">${p.months}</b></div><div class="row"><span>שווי נקי</span><span class="num">${fmtM(p.netWorth)}</span></div>
    <div class="row"><span>הכנסה פסיבית</span><span class="num">${fmtM(p.passive)}</span></div><div class="row"><span>הוצאות</span><span class="num">${fmtM(p.expenses)}</span></div></div>
    ${(e.leaks || []).filter((l) => l.amount > 0).length ? `<h3 class="fbh">לאן הכסף דלף</h3><div class="grid">${e.leaks.filter((l) => l.amount > 0).slice(0, 4).map((l) => `<div class="row"><span>${esc(l.label)}</span><span class="num neg">${fmtM(l.amount)}</span></div>`).join('')}</div>` : ''}
    <p class="note"><b>הלקח של ${esc(w.name)}:</b> ${esc(w.lesson)}</p><p class="note">${esc(e.tip || '')}</p>
    <div class="acts"><button class="primary" id="fbAgain">עוד פעם</button><button id="fbBack">בחירת עולם</button></div></div>`;
  if (p.t6 && p.t6.tl) T6S.wireSummary(root(), (id) => (id === 'fb' ? { tl: p.t6.tl, opts: { alt: T6S.altOf(p.t6.tl, e), recessions: T6S.recessionsOf(e) } } : null));
  root().querySelector('#fbAgain').onclick = () => G.startGame({ worldId: p.worldId, charId: p.charId, mode: 'free', seed: (Math.random() * 2 ** 31) >>> 0, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, resume: false });
  root().querySelector('#fbBack').onclick = () => fallbackLobby();
  setTimeout(() => root().querySelector('#fbAgain').focus(), 50);
}

/** checkEnd().learning: decision quality (what you could see) vs luck (what happened) — engine numbers only */
const VERD = { strong: 'חזקה', ok: 'סבירה', mixed: 'יש מה לשפר', risky: 'מסוכנת', costly: 'יקרה' };
function learnHtml(L) {
  if (!L || L.decisionQuality == null) return '';
  const luck = L.luck && L.luck.total ? L.luck.total : 0;
  const top = (L.top || []).filter((x) => x.score < 85).slice(0, 2);
  return `<h3 class="fbh">איכות ההחלטות שלך</h3><div class="grid">
    <div class="row"><span>ציון ממוצע (${L.decisions} החלטות)</span><b class="num">${L.decisionQuality}/100</b></div>
    <div class="row"><span>מזל (מה שקרה מול מה שהיה צפוי)</span><span class="num ${luck > 0 ? 'pos' : luck < 0 ? 'neg' : ''}">${sgn(luck)}</span></div>
    ${top.map((x) => `<div class="row"><span>${esc(x.c)} — ${esc(VERD[x.verdict] || '')}</span><small>${esc(x.why || '')}</small></div>`).join('')}</div>
    ${L.sentence ? `<p class="note">${esc(L.sentence)}</p>` : ''}`;
}

boot();
