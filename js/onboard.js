// T4 §14.2 — onboarding hooks for the game shell (js/game.js calls them; IR-T4-3).
// Owns: the tutorial coach schedule, the first-visit world coaches (WORLD_COACH, moved from game.js — texts and the
// rr2-coach key unchanged), the reopenable tour + legend (F4), the practice chip flow (§10, feature-detected), the
// bus 'onboard:done' event and the test-only window.__t4trace.
// Everything that needs the in-game UI lane (intro card renderer, gradual HUD reveal, #helpBtn, practice sheet, dream chip)
// is FEATURE-DETECTED: with today's ui.js / engine the game behaves exactly as before T4 (roll → meter → ROI coaches).
//
//   afterStart(h)  afterTurn(h)  onCard(ev, ctl, h)  onCardClosed(ev, res, h)  isRevealed(key)  tour(h)  legend(h)  hidePractice()
//   h = { S, CFG, W, my, gen:()=>int, persist, render, isBusy:()=>bool, answerPractice?(qid, idx) }
import * as E from './engine.js';
import * as ui from './ui.js';
import { bus } from './bus.js';
import * as EN from './energy.js';   // review m-6: the legend's ⚡ row shows the real count

/* ------------------------------------------------------------ trace (tests) */
export function trace(screen) {
  try { const t = (window.__t4trace ||= []); if (!t.length || t[t.length - 1].screen !== screen) t.push({ t: Math.round(performance.now()), screen }); } catch (e) { /* no window */ }
}
const $ = (s) => document.querySelector(s);
const alive = (h) => h && h.my === h.gen() && !h.isBusy() && !ui.isEventOpen() && $('#start') && $('#start').hidden;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ player-level reveal record (§4.3; written by the lobby migration) */
const REVEALK = 'rr2-reveal';
const readReveal = () => { try { const r = JSON.parse(localStorage.getItem(REVEALK) || 'null'); return r && typeof r === 'object' && !Array.isArray(r) ? r : null; } catch (e) { return null; } };
const writeReveal = (patch) => { try { localStorage.setItem(REVEALK, JSON.stringify({ v: 1, all: false, coached: [], tourNext: false, ...(readReveal() || {}), ...patch })); } catch (e) { /* ignore */ } };
/** §4.3: is a HUD part visible? Gradual reveal exists only in a tutorial game whose state carries S.ui.reveal (UI lane). */
let curS = null, tourAll = false;
export function isRevealed(key) {
  const R = curS && curS.ui && curS.ui.reveal;
  if (tourAll || !R || R.skipped || !Array.isArray(R.keys)) return true;
  if (['cash', 'month', 'mentor', 'home', 'mute', 'help', 'roll'].includes(key)) return true;
  return R.keys.includes(key);
}
/* ------------------------------------------------------------ §4.3 reveal STATE WRITER (S.ui.reveal = {keys, skipped, coached, pd})
   Created for a brand-new tutorial game (w1, the engine's intro card at its first beat, the player has no rr2-reveal.all), then fed by
   what the game actually did: cards opened / closed, roll results, months. It never hides a part again; skip = everything. */
const TFR = () => (typeof E.TUTORIAL_FREE_ROLLS === 'number' ? E.TUTORIAL_FREE_ROLLS : 10);
/** §4.4 hint triggers are collected in every free / learning game (never ranked, daily, history): S.ui.seen = keys whose system has
 *  appeared in this game (same game-state rules as the §4.3 reveal schedule). In a tutorial game the reveal keys feed it too. */
const freeCfg = (CFG) => !!CFG && (CFG.mode || 'free') === 'free' && !CFG.resultId && CFG.worldId !== 'h';
let hintable = false;
export function prepare(S, CFG, W) {
  curS = S; hintable = freeCfg(CFG) && !!(S && S.ui) && !(S && S.history);
  if (!S || !S.ui || S.ui.reveal || S.over) return;
  if (!CFG || !CFG.tutorial || !W || W.id !== 'w1' || !S.intro || S.intro.step !== 'salary') return;
  const R0 = readReveal(); if (R0 && R0.all) return;
  S.ui.reveal = { keys: [], skipped: false, coached: [], pd: 0 };
}
function seenAdd(S, keys) {
  if (!hintable || !S || !S.ui) return;
  const L = Array.isArray(S.ui.seen) ? S.ui.seen : (S.ui.seen = []);
  for (const k of keys) if (k && !L.includes(k)) L.push(k);
}
const seen = (S, k) => !!(S && S.ui && ((Array.isArray(S.ui.seen) && S.ui.seen.includes(k)) || (S.ui.reveal && Array.isArray(S.ui.reveal.keys) && S.ui.reveal.keys.includes(k))));
/** → true when a HUD part became visible (gradual reveal); hint triggers are recorded either way */
function revealAdd(S, ...keys) {
  seenAdd(S, keys);
  const R = S && S.ui && S.ui.reveal; if (!R || R.skipped) return false;
  let ch = false; for (const k of keys) if (k && !R.keys.includes(k)) { R.keys.push(k); ch = true; }
  return ch;
}
function revealSkip(S) { const R = S && S.ui && S.ui.reveal; if (!R || R.skipped) return false; R.skipped = true; return true; }
const revealing = (S) => { const R = S && S.ui && S.ui.reveal; return !!(R && !R.skipped); };
/** info = {m (metrics), out (a roll / choose / resolveStory result), cfg}. Pure state edit; the caller renders. */
export function revealTick(S, info = {}) {
  if (S) curS = S;
  if (!revealing(S) && !(hintable && S && S.ui)) return false;
  if (revealing(S) && S.intro && S.intro.step === 'skipped') return revealSkip(S);
  const { m, out, cfg } = info; let ch = false;
  if (m) {
    const mo = m.month || 0;
    if (mo >= 4) ch = revealAdd(S, 'fund') || ch;
    if (mo >= 6) ch = revealAdd(S, 'happy', 'tools') || ch;
    if (mo >= 10) ch = revealAdd(S, 'credit') || ch;
    if (mo >= 12) ch = revealAdd(S, 'age') || ch;
    if ((m.assets || []).length) ch = revealAdd(S, 'goal') || ch;                    // first asset bought
    if ((m.loans || 0) + (m.credit || 0) > 0) ch = revealAdd(S, 'credit') || ch;   // first loan or card debt
    if ((S.turn || 0) >= TFR() && !(cfg && cfg.learn)) ch = revealAdd(S, 'zr') || ch;  // ⚡ after the free rolls (never in learning mode)
  }
  if (out) {
    if ((out.paydays || []).length) ch = revealAdd(S, 'goal') || ch;                  // first payday passed
    for (const n of out.news || []) {
      if (n.kind === 'inflation') ch = revealAdd(S, 'cpi') || ch;
      if (n.kind === 'savings' || n.kind === 'forcedLoan' || n.kind === 'loan') ch = revealAdd(S, 'fund') || ch;
    }
    if ((out.effects || []).some((e) => e.type === 'loan')) ch = revealAdd(S, 'credit', 'fund') || ch;
  }
  return ch;
}

/* ------------------------------------------------------------ onboard:done (once per game) */
let doneFor = null;
function emitDone(h, reason) {
  if (!h || !h.S || doneFor === h.S) return;
  doneFor = h.S;
  bus.emit('onboard:done', { reason });
}
const engineIntro = (S) => !!(S && S.intro);

/* ------------------------------------------------------------ §4.4 core tutorial coaches: C-roll (1/2) → C-meter (2/2), C-roi in the deal card */
const CORE_STEP = { roll: 1, meter: 2 }, CORE_TOTAL = 2;
/** §4.1 / AC-T1 (T4 verify D1): "דלג על ההדרכה" — on intro beat 1 or on a core coach — ends every tutorial coach of this game for
 *  good. The intro skip is recorded by the engine (S.intro.step 'skipped') and by the reveal state; both are folded into
 *  S.ui.coach.skip (saved with the game), so a resumed / re-rendered game never brings a coach back. */
function tutorialSkipped(S) { const U = S && S.ui; return !!(U && ((U.coach && U.coach.skip) || (U.reveal && U.reveal.skipped) || (S.intro && S.intro.step === 'skipped'))); }
function markSkipped(S) { const U = S && S.ui; if (!U) return false; if (!U.coach || typeof U.coach !== 'object') U.coach = {}; if (U.coach.skip) return false; U.coach.skip = true; return true; }
function wantCoach(h, k) {
  const U = h.S && h.S.ui; if (!(h.CFG && h.CFG.tutorial && U)) return false;
  if (tutorialSkipped(h.S)) { if (markSkipped(h.S)) h.persist(); return false; }
  return !!(U.coach && !U.coach[k]);
}
async function showCoach(h, k, o) {
  const U = h.S.ui; U.coach[k] = true; h.persist(); turnUsed(h);
  const step = CORE_STEP[k] ?? null;   // C-roi (in card) has no number and no skip link (§4.4)
  const v = await ui.coach({ ...o, step, total: step ? CORE_TOTAL : null, skipLabel: step ? 'דלג על ההדרכה' : null });
  if (v === 'skip') { U.coach.skip = true; emitDone(h, 'skip'); }
  h.persist();
}

/* ------------------------------------------------------------ §4.4 hint coaches ("טיפ"): one line, once per player, free / learn only */
// trigger = the system's key appeared in this game (S.ui.seen / the reveal keys). Never in ranked / daily / history, never for a player
// with rr2-reveal.all (existing players) or rr2-reveal.hintsOff ("בלי טיפים"), never in a game whose tutorial was skipped. At most one
// coach per turn; a hint between turns goes through ui.hint (the single overlay queue), an in-card hint opens in the card (§4.7).
const fm = (n) => (typeof E.fmtM === 'function' ? E.fmtM(n) : String(Math.round(n)));
const monthsTxt = (x) => { const v = Math.round((+x || 0) * 10) / 10; return v === 1 ? 'חודש אחד' : v === 2 ? 'חודשיים' : `${v} חודשים`; };
const visEl = (sel) => { const e = typeof sel === 'string' ? document.querySelector(sel) : sel; return e && !e.hidden && e.getClientRects().length ? e : null; };
/** a life-row chip, or the "⋯" chip that holds it on a narrow phone */
const lifeChip = (cls, alt = null) => () => visEl(`#hLife .lc.${cls}:not(.in-more)`) || visEl('#hLife .lc.more') || (alt && visEl(alt)) || `#hLife .lc.${cls}`;
const sheetTarget = () => visEl('#sheetBtn') || visEl('#sheet .total') || '#sheetBtn';
const OUT_HINTS = [   // between turns, in this order
  { id: 'C-power', key: 'energy', target: lifeChip('en'), title: '🔋 כוח',
    text: (m, S) => `הכוח של ${S.charName || ''} בסיפור: ${Math.round((m.life || {}).energy ?? 0)} מתוך 100. מתחת ל־25 יש סכנת שחיקה — חודש בלי משכורת.` },
  { id: 'C-sheet', key: 'sheet', target: sheetTarget, title: 'הדוח שלי',
    text: (m) => `כאן כל השורות: נטו ${fm((m.payslip || {}).net ?? m.salary ?? 0)}, הוצאות ${fm(m.expenses || 0)}, נשאר ${fm(m.cashflow || 0)}. לפני החלטה גדולה — ${ui.gw('תציץ', 'תציצי')}.` },
  { id: 'C-fund', key: 'fund', target: lifeChip('fund', '#sheetBtn'), title: '🛟 קרן חירום',
    text: (m) => `יש לך ${monthsTxt((m.emergency || {}).months)} בצד. כשנגמר המזומן, הקרן משלמת לפני שהבנק נותן הלוואה כפויה.` },
  { id: 'C-happy', key: 'happy', target: lifeChip('hp'), title: '😊 אושר',
    text: (m) => `אושר ${Math.round((m.life || {}).happiness ?? 0)} מתוך 100. ל־★★★ צריך לפחות 60. פיתויים משמחים לרגע, ואז דועכים.` },
  { id: 'C-credit', key: 'credit', target: lifeChip('cr'), title: '🏦 דירוג אשראי',
    text: (m) => `הדירוג שלך ${(m.life || {}).creditScore ?? ''}. הלוואה כפויה מורידה אותו, ואז כל הלוואה עולה יותר.` },
  { id: 'C-cpi', key: 'cpi', target: lifeChip('cpi'), title: '🛒 אינפלציה',
    text: (m) => `המחירים עולים השנה ב־${(m.life || {}).inflationYear ?? 0}%. מזומן שלא עובד שווה פחות כל שנה.` },
];
export const HINT_IDS = ['C-plan', ...OUT_HINTS.map((x) => x.id), 'C-focus', 'C-impact'];
function hintsOn(h) {
  const S = h && h.S; if (!S || !S.ui || S.over || !freeCfg(h.CFG) || S.history) return false;
  if (tutorialSkipped(S)) return false;
  const R = readReveal();
  if (R) return !R.all && !R.hintsOff;
  return revealing(S);   // no player record (a game-only build): only a tutorial game teaches
}
const hinted = (id) => { const R = readReveal(); return !!(R && Array.isArray(R.coached) && R.coached.includes(id)); };
function markHint(id, S) {
  const R = readReveal() || {}; const c = Array.isArray(R.coached) ? R.coached : [];
  if (!c.includes(id)) writeReveal({ coached: [...c, id] });
  shownAt = { id, at: Date.now() };
  const G = S && S.ui && S.ui.reveal; if (G && Array.isArray(G.coached) && !G.coached.includes(id)) G.coached.push(id);   // per game (§4.3)
}
/** a tip that a roll closed within 1.5 s of opening was not read: it may come back on a later turn */
let shownAt = null;
function unreadHint(id, v) {
  if (v !== 'roll' || !shownAt || shownAt.id !== id || Date.now() - shownAt.at > 1500) return;
  const R = readReveal(); if (R && Array.isArray(R.coached)) writeReveal({ coached: R.coached.filter((x) => x !== id) });
}
/* at most one coach per turn (core or hint) */
let usedAt = null;
const turnUsed = (h) => { usedAt = { S: h.S, t: h.S && h.S.turn }; };
const turnFree = (h) => !(usedAt && usedAt.S === h.S && usedAt.t === (h.S && h.S.turn));
/** between turns: the first due hint whose target is on screen (fire-and-forget; true when one was queued) */
function hintBetween(h) {
  if (!hintsOn(h) || !turnFree(h) || !alive(h) || !$('#coach').hidden) return false;
  const due = OUT_HINTS.filter((x) => seen(h.S, x.key) && !hinted(x.id));
  if (!due.length) return false;
  turnUsed(h);
  const my = h.my, t0 = h.S.turn;
  (async () => {
    for (const x of due) {
      let m; try { m = E.metrics(h.S); } catch (e) { return; }
      const v = await ui.hint({ target: x.target, title: x.title, text: x.text(m, h.S), skipLabel: 'בלי טיפים', onShow: () => markHint(x.id, h.S) },
        () => h.my === my && my === h.gen() && h.S.turn === t0 && alive(h) && hintsOn(h) && !hinted(x.id));   // still this turn's quiet moment
      if (v === 'skip') { writeReveal({ hintsOff: true }); return; }
      unreadHint(x.id, v);
      if (v !== 'none') return;   // shown (or no longer the moment): one per turn; 'none' = its chip is not on screen — try the next
    }
  })().catch((e) => console.warn(e));
  return true;
}
/** in an open card (§4.7: the one overlay that may sit on a card): C-plan on a payday card with plan tiles, C-focus, C-impact */
function hintInCard(ev, h) {
  if (!ev || !hintsOn(h) || !turnFree(h)) return;
  const S = h.S; let x = null;
  const plans = ev.type === 'payday' && (ev.options || []).some((o) => String(o.id).startsWith('plan:'));
  if (plans && seen(S, 'plan') && !hinted('C-plan')) {
    const ot = (ev.options || []).find((o) => o.id === 'plan:overtime'); const e = (ot && ot.effects) || null;
    const text = e && e.netDelta != null && e.energy != null
      ? `איך ${ui.gw('תעביר', 'תעבירי')} את החודש? "שעות נוספות" מוסיפות ${fm(Math.abs(e.netDelta))} בחודש ולוקחות 🔋 ${Math.abs(Math.round(e.energy))}. מנוחה מחזירה כוח.`
      : `איך ${ui.gw('תעביר', 'תעבירי')} את החודש? כל תוכנית משנה את ההכנסה ואת 🔋 הכוח. מנוחה מחזירה כוח.`;
    x = { id: 'C-plan', target: '#evCard .plans', title: 'התוכנית החודשית', text };
  } else if (ev.data && ev.data.focus && seen(S, 'focus') && !hinted('C-focus')) {
    x = { id: 'C-focus', target: '#evCard .fsec', title: 'מוקד החודש', text: `על מה ${ui.gw('תשים', 'תשימי')} לב החודש, חוץ מהעבודה? כל מוקד עולה קצת 🔋 כוח.` };
  } else if (ev.type === 'deal' && seen(S, 'impact') && !hinted('C-impact')) {
    x = { id: 'C-impact', target: '#evCard #impP', title: 'מה הבחירה עושה', text: 'לכל אפשרות: מה קורה לקופה, לתזרים ולסיכון — לפני שבוחרים.' };
  }
  if (!x) return;
  const my = h.my;
  setTimeout(async () => {
    if (h.my !== my || my !== h.gen() || !ui.isEventOpen() || !$('#coach').hidden || !turnFree(h) || hinted(x.id) || !visEl(x.target)) return;
    turnUsed(h);
    const p = ui.coach({ target: x.target, title: x.title, text: x.text, label: 'טיפ', tip: true, skipLabel: 'בלי טיפים' });
    if (!$('#coach').hidden) markHint(x.id, S);
    const v = await p; if (v === 'skip') writeReveal({ hintsOff: true }); else unreadHint(x.id, v);
  }, 500);
}

/* ------------------------------------------------------------ first visit to a world: 2 coach marks about its mechanic (moved from game.js) */
const COACH_KEY = 'rr2-coach';
const readCoach = () => { try { return JSON.parse(localStorage.getItem(COACH_KEY) || '{}') || {}; } catch (e) { return {}; } };
export const worldCoached = (wid) => !!readCoach()[wid];
export function markWorldCoached(wid) { try { localStorage.setItem(COACH_KEY, JSON.stringify({ ...readCoach(), [wid]: true })); } catch (e) { /* ignore */ } }
const narrow = () => innerWidth <= 820;
export const WORLD_COACH = {
  w1: [
    { target: '#hGoal', title: 'מד החופש', text: 'המטרה בשכונה: הכנסה פסיבית — כסף שנכסים מכניסים בלי שתעבוד — שמכסה את כל ההוצאות. כשהפס מתמלא, יצאת מהמירוץ.' },
    { target: () => (narrow() ? '#sheetBtn' : '#sheet .total'), title: 'הדוח הכספי', text: 'כאן רואים מה נכנס, מה יוצא, מה יש לך ומה החובות שלך. לפני כל החלטה — כדאי להציץ בשורה התחתונה: התזרים החודשי.' },
  ],
  w2: [
    { target: '#hWorld', title: 'הריבית', text: 'בעיר הגדולה הריבית זזה. משכנתא משתנה עולה ויורדת איתה; קבועה ננעלת ולא מפתיעה. משבצות הבנק (תכלת) מזיזות אותה.' },
    { target: '#hGoal', title: 'יעד רחוק', text: 'סגנון החיים כאן יקר, אז היעד רחוק. משבצות השדרוג (כתומות) מגדילות הכנסה מנכס או מקצצות הוצאה — לתמיד.' },
  ],
  w3: [
    { target: '#hWorld', title: 'שער הדולר', text: 'בנמל הכל תלוי בדולר: דולר חזק טוב ליצואנים ולספינות, ורע ליבואנים. גידור נועל את השער לשנה — קונים אותו כשהשער נוח, לא באמצע סערה.' },
    { target: '#hGoal', title: 'היעד: שווי נקי', text: 'כאן לא סופרים תזרים אלא שווי: כל מה שיש לך פחות החובות שלך. וזהב? הוא קופץ במשברים — ביטוח טוב לתיק.' },
  ],
  w4: [
    { target: '#hGoal', title: 'שני יעדים', text: 'בעמק העתיד צריך גם שווי נקי וגם נקודות השפעה. שני הפסים חייבים להתמלא.' },
    { target: '#hWorld', title: 'סטארט־אפים והשפעה', text: 'במשבצות הפיץ\' (סגולות) רוב הסטארט־אפים נכשלים ומעטים עושים פי 20 — אז מפזרים הרבה צ\'קים קטנים. משבצות הנתינה (ורודות) בונות השפעה שגדלה עם הזמן.' },
  ],
};
async function worldCoach(h) {
  const marks = WORLD_COACH[h.W.id]; if (!marks) return;
  markWorldCoached(h.W.id);
  for (let i = 0; i < marks.length; i++) {
    if (!alive(h)) return;
    const m = marks[i]; const target = typeof m.target === 'function' ? m.target() : m.target;
    const v = await ui.coach({ target, title: m.title, text: m.text, step: i + 1, total: marks.length, label: `${h.W.name} ·`, skipLabel: 'דלג' });
    if (v === 'skip') return;
  }
}

/* ------------------------------------------------------------ hooks */
const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
const ROLL_TEXT = () => ui.gw('לחץ', 'לחצי') + ' על "הטל קוביות". החייל זז, ובכל משבצת מחכה הזדמנות, הוצאה או הפתעה.' + (coarse() ? '' : ' (אפשר גם רווח)');   // S-C2
/** Called once the board is shown and any pending card (e.g. the engine's intro card) was handled. */
export async function afterStart(h) {
  curS = h.S; practice.reset(h);
  trace('game');
  if (h.S.over) return;
  const tutorialHere = h.CFG.tutorial && h.W.id === 'w1';
  if (tutorialHere) markWorldCoached(h.W.id); // the tutorial explains w1
  // engines without the intro card (E-3 pending): the tutorial counts as done once its game is on screen — what
  // lobby.js used to do on launch, so quitting a not-yet-started game keeps the tutorial for the next one
  if (tutorialHere && !engineIntro(h.S)) emitDone(h, 'done');
  const R = readReveal();
  if (R && R.tourNext) { writeReveal({ tourNext: false }); await sleep(700); if (alive(h)) await tour(h); return; }
  if (wantCoach(h, 'roll')) {
    await sleep(700);
    if (!alive(h)) return;
    await showCoach(h, 'roll', { target: '#roll', title: 'מטילים קובייה', text: ROLL_TEXT() });   // S-C1 / S-C2 (core 1/2)
  } else if (!worldCoached(h.W.id)) {
    await sleep(900);
    await worldCoach(h);
  }
}
/** Between turns (roll enabled again). */
export async function afterTurn(h) {
  curS = h.S;
  if (wantCoach(h, 'meter') && isRevealed('goal') && turnFree(h)) {   // §4.4 C-meter (core 2/2) runs once the meter is on screen (one coach per turn)
    const pass = h.W.goal.type === 'passive';
    let text = 'כשהפס מתמלא — ניצחת. כל החלטה מזיזה אותו.';
    if (pass) { const m = E.metrics(h.S); const ex = m.expenses || 0; text = `הכנסה פסיבית ${fm(m.passive || 0)} מתוך ${fm(ex)} הוצאות: ${ex ? Math.round(((m.passive || 0) / ex) * 100) : 0}%. כשהפס מלא — יצאת מהמירוץ.`; }   // S-C6
    await showCoach(h, 'meter', { target: '#hGoal', title: pass ? 'מד החופש' : 'היעד של העולם', text });
    return;
  }
  if (hintBetween(h)) return;   // §4.4 "טיפ" — the practice chip waits for another turn
  practice.offer(h);
}
/** A card was opened (in-card coaches). */
export function onCard(ev, ctl, h) {
  curS = h.S; practice.hide();
  if (ev && h.S && h.S.ui && (revealing(h.S) || hintable)) {   // §4.3 card triggers (gradual reveal and / or §4.4 hint triggers)
    const S = h.S; const U = S.ui; const R = revealing(S) ? U.reveal : null; let ch = false;
    if (ev.type === 'intro') ch = revealAdd(S, 'cf');
    if (ev.type === 'payday' && (ev.options || []).some((o) => String(o.id).startsWith('plan:'))) {
      if (R) R.pd = (R.pd || 0) + 1;
      if (U.hpdT !== S.turn) { U.hpdT = S.turn; U.hpd = (U.hpd || 0) + 1; }   // landed payday cards (a re-opened card counts once)
      ch = revealAdd(S, 'energy', 'plan', (R ? R.pd : U.hpd) >= 3 ? 'focus' : null) || ch;
    }
    if (ev.type === 'deal') { if (U.hdlT !== S.turn) { U.hdlT = S.turn; U.hdl = (U.hdl || 0) + 1; } if (U.hdl >= 2) ch = revealAdd(S, 'impact') || ch; }   // 2nd deal card
    if (ev.type === 'life') ch = revealAdd(S, 'happy', 'age') || ch;
    if (ev.type === 'doodad' && (ev.options || []).some((o) => o.id === 'skip')) ch = revealAdd(S, 'happy') || ch;
    if (ch) { h.persist(); h.render(false); }
  }
  if (wantCoach(h, 'roi') && ev.type === 'deal' && ev.data && ev.data.down && (ev.data.cf || 0) > 0) {   // §4.4 C-roi (core, in card): a deal that earns (the tutorial deal), so S-C4 reads true
    const d = ev.data;
    setTimeout(async () => {
      if (h.my !== h.gen() || !ui.isEventOpen()) return;
      await showCoach(h, 'roi', { target: '#evCard [data-roi]', title: 'כמה הכסף מרוויח?', text: `${fm(d.down)} שמכניסים ${fm(d.cf || 0)} בחודש = ${d.roi ?? 0}% בשנה. ${ui.gw('לחץ', 'לחצי')} כאן כדי לראות את החישוב.` });   // S-C3 / S-C4
    }, 450);
    return;
  }
  hintInCard(ev, h);
}
/** A card closed. The engine intro card (E-3) ends the tutorial core: bus 'onboard:done' {reason:'done'|'skip'}. */
export function onCardClosed(ev, res, h) {
  if (ev && ev.type === 'intro') emitDone(h, h.S && h.S.intro && h.S.intro.step === 'skipped' ? 'skip' : 'done');
  if (ev && ev.type === 'intro' && h && h.S && h.S.intro && h.S.intro.step === 'skipped' && markSkipped(h.S)) h.persist();   // AC-T1: no coach after the skip
  const S = h && h.S;
  if (!ev || !S || !S.ui || !(revealing(S) || hintable)) return;   // §4.3 reveal and / or §4.4 hint triggers
  let ch = false;
  if (ev.type === 'intro' && revealing(S)) {
    if (S.intro && S.intro.step === 'skipped') ch = revealSkip(S);
    else {
      if (S.intro && S.intro.choice === 'fix:diy') ch = revealAdd(S, 'energy') || ch;
      if (S.intro && S.intro.goal) ch = revealAdd(S, 'next', S.intro.goal === 'cushion' || (S.intro.goal && S.intro.goal.id === 'cushion') ? 'fund' : null) || ch;
      try { const g = E.metrics(S).nextGoal; if (g) ch = revealAdd(S, 'next', g.id === 'cushion' ? 'fund' : null) || ch; } catch (e) { /* ignore */ }
    }
  }
  const last = Array.isArray(S.actions) ? S.actions[S.actions.length - 1] : null; const optId = last && last[0] === 'c' ? String(last[1]) : '';
  if (ev.type === 'payday' && (ev.options || []).some((o) => String(o.id).startsWith('plan:'))) ch = revealAdd(S, 'sheet') || ch;
  if (ev.type === 'doodad' && (optId === 'credit' || optId === 'inst3')) ch = revealAdd(S, 'credit') || ch;
  if (res && res.ok !== false) ch = revealTick(S, { out: res }) || ch;
  if (ch) { h.persist(); h.render(false); }
}
/** §4.5: the tour shows every part while it runs, then the reveal state again. */
async function withAll(h, fn) { tourAll = true; try { h.render && h.render(false); return await fn(); } finally { tourAll = false; try { h.render && h.render(false); } catch (e) { /* ignore */ } } }

/* ------------------------------------------------------------ F4: tour (5 marks over the current values) and legend */
const fmt = (n) => (typeof E.fmtM === 'function' ? E.fmtM(n) : String(Math.round(n)));
export async function tour(h) { return withAll(h, () => tourInner(h)); }
async function tourInner(h) {
  const m = E.metrics(h.S); const pay = m.payslip || {};
  const net = pay.net ?? m.salary ?? 0; const exp = m.expenses || 0; const pct = exp ? Math.round(((m.passive || 0) / exp) * 100) : 0;
  const steps = [
    { target: '#hCash', title: '💰 מזומן ותזרים', text: `כאן כל השורות: נטו ${fmt(net)}, הוצאות ${fmt(exp)}, נשאר ${fmt(m.cashflow || 0)}. לפני החלטה גדולה — כדאי להציץ.` },
    { target: '#hGoal', title: 'מד החופש', text: `הכנסה פסיבית ${fmt(m.passive || 0)} מתוך ${fmt(exp)} הוצאות: ${pct}%. כשהפס מלא — יצאת מהמירוץ.` },
    { target: '#hLife', title: 'החיים שלך', text: 'החיים שלך: גיל, 🔋 כוח, אושר, אשראי ועוד. לחיצה על כל סימן מסבירה אותו.' },
    { target: '#roll', title: 'מטילים קובייה', text: ROLL_TEXT() },
    { target: '#sheetBtn', title: 'הדוח שלי', text: `כאן כל השורות: נטו ${fmt(net)}, הוצאות ${fmt(exp)}, נשאר ${fmt(m.cashflow || 0)}. לפני החלטה גדולה — כדאי להציץ.` },
  ];
  for (let i = 0; i < steps.length; i++) {
    const v = await ui.coach({ ...steps[i], step: i + 1, total: steps.length, label: 'סיור', skipLabel: 'סיום' });
    if (v === 'skip') return;
  }
}
export function legend(h) {
  const m = E.metrics(h.S); const L = m.life || {}; const e = m.emergency || {};
  const rows = [
    ['💰', 'מזומן', fmt(m.cash), 'הכסף שבקופה עכשיו.'],
    ['💧', 'תזרים חודשי', fmt(m.cashflow || 0), 'מה נשאר בסוף כל חודש.'],
    ['📊', 'מד החופש', `${m.expenses ? Math.round(((m.passive || 0) / m.expenses) * 100) : 0}%`, 'כמה מההוצאות ההכנסה הפסיבית מכסה.'],
    L.age != null ? ['🎂', 'גיל', String(Math.floor(L.age)), 'כל חודש במשחק הוא חודש בחיים.'] : null,
    L.energy != null ? ['🔋', 'כוח', `${Math.round(L.energy)}/100`, 'הכוח של הדמות בסיפור — לא ⚡ זריקות.'] : null,
    L.happiness != null ? ['😊', 'אושר', `${Math.round(L.happiness)}/100`, 'ל־★★★ צריך לפחות 60.'] : null,
    L.creditScore != null ? ['🏦', 'דירוג אשראי', String(L.creditScore), 'קובע כמה יעלו הלוואות.'] : null,
    L.inflationYear != null ? ['🛒', 'אינפלציה', `${L.inflationYear}%`, L.inflationLastYear != null ? 'כמה המחירים עלו בשנה שעברה.' : 'הצפי לשנה הראשונה.'] : null,
    m.focus ? ['🎯', 'מוקד החודש', String(m.focus.current.label || ''), 'על מה שמים את הראש החודש. עולה קצת 🔋.'] : null,
    m.econ ? ['📊', 'מד הכלכלה', String(m.econ.label || ''), 'מתעדכן באיחור ועם רעש.'] : null,
    ['🛟', 'קרן חירום', e.months != null ? `${e.months} חודשים` : fmt(m.savings || 0), 'חודשי הוצאות שמורים בצד.'],
    L.plan ? ['📅', 'התוכנית', String((L.plans || []).find((p) => p.id === L.plan)?.label || L.plan), ui.gw('איך אתה מעביר את החודש.', 'איך את מעבירה את החודש.')] : null,
    h.CFG && !h.CFG.learn && !h.CFG.resultId && (h.CFG.mode || 'free') !== 'daily' ? ['⚡', 'זריקות', (() => { try { return `${EN.get()}/${EN.MAX}`; } catch (e) { return ''; } })(), 'כל הטלה במשחק רגיל עולה זריקה אחת.'] : null,
    m.nextGoal ? ['🎯', 'המטרה הבאה', String(m.nextGoal.title || ''), ''] : m.dream ? ['🎯', 'החלום', `${m.dream.icon || ''} ${m.dream.name || ''}`, ''] : null,
  ].filter(Boolean);
  return ui.modal({ tag: 'איך משחקים', color: '#0e7490', title: 'מה כל סימן אומר', dismissable: true,
    html: `<table class="t4-legend"><tbody>${rows.map(([ic, n, v, t]) => `<tr><td aria-hidden="true">${ic}</td><th scope="row">${ui.esc(n)}</th><td><bdi>${ui.esc(v)}</bdi></td><td>${ui.esc(t)}</td></tr>`).join('')}</tbody></table>`,
    actions: [{ label: 'סגירה', cls: 'primary' }] });
}

/* ------------------------------------------------------------ §10 practice chip (needs E.practiceDue + ui.practiceChip) */
const practice = {
  memo: { lastTurn: null, offered: [], doneA: [] }, S: null,
  reset(h) { if (this.S !== h.S) { this.S = h.S; this.memo = { lastTurn: null, offered: [], doneA: doneTopics() }; } },
  offer(h) {
    if (typeof E.practiceDue !== 'function' || typeof ui.practiceChip !== 'function' || !h.CFG || (h.CFG.mode || 'free') !== 'free' || h.CFG.resultId) return;
    if (!alive(h) || !$('#coach').hidden) return;
    let q = null; try { q = E.practiceDue(h.S, this.memo); } catch (e) { q = null; }
    if (!q) return;
    this.memo.offered.push(q.id); this.memo.lastTurn = h.S.turn;  // an ignored chip counts as offered
    ui.practiceChip(q, async (idx) => {
      const r = h.answerPractice ? h.answerPractice(q.id, idx) : null;
      if (r && r.ok) bus.emit('practice', { topic: q.topic, right: !!r.right, qid: q.id });
      return r;
    });
  },
  hide() { if (typeof ui.hidePractice === 'function') { try { ui.hidePractice(); } catch (e) { /* ignore */ } } },
};
function doneTopics() { try { const s = JSON.parse(localStorage.getItem('rr2-library') || '{}'); return Object.keys((s && s.practiced) || {}); } catch (e) { return []; } }
/** IR-T4-9: game.js calls this when it goes to the lobby or ends the game. */
export function hidePractice() { practice.hide(); }

/* ------------------------------------------------------------ F4 help modal (ui.js injects #helpBtn → bus 'onboard:help') */
/** S-H0…S-H6: "איך משחקים" → tour / legend / full tutorial in the next w1 game. */
export async function help(h) {
  // T2 (in-game UI lane): the mentor level lives in this menu — game.js passes h.mentorMenu / h.mentorLabel
  const ml = h && typeof h.mentorMenu === 'function' && typeof h.mentorLabel === 'function' ? h.mentorLabel() : null;
  const mBtn = ml ? `<button data-h="mentor">🧭 רמת המנטור: ${ui.esc(ml)}</button>` : '';
  const v = await ui.modal({ tag: 'איך משחקים', color: '#0e7490', title: ui.gz('מה תרצה לראות?'), dismissable: true,
    html: `<div class="t4-help"><button data-h="tour">🎬 סיור קצר במסך (5 צעדים)</button><button data-h="legend">📖 מה כל סימן אומר</button>${mBtn}<button data-h="replay">🔄 הדרכה מלאה במשחק הבא בשכונה</button></div>`,
    onExtra: (e) => { const b = e.target.closest('[data-h]'); if (!b) return; pick = b.dataset.h; document.querySelector('#gm .acts button')?.click(); },
    actions: [{ label: 'סגירה', cls: 'primary', v: null }] });
  void v;
  const p = pick; pick = null;
  if (p === 'mentor') await h.mentorMenu();
  else if (p === 'tour') await tour(h);
  else if (p === 'legend') await legend(h);
  else if (p === 'replay') {
    try { const P = await import('./progress.js'); P.requestTutorialReplay(); } catch (e) { /* game-only copy without progress.js */ }
    ui.toast('נפתח את ההדרכה במשחק הבא בשכונה.');
  }
}
let pick = null;
