// Minimal stand-in for js/lobby.js — used only by the front-end agent's contract test (copied to js/lobby.js in a TEST copy).
// Exercises: main.js → openLobby(), HUD lobby button → bus 'lobby:open', startGame(cfg) incl. ranked keys/pawns, resume via
// activeConfig(), resume by just hiding #start (the real lobby's "חזרה למשחק"), and cfg.state (server checkpoint).
import { bus } from './bus.js';
import { achievementToast } from './ui.js';
import { achievementById } from './engine.js';

const G = () => import('./game.js');
window.__stub = { opens: 0, ends: [], ach: [] };
bus.on('game:end', (p) => { window.__stub.ends.push(p); openLobby({ end: true }); });
bus.on('achievement', (p) => { window.__stub.ach.push(p); (p.ids || []).forEach((id) => { const a = achievementById(id); if (a) achievementToast({ name: a.name, desc: a.desc, icon: '🏅' }); }); });

export async function openLobby(p = {}) {
  window.__stub.opens++;
  document.getElementById('start').hidden = false;
  const r = document.getElementById('lobby-root');
  const g = await G();
  const daily = { worldId: 'w3', charId: 'importer', seed: 777, mode: 'daily', maxMonths: 24, resultId: 'stub-r1', title: 'אתגר יומי', pawn: 'rocket', pawnColor: '#7c3aed', tutorial: false, bailout: true };
  const sv = g.savedGame(g.saveKeyFor(daily));
  r.innerHTML = `<div class="intro"><h1>לובי בדיקה</h1><p class="lead">${p.end ? 'המשחק נגמר' : 'בחר'}</p><div class="acts">
    <button class="primary" id="stubFree">w2 חופשי (כתר כחול)</button>
    <button id="stubDaily">${sv ? 'להמשיך יומי' : 'יומי w3'}</button>
    <button id="stubServer">יומי מהשרת (cfg.state)</button>
    ${g.hasActiveGame() ? '<button id="stubCont">להמשיך משחק פעיל</button><button id="stubBack">חזרה למשחק (רק לסגור)</button>' : ''}</div></div>`;
  r.querySelector('#stubFree').onclick = () => g.startGame({ worldId: 'w2', charId: 'chef', mode: 'free', seed: 42, pawn: 'crown', pawnColor: '#2f6fdb', tutorial: false, resume: false });
  r.querySelector('#stubDaily').onclick = () => g.startGame({ ...daily, resume: !!sv });
  // simulate a second device: no local save, the server returns its checkpoint
  r.querySelector('#stubServer').onclick = () => { localStorage.removeItem(g.saveKeyFor(daily)); g.startGame({ ...daily, resume: true, state: window.__lastCkState || null, checkpointTurn: window.__lastCkTurn || 0 }); };
  const c = r.querySelector('#stubCont'); if (c) c.onclick = () => g.startGame({ ...g.activeConfig(), resume: true });
  const bk = r.querySelector('#stubBack'); if (bk) bk.onclick = () => { document.getElementById('start').hidden = true; };
}
