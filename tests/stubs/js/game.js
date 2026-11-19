// TEST STUB of game.js implementing the lobby contract. window.__stubEnd(status, months, extra) ends the game.
import { bus } from './bus.js';
import { getWorld, starsFor, starThresholds } from './engine.js';
let active = null; let ended = false;
const keyOf = (cfg) => (cfg.resultId ? 'rr2-save-' + cfg.resultId : 'rr2-save-free-' + cfg.worldId);
window.__cfgs = [];
export async function startGame(cfg) {
  window.__lastCfg = cfg; window.__cfgs.push(cfg);
  active = cfg; ended = false;
  document.getElementById('start').hidden = true;
  const g = document.getElementById('stubGame'); g.hidden = false;
  document.getElementById('stubInfo').textContent = JSON.stringify(cfg, null, 1);
  const w = getWorld(cfg.worldId); const c = w.characters.find((x) => x.id === cfg.charId);
  const st = cfg.state || { turn: cfg.resume ? 9 : 7, month: cfg.resume ? 9 : 7, nextEventId: 12, pending: null };
  const { state, ...plain } = cfg;
  localStorage.setItem(keyOf(cfg), JSON.stringify({ cfg: { ...plain, resume: false }, state: st, month: st.month, worldId: cfg.worldId, charName: c ? c.name : '' }));
}
export function savedGame(key) { try { const s = JSON.parse(localStorage.getItem(key) || 'null'); return s && s.cfg && !(s.state && s.state.over) ? { cfg: s.cfg, month: s.month, worldId: s.worldId, charName: s.charName } : null; } catch (e) { return null; } }
export function clearSave(key) { localStorage.removeItem(key); }
export function hasActiveGame() { return !!active && !ended; }
export function activeConfig() { return active; }
window.__stubEnd = (status = 'won', months = 20, extra = {}) => {
  const cfg = active; if (!cfg || ended) throw new Error('no active game');
  const w = getWorld(cfg.worldId);
  const T = starThresholds(w, cfg.charId);
  const won = status === 'won';
  const stars = won ? starsFor(w, months, cfg.maxMonths ?? T.maxMonths, cfg.charId) : 0;
  const reason = won ? 'goal' : (extra.reason || 'time');
  const progress = won ? 1 : (extra.progress ?? 0.87);
  const passive = won ? 7600 : 6500; const expenses = 7300;
  const nearMiss = won
    ? (stars >= 3 ? { text: 'משחק מושלם: ★★★. נראה אותך עושה את זה שוב בעולם הבא.' } : { text: `עוד ${months - (stars === 1 ? T.t2 : T.t3)} חודשים פחות ו${stars === 1 ? '־★★' : '־★★★'} היו שלך.` })
    : reason === 'bankrupt' ? { text: 'החובות בלעו את התזרים. בפעם הבאה: לא לקנות "נכסים" שמוציאים כסף.' } : { text: 'היית רק ₪800 בחודש מהחופש.', gap: 800 };
  const netWorth = extra.netWorth ?? 184000;
  const stats = { deals: 6, ...(extra.stats || {}) };
  const end = { status, reason, months, stars, netWorth, passive, expenses, progress, impact: 0, nearMiss, tip: extra.tip || 'בפעם הבאה: תבדוק את התזרים לפני שאתה מתאהב בנכס.', lesson: w.lesson, worldId: w.id, charId: cfg.charId, stats, achievements: extra.achievements || (won ? ['first_asset', 'no_trap'] : ['first_asset']) };
  if (extra.leaks) end.leaks = extra.leaks;
  document.getElementById('stubGame').hidden = true;
  ended = true;
  const { state, ...plain } = cfg;
  localStorage.setItem(keyOf(cfg), JSON.stringify({ cfg: plain, state: { over: status, turn: 99 }, month: months }));
  bus.emit('game:end', { status, stars, months, netWorth, passive, expenses, progress, worldId: w.id, charId: cfg.charId, mode: cfg.mode, resultId: cfg.resultId || null, challengeId: cfg.challengeId || null, groupId: cfg.groupId || null, title: cfg.title || '', end, stats: end.stats });
};
document.getElementById('stubWin').onclick = () => window.__stubEnd('won', 18);
document.getElementById('stubLose').onclick = () => window.__stubEnd('lost', 60);
document.getElementById('stubAch').onclick = () => bus.emit('achievement', { ids: ['golden'] });
document.getElementById('stubLobby').onclick = () => bus.emit('lobby:open', {});
