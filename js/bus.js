// Tiny event bus shared by the game screen (game.js/ui.js) and the meta layer (lobby.js/progress.js).
// Events (payload):
//   'game:end'        {status, stars, months, netWorth, passive, expenses, progress, worldId, charId, mode, resultId, challengeId, groupId, title, end, state}
//   'achievement'     {ids:[...]}           — unlocked during a game (game.js emits, progress.js stores + toasts)
//   'lobby:open'      {view?}               — request to show the lobby (e.g. HUD button)
//   'sfx'             {name}                — optional: anyone can ask audio.js to play a cue
const listeners = new Map();
export const bus = {
  on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
  emit(type, payload) { for (const fn of listeners.get(type) || []) { try { fn(payload); } catch (e) { console.error('bus handler', type, e); } } },
};
