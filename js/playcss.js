// T7 CR-33 (review MAJOR-1): enable css/game-play.css — idempotent; → a promise that settles when it has loaded, failed, or after 20 s.
// A module, not an inline script, so a strict CSP without 'unsafe-inline' (SECURITY_REVIEW §3.10) cannot leave the game unstyled.
// window.__rrPlayCss stays as the shared entry point for game.js / lobby.js (set here, before either of them loads).
export function playCss() {
  if (typeof document === 'undefined') return Promise.resolve();
  const l = document.getElementById('playCss');
  if (!l) return Promise.resolve();
  if (!l._p) l._p = new Promise((res) => {
    const done = () => { window.__rrPlayCssDone = 1; res(); };
    l.addEventListener('load', done, { once: true }); l.addEventListener('error', done, { once: true }); setTimeout(done, 20000);
    if (!l.getAttribute('href')) { l.rel = 'stylesheet'; l.href = l.getAttribute('data-href') || 'css/game-play.css'; }
    try { if (l.sheet && l.sheet.cssRules.length) done(); } catch (e) { /* not loaded yet */ }
  });
  return l._p;
}
if (typeof window !== 'undefined') window.__rrPlayCss = playCss;
