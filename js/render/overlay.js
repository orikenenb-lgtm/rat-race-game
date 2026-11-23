// Loading stages with honest progress (no percentages, the bar moves only on real events), the fatal start panel inside
// #loading, and the recover bar #recover. UI chrome strings live here (STR). Styles: css/stability.css. No DOM at import.

export const RENDERER_TIMEOUT_MS = 20000, GLB_TIMEOUT_MS = 15000, SLOW_HINT_MS = 8000, BOOT_SLOW_MS = 20000,
  CONTEXT_RESTORE_WAIT_MS = 3000, STUCK_CHECK_MS = 1500, RECOVER_WINDOW_MS = 120000;

/** wave 3a (NIT-2): a long GPU string is cut at a word, its open brackets closed (not "…(SwiftShader Device (Subzero) (…") */
export function shortGpu(g, max = 60) {
  const s = String(g || ''); if (s.length <= max) return s;
  let t = s.slice(0, max - 1); const sp = t.lastIndexOf(' '); if (sp > max / 2) t = t.slice(0, sp);
  t = t.replace(/[\s,·(]+$/, '');
  let open = 0; for (const ch of t) { if (ch === '(') open++; else if (ch === ')') open = Math.max(0, open - 1); }
  return t + '…' + ')'.repeat(open);   // the open brackets are closed after the cut
}
export const STR = {
  L0: 'פותחים את המשחק…',
  L1: 'מכינים את התצוגה',
  L2: (w) => `טוענים את ${w}`,
  L2n: (n, N) => `${n} מתוך ${N} דגמים`,
  L3: 'טוענים את דגמי החיים',
  L3n: (n, N) => `${n} מתוך ${N}`,
  L4: 'מסדרים את הלוח',
  L5: 'לוקח יותר מהרגיל…',
  L6: 'התלת־ממד מתעכב, עוברים למצב קל…',
  L7: 'הטעינה לוקחת יותר מהרגיל. אם זה נתקע, נסה לרענן את הדף.',
  reload: 'רענון הדף',
  E1: 'לא הצלחנו לפתוח את המשחק',
  E2: 'ההתקדמות שלך שמורה. אפשר לנסות שוב, לעבור למצב קל (בלי תלת־ממד) או לחזור ללובי.',
  E3: 'לנסות שוב', E4: 'מצב קל', E5: 'חזרה ללובי', E6: 'פרטים טכניים',
  // renderer notices — one per real cause (BRIEF §8). The no-WebGL text names the usual cause (hardware acceleration off,
  // common in cloud / VM / locked-down browsers) instead of blaming "the browser".
  N1: 'התלת־ממד (WebGL) לא זמין בדפדפן הזה כרגע, למשל כשהאצת החומרה כבויה. פתחנו את המשחק במצב קל, והמשחק עצמו זהה.',
  N1b: 'הדפדפן או המכשיר הזה תומכים רק בגרסה הישנה של WebGL, אז פתחנו את המשחק במצב קל. המשחק עצמו זהה.',  // no digit: iso() would isolate it and flip the bidi order
  N2: 'לא הצלחנו להוריד את קבצי התלת־ממד, אז עברנו למצב קל. המשחק עצמו זהה.',
  N2s: 'התלת־ממד נטען לאט מדי ברשת הזאת, אז בינתיים עברנו למצב קל. המשחק עצמו זהה.',
  N2a: 'לנסות שוב בתלת־ממד',
  N3: 'התלת־ממד לא הצליח לעלות בדפדפן הזה, אז עברנו למצב קל. המשחק עצמו זהה.',
  N8: 'התצוגה התלת־ממדית נעצרה (כנראה נגמר הזיכרון הגרפי), אז עברנו למצב קל. ההתקדמות שמורה.',
  // the code + GPU string is Latin: one LTR isolate (U+2066…U+2069) keeps its brackets in order inside the Hebrew line
  tech: (code, gpu) => `פרטים טכניים: \u2066${code}${gpu ? ' · ' + shortGpu(gpu) : ''}\u2069`,
  N4: 'מצב קל פועל: לוח שטוח ומהיר, אותו משחק בדיוק.',
  N5: 'לא הצלחנו להציג את הלוח, אבל אפשר להמשיך לשחק: הקוביות, הכרטיסים והדוח עובדים כרגיל.',
  N6: 'חלק מהציורים לא נטענו, ובמקומם מופיעים סימנים פשוטים. זה לא משפיע על המשחק.',
  N7: 'התלת־ממד כבד למכשיר הזה? במצב קל הכל זז מהר יותר.',
  N7a: 'למצב קל',
  liteOff: 'מצב קל (בלי תלת־ממד)', liteOn: 'חזרה לתלת־ממד',
  R1t: 'משהו נתקע באמצע התור', R1b: 'ההתקדמות שלך שמורה, ואפשר להמשיך בדיוק מאותה נקודה.',
  R2b: 'זה קורה שוב. אפשר לנסות במצב קל, או לחזור ללובי.',
  R2b2d: 'זה קורה שוב. אפשר להמשיך מהשמירה, או לחזור ללובי.',
  R3t: 'התצוגה התלת־ממדית נעצרה', R3b: 'כנראה נגמר הזיכרון הגרפי, או שהדפדפן איפס את התצוגה. ההתקדמות שמורה.',
  R4: 'משהו השתבש. אפשר לחזור ללובי ולהמשיך מהשמירה.',
  Rsave: 'להמשיך מהשמירה', Rlite: 'להמשיך במצב קל', R3d: 'לנסות שוב בתלת־ממד', Rlobby: 'חזרה ללובי',
};

/**
 * Which renderer notice fits the real cause? Pure (no DOM). info = {kind, reason, gpu?, failed?, lowPower?, liteOffered?, liteAllowed?}
 * (kind/reason/gpu from select.loadRenderer, failed = number of GLBs that did not load, lowPower = software GL).
 * → null: nothing to say yet (3D running fine — a later start may still have something to report);
 *   {id, text:'', ...}: settled, say nothing (מצב קל chosen by the player or a flag);
 *   {id, text, sub, ms, action}: show a toast. action = null | 'reload3d' (button label `actionLabel`, → game.reloadInto3D())
 *   | 'lite' (→ game.setLite(true)). `sub` is the short "פרטים טכניים" line (reason code + GPU string when known).
 */
export function noticeFor(info = {}) {
  const { kind, reason = null, gpu = '', failed = 0, lowPower = false, liteOffered = false, liteAllowed = true } = info || {};
  const t = (id, text, code, action = null, actionLabel = '') =>
    ({ id, text, sub: code ? STR.tech(code, gpu) : '', ms: action ? 9000 : 8000, action, actionLabel });
  if (kind === 'none') return t('N5', STR.N5, reason || '2d-failed');
  if (kind === '2d') {
    switch (reason) {
      case 'user-lite': case 'flag': return { id: 'quiet', text: '', sub: '', ms: 0, action: null, actionLabel: '' };
      case 'no-webgl': return t('N1', STR.N1, 'no-webgl');
      case 'no-webgl2': return t('N1b', STR.N1b, 'no-webgl2');
      case 'three-failed': return t('N2', STR.N2, 'three-failed', 'reload3d', STR.N2a);
      case 'three-timeout': return t('N2s', STR.N2s, 'three-timeout', 'reload3d', STR.N2a);
      case 'context-lost': return t('N8', STR.N8, 'context-lost', 'reload3d', STR.N2a);
      case 'webgl-init-failed': return t('N3', STR.N3, 'webgl-init-failed');
      default: return { id: 'quiet', text: '', sub: '', ms: 0, action: null, actionLabel: '' }; // unknown: never a wrong diagnosis
    }
  }
  if (kind !== '3d') return null;
  if (failed > 0) return { id: 'N6', text: STR.N6, sub: '', ms: 6000, action: null, actionLabel: '' };   // still 3D, stand-ins
  if (lowPower && !liteOffered && liteAllowed) return { id: 'N7', text: STR.N7, sub: '', ms: 6000, action: 'lite', actionLabel: STR.N7a };
  return null;
}

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ============================================================ stages */
let stages = [];          // [{id, label, countable, done, n, N, note}]
let barMax = 0;           // monotonic within one start
let slowT = 0, slowFor = null;

function activeIdx() { return stages.findIndex((s) => !s.done); }
function render() {
  const list = $('#loadSteps'); const bar = $('#loadBar'); const lbar = bar && bar.parentElement; const txt = $('#loadText');
  if (!list) return;
  const ai = activeIdx();
  list.hidden = !stages.length;
  list.innerHTML = stages.map((s, i) => {
    const st = s.done ? 'done' : i === ai ? 'on' : 'todo';
    const cnt = s.countable && s.N ? `<small class="lcnt num">${esc(s.id === 'models' ? STR.L2n(s.n, s.N) : STR.L3n(s.n, s.N))}</small>` : '';
    const note = s.note && (!s.done || s.note === STR.L6) ?  // the 3D → 2D fallback note stays readable after its step
       `<small class="lnote">${esc(s.note)}</small>` : '';
    return `<li class="${st}"${st === 'on' ? ' aria-current="step"' : ''}><span class="lmark" aria-hidden="true">${s.done ? '✓' : i + 1}</span><span class="ltxt">${esc(s.label)}${cnt}${note}</span></li>`;
  }).join('');
  if (txt && ai >= 0) txt.textContent = stages[ai].label;
  // bar: (completed + f) / shown — f only for a countable active stage. Never decreases.
  const completed = stages.filter((s) => s.done).length;
  const a = ai >= 0 ? stages[ai] : null;
  const f = a && a.countable && a.N ? Math.min(1, a.n / a.N) : 0;
  const v = stages.length ? (completed + f) / stages.length : 0;
  barMax = Math.max(barMax, v);
  if (bar) bar.style.width = (barMax * 100).toFixed(2) + '%';
  if (lbar) {
    lbar.classList.toggle('indet', !!(a && !(a.countable && a.N)));
    lbar.setAttribute('aria-valuenow', String(Math.round(barMax * 100)));
    if (a) lbar.setAttribute('aria-valuetext', `שלב ${ai + 1} מתוך ${stages.length}: ${a.label}${a.countable && a.N ? `, ${a.n} מתוך ${a.N}` : ''}`);
    else lbar.removeAttribute('aria-valuetext');
  }
  armSlow();
}
function armSlow() {
  const ai = activeIdx(); const id = ai >= 0 ? stages[ai].id : null;
  if (id === slowFor) return;
  clearTimeout(slowT); slowFor = id;
  if (id) slowT = setTimeout(() => { const s = stages.find((x) => x.id === id); if (s && !s.done && !s.note) { s.note = STR.L5; render(); } }, SLOW_HINT_MS);
}
/** list: [{id, label, countable}] → #loading visible, #loadSteps rendered. */
export function showStages(list) {
  stages = (list || []).map((s) => ({ id: s.id, label: s.label, countable: !!s.countable, done: false, n: 0, N: 0, note: '' }));
  barMax = 0; slowFor = null; clearTimeout(slowT);
  const l = $('#loading'); if (!l) return;
  hideFatal();
  l.hidden = false;
  render();
}
export const hasStage = (id) => stages.some((s) => s.id === id);
/** countable stages only; done = settled files (loaded OR failed) */
export function stageProgress(id, done, total) {
  const s = stages.find((x) => x.id === id); if (!s) return;
  s.n = Math.max(0, Math.min(done, total)); s.N = Math.max(0, total);
  render();
}
export function stageDone(id) { const s = stages.find((x) => x.id === id); if (!s || s.done) return; s.done = true; render(); }
/** S-L5 / S-L6 under a step */
export function stageNote(id, text) { const s = stages.find((x) => x.id === id); if (!s) return; s.note = text; render(); }
export function setStageLabel(id, label) { const s = stages.find((x) => x.id === id); if (!s) return; s.label = label; render(); }
export function hideLoading() {
  clearTimeout(slowT); slowFor = null; stages = []; barMax = 0;
  const l = $('#loading'); if (l) l.hidden = true;
  const bs = $('#bootSlow'); if (bs) bs.remove(); // the boot watchdog message never comes back at a later start
  const list = $('#loadSteps'); if (list) { list.hidden = true; list.innerHTML = ''; }
  const bar = $('#loadBar'); if (bar) bar.style.width = '0';
  const lbar = bar && bar.parentElement; if (lbar) { lbar.classList.remove('indet'); lbar.setAttribute('aria-valuenow', '0'); lbar.removeAttribute('aria-valuetext'); }
}
export function bootText(text) { const t = $('#loadText'); if (t) t.textContent = text; }

/* ============================================================ fatal start failure: panel inside #loading */
function hideFatal() { const e = $('#loadErr'); if (e) { e.hidden = true; e.innerHTML = ''; } const l = $('#loading'); if (l) l.classList.remove('lfail'); }
/** actions: [{label, primary?, fn}] */
export function showFatal({ title = STR.E1, body = STR.E2, details = '', actions = [] } = {}) {
  const l = $('#loading'), box = $('#loadErr'); if (!l || !box) return;
  clearTimeout(slowT); slowFor = null; stages = [];
  const list = $('#loadSteps'); if (list) list.hidden = true;
  l.hidden = false; l.classList.add('lfail');
  const det = String(details || '').slice(0, 300);
  box.innerHTML = `<h2 id="loadErrT">${esc(title)}</h2><p>${esc(body)}</p><div class="lacts">${actions.map((a, i) => `<button type="button" data-i="${i}" class="${a.primary ? 'primary' : ''}">${esc(a.label)}</button>`).join('')}</div>${det ? `<details><summary>${esc(STR.E6)}</summary><p dir="ltr">${esc(det)}</p></details>` : ''}`;
  box.hidden = false;
  box.onclick = (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; const a = actions[+b.dataset.i]; hideFatal(); l.hidden = true; try { a.fn && a.fn(); } catch (x) { console.error(x); } };
  setTimeout(() => (box.querySelector('button.primary') || box.querySelector('button'))?.focus(), 30);
}

/* ============================================================ recover bar */
/** actions: [{label, primary?, fn}] — never dismissed by Escape or an outside click. details: optional short "פרטים טכניים" line */
export function showRecover({ title, body, details = '', actions = [] } = {}) {
  const r = $('#recover'); if (!r) return;
  const det = String(details || '').slice(0, 200);
  r.innerHTML = `<div class="rtx"><b id="recoverT">${esc(title)}</b><p id="recoverD">${esc(body)}</p>${det ? `<small class="rtech" dir="auto">${esc(det)}</small>` : ''}</div><div class="racts">${actions.map((a, i) => `<button type="button" data-i="${i}" class="${a.primary || i === 0 ? 'primary' : ''}">${esc(a.label)}</button>`).join('')}</div>`;
  r.hidden = false;
  r.onclick = (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; const a = actions[+b.dataset.i]; try { a.fn && a.fn(); } catch (x) { console.error(x); } };
  setTimeout(() => r.querySelector('button.primary')?.focus(), 30);
}
export function hideRecover() { const r = $('#recover'); if (r) { r.hidden = true; r.innerHTML = ''; r.onclick = null; } }
export const recoverShown = () => { const r = $('#recover'); return !!(r && !r.hidden); };
