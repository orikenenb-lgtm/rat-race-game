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
let curS = null;
export function isRevealed(key) {
  const R = curS && curS.ui && curS.ui.reveal;
  if (!R || R.skipped || !Array.isArray(R.keys)) return true;
  if (['cash', 'month', 'mentor', 'home', 'mute', 'help', 'roll'].includes(key)) return true;
  return R.keys.includes(key);
}

/* ------------------------------------------------------------ onboard:done (once per game) */
let doneFor = null;
function emitDone(h, reason) {
  if (!h || !h.S || doneFor === h.S) return;
  doneFor = h.S;
  bus.emit('onboard:done', { reason });
}
const engineIntro = (S) => !!(S && S.intro);

/* ------------------------------------------------------------ legacy tutorial coaches (roll → meter → ROI), unchanged texts */
const COACH_TOTAL = 3;
function wantCoach(h, k) { const U = h.S && h.S.ui; return !!(h.CFG && h.CFG.tutorial && U && U.coach && !U.coach.skip && !U.coach[k]); }
async function showCoach(h, k, o) {
  const U = h.S.ui; U.coach[k] = true; h.persist();
  const step = ['roll', 'meter', 'roi'].filter((x) => U.coach[x]).length;
  const v = await ui.coach({ ...o, step, total: COACH_TOTAL });
  if (v === 'skip') { U.coach.skip = true; emitDone(h, 'skip'); }
  h.persist();
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
const ROLL_TEXT = () => 'לחץ על "הטל קוביות". החייל זז, ובכל משבצת מחכה הזדמנות, הוצאה או הפתעה.' + (coarse() ? '' : ' (אפשר גם רווח)');   // S-C2
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
    await showCoach(h, 'roll', { target: '#roll', title: 'מטילים קובייה', text: ROLL_TEXT() });
  } else if (!worldCoached(h.W.id)) {
    await sleep(900);
    await worldCoach(h);
  }
}
/** Between turns (roll enabled again). */
export async function afterTurn(h) {
  curS = h.S;
  if (wantCoach(h, 'meter')) {
    const pass = h.W.goal.type === 'passive';
    await showCoach(h, 'meter', { target: '#hGoal', title: pass ? 'מד החופש' : 'היעד של העולם', text: pass ? 'כשההכנסה הפסיבית (כסף מנכסים) מכסה את כל ההוצאות — הפס מתמלא ויצאת מהמירוץ. זו המטרה.' : 'כשהפס מתמלא — ניצחת. כל החלטה מזיזה אותו.' });
    return;
  }
  practice.offer(h);
}
/** A card was opened (in-card coaches). */
export function onCard(ev, ctl, h) {
  curS = h.S; practice.hide();
  if (wantCoach(h, 'roi') && ev.type === 'deal' && ev.data && ev.data.down) {
    setTimeout(async () => {
      if (h.my !== h.gen() || !ui.isEventOpen()) return;
      await showCoach(h, 'roi', { target: '#evCard [data-roi]', title: 'הסוד של המשקיעים', text: 'לפני שקונים: כמה אחוז בשנה הכסף שלך מרוויח? לחץ כאן ותראה את החישוב. אם התשואה גבוהה ממה שעולה ההלוואה — העסקה עובדת בשבילך. אם נמוכה — היא עובדת נגדך.' });
    }, 450);
  }
}
/** A card closed. The engine intro card (E-3) ends the tutorial core: bus 'onboard:done' {reason:'done'|'skip'}. */
export function onCardClosed(ev, res, h) {
  if (ev && ev.type === 'intro') emitDone(h, h.S && h.S.intro && h.S.intro.step === 'skipped' ? 'skip' : 'done');
}

/* ------------------------------------------------------------ F4: tour (5 marks over the current values) and legend */
const fmt = (n) => (typeof E.fmtM === 'function' ? E.fmtM(n) : String(Math.round(n)));
export async function tour(h) {
  const m = E.metrics(h.S); const pay = m.payslip || {};
  const net = pay.net ?? m.salary ?? 0; const exp = m.expenses || 0; const pct = exp ? Math.round(((m.passive || 0) / exp) * 100) : 0;
  const steps = [
    { target: '#hCash', title: 'הדוח שלי', text: `כאן כל השורות: נטו ${fmt(net)}, הוצאות ${fmt(exp)}, נשאר ${fmt(m.cashflow || 0)}. לפני החלטה גדולה — תציץ.` },
    { target: '#hGoal', title: 'מד החופש', text: `הכנסה פסיבית ${fmt(m.passive || 0)} מתוך ${fmt(exp)} הוצאות: ${pct}%. כשהפס מלא — יצאת מהמירוץ.` },
    { target: '#hLife', title: 'החיים שלך', text: 'החיים שלך: גיל, 🔋 כוח, אושר, אשראי ועוד. לחיצה על כל סימן מסבירה אותו.' },
    { target: '#roll', title: 'מטילים קובייה', text: ROLL_TEXT() },
    { target: '#sheetBtn', title: 'הדוח שלי', text: `כאן כל השורות: נטו ${fmt(net)}, הוצאות ${fmt(exp)}, נשאר ${fmt(m.cashflow || 0)}. לפני החלטה גדולה — תציץ.` },
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
    L.inflationYear != null ? ['🛒', 'אינפלציה', `${L.inflationYear}%`, 'כמה המחירים עולים השנה.'] : null,
    ['🛟', 'קרן חירום', e.months != null ? `${e.months} חודשים` : fmt(m.savings || 0), 'חודשי הוצאות שמורים בצד.'],
    L.plan ? ['📅', 'התוכנית', String((L.plans || []).find((p) => p.id === L.plan)?.label || L.plan), 'איך אתה מעביר את החודש.'] : null,
    h.CFG && !h.CFG.learn && !h.CFG.resultId && (h.CFG.mode || 'free') !== 'daily' ? ['⚡', 'זריקות', '', 'כל הטלה במשחק רגיל עולה זריקה אחת.'] : null,
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
  const v = await ui.modal({ tag: 'איך משחקים', color: '#0e7490', title: 'מה תרצה לראות?', dismissable: true,
    html: '<div class="t4-help"><button data-h="tour">🎬 סיור קצר במסך (5 צעדים)</button><button data-h="legend">📖 מה כל סימן אומר</button><button data-h="replay">🔄 הדרכה מלאה במשחק הבא בשכונה</button></div>',
    onExtra: (e) => { const b = e.target.closest('[data-h]'); if (!b) return; pick = b.dataset.h; document.querySelector('#gm .acts button')?.click(); },
    actions: [{ label: 'סגירה', cls: 'primary', v: null }] });
  void v;
  const p = pick; pick = null;
  if (p === 'tour') await tour(h);
  else if (p === 'legend') await legend(h);
  else if (p === 'replay') {
    try { const P = await import('./progress.js'); P.requestTutorialReplay(); } catch (e) { /* game-only copy without progress.js */ }
    ui.toast('נפתח את ההדרכה במשחק הבא בשכונה.');
  }
}
let pick = null;
