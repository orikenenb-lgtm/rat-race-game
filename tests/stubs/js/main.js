// TEST STUB of main.js: boots the lobby exactly like the contract says.
import { bus } from './bus.js';
const { openLobby } = await import('./lobby.js');
openLobby();
bus.on('lobby:open', (p) => openLobby(p && p.view));
window.__bus = bus;
