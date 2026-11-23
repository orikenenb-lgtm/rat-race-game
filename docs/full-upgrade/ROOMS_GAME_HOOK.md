# game.js hook for live rooms (wave 3b) — /tmp/w3b/game_hook.patch

Regenerated against `HEAD:js/game.js` **after wave 3a** (game.js @ 9d7b197; repo HEAD 0c2e247): `patch -p1 < /tmp/w3b/game_hook.patch` from the repo root
(dry-run clean). If game.js moves again, `python3 /tmp/w3b/apply_hook.py js/game.js` makes the same edits by anchors. It fails loudly and writes
nothing if an anchor is missing. Each change is one line and easy to redo by hand. The driver is `js/remote.js` (RemoteDriver).

Idea: game.js stays the single mutation point. `D` (the driver) is null for every local game, so local play does not change.
In a room, each engine mutation becomes `await D.<same call>`, and the driver swaps S, in place, for the server's redacted view.

| # | where | change |
|---|---|---|
| 1 | after the imports | `let D = null; export function setDriver(d)` (listens to the driver: when the round closes it adopts the view and re-enables 🎲) + `const mut = (name, ...a) => (D ? D.call(name, S, ...a) : E[name](S, ...a))` |
| 2 | `persist()` / `checkpoint()` / `usesEnergy()` | early `return` / `false` when `D` (no local save, no server checkpoint, no ⚡ in a room) |
| 3 | `startInner` | `if (!cfg.room) D = null;` and `if (D && cfg.room) st = D.adopt({ ui: {} }); else if (cfg.state \|\| cfg.resume) {…}` |
| 4 | `t6Start` | no ghost players when `D` (the real opponents are on the room screen) |
| 5 | `turn()` | `if (D && !D.canRoll()) { toast "מחכים ליריבים"; return; }` (one roll per round) |
| 6 | `turnBody` | `out = D ? await D.roll(S) : E.rollDice(S)`; the end of the turn: `ui.setRollEnabled(!D \|\| D.canRoll())` |
| 7 | `landingBody` | `D ? D.landing(S) : (E.landing(S) \|\| E.currentEvent(S))`; the routine/auto choose: `D ? await D.choose(S, ev, opt) : E.choose(…)` |
| 8 | `resolveCard` | `res = D ? await D.choose(S, cur, optId, params) : E.choose(…)`; error path `D ? D.currentEvent(S) : E.currentEvent(S)`; `api.hint` undefined in a room (ui.js calls it synchronously; the room screen's 💡 sends `H`) |
| 9 | setPlan, setFocus ×2, resolveStory, setSideReport, takeLoan/repayLoan/payCredit (`doLoan` → async), invest, setAutoInvest, moveSavings | `E.x(S, …)` → `await mut('x', …)` |
| 10 | `mentorMenu` | returns when `D` (in a room the help level is a room setting) |
| 11 | `endGame` | after `celebrate`: `if (D && CFG.room) → lobby:open {k:'room', id}` (the server ranks the room, so there is no local end screen and nothing is sent) |
| 11b | wave 3a's `offerSummary` (free-run ★ limit) | `if (!D && await offerSummary(my))` — never in a room |
| 12 | `goLobby` | `lobby:open {k:'room', id: CFG.room}` when in a room |

How the lobby uses it: `js/lobby.js` → `roomsApi().playRoom(driver)` calls `g.setDriver(driver)`, then `launch({worldId, charId, mode, room: roomId, …})`.
The room screen (`js/rooms.js`) only shows "🎮 לשחק על לוח המשחק" when `G.setDriver` exists. Until the hook is applied, the whole
room can be played on the room screen itself (roll, card options, loan, repay, 💡).

Verified on current HEAD + the patch: `tests/rooms_e2e.py --hook=<copy with the patch applied>` → 76/76. On the real 3D screen, the roll and card choices went to the server
as intents (state_version advanced) and no local save was written.
Known gaps (not done here): the "👥 יריבים" HUD chip still shows (ghosts stay off, so the panel is empty); the in-card 💡 is hidden in
rooms; after-win / rewind / moments never show up because rooms are not practice games (`flagFor` and `rewind.allowed`), but no explicit
`D` guard was added for them.
