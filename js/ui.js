// מירוץ העכברים 2.0 — DOM layer: HUD, statement sheet, event cards (incl. the v1.1 trade window), mentor, dice,
// toasts, achievement toast, coach marks, flying coins. Generic helpers (toast/modal/confirmBox/achievementToast)
// are also used by the lobby.
import { fmt, fmtM, sgn, fmtP, genderize, starThresholds, money as moneyOf } from './engine.js';
import { goalPanelModel, monthsText, partTag, meterLabel, isStreak, covX, partText1420 } from './hudgoal.js';
import { displayLesson } from './data/lessons-meta.js';   // wave 3a: misleading lesson titles → display overrides   // 3D upgrade wave 2 (A2 G-04): the "יעד העולם" panel model (pure, engine outputs only)
import { sfx } from './audio.js';
import { mapLabel, mapNo, groupOf } from './worlds-groups.js';   // 2026-11-25: a level is a מפה inside one of 6 עולמות ("מפה 2 · הכסף הגדול")
import { reducedMotion } from './motion.js';
import { bus } from './bus.js';
import * as T6S from './summary.js';   // T6: graph / table / personas (pure, no DOM at import)
import { levelText as stageText, levelHint as stageHint, ageBand, DIV_HE } from './render/vocab.js';   // T3 UI-5: growth-stage words shared with T5 (pure)
import { miniHtml as cdlMini, mountChart as cdlMount, fullHtml as cdlFull } from './render/candles-lite.js';
import * as WV from './render/worldview1115.js';
import * as WV2 from './render/worldview1216.js';
import * as WV3 from './render/worldview1420.js';   // w14 / w17 / w18 / w19 / w20: cards, news, panels, the chip / sheet text, the two-tap words (HTML only; the engine's numbers)   // w12 / w16: cards, panels, the chip / sheet text, the two-tap words (HTML only; the engine's numbers)   // w11 / w15: cards, panels and the chip text (HTML only; the engine's numbers)
import * as MV from './render/marketview.js';   // w10: the market screen (HTML only; the engine's numbers)
import { marketSeries } from './candlelog.js';  // w10: the engine's candles in the one chart component's series shape   // CATALOG-25 §3.9: light candle view (SVG, no dependency)

const $ = (s, r = document) => r.querySelector(s);
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Wrap signed ₪ amounts / percentages inside Hebrew sentences in LTR isolates (LRI…PDI) so "(+₪4,830)" stays readable. */
const NUMRE = /[+−-]?(?:[₪$]\d{1,3}(?:,\d{3})*(?:\.\d+)?[KM]?|\d+(?:\.\d+)?%(?:[–-]\d+(?:\.\d+)?%)?)|[+−]\d{1,3}(?:,\d{3})*(?:\.\d+)?/g;
export const iso = (t) => String(t ?? '').replace(/→/g, '←').replace(NUMRE, (m) => '\u2066' + m.replace(/^([+−-])(?=[₪$])/, '$1\u2060') + '\u2069');
/** "≥" mirrors in RTL and confuses readers — say it in words. */
export const goalWords = (t) => String(t ?? '').replace(/הכנסה פסיבית\s*≥\s*הוצאות/g, 'הכנסה פסיבית שמכסה את ההוצאות').replace(/\s*≥\s*/g, ' של לפחות ');
/** HTML text: amounts become <span class="num"> (Rubik, LTR isolate) — T5 CR-U1 (₪ never in Secular One). Text-only callers keep iso(). */
const escI = (t) => String(esc(t)).replace(/→/g, '←').replace(NUMRE, (m) => '<span class="num">' + m.replace(/^([+−-])(?=[₪$])/, '$1⁠') + '</span>');
const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const N = (n) => Math.round(n).toLocaleString('en-US');
const HEB = /[\u0590-\u05FF]/;
/** Isolated number span; text that also contains Hebrew words is isolated RTL so it still reads right. */
/* T3 verify D4: the player's grammatical gender for the UI's own strings (game.js sets it on every start / resume) */
let uiG = 'm';
export function setGender(g) { uiG = g === 'f' ? 'f' : 'm'; }
/** The engine's genderize for a UI string (data is written in the masculine form). */
/* wave 2 (A3 #5): the engine's table (pinned) turns the masculine "you" into the feminine one but leaves a few verbs after it masculine ("לפני שאת מחליט").
   A UI-side pass completes those phrases for a female player — display only; the engine text and its table are unchanged. */
const GZ_UI_W = { עובד: 'עובדת', משלם: 'משלמת', יודע: 'יודעת', גר: 'גרה', צריך: 'צריכה', עייף: 'עייפה', עומד: 'עומדת', מתאהב: 'מתאהבת', מרוויח: 'מרוויחה',
  מפריש: 'מפרישה', מפסיד: 'מפסידה', מחליט: 'מחליטה', מושך: 'מושכת', מגודר: 'מגודרת', חשוף: 'חשופה', בוחר: 'בוחרת' };   // the words that follow "אתה" in the data
const GZ_UI = [[new RegExp(`(^|[^\u05D0-\u05EA])((?:ש|ו|כש)?את (?:לא |כבר )?)(${Object.keys(GZ_UI_W).join('|')})(?![\u05D0-\u05EA])`, 'g'), (x, a, b, w) => a + b + GZ_UI_W[w]],
  [/כסף את שם(?![\u05D0-\u05EA])/g, 'כסף את שמה']];
export const gzFix = (t, g = uiG) => { if (g !== 'f' || !t) return t; let x = String(t); for (const [re, f] of GZ_UI) x = x.replace(re, f); return x; };
export const gz = (t) => gzFix(genderize(t, uiG));
/** Pick the masculine / feminine form of a phrase the GZ table does not cover. */
export const gw = (m, f) => (uiG === 'f' ? f : m);
const num = (s, c = '') => (HEB.test(String(s)) ? `<span class="num rtl ${c}">${iso(s)}</span>` : `<span class="num ${c}">${s}</span>`);
const pctTxt = (x) => `${Math.round(x * 100) / 100}%`;
const usdTxt = (u) => `₪${Number(u).toFixed(2)}`;
/* w5 (season): month / band words for the HUD chip and the world panel */
const MONTH_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const MONTH_S = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const BAND_HE = { peak: 'עונה', mid: 'רגיל', off: 'שפל' };
const BAND_IC = { peak: '☀️', mid: '🌤️', off: '🌧️' };
const tourTxt = (t) => '×' + (Math.round((+t || 0) * 100) / 100).toFixed(2);
const mS = (n) => moneyOf(Math.round(+n || 0), 'short');   // ₪850 אלף / ₪12.5 מיליון — panel numbers (E.money, wave 0 I6)
const mSg = (n) => (Math.round(+n || 0) > 0 ? '+' : '') + mS(n);   // signed short money (E.money)
/* w6 (plant): line words for the HUD chip, the cards and the world panel */
const MAINT_HE = { preventive: 'מונעת', basic: 'בסיסית', run: 'עד שזה נשבר' };
const HZ_HE = { low: 'נמוך', mid: 'בינוני', high: 'גבוה' };
const LIGHT_HE = { green: 'תקין', amber: 'שחוק', red: 'במצב ירוד' };
const LIGHT_DOT = { green: '🟢', amber: '🟠', red: '🔴' };
const pctI = (x) => `${Math.round((+x || 0) * 100)}%`;
const pct1 = (x) => `${Math.round((+x || 0) * 1000) / 10}%`;
const shiftHe = (n) => (n === 3 ? 'שלוש משמרות' : n === 2 ? 'שתי משמרות' : 'משמרת אחת');
const pipsOf = (n) => '●'.repeat(Math.max(0, Math.min(3, n | 0))) + '○'.repeat(3 - Math.max(0, Math.min(3, n | 0)));
/* w7 (chain) / w8 (projects): words for the HUD chip, the site / land cards and the world panel */
const LOC_HE = { A: 'מיקום מצוין', B: 'מיקום סביר', C: 'מיקום חלש' };
const STAGE4 = ['בשיפוץ', 'נפתח', 'בהרצה', 'כמעט בשל', 'בשל'];
const pips4 = (n) => '●'.repeat(Math.max(0, Math.min(4, n | 0))) + '○'.repeat(4 - Math.max(0, Math.min(4, n | 0)));
const PHASE_HE = { permit: 'ממתין להיתר', build: 'בבנייה', done: 'הושלם' };
const CTR_HE = { reliable: 'קבלן אמין', cheap: 'קבלן זול' };
/* w9 (energy) / w10 (market + portfolio): words for the HUD chip, the cards and the panels */
const TECH_HE = { solar: 'שדה סולארי', wind: 'חוות רוח', storage: 'אגירת סוללות', hybrid: 'סולארי עם אגירה', line: 'קו הולכה', h2: 'פיילוט מימן' };
const TECH_IC = { solar: '☀️', wind: '🌬️', storage: '🔋', hybrid: '🔆', line: '🗼', h2: '🧪' };
const OFF_HE = { ppa: 'חוזה PPA קבוע', merchant: 'שוק חופשי', line: 'תעריף מפוקח' };
const mwh = (x) => `${N(x)} ₪ למגה־ואט שעה`;
let speed = 1;
export function setSpeed(f) { speed = f; }
const vibrate = (p = 12) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* ignore */ } };
export { vibrate };

/** Compact money for tight spots: ₪950K / ₪3.25M (exact below ₪100,000). */
export function fmtC(n) {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e6) { const v = a / 1e6; return s + '₪' + (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.?0+$/, '') + 'M'; }
  if (a >= 1e5) return s + '₪' + Math.round(a / 1e3) + 'K';
  if (a >= 1e4) return s + '₪' + (Math.round(a / 100) / 10) + 'K';
  return fmt(n);
}
const compact = () => innerWidth < 600;
const tiny = () => innerWidth < 420;
/** HUD money: exact on desktop, ₪16.6K on phones (₪1.6K on the narrowest ones). */
// worlds wave 1: from ₪100K up a phone uses E.money 'tiny' (3 significant digits, ≤ 6 chars: "₪127K", "₪1.8M", "₪1.25B") — w5's
// "+₪127.1K" overlapped the cash next to it at 390 px; below ₪100K the old wording stays (w1–w4 phones unchanged)
const money = (n) => (tiny() && Math.abs(n) >= 1e5 ? moneyOf(n, 'tiny') : tiny() && Math.abs(n) >= 1000 ? (n < 0 ? '−' : '') + '₪' + (Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : (Math.round(Math.abs(n) / 100) / 10) + 'K') : compact() ? fmtC(n) : fmtM(n));
const moneyS = (n) => (Math.round(n) > 0 ? '+' : '') + money(n);

/* ============================================================ icons */
export const ICON = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5.2v-6.2H9.2V21H4a1 1 0 0 1-1-1z"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m16 9 6 6m0-6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  overview: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.5"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4 14h6.5L9 22l11-13h-7z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l5 5v15H6z" opacity=".25"/><path d="M6 2h9l5 5v15H6zM15 2v5h5M9 12h8M9 16h8M9 8h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  medal: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 2h8l4 12h-8zM34 2h-8l-4 12h8z" fill="#2f6fdb"/><circle cx="24" cy="30" r="15" fill="#f2b632" stroke="#c98a12" stroke-width="3"/><path d="m24 21 2.8 5.7 6.2.9-4.5 4.4 1 6.2L24 35.3 18.5 38.2l1-6.2L15 27.6l6.2-.9z" fill="#fff6d5"/></svg>',
  up: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2 11 9H1z"/></svg>',
  down: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10 1 3h10z"/></svg>',
  voice: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

/** Playtest B1: the end-screen near miss never shows negative months. The engine's "עוד {d} חודשים פחות" is about TIME; when the
 *  months already met the ★★★ (or ★★) line, what stopped the star was the fund or happiness — say that. */
export function nearMissText(end) {
  const n = end && end.nearMiss; if (!n || !n.text) return '';
  if (typeof n.monthsToNext !== 'number' || n.monthsToNext > 0) return n.text;
  const f = !!end.starsBlockedByFund, h = !!end.starsBlockedByHappiness;
  if (f && h) return 'יצאת בזמן של ★★★, אבל ★★★ דורש גם קרן חירום של 3 חודשי הוצאות וגם אושר של 60 לפחות.';
  if (f) return 'יצאת בזמן של ★★★, אבל ★★★ דורש גם קרן חירום של 3 חודשי הוצאות.';
  if (h) return 'יצאת בזמן של ★★★, אבל ★★★ דורש גם אושר של 60 לפחות.';
  if (end.starsBlockedBy && end.starsBlockedBy.label) { const l = String(end.starsBlockedBy.label); return `יצאת בזמן של ★★★, אבל ${/^★/.test(l) ? l : `★★★ רק ${l}`}.`; }   // worlds: a module's star rule (w6: '★★★ רק בלי עצירה…'; w10: 'בלי אף מכירה כפויה')
  return 'יצאת בזמן — הכוכב הבא היה ממש קרוב.';
}
/* ============================================================ toasts */
const tq = []; let tBusy = false, tWait = 0, tCur = null;
/** Short message pill under the HUD (queued). kind: ''|'gold'|'bad' */
export function toast(text, opts = {}) {
  if (!text) return;
  // T5 §4.2 rules 5–6 (T5 verify D1): identical consecutive texts are dropped; the queue keeps 6 and drops the OLDEST ordinary item
  // first — important feedback (opts.keep: level-down, milestones, dream missions, lessons; every 'bad' toast) is never dropped
  const it = { text: String(text), kind: opts.kind || '', ms: opts.ms || 0, action: opts.action || null, sub: opts.sub ? String(opts.sub) : '', keep: !!opts.keep || opts.kind === 'bad' };
  const last = tq[tq.length - 1]; if (last && last.text === it.text && last.sub === it.sub && !it.action) return;
  // final-wave fix: an urgent warning (storage full, a removed practice branch) goes to the FRONT of the queue — it must not wait
  // behind a burst of lesson / dream toasts (stability S10)
  if (opts.urgent) tq.unshift(it); else tq.push(it);
  while (tq.length > 6) { const i = tq.findIndex((x) => !x.keep); if (i < 0) break; tq.splice(i, 1); }
  if (!tBusy) nextToast();
}
function nextToast() {
  const el = $('#toast'); if (!el) return;
  if (!tq.length) { tBusy = false; return; }
  // T2 verify D7 / T1 D-2: on phones a toast never floats over an open card, dialog or the life story (same rule as the verdict pill):
  // it waits (no timer races, nothing dropped but the queue cap) and shows once the board is clear
  // §4.7: a waiting coach / tip (priority 1) takes the slot before the next info pill
  if (phoneQ() && !ovBusy && ovq.length && ovq[0].kind === 'coach' && !fbHold && !(evState || shown('#gm') || shown('#story'))) { tBusy = true; clearTimeout(tWait); tWait = setTimeout(nextToast, 400); pumpOv(); return; }
  if (fbHold || (phoneQ() && (evState || shown('#gm') || shown('#story') || coachOpen()))) { tBusy = true; clearTimeout(tWait); tWait = setTimeout(nextToast, 400); return; }
  const t = tq.shift();
  tBusy = true; tCur = t;
  el.className = 'on ' + t.kind + (t.action ? ' act' : '') + (t.sub ? ' two' : '') + (t.text.length > 64 ? ' long' : '');
  if (t.sub) {   // T3 UI-4: a second, smaller line (the business "why" sentence)
    el.textContent = ''; const w = document.createElement('span'); w.className = 'tw';
    const a = document.createElement('span'); a.className = 'tmain'; a.textContent = iso(t.text);
    const s2 = document.createElement('small'); s2.className = 'tsub'; s2.textContent = iso(t.sub);
    w.append(a, s2); el.appendChild(w);
  } else el.textContent = iso(t.text);
  if (t.action) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tbtn'; b.textContent = t.action.label;
    b.onclick = () => { try { t.action.fn(); } catch (e) { console.error(e); } el.className = t.kind; };
    el.appendChild(b);
  }
  const ms = t.ms || Math.max(1300, Math.min(t.sub ? 5200 : 3200, 900 + (t.text.length + t.sub.length) * 38)) * (tq.length ? 0.75 : 1) * (t.action ? 2.4 : 1) * Math.max(0.5, Math.min(1, speed));   // §4.2 rule 4: × speed in turbo
  setTimeout(() => { el.className = t.kind; setTimeout(nextToast, 260); }, ms);
}

/* ============================================================ phone overlay queue (T5 / T4 §4.7, UX§4 fix 2)
   On phones (≤ 600 px) at most ONE of coach / achievement / lesson / rumour (newspaper) / verdict floats above the board.
   A coach bubble holds everything; the rest is released one by one by priority. Desktop shows them as before. */
const OVP = { coach: 0, levelUp: 1, worldEntry: 1, achievement: 3, dream: 4, lesson: 5, rumour: 5, rival: 5, verdict: 6 };   // T5 §4.2 rule 3
const OV_KEEP = new Set(['coach', 'levelUp', 'worldEntry', 'achievement', 'dream', 'lesson']);   // T4 §4.7: never dropped by the cap
let fbHold = false;   // T5 §4.2 holdFeedback(true): B / C / D wait (e.g. while the T4 coach or the T1 recover bar is up)
const ovq = []; let ovBusy = null, ovT = 0;
const phoneQ = () => innerWidth <= 600;
const coachOpen = () => { const c = $('#coach'); return !!c && !c.hidden; };
/** show(done): paint the overlay and call done() once it is gone. Verdicts replace a queued verdict (only the newest matters). */
function overlay(kind, show, cancel = null) {
  if (!phoneQ()) { show(() => {}); return; }
  if (kind === 'verdict') { const i = ovq.findIndex((x) => x.kind === 'verdict'); if (i >= 0) ovq.splice(i, 1); }
  if (kind === 'coach') { const i = ovq.findIndex((x) => x.kind === 'coach'); if (i >= 0) ovq.splice(i, 1)[0].cancel?.(); }   // one tip waits at a time: the newest
  ovq.push({ kind, show, cancel, p: OVP[kind] || 9, t: performance.now(), behindRival: ovBusy === 'rival' });
  ovq.sort((a, b) => a.p - b.p || a.t - b.t);
  // §4.7 cap 6: the newest verdict goes first, then the lowest-priority info line; a coach, achievement / level-up / world entry,
  // dream mission or lesson is never dropped (T4 verify D3) — the queue may then hold more than 6
  if (ovq.length > 6) { const ks = ovq.map((x) => x.kind); let i = ks.lastIndexOf('verdict'); if (i < 0) { for (let j = ovq.length - 1; j >= 0; j--) if (!OV_KEEP.has(ovq[j].kind)) { i = j; break; } } if (i >= 0) { const [x] = ovq.splice(i, 1); x.cancel?.(); } }
  pumpOv();
}
function pumpOv() {
  clearTimeout(ovT);
  if (ovBusy || !ovq.length) return;
  if (fbHold) { ovT = setTimeout(pumpOv, 400); return; }
  // T7: a verdict that waited behind a T6 reveal line (it holds the slot until tapped or the next roll) is about a decision long gone
  if (ovq[0].kind === 'verdict' && ovq[0].behindRival && performance.now() - ovq[0].t > 9000) { ovq.shift(); ovT = setTimeout(pumpOv, 50); return; }
  // §4.7: one floating thing at a time — a tip (priority 1) moves an ordinary info pill aside; it waits for an important one (keep)
  if (ovq[0].kind === 'coach' && toastOn() && !coachOpen() && !(tCur && tCur.keep) && !(evState || shown('#gm') || shown('#story'))) toastAside();
  if (coachOpen() || ((ovq[0].kind === 'verdict' || ovq[0].kind === 'coach') && toastOn())) { ovT = setTimeout(pumpOv, 400); return; }
  // T6 (UI fix): on phones a verdict pill never floats over an open card / dialog / life story (it covered the options):
  // it waits for the board; a verdict that waited > 9 s is about a decision long gone and is dropped
  // T2 verify D7: on phones nothing else floats over an open card / dialog / life story either — it waits for the board (never dropped)
  if (ovq[0].kind !== 'verdict' && (evState || shown('#gm') || shown('#story'))) { ovT = setTimeout(pumpOv, 400); return; }
  if (ovq[0].kind === 'verdict' && coversContent()) {
    if (performance.now() - ovq[0].t > 9000) { ovq.shift(); ovT = setTimeout(pumpOv, 50); return; }
    ovT = setTimeout(pumpOv, 400); return;
  }
  const it = ovq.shift(); ovBusy = it.kind;
  let fin = false;
  const done = () => { if (fin) return; fin = true; ovBusy = null; ovT = setTimeout(pumpOv, 220); };
  try { it.show(done); } catch (e) { console.error(e); done(); }
}
/** a toast that is on screen when a card / dialog opens on a phone steps aside (its timer ends as usual; it never covers the content) */
function toastAside() { const el = $('#toast'); if (el && /\bon\b/.test(el.className)) el.className = el.className.replace(/\bon\b/, '').trim(); }
const toastOn = () => { const t = $('#toast'); return !!t && t.className.includes('on'); };
const shown = (sel) => { const el = $(sel); return !!el && !el.hidden; };
/** something interactive fills the phone screen: an event card, a dialog, the life story or the lobby */
const coversContent = () => !!evState || shown('#gm') || shown('#story') || lobbyOpen();

const aq = []; let aBusy = false;
/** Celebratory slide-in card with sound (used for achievements and unlocks). */
export function achievementToast(a = {}) {
  if (a.first) { const i = aq.findIndex((x) => !x.first); aq.splice(i < 0 ? aq.length : i, 0, a); } else aq.push(a);   // §4.2 rule 3: level-up / world entry first
  if (!aBusy) nextAch();
}
function nextAch() {
  const box = $('#achv'); if (!box) return;
  const a = aq.shift(); if (!a) { aBusy = false; return; }
  aBusy = true;
  overlay(a.kind || 'achievement', (done) => {
    const icon = a.pips ? `<span class="pips" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= a.pips.n ? 'on' : ''}"></i>`).join('')}</span>`
      : a.icon && String(a.icon).length <= 4 ? `<span class="emo" aria-hidden="true">${esc(a.icon)}</span>` : ICON.medal;
    box.innerHTML = `<div class="ach" role="status"><div class="medal">${icon}</div><div><small>${esc(a.label || 'הישג חדש!')}</small><b>${escI(a.name || '')}</b>${a.desc ? `<p>${escI(a.desc)}</p>` : ''}</div></div>`;
    const card = box.firstElementChild;
    sfx(a.sound || 'achievement'); vibrate([12, 40, 18]);
    requestAnimationFrame(() => card.classList.add('in'));
    setTimeout(() => { card.classList.remove('in'); card.classList.add('out'); setTimeout(() => { box.innerHTML = ''; done(); nextAch(); }, 380); }, 2600 * Math.max(0.5, Math.min(1, speed)));   // §4.2: B hold 2.6 s (× speed in turbo)
  });
}

/** T5 verify D2: focus goes back to the opener when it is still on screen; otherwise (a phone sheet row whose sheet closed, a
 *  re-rendered chip) to the sheet button, else the HUD money — never to <body> */
function restoreFocus(prev) {
  const ok = (el) => !!el && el !== document.body && el.isConnected && el.getClientRects().length && !el.closest('[hidden],[inert],#sheet:not(.open)');
  try { if (ok(prev)) { prev.focus({ preventScroll: true }); if (document.activeElement === prev) return; } } catch (e) { /* ignore */ }
  if (!evState && shown('#gm')) return;   // another dialog took over: it places focus itself
  if (evState) return;                     // an event card is open: it owns focus
  const sb = $('#sheetBtn'), cash = $('#hCash');
  const alt = ok(sb) ? sb : $('#roll') && ok($('#roll')) && !$('#roll').disabled ? $('#roll') : cash;
  if (alt === cash && cash && !cash.hasAttribute('tabindex')) cash.setAttribute('tabindex', '-1');
  try { alt && alt.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
}
/* ============================================================ focus trap (T4 A11Y-1/2) */
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
/** Tab / Shift+Tab cycle inside `root` while it is open. Returns release(). */
const traps = [];   // stack: only the topmost open dialog traps Tab
export function trapFocus(root) {
  if (!root) return () => {};
  traps.push(root);
  return () => { const i = traps.lastIndexOf(root); if (i >= 0) traps.splice(i, 1); };
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || !traps.length) return;
  const root = traps[traps.length - 1];
  if (!root.isConnected || !root.getClientRects().length) return;
  const els = [...root.querySelectorAll(FOCUSABLE)].filter((x) => x.getClientRects().length && !x.closest('[hidden],[inert]'));
  if (!els.length) { e.preventDefault(); return; }
  const first = els[0], last = els[els.length - 1], a = document.activeElement;
  if (!root.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
  if (e.shiftKey && (a === first || !els.includes(a) && (a.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
}, true);
/** T4 A11Y-2: Escape on the topmost thing — a coach bubble = "הבנתי". (Modals handle their own Escape when dismissable.) */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (coachOpen()) { e.preventDefault(); e.stopPropagation(); hideCoach('next'); }
}, true);

/* ============================================================ generic modal (shared with the lobby) */
/**
 * modal({tag, color, title, html, actions:[{label, cls, v, fn, dis}], onExtra, onOpen, dismissable}) → Promise<v>
 * fn() returning false keeps the modal open. Clicks on non-action elements go to onExtra(e).
 */
export function modal({ tag = '', color = '#2f6fdb', title = '', html = '', actions = [{ label: 'סגירה', cls: 'primary' }], onExtra, onOpen, dismissable = false, wide = false, cls = '' } = {}) {
  const m = $('#gm'), c = $('#gmCard');
  c.className = 'card' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '');
  c.innerHTML = `${tag ? `<span class="tag" style="--c:${esc(color)}">${esc(tag)}</span>` : ''}${title ? `<h2 id="gmTitle">${escI(title)}</h2>` : ''}${html}<div class="acts">${actions.map((a, i) => `<button data-i="${i}" class="${a.cls || ''}" ${a.dis ? 'disabled' : ''}>${esc(a.label)}</button>`).join('')}</div>`;
  // T7 CR-31: every dialog has a name — the title, else the tag, else the first line of text
  if (title) { c.setAttribute('aria-labelledby', 'gmTitle'); c.removeAttribute('aria-label'); }
  else { c.removeAttribute('aria-labelledby'); c.setAttribute('aria-label', tag || (c.querySelector('.d') || {}).textContent?.slice(0, 80) || 'הודעה'); }
  const prevFocus = document.activeElement;
  const vd = $('#verdict'); if (vd && /\bon\b/.test(vd.className)) vd.className = vd.className.replace(/\bon\b/, '').trim(); // a dialog on top: the pill steps aside
  if (phoneQ()) { toastAside(); stickyAside(); }   // T2 verify D7: and so does a toast on phones (T7: and a T6 reveal line)
  m.hidden = false; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  if (onOpen) try { onOpen(c); } catch (e) { console.error(e); }
  setTimeout(() => (c.querySelector('.acts button.primary:not(:disabled)') || c.querySelector('.acts button:not(:disabled)'))?.focus(), 40);
  const release = trapFocus(c);
  const openedAt = performance.now();
  return new Promise((res) => {
    const close = (v) => { release(); m.hidden = true; c.onclick = null; m.onkeydown = null; restoreFocus(prevFocus); res(v); };
    c.onclick = (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) { if (onExtra) onExtra(e); return; }
      if (ghostTap(e, openedAt)) return;   // P1: the second tap of a double tap that opened this dialog never answers it
      const a = actions[+b.dataset.i];
      sfx('click');
      if (a.fn && a.fn() === false) return;
      close(a.v);
    };
    m.onkeydown = (e) => { if (e.key === 'Escape' && dismissable) close(undefined); };
  });
}
/** Yes/no question → Promise<boolean>. */
export async function confirmBox(text, { yes = 'כן', no = 'ביטול', title = '' } = {}) {
  const v = await modal({ title, html: `<p class="d">${esc(text)}</p>`, actions: [{ label: yes, cls: 'primary', v: true }, { label: no, v: false }], dismissable: true });
  return !!v;
}

/* ============================================================ loading + theme + banner */
export function showLoading(text, p = null) {
  const el = $('#loading'); if (!el) return;
  el.hidden = false;
  const t = $('#loadText'); if (t && text != null) t.textContent = text;
  const bar = $('#loadBar'); if (bar && p != null) bar.style.width = Math.round(p * 100) + '%';
}
export function hideLoading() { const el = $('#loading'); if (el) el.hidden = true; }

/** Paint the page for a world: sky, accents, data-world. */
export function applyTheme(w) {
  const T = w.mechanic === 'history' ? { ...w.theme, sky: ['#efe2c4', '#c9b089'], accent: '#a8763e' } : w.theme, r = document.documentElement.style;
  r.setProperty('--sky1', T.sky[0]); r.setProperty('--sky2', T.sky[1]);
  r.setProperty('--accent', T.accent || '#f2b632'); r.setProperty('--accent2', T.accent2 || T.accent || '#f2b632');
  document.body.dataset.world = w.id;
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = T.sky[0];
  const n = $('#hWorldName'); if (n) n.textContent = w.name;
}
export function worldBanner(w, sub = '') {
  const el = $('#banner'); if (!el) return;
  el.innerHTML = `<small>${esc(mapLabel(w.id) || (w.order ? `מפה ${w.order}` : ''))}</small><b>${esc(w.name)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
  el.className = 'banner'; void el.offsetWidth; el.className = 'banner in';
  clearTimeout(el._t); el._t = setTimeout(() => { el.className = 'banner out'; }, (450 + 1600) * Math.max(0.5, Math.min(1, speed)));   // T5 §4.1: in 450, hold 1.6 s, out 350
}

/* ============================================================ HUD */
let shownCash = null, cashRaf = 0, shownMonth = null;
const ind = { key: null, v: null, dir: 0, good: 0, t: 0 };

export function setCash(v, animate = true) {
  const el = $('#hCash'); if (!el) return;
  const from = shownCash == null ? v : shownCash; shownCash = v;
  cancelAnimationFrame(cashRaf);
  const st = el.closest('.stat');
  if (animate && from !== v) {
    st.classList.remove('up', 'down'); void st.offsetWidth; st.classList.add(v > from ? 'up' : 'down');
    const t0 = performance.now(), dur = 650 * speed;
    const step = (now) => { const p = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - p, 3); el.textContent = money(from + (v - from) * e); if (p < 1) cashRaf = requestAnimationFrame(step); };
    cashRaf = requestAnimationFrame(step);
  } else el.textContent = money(v);
}
export function resetHud() { shownCash = null; shownMonth = null; ind.key = null; ind.v = null; ind.dir = 0; msBase = null; goalPanel(false); debtChip(null); }
export function setMonth(month, max, star = 0) {
  const el = $('#hMonth'); if (!el) return;
  // wave 3a (J1 P0-1): a free game shows its ★ limit ("★ עד חודש N"; after it: "★ עבר") — the month itself never ends a free game
  const st = star ? `<small class="mstar${month > star ? ' past' : ''}">${month > star ? `★ עבר<span class="ml"> (${star})</span>` : `★ <span class="ml1">עד </span><span class="ml">חודש </span>${star}`}</small>` : '';
  el.innerHTML = max ? `${month}<small>/${max}</small>` : `${month}${st}`;
  el.closest('.stat')?.setAttribute('aria-label', star ? `חודש ${month}. ${month > star ? `עבר מועד הכוכבים (חודש ${star})` : `כוכבים: לצאת מהמירוץ עד חודש ${star}`}` : `חודש ${month}${max ? ` מתוך ${max}` : ''}`);
  if (shownMonth != null && month !== shownMonth) { const st = el.closest('.stat'); st.classList.remove('tick'); void st.offsetWidth; st.classList.add('tick'); }
  shownMonth = month;
}
export function bumpCash() { const st = $('#hCash')?.closest('.stat'); if (!st) return; st.classList.remove('bump'); void st.offsetWidth; st.classList.add('bump'); }

/** the ★ month limit of a free game with stars (not learning, not history, not after the win) — 0 when none */
function starOf(m, ctx) { return m.mode === 'free' && !m.afterWin && !(ctx && ctx.cfg && ctx.cfg.learn) && !(ctx && ctx.world && ctx.world.id === 'h') && m.maxMonths > 0 ? m.maxMonths : 0; }
/** ctx: {world, st} */
export function renderHUD(m, ctx, { animate = true } = {}) {
  const w = ctx.world;
  setCash(m.cash, animate);
  const cf = $('#hCf'); cf.textContent = moneyS(m.cashflow); cf.className = 'num ' + cls(m.cashflow);
  setMonth(m.month, m.mode === 'free' ? 0 : m.maxMonths, starOf(m, ctx));
  // world indicator
  const wi = m.worldIndicators || {}; const box = $('#hInd');
  let key = null, v = null, text = '', goodUp = 0, extra = '';
  if (wi.ymText) { key = 'ym'; v = wi.index; text = `🗞️ ${esc(wi.ymText)}${wi.index != null ? ` · מדד ${num(Math.round(wi.index))}` : ''}`; goodUp = 1; }
  else if (w.mechanic === 'rate') { key = 'rate'; v = wi.rate; text = `ריבית ${num(pctTxt(wi.rate))}`; goodUp = -1; }
  else if (w.mechanic === 'fx') {
    key = 'usd'; v = wi.usd; text = `דולר ${num(usdTxt(wi.usd))}`;
    goodUp = (wi.exposure && wi.exposure.cf) ? Math.sign(wi.exposure.cf) : 0;
    const hedged = (m.assets || []).some((a) => a.hedgedUntil);
    const insured = (wi.insuredUntil || 0) >= m.month;
    if (hedged || insured) extra = `<span class="hedge" title="${hedged ? 'יש נכסים מגודרים' : 'המשלוחים מבוטחים'}">${ICON.shield}${hedged ? 'מגודר' : 'מבוטח'}</span>`;
  } else if (w.mechanic === 'angel') { key = 'impact'; v = wi.impact; text = `השפעה ${num(`${wi.impact}/${wi.impactTarget}`)}`; goodUp = 1; }
  else if (wi.season) {   // w5: the month's season and the city's demand — a button that opens the world panel (עונות ותפוסה)
    const se = wi.season; key = 'tour'; v = se.tour; goodUp = 1;
    text = `<button type="button" class="hind-btn" id="worldPanelBtn" aria-haspopup="dialog" aria-label="${esc((wi.panel && wi.panel.title) || 'לוח המפה')}: ${esc(MONTH_HE[se.cal - 1] || '')}, ${esc(BAND_HE[se.band] || '')}, ביקוש ${esc(tourTxt(se.tour))}">${BAND_IC[se.band] || '🌴'} <span class="hb-mf">${esc(MONTH_HE[se.cal - 1] || '')}</span><span class="hb-ms">${esc(MONTH_S[se.cal - 1] || '')}</span><span class="hb-b"> · ${esc(BAND_HE[se.band] || '')}</span> <span class="hb-w">· ביקוש </span>${num(tourTxt(se.tour))}</button>`;
    if (se.festival) extra = '<span class="hedge" title="פסטיבל החודש">🎪</span>';
  }
  else if (wi.plant && wi.panel) {   // w6: lines, utilisation and lines down — a button that opens the world panel (קווי ייצור)
    const P = wi.plant; key = 'util'; v = P.utilisation ?? 0; goodUp = 1;
    const rows = wi.panel.rows || []; const dn = rows.filter((r) => r.down).length; const pend = rows.filter((r) => r.pending).length;
    const ut = P.utilisation != null ? pctI(P.utilisation) : '—';
    const al = `${wi.panel.title || 'קווי ייצור'}: ${P.lines} מתוך ${P.slots} קווים, ניצולת ${ut}${dn ? `, ${dn} בתקלה` : ''}${pend ? `, ${pend} בדרך` : ''}`;
    text = `<button type="button" class="hind-btn" id="worldPanelBtn" aria-haspopup="dialog" aria-label="${esc(al)}">🏭 ${num(`${P.lines}/${P.slots}`)}<span class="hb-w"> קווים</span><span class="hb-b"> · ניצולת </span><span class="hb-b">${num(ut)}</span>${dn ? ` · 🔧${num(String(dn))}` : ''}${pend ? `<span class="hb-b"> · ⏳${num(String(pend))}</span>` : ''}</button>`;
    if (P.noShift3Until >= (m.month || 0) && P.noShift3Until > 0) extra = '<span class="hedge" title="אין עובדים למשמרת לילה">🌙✖</span>';
  }
  else if (wi.chain && wi.panel) {   // w7: branches / the managers' span and the liquidity months — a button that opens the world panel (הרשת)
    const C = wi.chain; key = 'liq'; v = C.liqMonths ?? 99; goodUp = 1;
    const lq = C.liqMonths >= 99 ? '—' : mo1(C.liqMonths);
    const al = `${wi.panel.title || 'הרשת'}: ${C.branches} סניפים${C.franchises ? ` ועוד ${C.franchises} בזכיינות` : ''}, יכולת ניהול ${C.branches} מתוך ${C.span}${C.overSpan ? `, ${C.overSpan} מעבר ליכולת` : ''}, קופה: ${monthsText(C.liqMonths)}${C.liqMonths < 99 ? ' של עלויות קבועות' : ''}`;
    text = `<button type="button" class="hind-btn" id="worldPanelBtn" aria-haspopup="dialog" aria-label="${esc(al)}">🛍️ ${num(`${C.branches}/${C.span}`)}<span class="hb-w"> סניפים</span><span class="hb-b"> · קופה ${num(lq)} ח׳</span>${C.overSpan ? ' ⚠️' : ''}</button>`;   // phones: the goal meter shows the liquidity months
    if (C.franchises) extra = `<span class="hedge" title="סניפים בזכיינות">🤝${num(String(C.franchises))}</span>`;
  }
  else if (wi.proj && wi.panel) {   // w8: open projects, the policy rate, stalled sites — a button that opens the world panel (הפרויקטים)
    const PJ = wi.proj; key = 'rate'; v = PJ.rate; goodUp = -1;
    const st = (wi.panel.rows || []).filter((r) => r.phase !== 'done' && (r.paused || r.delayed || (r.stallRun || 0) > 0)).length;
    const al = `${wi.panel.title || 'הפרויקטים'}: ${PJ.open} פתוחים${(PJ.plots || []).length ? `, ${PJ.plots.length} מגרשים` : ''}${(PJ.rentals || []).length ? `, ${PJ.rentals.length} בניינים מושכרים` : ''}, ריבית ${PJ.rate}%${PJ.equityCalls ? `, הון עצמי שעוד צריך ${mS(PJ.equityCalls)}` : ''}${st ? `, ${st} עומדים` : ''}`;
    text = `<button type="button" class="hind-btn" id="worldPanelBtn" aria-haspopup="dialog" aria-label="${esc(al)}">🏗️ ${num(String(PJ.open))}<span class="hb-w"> פרויקטים</span><span class="hb-b"> · ריבית ${num(PJ.rate + '%')}</span>${st ? ` ⛔${num(String(st))}` : ''}</button>`;   // phones: the count (+ stalled); the rate is in the panel
    if ((PJ.plots || []).length) extra = `<span class="hedge" title="מגרשים">🚧${num(String(PJ.plots.length))}</span>`;
  }
  else if (wi.energy && wi.panel) {   // w9: operating income after debt service vs the target, the rate — a button that opens the world panel (התחנות והפרויקטים)
    const EN = wi.energy; key = 'opinc'; v = EN.income; goodUp = 1;
    const al = `${wi.panel.title || 'התחנות'}: הכנסה תפעולית אחרי החזר חוב ${mS(EN.income)} מתוך ${mS(EN.target)} בחודש, ריבית ${EN.rate}%, ${(EN.slots || {}).free || 0} חיבורים פנויים לרשת${(EN.slots || {}).waiting ? `, ${EN.slots.waiting} פרויקטים מחכים לחיבור` : ''}`;
    text = `<button type="button" class="hind-btn" id="worldPanelBtn" aria-haspopup="dialog" aria-label="${esc(al)}">☀️ ${num(money(EN.income))}<span class="hb-w"> בחודש</span><span class="hb-b"> · ריבית ${num(EN.rate + '%')}</span>${(EN.slots || {}).waiting ? ` 🔌${num(String(EN.slots.waiting))}` : ''}</button>`;
    if (EN.spike) extra = '<span class="hedge" title="קפיצה במחיר החשמל">🔥</span>';
  }
  else if (wi.portfolio && wi.panel) {   // w10: the regime and the LTV — a button that opens the market screen (הבורסה והתיק)
    const PF = wi.portfolio; const R = (wi.market || {}).regime || {}; key = 'ltv'; v = PF.ltv; goodUp = -1;
    const al = `${wi.panel.title || 'הבורסה'}: מצב השוק ${R.label || ''}, מינוף ${pctI(PF.ltv)}${PF.call ? ', קריאת מרווח פתוחה' : ''}, שווי נקי ${mS(PF.nw)}`;
    text = `<button type="button" class="hind-btn" id="worldPanelBtn" aria-haspopup="dialog" aria-label="${esc(al)}">📊 <span class="hb-w">${esc(R.label || '')} · </span>מינוף ${num(pctI(PF.ltv))}${PF.call ? ' ⚠️' : ''}</button>`;
    if (PF.hedge) extra = '<span class="hedge" title="הגנת אופציות פעילה">🛡️</span>';
  }
  else if (wi.league && wi.panel) {   // w13: the place in the table and wages vs revenue — a button that opens the club panel (המועדון והטבלה) + the live table strip
    const LG = wi.league; key = 'rank'; v = LG.rank; goodUp = -1;
    const al = `${wi.panel.title || 'המועדון'}: מקום ${LG.rank} מתוך 8 ב${LG.divName}, מחזור ${LG.round} מתוך ${LG.rounds}${LG.window ? ', חלון העברות פתוח' : ''}, שכר ${+LG.wageRatio > 0 ? `${pctI(LG.wageRatio)} מההכנסות ב־12 החודשים האחרונים` : 'מול הכנסות: עוד אין נתונים'}`;
    text = `<button type="button" class="hind-btn" id="worldPanelBtn" aria-haspopup="dialog" aria-label="${esc(al)}">⚽ <span class="hb-mf">מקום ${num(String(LG.rank))}</span><span class="hb-ms">${num(`${LG.rank}/8`)}</span><span class="hb-w"> ב${esc(LG.divName)}</span><span class="hb-b"> · שכר ${num(wrT(LG.wageRatio))}</span>${LG.window ? ' 🔁' : ''}</button>`;
    extra = leagueStrip(wi.panel.table, LG);
  }
  else if (wi.multinational && wi.panel) {   // w11: attention (self-run subs of the slots) and the trust in the managers — a button to the map panel
    const X = wi.multinational; key = 'trust'; v = X.trust; goodUp = 1; const dis = (wi.panel.rows || []).filter((r) => r.disrupted).length; const nm = (wi.panel.rows || []).filter((r) => r.mgr).length;   // no manager yet: no trust to show (the engine's 1 is "nothing to doubt")
    const al = `${wi.panel.title || 'המפה'}: ${X.subs} חברות־בנות, ${X.used} מתוך ${X.slots} בניהול שלך, ${nm ? `אמון ממוצע במנהלים ${pctI(X.trust)}` : 'אין עדיין מנהלים'}${X.frauds ? `, ${X.frauds} הונאות` : ''}${dis ? `, ${dis} עם ספק משובש` : ''}`;
    text = `<button type="button" class="hind-btn" id="worldPanelBtn" aria-haspopup="dialog" aria-label="${esc(al)}">🌍 <span class="hb-mf">קשב </span>${num(`${X.used}/${X.slots}`)}<span class="hb-b"> · ${nm ? `אמון ${num(pctI(X.trust))}` : 'בלי מנהלים'}</span><span class="hb-w"> · ${num(String(X.subs))} חברות</span>${dis ? ' ⚠️' : ''}</button>`;
    if (X.frauds) extra = `<span class="hedge" title="הונאות שנמצאו">🕵️${num(String(X.frauds))}</span>`;
  }
  else if (wi.platform && wi.panel) {   // w15: the runway (months of cash) and your stake — a button to the app panel; 🔥 under 6 months
    const X = wi.platform; key = 'runway'; v = Math.min(99, +X.runway || 0); goodUp = 1; const prof = +X.runway >= 99;
    const al = X.sold ? `${wi.panel.title || 'האפליקציה'}: החברה נמכרה ב־${mS(X.proceeds)}` : `${wi.panel.title || 'האפליקציה'}: ${prof ? 'החברה רווחית' : `מזומן ל־${mo1(X.runway)} חודשים`}, החלק שלך ${pctI(X.stake)}, ${(+X.users || 0).toLocaleString('en-US')} משתמשים, שוק: ${X.regimeLabel || ''}`;
    text = `<button type="button" class="hind-btn" id="worldPanelBtn" aria-haspopup="dialog" aria-label="${esc(al)}">☁️ ${X.sold ? 'נמכרה' : `${prof ? 'רווחית' : `${num(+X.runway >= 10 ? String(Math.round(X.runway)) : mo1(X.runway))}<span class="hb-mf"> חודשי מזומן</span><span class="hb-ms"> ח׳</span>`}<span class="hb-b"> · חלק ${num(pctI(X.stake))}</span><span class="hb-w"> · ${esc(X.regimeLabel || '')}</span>`}${!X.sold && !prof && X.runway < 6 ? ' 🔥' : ''}</button>`;
    if (X.net && !X.sold) extra = '<span class="hedge" title="אפקט רשת פעיל">🌐</span>';
  }
  else if (wi.holding && wi.panel) {   // w12: liquidity coverage (× and months) and the rating — a button to the group panel; 🌩️ a storm, ⚠️ a division in a deficit
    const X = wi.holding; key = 'coverage'; v = X.coverage; goodUp = 1; const C = WV2.hdChip(WVH2, X, wi.panel);
    text = `<button type="button" class="hind-btn" id="worldPanelBtn" aria-haspopup="dialog" aria-label="${esc(C.al)}">${C.html}</button>`; extra = C.extra;
  }
  else if (wi.harvest && wi.panel) {   // w16: the farm's income this month and the regime — a button to the farm panel; 🏜️ a drought, 🔒 hedged fields
    const X = wi.harvest; key = 'farmInc'; v = X.income; goodUp = 1; const C = WV2.hvChip(WVH2, X, wi.panel);
    text = `<button type="button" class="hind-btn" id="worldPanelBtn" aria-haspopup="dialog" aria-label="${esc(C.al)}">${C.html}</button>`; extra = C.extra;
  }
  else if (WV3.worldKey(wi)) {   // w14 🏦 capital ratio · w17 🧪 drugs earning · w18 ☂️ solvency · w19 🔔 the price · w20 📈 money managed — a button to the world panel
    const C = WV3.chip(WVH2, wi); key = C.key; v = C.v; goodUp = C.goodUp;
    text = `<button type="button" class="hind-btn" id="worldPanelBtn" aria-haspopup="dialog" aria-label="${esc(C.al)}">${C.html}</button>`; extra = C.extra;
  }
  else if (wi.panel) { key = 'panel'; v = 0; text = `<button type="button" class="hind-btn" id="worldPanelBtn" aria-haspopup="dialog">🧭 ${esc(wi.panel.title || 'לוח המפה')}</button>`; }   // any later world with a panel descriptor
  if (key) {
    if (ind.key === key && ind.v != null && v !== ind.v) { ind.dir = Math.sign(v - ind.v); ind.good = goodUp ? ind.dir * goodUp : 0; ind.t = performance.now(); }
    if (ind.key !== key) { ind.dir = 0; }
    ind.key = key; ind.v = v;
    const fresh = ind.dir && performance.now() - ind.t < 8000;
    const arrow = fresh ? `<i class="arr ${ind.good > 0 ? 'pos' : ind.good < 0 ? 'neg' : 'neu'}" aria-label="${ind.dir > 0 ? 'עלייה' : 'ירידה'}">${ind.dir > 0 ? ICON.up : ICON.down}</i>` : '';
    box.innerHTML = `${text}${arrow}${extra}`;
    box.hidden = false;
    const wb = box.querySelector('#worldPanelBtn'); if (wb) wb.onclick = () => { sfx('click'); bus.emit('world:panel'); };
  } else { box.innerHTML = ''; box.hidden = true; }
  $('#hWorld').classList.toggle('noind', !key);
  renderLife(m, ctx);
  // T5-C1: the board's accessible name says how many assets the city holds (details are in the sheet)
  const cv = $('#c'); if (cv) { const n = (m.assets || []).length; const t = n ? `לוח המשחק. בעיר שלך ${n === 1 ? 'נכס אחד' : n + ' נכסים'}. פרטים על כל נכס בדוח הכספי.` : 'לוח המשחק. עדיין אין נכסים בעיר.'; if (cv.getAttribute('aria-label') !== t) cv.setAttribute('aria-label', t); }
  // goal meter (updated in place so the bars animate)
  const g = $('#hGoal');
  const label = meterLabel(m);   // w12 'יעד הקבוצה' / w16 'הכנסה ורצף' (a no-event streak is not a cash box)
  const parts = m.goalParts || [];
  const pc = shownPct(m);
  const sig = m.goalType + parts.length;
  if (g.dataset.sig !== sig) {
    g.dataset.sig = sig;
    // wave 2 (A2 G-04): the meter is an inner role=meter (a meter's children are presentational) + a full-card toggle that opens "יעד העולם"
    for (const a of ['role', 'aria-label', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) g.removeAttribute(a);
    g.innerHTML = `<div class="gm" role="meter" aria-valuemin="0" aria-valuemax="100"><div class="gl"><span>${label}</span><b class="num"></b></div>` +
      parts.map((p) => `<div class="gbar" title="${esc(p.label)}"><s></s><i></i>${parts.length > 1 ? `<em>${partTag(p)}</em>` : ''}</div>`).join('') +
      '<div class="gsub"></div></div>' +
      `<button type="button" class="gx" id="hGoalBtn" aria-controls="goalPanel" aria-expanded="${gpOpen}"><span class="gchev" aria-hidden="true"></span></button>`;
    g.querySelector('.gx').onclick = (e) => { sfx('click'); goalPanel(!gpOpen, { focus: e.detail === 0 }); };
  }
  const gm = g.querySelector('.gm');
  g.querySelector('.gl b').textContent = pc + '%';
  if (m.goalType !== 'benchmark') milestoneCheck(pc);
  const bars = g.querySelectorAll('.gbar');
  parts.forEach((p, i) => {
    const b = bars[i]; if (!b) return;
    b.querySelector('i').style.width = Math.max(2, Math.round(p.progress * 100)) + '%';
    const pend = p.key === 'impact' && wi.impactPending ? Math.min(100, ((p.value + wi.impactPending) / Math.max(1, p.target)) * 100) : 0;
    b.querySelector('s').style.width = pend + '%';
  });
  const gh = m.goalHold && m.goalType !== 'benchmark' && m.goalHold.streak > 0 && m.goalHold.streak < m.goalHold.need ? ` · ⏳ מחזיק ${m.goalHold.streak}/${m.goalHold.need}` : '';
  g.querySelector('.gsub').textContent = parts.map((p) => partText1420(p) ? iso(partText1420(p).short) : p.key === 'impact' ? `${iso(N(p.value) + '/' + N(p.target))}${wi.impactPending ? ` (+${wi.impactPending} בדרך)` : ''}` : isStreak(p) ? `🛡️ ${iso(String(Math.round(p.value)))}/${iso(String(p.target))} ח׳` : p.unit === 'months' && wi.holding ? `🛟 ${iso(p.value >= 99 ? '—' : covX(p.value))}` : p.key === 'passive12' && wi.harvest ? `🌾 ${iso(money(p.value))} / ${iso(money(p.target))}` : p.unit === 'months' ? (p.value >= 99 && wi.platform ? '🛟 רווחית' : `🛟 ${iso(p.value >= 99 ? '—' : mo1(p.value))}/${iso(String(p.target))} ח׳`) : p.cmp === 'le' ? `⚖️ שכר ${iso(pctI(p.value))} (עד ${iso(pctI(p.target))})` : `${iso(money(p.value))} / ${iso(money(p.target))}`).join(' · ') + gh;   // w7: liquidity in months   // wave 2: "₪3.2 מיליון" is mixed text — isolate each amount, not the whole line (it read backwards in an LTR box)
  gm.setAttribute('aria-label', label);
  // T7 CR-01: a role=meter needs its value
  gm.setAttribute('aria-valuenow', String(pc));
  gm.setAttribute('aria-valuetext', `${pc}%${parts.length > 1 ? ' (הפס החלש מבין השניים)' : ''}`);
  g.classList.toggle('done', pc >= 100);
  goalPanelUpdate(m, ctx);
  // the mentor's level next to its name (T2 §15.1 "show metrics().mentor.label")
  const mb = $('#mentor .mt>b');
  if (mb && m.mentor) { const t = `אבא עשיר · ${m.mentor.label}`; if (mb.dataset.t !== t) { mb.dataset.t = t; mb.innerHTML = `אבא עשיר <small class="mlv">· ${esc(m.mentor.label)}</small>`; } }
  // T4 §4.3 gradual reveal (ctx.isRevealed = onboard.isRevealed; true for every key outside a tutorial game)
  const rev = ctx && ctx.isRevealed;
  if (rev) {
    const set = (k, el) => { if (!el) return; el.hidden = !rev(k); revealPulse(k, el); };
    set('cf', $('#hCf')?.closest('.stat')); set('goal', g); set('sheet', $('#sheetBtn'));
    if (g.hidden && gpOpen) goalPanel(false);
    document.body.classList.toggle('t4-nosheet', !rev('sheet'));   // desktop: the side sheet waits for its reveal too (freeRect sees it as absent)
    set('tools', $('#turboBtn')); if ($('#camBtn')?.dataset.kind === '3d') set('tools', $('#camBtn'));
  }
  injectHelp();
}
/** T4 CR-U-T4-4 (F4): the ❓ button — first child of .htools; game.js + onboard.help() answer bus 'onboard:help'. */
let helpDone = false;
function injectHelp() {
  if (helpDone) return; const tools = $('.htools'); if (!tools) return; helpDone = true;
  if ($('#helpBtn')) return;
  const b = document.createElement('button'); b.id = 'helpBtn'; b.className = 'ibtn'; b.type = 'button'; b.setAttribute('aria-label', 'איך משחקים'); b.title = 'איך משחקים · רמת המנטור'; b.textContent = '❓';
  b.onclick = () => { sfx('click'); bus.emit('onboard:help'); };
  tools.insertBefore(b, tools.firstChild);
  // phones: the same button in the mentor bar (the HUD's first row has no room for a 4th tool next to the money stats)
  const vb = $('#voiceBtn');
  if (vb && !$('#helpBtnM')) { const b2 = b.cloneNode(true); b2.id = 'helpBtnM'; b2.className = 'ibtn sm'; b2.onclick = b.onclick; vb.insertAdjacentElement('beforebegin', b2); }
}

/** % shown to the player = the weakest goal part (goalProgress itself carries a ranking offset since v2.1). */
function shownPct(m) {
  const parts = m.goalParts || [];
  const p = parts.length ? Math.min(...parts.map((x) => x.progress)) : (m.goalProgress || 0);
  return Math.max(0, Math.min(100, Math.floor(p * 100)));
}

/* ============================================================ wave 2 (A2 G-04, brief §14): "יעד העולם" — the world's real win condition
   Primary info stays in the HUD (meter, %); the panel holds the secondary part: what is missing, the 2-payday hold, ★★ / ★★★ months
   and gates, total assets / liabilities. Model: hudgoal.js (engine outputs only). Non-modal disclosure: Esc / ✕ / a tap outside closes,
   focus returns to the toggle. Nothing here is saved. */
let gpOpen = false, gpData = null, gpHtml = '';
const gpTick = (ok) => (ok == null ? '' : `<span class="gp-ok ${ok ? 'pos' : 'neg'}" aria-hidden="true">${ok ? '✓' : '✗'}</span><span class="sr">${ok ? ' — עומד' : ' — לא עומד'}</span>`);
function goalPanelEl() {
  let el = $('#goalPanel'); if (el) return el;
  el = document.createElement('section'); el.id = 'goalPanel'; el.className = 'gpanel'; el.hidden = true;
  el.setAttribute('role', 'region'); el.setAttribute('aria-labelledby', 'gpH');
  el.innerHTML = '<div class="gp-head"><h2 id="gpH" tabindex="-1">יעד המפה</h2><button type="button" class="ibtn gp-x" aria-label="לסגור את יעד המפה" title="סגירה">✕</button></div><div class="gp-body"></div>';
  el.querySelector('.gp-x').onclick = () => { sfx('click'); goalPanel(false, { focus: true }); };
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); goalPanel(false, { focus: true }); } });
  document.addEventListener('pointerdown', (e) => { if (gpOpen && !e.target.closest('#goalPanel, #hGoal')) goalPanel(false); }, { passive: true });
  document.addEventListener('keydown', (e) => { if (gpOpen && e.key === 'Escape' && e.target.closest && e.target.closest('#hGoal')) goalPanel(false, { focus: true }); });
  addEventListener('resize', () => { if (gpOpen) placeGoalPanel(); });
  document.body.appendChild(el);
  return el;
}
function placeGoalPanel() {
  const el = $('#goalPanel'), g = $('#hGoal'), hud = $('#hud'); if (!el || !g || !hud) return;
  const hb = hud.getBoundingClientRect(), gb = g.getBoundingClientRect();
  const top = Math.round(Math.max(hb.bottom, gb.bottom) + 6);
  el.style.top = top + 'px';
  if (innerWidth > 600) {   // under the goal card, kept inside the viewport (RTL: aligned to the card's right edge)
    const w = Math.min(420, innerWidth - 24);
    const right = Math.max(12, Math.min(innerWidth - gb.right, innerWidth - w - 12));
    el.style.right = right + 'px'; el.style.left = 'auto'; el.style.width = w + 'px';
  } else { el.style.right = ''; el.style.left = ''; el.style.width = ''; }
  el.style.maxHeight = `calc(100dvh - ${top}px - 12px - var(--safe-b, 0px))`;
}
function goalPanelHtml(M) {
  const parts = M.parts.map((p) => `<div class="gp-part"><div class="gp-pl"><span>${esc(p.label)}</span><b>${p.cmp === 'le' ? `${escI(p.valueText)} · היעד: ${escI(p.targetText)}` : `${escI(p.valueText)} מתוך ${escI(p.targetText)}`}</b></div><div class="gbar" aria-hidden="true"><i style="width:${Math.max(2, Math.round(p.progress * 100))}%"></i></div></div>`).join('');
  const gaps = M.gaps.length ? M.gaps.map((t) => `<p class="gp-gap"><span aria-hidden="true">🎯</span> ${escI(t)}</p>`).join('') : `<p class="gp-gap met">${gpTick(true)} ${escI(M.summary)}</p>`;
  const hold = M.hold ? `<p class="gp-row"><span><span aria-hidden="true">⏳</span> ${esc(M.hold.text)}</span><b class="num">${esc(M.hold.status)}</b>${gpTick(M.hold.ok ? true : null)}</p>` : '';
  const starLi = (s) => `<li><span class="gp-s" aria-label="${s.n === 1 ? 'כוכב אחד' : s.n === 2 ? 'שני כוכבים' : 'שלושה כוכבים'}">${'★'.repeat(s.n)}</span><span class="gp-t">${escI(s.text)}${s.now ? ` <small>${escI(s.now)}</small>` : ''}</span>${gpTick(s.ok)}` +
    (s.gates && s.gates.length ? `<ul class="gp-gates">${s.gates.map((x) => `<li><span class="gp-t">${x.key === 'fund' ? '<span aria-hidden="true">🛟</span> ' : '<span aria-hidden="true">🙂</span> '}${escI(x.text)} <small class="num">${esc(x.now)}${x.note ? ` · ${esc(x.note)}` : ''}</small></span>${gpTick(x.ok)}</li>`).join('')}</ul>` : '') + '</li>';
  // wave 3a (J1 P0-2): the near-goal ladder — every rung with ✓ / ✗, the next one marked with its numbers
  const ni = M.ladder && M.ladder.length ? M.ladder.findIndex((x) => !x.met) : -1;
  const ladder = M.ladder && M.ladder.length ? `<h3>הדרך ליעד</h3><ol class="gp-ladder">${M.ladder.map((x, i) => `<li class="${x.met ? 'ok' : i === ni ? 'next' : ''}"${i === ni ? ' aria-current="step"' : ''}><span class="gp-t"><span aria-hidden="true">${esc(x.icon)}</span> ${escI(x.title)}${i === ni && M.next ? ` <small class="num">${escI(M.next.valText)}</small>` : ''}${i === ni ? ' <small>· היעד הקרוב</small>' : ''}</span>${gpTick(x.met ? true : i === ni ? null : false)}</li>`).join('')}</ol>` : '';
  const stars = M.stars ? `<h3>כוכבים</h3><ul class="gp-stars">${M.stars.map(starLi).join('')}</ul>` : '';
  const T = M.totals;
  return `<p class="gp-rule">${escI(M.rule)}</p>${parts}${gaps}${M.pending ? `<p class="gp-note">${esc(M.pending)}</p>` : ''}${hold}${ladder}${stars}${M.starsNote ? `<p class="gp-note">${esc(M.starsNote)}</p>` : ''}` +
    `<h3>נכסים וחובות</h3><dl class="gp-tot"><div><dt>סך הנכסים</dt><dd class="num">${escI(T.assetsText)}</dd></div><div><dt>סך החובות</dt><dd class="num ${T.liabilities > 0 ? 'neg' : ''}">${escI(T.liabilitiesText)}</dd></div><div><dt>שווי נקי</dt><dd class="num">${escI(T.netWorthText)}</dd></div></dl>` +
    '<p class="gp-note">הפירוט המלא — בדוח הכספי.</p>';
}
function goalModelOf(m, ctx) {
  const w = ctx && ctx.world, st = ctx && ctx.st;
  let thresholds = {};
  try { if (w && st) thresholds = starThresholds(w, st.charId, m.rules); } catch (e) { /* the history world has no characters' stars */ }
  return goalPanelModel(m, { thresholds, learn: !!(ctx && ctx.cfg && ctx.cfg.learn), startNW: st && st.history ? st.history.startNW : null, impactPending: (m.worldIndicators || {}).impactPending || 0 });
}
function goalPanelUpdate(m, ctx) {
  gpData = { m, ctx };
  const btn = $('#hGoalBtn');
  let M = null;
  try { M = goalModelOf(m, ctx); } catch (e) { console.warn(e); }
  if (btn) { const t = `יעד המפה — מה חסר לניצחון${M && M.summary ? `: ${iso(M.summary)}` : ''}`; if (btn.getAttribute('aria-label') !== t) { btn.setAttribute('aria-label', t); btn.title = 'יעד המפה — מה חסר לניצחון'; } }
  if (!gpOpen || !M) return;
  const body = $('#goalPanel .gp-body'); if (!body) return;
  const html = goalPanelHtml(M); if (gpHtml !== html) { gpHtml = html; body.innerHTML = html; }
  placeGoalPanel();
}
/** open / close the "יעד העולם" panel (focus: move focus into it on open, back to the toggle on close) */
export function goalPanel(open, { focus = false } = {}) {
  const was = gpOpen;
  gpOpen = !!open && !!gpData && !!$('#hGoalBtn') && !$('#hGoal').hidden;
  const el = gpOpen ? goalPanelEl() : $('#goalPanel');
  const btn = $('#hGoalBtn'); if (btn) btn.setAttribute('aria-expanded', String(gpOpen));
  document.body.classList.toggle('gp-open', gpOpen);
  if (!el) return;
  if (gpOpen) { gpHtml = ''; el.hidden = false; goalPanelUpdate(gpData.m, gpData.ctx); if (focus) el.querySelector('#gpH').focus({ preventScroll: true }); }
  else { el.hidden = true; if (was && focus && btn) btn.focus({ preventScroll: true }); }
}
export const goalPanelOpen = () => gpOpen;

/* ============================================================ wave 2 (A2 G-07, brief §15): new debt → a short chip under the money stats
   "חוב חדש ₪X · ₪Y בחודש": both numbers are differences of engine values (hudgoal.newDebt), computed by game.js between renders. */
export function debtChip(d) {
  let el = $('#debtChip');
  if (!d) { if (el) { el.classList.remove('on'); el.textContent = ''; } return; }
  if (!el) { el = document.createElement('p'); el.id = 'debtChip'; el.className = 'debtc'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-atomic', 'true'); ($('#hud') || document.body).appendChild(el); }   // inside the HUD landmark (fixed: placed below)
  const host = $('.hstats'); const r = host && host.getBoundingClientRect();
  if (r && r.width) { el.style.top = Math.round(r.bottom + 6) + 'px'; el.style.left = Math.round(r.left + r.width / 2) + 'px'; }
  el.innerHTML = `<span aria-hidden="true">🏦</span> ${escI(d.text)}`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  // no timed dismissal: it stays until the next roll (game.js) or the next card (openEvent); it never takes taps
}

/* ============================================================ v3 life row (age · energy · happiness · credit · inflation) */
const BAND_CLS = { 'מצוין': 'pos', 'טוב': 'pos', 'בינוני': '', 'חלש': 'neg', 'גרוע': 'neg' };
function renderLife(m, ctx) {
  const box = $('#hLife'); if (!box) return;
  const L = m.life;
  if (!L) { box.hidden = true; document.body.classList.remove('has-life'); return; }
  box.hidden = false; document.body.classList.add('has-life');
  // a re-render keeps keyboard focus on the same chip (the row is rebuilt every render)
  const fa = document.activeElement; const fIn = fa && box.contains(fa) ? fa : null;
  const focusKey = fIn ? (fIn.dataset.more ? '.lc.more' : fIn.dataset.life ? `${fIn.closest('.hlmore') ? '.hlmore ' : ':scope > '}[data-life="${fIn.dataset.life}"]` : null) : null;
  fundMonthsNow = m.emergency ? m.emergency.months : null;
  const en = Math.round(L.energy ?? 0), hp = Math.round(L.happiness ?? 0);
  const enc = en < 25 ? 'neg' : en < 50 ? 'warn' : 'pos';
  const hpe = hp >= 75 ? '😄' : hp >= 60 ? '🙂' : hp >= 40 ? '😐' : hp >= 25 ? '🙁' : '😣';
  // inflation: the engine's figure is LAST year's (or the long-run expectation in year one) — never a pre-drawn future value
  const infl = L.inflationYear != null ? Math.round(L.inflationYear * 10) / 10 : null;
  const F = m.focus, X = m.econ;
  const fIcon = F ? (F.opsOpen ? '🏪' : FOCUS_ICON[F.current.id] || '🎯') : '';
  // T3 UI-3 / UI-7: 📬 open decisions (first, only when there are any) and the calendar (when it says something: a season, or a business)
  const IB = m.inbox, CAL = m.calendar; const ownBiz = (m.assets || []).some((a) => a.business);
  const ibChip = IB && IB.open ? `<button class="lc inbox ${IB.urgent ? 'urg' : ''}" data-life="inbox" aria-label="${esc(`החלטות פתוחות: ${IB.open}${IB.urgent ? `, ${IB.urgent} עד המשכורת הבאה` : ''}`)}" title="החלטות פתוחות"><span aria-hidden="true">📬</span><b class="num">${IB.open}</b></button>` : '';
  const calChip = CAL && CAL.label && (CAL.season || ownBiz) ? `<button class="lc cal ${ownBiz ? 'biz' : ''}" data-life="cal" aria-label="${esc(`לוח השנה: ${CAL.label}${CAL.season ? ` · ${CAL.season}` : ''}`)}" title="לוח השנה"><span aria-hidden="true">🗓️</span><b>${esc(CAL.label)}${CAL.season ? ` · ${esc(CAL.season)}` : ''}</b></button>` : '';
  box.innerHTML = `${ibChip}<button class="lc age" data-life="age" title="גיל"><span>🎂</span><b class="num">${Math.floor(L.age)}</b></button>
    <button class="lc en ${enc}" data-life="energy" title="כוח (${en}/100)"><span>🔋</span><i class="mb"><i style="width:${Math.max(3, en)}%"></i></i><b class="num">${en}</b></button>
    <button class="lc hp" data-life="happy" title="אושר (${hp}/100)"><span>${hpe}</span><b class="num">${hp}</b></button>
    <button class="lc cr ${BAND_CLS[L.creditBand] ?? ''}" data-life="credit" title="דירוג אשראי: ${esc(L.creditBand || '')}"><span>🏦</span><b class="num">${L.creditScore ?? '—'}</b></button>
    ${infl != null ? `<button class="lc cpi" data-life="cpi" title="${L.inflationLastYear != null ? 'אינפלציה בשנה שעברה' : 'אינפלציה צפויה'}"><span>🛒</span><b class="num">${infl}%</b></button>` : ''}
    ${m.emergency ? `<button class="lc fund ${m.emergency.covered ? 'pos' : ''}" data-life="fund" title="קרן חירום: ${m.emergency.months} מתוך ${m.emergency.target || 3} חודשי הוצאות (נדרש ל־★★★)"><span aria-hidden="true">🛟</span><b class="num">${m.emergency.months}/${m.emergency.target || 3}</b><span class="sr"> חודשי קרן חירום, נדרשים לשלושה כוכבים</span><i class="fbar" aria-hidden="true"><i style="width:${Math.round(Math.min(1, (m.emergency.months || 0) / (m.emergency.target || 3)) * 100)}%"></i></i></button>` : ''}
    <button class="lc plan" data-life="plan" title="התוכנית החודשית — לשנות"><span>${PLAN_ICON[L.plan] || '📅'}</span><b>${esc(L.planLabel || '')}</b></button>
    ${calChip}${F ? `<button class="lc focus ${F.opsOpen ? 'ops' : ''} ${F.current.id !== 'none' ? 'on' : ''}" data-life="focus" aria-label="${F.opsOpen ? 'לפתוח את לוח העסק' : `מוקד החודש: ${esc(F.current.label)}`}" title="מוקד החודש"><span aria-hidden="true">${fIcon}</span><b>${esc(F.opsOpen ? 'לוח העסק' : F.current.id === 'none' ? 'מוקד' : F.current.label)}</b></button>` : ''}
    ${X ? `<button class="lc econ t${X.trend > 0 ? 'u' : X.trend < 0 ? 'd' : 'f'}" data-life="econ" aria-label="מד הכלכלה: ${esc(X.label)}, ${X.signal} מתוך 100" title="${esc(X.text || 'מד הכלכלה')}">${gaugeSvg(X.signal, 26)}<b>${esc(X.label)}</b><i class="tr" aria-hidden="true">${X.trend > 0 ? '↗' : X.trend < 0 ? '↘' : '→'}</i>${X.sharp ? '<i class="sh" aria-hidden="true">🔬</i>' : ''}</button>` : ''}${t6Chips(ctx && ctx.t6)}`;
  const rev = ctx && ctx.isRevealed;
  if (rev) for (const [k, sel] of [['age', '.lc.age'], ['energy', '.lc.en'], ['happy', '.lc.hp'], ['credit', '.lc.cr'], ['cpi', '.lc.cpi'], ['fund', '.lc.fund'], ['plan', '.lc.plan'], ['focus', '.lc.focus'], ['focus', '.lc.econ']]) {
    const el = box.querySelector(sel); if (el) { el.hidden = !rev(k); revealPulse(k, el); }
  }
  fitLife(box, focusKey);
}
/* T7 polish: the life row never overflows. When the chips do not fit on one line (390 px with 📬, the calendar and the T6 chips),
   the lowest-priority chips move behind a "⋯" chip (44 px) that opens them as a list — together with the chips this width hides
   by CSS (age, inflation, fund, calendar), so nothing is out of reach. Gradual-reveal chips (hidden attribute) stay hidden. */
const LIFE_PRI = ['inbox urg', 'en', 't6aw', 'inbox', 'hp', 'fund', 'focus', 'plan', 'cr', 'econ', 't6rv', 't6mo', 'cal', 'cpi', 'age'];   // 🛟 right after 😊: ★★★ needs it (playtest)   // 🌴 (retire after the win) is an action: it stays
const lifePri = (el) => { const c = el.classList; const i = LIFE_PRI.findIndex((k) => k.split(' ').every((x) => c.contains(x))); return i < 0 ? LIFE_PRI.length : i; };
let lifeMoreOpen = false, lifeWired = false;
function fitLife(box, focusKey) {
  const chips = [...box.querySelectorAll(':scope > .lc')];
  const more = document.createElement('button');
  more.type = 'button'; more.className = 'lc more'; more.dataset.more = '1'; more.hidden = true;
  more.setAttribute('aria-haspopup', 'true'); more.setAttribute('aria-controls', 'hLifeMore'); more.setAttribute('aria-label', 'עוד בשורת החיים'); more.title = 'עוד';
  more.innerHTML = '<span aria-hidden="true">⋯</span>';
  box.appendChild(more);
  const over = () => box.scrollWidth > box.clientWidth + 1;
  const moved = [];
  // T3 verify D6: a phone hides the 🗓️ chip by CSS — then "⋯" is offered even when the row fits, so the calendar stays one tap away
  const calHidden = chips.some((c) => !c.hidden && c.classList.contains('cal') && !c.getClientRects().length);
  if (over() || calHidden) {
    more.hidden = false;
    const cand = chips.filter((c) => !c.hidden && c.getClientRects().length).sort((a, b) => lifePri(b) - lifePri(a));
    for (const c of cand) { if (!over()) break; c.hidden = true; c.dataset.ovf = '1'; moved.push(c); }
  }
  if (!moved.length && !calHidden) { more.remove(); lifeMoreOpen = false; document.body.classList.remove('hlife-more-open'); } else {
    // the list: the chips moved here + the chips this width hides by CSS (never the not-yet-revealed ones)
    const cssHidden = chips.filter((c) => !c.hidden && !c.getClientRects().length);
    const items = [...moved, ...cssHidden].sort((a, b) => lifePri(a) - lifePri(b));
    const pop = document.createElement('div'); pop.id = 'hLifeMore'; pop.className = 'hlmore'; pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', 'עוד בשורת החיים');
    for (const c of items) { const k = c.cloneNode(true); k.hidden = false; delete k.dataset.ovf; k.classList.add('in-more'); pop.appendChild(k); }   // full labels (CSS), same names as on desktop
    pop.hidden = !lifeMoreOpen; box.appendChild(pop);
    more.setAttribute('aria-expanded', String(lifeMoreOpen));
  }
  box.dataset.fitW = String(box.clientWidth);
  if (focusKey) { const f = box.querySelector(focusKey); if (f && f.getClientRects().length) f.focus({ preventScroll: true }); }
  if (!lifeWired) { lifeWired = true; wireLifeMore(box); }
}
/** the row's width changed without a render (HUD shown after the lobby, rotation, sheet): put the chips back and fit again */
function refitLife(box) {
  if (box.hidden || !box.clientWidth || String(box.clientWidth) === box.dataset.fitW) return;
  box.querySelectorAll(':scope > .lc[data-ovf]').forEach((c) => { c.hidden = false; delete c.dataset.ovf; });
  box.querySelector(':scope > .lc.more')?.remove(); box.querySelector('#hLifeMore')?.remove();
  fitLife(box, null);
}
function setLifeMore(open, { focus = false } = {}) {
  const box = $('#hLife'); const pop = $('#hLifeMore'); const more = box && box.querySelector('.lc.more');
  lifeMoreOpen = !!open && !!pop;
  if (pop) pop.hidden = !lifeMoreOpen;
  if (more) more.setAttribute('aria-expanded', String(lifeMoreOpen));
  document.body.classList.toggle('hlife-more-open', lifeMoreOpen);   // the open list sits above the board's bubbles (CSS)
  if (focus && lifeMoreOpen) pop.querySelector('.lc')?.focus({ preventScroll: true });
  else if (focus && more) more.focus({ preventScroll: true });
}
function wireLifeMore(box) {
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-more]')) { sfx('click'); setLifeMore(!lifeMoreOpen, { focus: e.detail === 0 }); return; }
    if (e.target.closest('.hlmore [data-life]')) setLifeMore(false);   // game.js opens the chip's details (its own #hLife click handler)
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lifeMoreOpen) { e.stopPropagation(); setLifeMore(false, { focus: true }); } });
  document.addEventListener('pointerdown', (e) => { if (lifeMoreOpen && !e.target.closest('#hLife')) setLifeMore(false); }, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => refitLife(box)).observe(box);
}
/** T6 HUD chips (game.js ctx.t6): 👥 rivals panel (flag rivals), ⏪ decision moments (flag rewind, free / learn), 🌴 after the win */
function t6Chips(T) {
  if (!T) return '';
  const out = [];
  if (T.rivals) out.push(`<button class="lc t6rv" data-life="rivals" aria-label="יריבים על אותו לוח" title="יריבים על אותו לוח"><span aria-hidden="true">👥</span><b>יריבים</b></button>`);
  if (T.moments) out.push(`<button class="lc t6mo" data-life="moments" aria-label="רגעי החלטה" title="לחזור לרגע של החלטה (ענף תרגול)"><span aria-hidden="true">⏪</span><b>רגעי החלטה</b></button>`);
  if (T.afterWin) out.push(`<button class="lc t6aw" data-life="afterwin" aria-label="${esc(`אחרי החופש · ${T.afterWin.n} חודשים`)}" title="אחרי החופש — אפשר לפרוש"><span aria-hidden="true">🌴</span><b>אחרי החופש · ${num(String(T.afterWin.n))} חודשים</b></button>`);
  return out.join('');
}
const FOCUS_ICON = { scout: '🔍', debt: '🏦', ops: '🏪', frugal: '✂️', network: '🤝', research: '📊', none: '🎯' };
const FOCUS_ICON_ID = { search: '🔍', bank: '🏦', shop: '🏪', scissors: '✂️', people: '🤝', gauge: '📊', calendar: '📅' };
/** Semicircle gauge 0–100 with a needle at `signal` (decorative: the label next to it carries the meaning). */
function gaugeSvg(signal, w = 26) {
  const s = Math.max(0, Math.min(100, +signal || 0)); const a = Math.PI * (1 - s / 100);
  const cx = 20, cy = 20, r = 16, nx = cx + Math.cos(a) * (r - 3), ny = cy - Math.sin(a) * (r - 3);
  const arc = (from, to, c) => { const p0 = Math.PI * (1 - from / 100), p1 = Math.PI * (1 - to / 100); return `<path d="M${cx + Math.cos(p0) * r} ${cy - Math.sin(p0) * r}A${r} ${r} 0 0 1 ${cx + Math.cos(p1) * r} ${cy - Math.sin(p1) * r}" stroke="${c}" stroke-width="5" fill="none"/>`; };
  return `<svg class="gauge" viewBox="0 0 40 23" width="${w}" height="${Math.round(w * 23 / 40)}" aria-hidden="true">${arc(0, 33, 'var(--red)')}${arc(33, 62, '#d6a01e')}${arc(62, 100, 'var(--green)')}<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="2.6" fill="var(--ink)"/></svg>`;
}
/* T4 §4.3: a HUD part that becomes visible pulses once (.t4-new) and is announced in #a11yLive (S-R0) */
const REVEAL_NAME = { cf: 'תזרים חודשי', energy: '🔋 כוח', goal: 'מד החופש', plan: 'התוכנית החודשית', sheet: 'הדוח שלי', fund: '🛟 קרן חירום', happy: '😊 אושר', credit: '🏦 דירוג אשראי', age: '🎂 גיל', cpi: '🛒 אינפלציה', zr: '⚡ זריקות', tools: 'כלים', focus: 'מוקד החודש', next: 'המטרה הבאה' };
const revealState = new Map();
function revealPulse(key, el) {
  const was = revealState.get(key), now = !el.hidden;
  revealState.set(key, now);
  if (was === false && now) {
    if (!reduced()) { el.classList.remove('t4-new'); void el.offsetWidth; el.classList.add('t4-new'); setTimeout(() => el.classList.remove('t4-new'), 700); }
    if (REVEAL_NAME[key]) announce(`נוסף לתצוגה: ${REVEAL_NAME[key]}`);
  }
}
/* T4 A11Y-8: one visually hidden live region; at most one message per 2 s (queued) */
const liveQ = []; let liveT = 0;
export function announce(text) {
  if (!text) return;
  let el = $('#a11yLive');
  if (!el) { el = document.createElement('div'); el.id = 'a11yLive'; el.className = 'sr'; el.setAttribute('aria-live', 'polite'); el.setAttribute('role', 'status'); document.body.appendChild(el); }
  liveQ.push(String(text)); if (!liveT) pumpLive();
}
function pumpLive() { const el = $('#a11yLive'); const t = liveQ.shift(); if (!el || t == null) { liveT = 0; return; } el.textContent = t; liveT = setTimeout(pumpLive, 2000); }
/** Details popover for a life chip (tap). */
export function lifeDetails(kind, m, extra = {}) {
  const L = m.life || {}; const p = m.payslip || {}; const e = m.emergency || {};
  const T = {
    age: ['הגיל שלך', `${esc(L.ageText || Math.floor(L.age))}. כל חודש במשחק הוא חודש בחיים.${L.freeTimeMonths ? ` עד עכשיו היו לך ${L.freeTimeMonths} חודשים של זמן חופשי.` : ''}`],
    energy: ['🔋 כוח', `🔋 כוח: ${Math.round(L.energy)} מתוך 100. זה הכוח של הדמות בסיפור — לא ⚡ זריקות. שעות נוספות, לימודים ועסק צדדי שוחקים; מנוחה ומשפחה ממלאות. מתחת ל־25 — סכנת שחיקה: חודש בלי משכורת.`],
    happy: ['אושר', `${Math.round(L.happiness)}/100${L.happinessBase != null && Math.round(L.happinessBase) !== Math.round(L.happiness) ? ` (מתוכם ${Math.round(L.happiness - L.happinessBase)} מ"צעצועים" — וזה דועך)` : ''}. ל־★★★ צריך גם לצאת מהר וגם אושר של לפחות 60.`],
    credit: ['דירוג אשראי', `${L.creditScore} — ${esc(L.creditBand || '')}. הלוואות כפויות ואשראי לא משולם מורידים; החזר בזמן מעלה. הדירוג קובע את הריבית שלך${L.loanPctAdj ? ` (כרגע ${iso((L.loanPctAdj > 0 ? '+' : '') + L.loanPctAdj + '%')})` : ''}.`],
    cpi: ['אינפלציה', `${L.inflationLastYear != null ? `בשנה שעברה המחירים עלו ב־${iso(L.inflationLastYear + '%')}.` : `בשנה הראשונה עוד אין נתון: הצפי הוא בערך ${iso(L.inflationYear + '%')} בשנה.`} המזומן שלך שווה היום ${iso(fmtM(L.realCash ?? m.cash))} במחירים של תחילת המשחק. כסף שלא עובד — מתכווץ.${extra.inflReality ? `<br><span class="reality">${escI(extra.inflReality)}</span>` : ''}`],
    fund: ['🛟 קרן חירום', `${esc(e.text || '')} (${iso(fmtM(e.balance || 0))}). כשנגמר המזומן, הקרן משלמת לפני שהבנק נותן הלוואה כפויה — ומשבר שמכוסה לא פוגע באושר. ל־★★★ צריך לפחות ${e.target || 3} חודשים. להפקיד: ביום המשכורת, או ב"הדוח שלי".`],
  }[kind];
  return T;
}

/* ============================================================ statement sheet */
function payslipHtml(m, ctx) {
  const p = m.payslip; if (!p || !p.gross) return '';
  const L = m.life || {};
  const hist = (ctx.st && ctx.st.ui && ctx.st.ui.pensionHist) || [];
  const pctU = (x) => (x == null ? null : x > 1 ? x / 100 : x);
  const eff = pctU(p.effectiveTaxRate), marg = pctU(p.marginalRate);
  const lines = (p.lines && p.lines.length ? p.lines.filter((x) => !/^נטו/.test(x.label)) : [
    { label: 'ברוטו', amount: p.gross }, p.overtime ? { label: 'שעות נוספות', amount: p.overtime } : null,
    { label: 'מס הכנסה', amount: -p.incomeTax }, { label: 'ביטוח לאומי ובריאות', amount: -p.bl }, { label: 'פנסיה (6% שלך)', amount: -p.pensionEmployee },
  ].filter(Boolean));
  return `<details class="slip" open><summary><span>🧾 התלוש שלך</span><b class="num">${fmtM(p.net)} נטו</b></summary>
    <div class="slipb">${lines.map((x) => row(escI(x.label), (x.amount > 0 && x !== lines[0] ? '+' : '') + fmtM(x.amount), x.amount < 0 ? 'neg' : '')).join('')}
    <div class="row net"><b>נטו לחשבון</b><b class="num pos">${fmtM(p.net)}</b></div>
    ${eff != null ? `<p class="note">מס אפקטיבי ${iso(Math.round(eff * 1000) / 10 + '%')} · מדרגת המס שלך ${iso(Math.round((marg || 0) * 100) + '%')} — מכל שקל נוסף בברוטו, זה החלק שהולך למס הכנסה (ועוד ביטוח לאומי ופנסיה).</p>` : ''}
    ${p.employerPension ? `<p class="note">המעסיק מפקיד עוד ${num(fmtM(p.employerPension))} לפנסיה${p.severanceDeposit ? ` ו־${num(fmtM(p.severanceDeposit))} לפיצויים` : ''} — זה הכסף שלך, גם אם לא רואים אותו בעו"ש.</p>` : ''}
    ${realityLine(p)}</div></details>
    ${L.pension != null ? `<div class="wbox pens"><div class="wl"><span>🏝️ קרן הפנסיה שלך</span><b class="num">${fmtM(L.pension)}</b></div>${hist.length > 1 ? spark(hist, { color: 'var(--green)', w: 300, h: 34 }) : ''}<p class="note">גדלה כל חודש מהפקדות ומהתשואה — ריבית דריבית. לא מזומן, אבל נספרת בשווי הנקי.</p></div>` : ''}
    ${L.realCash != null ? `<div class="wbox"><div class="wl"><span>🛒 ${L.inflationLastYear != null ? `אינפלציה בשנה שעברה: ${iso(L.inflationLastYear + '%')}` : `אינפלציה צפויה: ${iso((L.inflationYear ?? 0) + '%')} בשנה`}</span><b class="num">מדד ${(L.cpi ?? 1).toFixed(3)}</b></div>
      ${row('מזומן (נומינלי)', fmtM(m.cash))}${row('מזומן בכסף של היום הראשון (ריאלי)', fmtM(L.realCash), L.realCash < m.cash ? 'neg' : '')}${L.realNetWorth != null ? row('שווי נקי ריאלי', fmtM(L.realNetWorth)) : ''}</div>` : ''}`;
}
/** 🛟 emergency fund (m.emergency — engine numbers only) + move money in / out (E.moveSavings via data-act) */
function fundHtml(m) {
  const e = m.emergency; if (!e) return '';
  const tgt = e.target || 3; const p = Math.min(100, (e.months / tgt) * 100);
  return `<div class="wbox fund ${e.covered ? 'ok' : ''}"><div class="wl"><span>🛟 קרן חירום</span><b class="num">${num(String(e.months))} <small>מתוך ${tgt} חודשי הוצאות</small></b></div>
    <div class="track"><i style="width:${Math.max(1, p)}%"></i></div>
    <p class="note">${fmtM(e.balance || 0)} בצד${e.rate ? ` · ריבית ${iso(e.rate + '%')} בשנה` : ''}. כשנגמר המזומן — הקרן משלמת לפני שהבנק נותן הלוואה כפויה. ${e.covered ? 'יש לך כרית — ★★★ אפשרי.' : `ל־★★★ צריך לפחות ${tgt} חודשי הוצאות בצד.`}</p>
    <div class="loans"><button data-act="save" ${m.cash > 0 ? '' : 'disabled'}>להפקיד לקרן</button><button data-act="unsave" ${e.balance > 0 ? '' : 'disabled'}>למשוך מהקרן</button></div></div>`;
}
/** side hustle: reported to the tax authority? (st.life.sideReport, read-only) */
function sideHtml(m, st) {
  const L = st && st.life; if (!L || !(L.plan === 'side' || (L.side && L.side.total > 0))) return '';
  if (L.sideReport) return '<p class="note">🧾 העסק הצדדי מדווח: מקדמות מס יורדות כל חודש, בלי קנס בסוף השנה.</p>';
  return `<div class="wbox"><div class="wl"><span>🧾 העסק הצדדי לא מדווח</span></div><p class="note">המס מצטבר לסוף השנה${L.sideTaxDue ? ` (כרגע ${iso(fmtM(L.sideTaxDue))})` : ''}, ואם לא מסדרים במשבצת מס הכנסה — עוד 10% קנס.</p><div class="loans"><button data-act="report">לפתוח תיק ולשלם מקדמות</button></div></div>`;
}
/** compact projection range (m.index.projection): never a promised return */
function projLine(P) {
  if (!P || !P.p50) return '';
  return `<p class="note">${num(fmtM(P.monthly))} בחודש למשך ${P.years} שנה: בין ${num(fmtC(P.p10))} ל־${num(fmtC(P.p90))} (באמצע ${num(fmtC(P.p50))}; שמת ${num(fmtC(P.contributed))}). ${escI(P.note || '')}</p>`;
}
/** "freedom must hold": goal met on GOAL_HOLD consecutive paydays (m.goalHold) */
function holdLine(m) {
  const g = m.goalHold; if (!g || !g.need) return '';
  if (g.streak > 0 && g.streak < g.need) return `<p class="hold">⏳ היעד מתקיים! הוא צריך להחזיק ${g.need} ימי משכורת ברצף: ${g.streak}/${g.need}</p>`;
  return '';
}
function spark(hist, { color = 'currentColor', w = 120, h = 30 } = {}) {
  if (!hist || hist.length < 2) return '';
  const mn = Math.min(...hist), mx = Math.max(...hist), span = mx - mn || 1;
  const pts = hist.map((v, i) => `${(i / (hist.length - 1)) * (w - 4) + 2},${h - 3 - ((v - mn) / span) * (h - 6)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
const row = (a, b, c = '') => `<div class="row"><span>${a}</span>${num(b, c)}</div>`;

/** ctx: {world, st, busy} */
export function renderSheet(m, ctx) {
  const el = $('#sheet'); if (!el) return;
  const w = ctx.world, st = ctx.st, wi = m.worldIndicators || {};
  const top = el.scrollTop;
  const goalTitle = m.goalType === 'passive' ? 'מד החופש' : 'יעד המפה';
  const hold = m.goalType !== 'benchmark' && m.goalHold && m.goalHold.need > 1 ? ` היעד צריך להחזיק ${m.goalHold.need} ימי משכורת ברצף.` : '';
  const goalHelp = (m.goalType === 'benchmark' ? `היעד: ${escI(goalWords(w.goalLabel))}. בסוף התקופה משווים לשווי של משקיע שקנה מדד והחזיק.` : m.goalType === 'passive' ? 'הכנסה פסיבית מול הוצאות. כשהפס מתמלא — יצאת מהמירוץ.' : m.goalType === 'netWorth' ? `היעד: ${escI(goalWords(w.goalLabel))}. שווי נקי = כל מה שיש לך פחות כל מה ש${gw('אתה חייב', 'את חייבת')}.` : m.goalType === 'passive12' ? `היעד: ${escI(goalWords(w.goalLabel))}. נמדד בממוצע של 12 ימי משכורת: הקיץ צריך לממן את החורף.` : `היעד: ${escI(goalWords(w.goalLabel))}. צריך את שניהם.`) + hold;
  let world = '';
  if (w.mechanic === 'rate') {
    world = `<div class="wbox"><div class="wl"><span>ריבית במשק</span><b class="num">${pctTxt(wi.rate)}</b></div>${spark(wi.rateHist, { color: 'var(--accent)' })}
      <p class="note">הלוואה בנקאית עולה ${num(pctTxt(wi.loanPct))} בחודש. משכנתא משתנה זזה עם הריבית; קבועה ננעלת על הריבית ועוד ${num(pctTxt(wi.fixedPremium))}.</p></div>`;
  } else if (w.mechanic === 'fx') {
    const ex = wi.exposure || { cf: 0, value: 0 };
    world = `<div class="wbox"><div class="wl"><span>שער הדולר</span><b class="num">${usdTxt(wi.usd)}</b></div>${spark(wi.usdHist, { color: 'var(--accent)' })}
      <p class="note">אם הדולר יעלה ב־10%: תזרים ${num(sgn(ex.cf), cls(ex.cf))} בחודש, שווי ${num(sgn(ex.value), cls(ex.value))}.${(wi.insuredUntil || 0) >= m.month ? ` המשלוחים מבוטחים עד חודש ${wi.insuredUntil}.` : ''}</p>
      ${wi.gold ? `<div class="row"><span>מחיר זהב (אונקייה)</span>${num(fmtM(wi.gold))}</div>` : ''}</div>`;
  } else if (w.mechanic === 'angel') {
    world = `<div class="wbox"><div class="wl"><span>נקודות השפעה</span><b class="num">${wi.impact}/${wi.impactTarget}</b></div>
      <div class="track"><i style="width:${Math.min(100, (wi.impact / Math.max(1, wi.impactTarget)) * 100)}%"></i></div>
      <p class="note">${wi.impactPerMonth ? `+${wi.impactPerMonth} בחודש` : 'עוד אין השפעה חודשית'}${wi.impactPending ? ` · עוד ${wi.impactPending} בדרך` : ''}. ${wi.angelsActive ? `${wi.angelsActive} סטארט־אפים פעילים, שווי על הנייר ${fmtM(wi.angelPaper)}.` : 'עוד לא השקעת בסטארט־אפים.'}</p></div>`;
  }
  else if (wi.plant && wi.panel) {   // w6: the plant box; the full panel (gauges, hazard bars, lines, actions) opens from here, the HUD chip and 💼
    const P = wi.plant;
    world = `<div class="wbox"><div class="wl"><span>🏭 ${esc(wi.panel.title || 'קווי ייצור')}: ${num(`${P.lines}/${P.slots}`)}</span><b class="num">${P.utilisation != null ? `ניצולת ${esc(pctI(P.utilisation))}` : 'אין קווים'}</b></div>
      <p class="note">${P.lines ? `עלויות קבועות ${num(mS(P.fixedMonth))} בחודש · תזרים הקווים ${num(mSg(P.cfMonth), cls(P.cfMonth))}${P.runway != null ? ` · כרית ${num(String(Math.round(P.runway * 10) / 10))} חודשי קבועות` : ''}. ` : 'עוד אין לך קווי ייצור: קונים או מזמינים במשבצת "הזדמנות". '}${P.breakdowns ? `תקלות עד היום: ${num(String(P.breakdowns))}.` : ''}${P.penalties ? ` קנסות על חוזים: ${num(mS(P.penalties))}.` : ''}</p>
      <div class="loans"><button data-act="world">🏭 ${esc(wi.panel.title || 'לוח המפה')}</button></div></div>`;
  }
  else if (wi.chain && wi.panel) {   // w7: the chain box; the full panel (gauges, branches, stock, actions) opens from here, the HUD chip and 💼
    const C = wi.chain;
    world = `<div class="wbox"><div class="wl"><span>🛍️ ${esc(wi.panel.title || 'הרשת')}: ${num(`${C.branches}/${C.span}`)}</span><b class="num">${esc(C.liqMonths >= 99 ? 'אין קבועות' : `קופה ${mo1(C.liqMonths)} ח׳`)}</b></div>
      <p class="note">${C.branches || C.franchises ? `${num(String(C.branches))} סניפים מול יכולת ניהול של ${num(String(C.span))} · עלויות קבועות ${num(mS(C.fixedMonth))} בחודש · קופה נזילה ${num(mS(C.liquid))} · מלאי ${num(mS(C.stock))}${C.transit ? ` + בדרך ${num(mS(C.transit))}` : ''}${C.payables ? ` · חוב לספקים ${num(mS(C.payables))}` : ''}${C.franchises ? ` · ${num(String(C.franchises))} בזכיינות` : ''}. ` : 'עוד אין לך סניפים: מיקום לסניף מגיע במשבצת "מיקום לסניף". '}${C.overSpan ? `⚠️ ${num(String(C.overSpan))} סניפים מעבר ליכולת הניהול. ` : ''}${C.lost ? `מכירות שאבדו כשנגמר המלאי: ${num(mS(C.lost))}.` : ''}</p>
      <div class="loans"><button data-act="world">🛍️ ${esc(wi.panel.title || 'לוח המפה')}</button></div></div>`;
  }
  else if (wi.energy && wi.panel) {   // w9: the stations box; the full panel (gantt, calls, projects, plants, actions) opens from here
    const EN = wi.energy;
    world = `<div class="wbox"><div class="wl"><span>☀️ ${esc(wi.panel.title || 'התחנות')}</span><b class="num">${esc(mS(EN.income))} / ${esc(mS(EN.target))}</b></div>
      <p class="note">הכנסה תפעולית אחרי החזר חוב, בחודש רגיל: ${num(mSg(EN.income), cls(EN.income))} מתוך ${num(mS(EN.target))}. ריבית ${num(EN.rate + '%')} · חשמל ${num(mwh(EN.px))} · ${num(String((EN.slots || {}).free || 0))} חיבורים פנויים${EN.equityCalls ? ` · הון עצמי שעוד צריך ${num(mS(EN.equityCalls))}` : ''}${EN.built ? ` · ${num(String(EN.built))} תחנות נבנו` : ''}.</p>
      <div class="loans"><button data-act="world">☀️ ${esc(wi.panel.title || 'לוח המפה')}</button></div></div>`;
  }
  else if (wi.portfolio && wi.panel) {   // w10: the portfolio box; the market screen opens from here
    const PF = wi.portfolio; const R = (wi.market || {}).regime || {};
    world = `<div class="wbox"><div class="wl"><span>📊 ${esc(wi.panel.title || 'הבורסה והתיק')} · ${esc(R.label || '')}</span><b class="num">מינוף ${esc(pctI(PF.ltv))}</b></div>
      <p class="note">מניות וקרן מדד ${num(mS((PF.classes || {}).daily || 0))} · קרנות ${num(mS((PF.classes || {}).monthly || 0))} · פרטי ${num(mS((PF.classes || {}).locked || 0))}${PF.debt ? ` · הלוואה כנגד התיק ${num(mS(PF.debt))}` : ''}${PF.unfunded ? ` · התחייבויות פתוחות ${num(mS(PF.unfunded))}` : ''}${PF.call ? ' · <b class="neg">⚠️ קריאת מרווח</b>' : ''}${PF.forced ? ` · ${num(String(PF.forced))} מכירות כפויות` : ''}.</p>
      <div class="loans"><button data-act="world">📊 ${esc(wi.panel.title || 'לוח המפה')}</button></div></div>`;
  }
  else if (wi.multinational && wi.panel) {   // w11: the group box; the map panel opens from here
    const X = wi.multinational;
    const nm = (wi.panel.rows || []).filter((r) => r.mgr).length;
    world = `<div class="wbox"><div class="wl"><span>🌍 חברות־בנות ${num(`${X.subs}/${X.maxSubs}`)}</span><b>${nm ? num(`אמון ${pctI(X.trust)}`) : 'בלי מנהלים'}</b></div>
      <p class="note">קשב ${num(`${X.used}/${X.slots}`)} · רווח מגודר ${num(pctI(X.hedgedShare))} · שכר מנהלים ומטה ${num(mS(X.fixedMonth))} בחודש${X.localCash ? ` · מזומן בחו"ל ${num(mS(X.localCash))}` : ''}${X.frauds ? ` · <b class="neg">${num(String(X.frauds))} הונאות (${num(mS(X.fraudLoss))})</b>` : ''} · ${num(String(X.audits))} ביקורות.</p>
      <div class="loans"><button data-act="world">🌍 ${esc(wi.panel.title || 'לוח המפה')}</button></div></div>`;
  }
  else if (wi.holding && wi.panel) world = WV2.hdBox(WVH2, wi.holding, wi.panel.title);   // w12: the group box; the group panel opens from here
  else if (wi.harvest && wi.panel) world = WV2.hvBox(WVH2, wi.harvest, wi.panel.title);   // w16: the farm box; the farm panel opens from here
  else if (WV3.worldKey(wi)) world = WV3.box(WVH2, wi);   // w14 / w17 / w18 / w19 / w20: the bank / lab / insurer / company / fund box; its panel opens from here
  else if (wi.platform && wi.panel) {   // w15: the app box; the app panel opens from here
    const X = wi.platform;
    world = `<div class="wbox"><div class="wl"><span>☁️ ${esc(wi.panel.title || 'האפליקציה')}${X.sold ? ' · נמכרה' : ''}</span><b>${num(X.sold ? mS(X.proceeds) : +X.runway >= 99 ? 'רווחית' : mo1(X.runway) + ' חודשי מזומן')}</b></div>
      <p class="note">${(+X.users || 0).toLocaleString('en-US')} משתמשים · הכנסה ${num(mS(X.mrr))} בחודש · ${X.cf >= 0 ? 'רווח' : 'שריפה'} ${num(mSg(X.cf), cls(X.cf))} · החלק שלך ${num(pctI(X.stake))} = ${num(mS(X.stakeValue))} · שוק: ${esc(X.regimeLabel || '')} (×${esc(String(X.mult))}).</p>
      <div class="loans"><button data-act="world">☁️ ${esc(wi.panel.title || 'לוח המפה')}</button></div></div>`;
  }
  else if (wi.league && wi.panel) {   // w13: the club box; the club panel (table, squad, stadium, actions) opens from here
    const LG = wi.league; const La = LG.last || {};
    world = `<div class="wbox"><div class="wl"><span>🏟️ ${esc(wi.panel.title || 'המועדון')} · ${esc(LG.divName)}</span><b class="num">מקום ${esc(String(LG.rank))}</b></div>
      <p class="note">עונה ${num(String(LG.season))} · מחזור ${num(`${LG.round}/${LG.rounds}`)}${LG.window ? ' · 🔁 חלון העברות' : ''} · הכנסות החודש ${num(mS(La.rev || 0))} · שכר ${num(mS(LG.wages))} · שכר מול הכנסות (12 חודשים) ${num(wrT(LG.wageRatio), LG.wageRatio > LG.wageRatioTarget ? 'neg' : '')} (יעד: עד ${num(pctI(LG.wageRatioTarget))}) · הסגל בספרים ${num(mS(LG.squadBook))} · בשוק ${num(mS(LG.squadMv))}${LG.ownerLoan ? ` · הלוואת בעלים ${num(mS(LG.ownerLoan))}` : ''}.</p>
      <div class="loans"><button data-act="world">🏟️ ${esc(wi.panel.title || 'לוח המפה')}</button></div></div>`;
  }
  else if (wi.proj && wi.panel) {   // w8: the projects box; the full panel (gantt, equity calls, rows, rentals, actions) opens from here
    const PJ = wi.proj;
    world = `<div class="wbox"><div class="wl"><span>🏗️ ${esc(wi.panel.title || 'הפרויקטים')}: ${num(String(PJ.open))}</span><b class="num">ריבית ${esc(PJ.rate + '%')}</b></div>
      <p class="note">${num(String(PJ.open))} ${PJ.open === 1 ? 'פרויקט פתוח' : 'פרויקטים פתוחים'}. ${PJ.equityCalls ? `הון עצמי שעוד צריך: ${num(mS(PJ.equityCalls))}${PJ.runway != null ? ` · המזומן מכסה ×${num(String(Math.round(PJ.runway * 100) / 100))}` : ''}. ` : ''}ביקוש לדירות ×${num(String(PJ.demand))} · הלוואת בנייה ${num(String(PJ.loanRate))}% בחודש${PJ.completed ? ` · ${num(String(PJ.completed))} פרויקטים הושלמו` : ''}${(PJ.plots || []).length ? ` · ${num(String(PJ.plots.length))} מגרשים` : ''}${(PJ.rentals || []).length ? ` · ${num(String(PJ.rentals.length))} בניינים מושכרים` : ''}${PJ.stallMonths ? ` · חודשי עמידה עד היום: ${num(String(PJ.stallMonths))}` : ''}.</p>
      <div class="loans"><button data-act="world">🏗️ ${esc(wi.panel.title || 'לוח המפה')}</button></div></div>`;
  }
  else if (wi.season) {   // w5: the season box; the full panel (strip, ring, rows, actions) opens from here, the HUD chip and 💼
    const se = wi.season; const rw = (wi.panel && (wi.panel.gauges || []).find((g) => g.id === 'runway')) || null;
    world = `<div class="wbox"><div class="wl"><span>${BAND_IC[se.band] || '🌴'} ${esc(MONTH_HE[se.cal - 1] || '')} · ${esc(BAND_HE[se.band] || '')}</span><b class="num">ביקוש ${esc(tourTxt(se.tour))}</b></div>
      <p class="note">${rw && rw.value != null ? `כרית לחורף: ${num(String(Math.round(rw.value * 10) / 10))} חודשי עלויות קבועות. ` : ''}${se.line ? `קו עונתי: ${num(fmtM(se.line))} (נסגר עד אוגוסט). ` : ''}${se.fixedMonth ? `עלויות קבועות של הנכסים: ${num(fmtM(se.fixedMonth))} בחודש.` : 'עוד אין נכסים עונתיים.'}</p>
      <div class="loans"><button data-act="world">🌴 ${esc((wi.panel && wi.panel.title) || 'לוח המפה')}</button></div></div>`;
  }
  else if (wi.ymText) {
    world = `<div class="wbox"><div class="wl"><span>🗞️ ${esc(wi.ymText)}</span>${wi.index != null ? `<b class="num">מדד ${Math.round(wi.index)}</b>` : ''}</div>${spark(wi.indexHist, { color: 'var(--accent)' })}
      ${wi.benchmark != null ? row('המשקיע שקנה מדד והחזיק', fmtM(wi.benchmark)) : ''}${wi.rate != null ? row('ריבית בנק ישראל', iso(wi.rate + '%')) : ''}
      ${wi.reality ? `<p class="reality">${escI(wi.reality)}</p>` : ''}</div>`;
  }
  const assetRows = m.assets.map((a) => {
    const badges = [];
    if (a.golden) badges.push('<em class="b gold">זהב</em>');
    if (a.fixedRate != null && a.debt > 0) badges.push(`<em class="b">קבועה ${num(pctTxt(a.fixedRate))}</em>`);
    else if (a.variable) badges.push('<em class="b warn">משתנה</em>');
    if (a.hedgedUntil) badges.push(`<em class="b ok">מגודר עד ${a.hedgedUntil}</em>`);
    if (a.upgrades) badges.push(`<em class="b">שודרג ×${a.upgrades}</em>`);
    if (a.impact) badges.push(`<em class="b pink">+${a.impact} השפעה</em>`);
    if (a.business) badges.push(a.business.manager || a.business.incomeKind === 'passive' ? '<em class="b ok">עם מנהל · פסיבי</em>' : `<em class="b warn">${gw('אתה עובד בו', 'את עובדת בו')} · אקטיבי</em>`);
    return `<div class="arow" data-asset="${esc(a.id)}"><div><button type="button" class="alink" data-asset-open="${esc(a.id)}">${esc(a.name)}</button>${badges.join('')}</div><div class="av2">${num(fmtM(a.value))}<small class="${cls(a.cf)}">${num(sgn(a.cf))} לחודש</small></div></div>`;
  }).join('');
  const holdRows = m.holdings.map((h) => `<div class="arow" ${h.model ? `data-asset="h:${esc(h.model)}"` : ''}><div>${h.model ? `<button type="button" class="alink" data-asset-open="h:${esc(h.model)}">${N(h.qty)} ${esc(h.unit)} ${esc(h.ticker)}</button>` : `<span>${N(h.qty)} ${esc(h.unit)} ${esc(h.ticker)}</span>`}<small class="note">${fmtP(h.price)} ליחידה</small></div><div class="av2">${num(fmtM(h.value))}${h.div ? `<small class="pos">${num(sgn(h.qty * h.div))} לחודש</small>` : ''}</div></div>`).join('');
  const angelRows = m.angels.filter((x) => x.status === 'active').map((x) => `<div class="arow" data-asset="${esc(x.id)}"><div><button type="button" class="alink" data-asset-open="${esc(x.id)}">${esc(x.name)}</button><small class="note">${x.news ? escI(x.news) : `תוצאה עד חודש ${x.revealAt}`}</small></div><div class="av2">${num(fmtM(x.paper))}<small>על הנייר</small></div></div>`).join('');
  const totA = m.totalAssets ?? null, totL = m.totalLiabilities ?? null; // engine sums (audit D3) — the UI only displays
  const done = m.angels.filter((x) => x.status !== 'active');
  const angelDone = done.length ? `<p class="note">${done.length} השקעות נסגרו: ${done.map((x) => `${esc(x.name)} ${x.mult ? '×' + x.mult : '✗'}`).join(' · ')}</p>` : '';
  el.innerHTML = `<div class="sh-head"><div><h2>הדוח הכספי</h2><p class="sub">${esc(st.charName)} · ${esc(w.name)} · חודש ${m.month}${m.mode !== 'free' ? '/' + m.maxMonths : ''}</p></div><button class="ibtn sh-close" data-act="close" aria-label="סגירת הדוח">${ICON.close}</button></div>
  <div class="freedom"><div class="fl"><span>${esc(goalTitle)}</span><span class="num">${shownPct(m)}%</span></div>
   ${m.goalParts.map((p) => `<div class="track" title="${esc(p.label)}"><i style="width:${Math.max(1, p.progress * 100)}%"></i></div><p class="gpl"><span>${esc(p.label)}</span>${num(partText1420(p) ? partText1420(p).long : p.key === 'impact' ? `${N(p.value)} / ${N(p.target)}` : isStreak(p) ? `${Math.round(p.value)} / ${p.target} חודשים ברצף` : p.unit === 'months' && wi.holding ? `${monthsText(p.value, 'cov')} (כיסוי ${covX(p.value)}) / ${p.target} חודשים` : p.unit === 'months' ? `${monthsText(p.value, !!wi.platform)} / ${p.target} חודשים` : p.cmp === 'le' ? `${pctI(p.value)} · היעד: עד ${pctI(p.target)}` : `${fmtM(p.value)} / ${fmtM(p.target)}`)}</p>`).join('')}
   ${holdLine(m)}<p>${goalHelp}</p></div>
  ${world}
  ${m.econ ? `<div class="wbox econbox"><div class="wl"><span>📊 מד הכלכלה</span></div>${econBlockHtml(m.econ)}</div>` : ''}
  ${payslipHtml(m, ctx)}
  ${m.index ? `<div class="wbox idx"><div class="wl"><span>📈 קרן מחקה מדד</span><b class="num">${fmtM(m.index.value || 0)}</b></div>
    ${m.index.history && m.index.history.length > 1 ? spark(m.index.history, { color: 'var(--green)', w: 300, h: 30 }) : ''}
    <p class="note">${m.index.qty ? `${N(m.index.qty)} יחידות · ${iso(fmtP(m.index.price))} ליחידה` : 'עוד לא השקעת. משעמם, זול, ועובד לאורך זמן.'}${m.index.autoInvest ? ` · הוראת קבע ${iso(fmtM(m.index.autoInvest))} בחודש` : ''}${m.index.maxBuy ? ` · אפשר לקנות עד ${N(m.index.maxBuy)} יחידות` : ''}</p>
    ${projLine(m.index.projection)}
    <div class="loans"><button data-act="invest">להשקיע / למכור</button></div></div>` : ''}
  ${fundHtml(m)}
  ${m.taxes && m.taxes.total ? (() => { const t = m.taxes; return `<details class="slip"><summary><span>🏛️ מסים ששילמת עד עכשיו</span><b class="num">${fmtM(t.total)}</b></summary><div class="slipb">${t.income ? row('מס הכנסה', fmtM(t.income)) : ''}${t.bl ? row('ביטוח לאומי ובריאות', fmtM(t.bl)) : ''}${t.capGains ? row('מס רווחי הון', fmtM(t.capGains)) : ''}${t.rental ? row('מס על שכירות', fmtM(t.rental)) : ''}${t.betterment ? row('מס שבח', fmtM(t.betterment)) : ''}${t.side ? row('מס על העסק הצדדי', fmtM(t.side)) : ''}${t.business ? row('מס חברות ודיבידנד מהעסק', fmtM(t.business)) : ''}${t.savings ? row('מס על ריבית החיסכון', fmtM(t.savings)) : ''}</div></details>`; })() : ''}
  ${sideHtml(m, st)}
  <h3>הכנסות בחודש</h3>${m.incomeLines.map((x) => row(escI(x.label), sgn(x.amount), cls(x.amount))).join('')}
  <h3>הוצאות בחודש</h3>${m.expenseLines.map((x) => row(escI(x.label), fmtM(x.amount))).join('')}
  <div class="total"><span>תזרים חודשי</span>${num(sgn(m.cashflow), cls(m.cashflow))}</div>
  <h3>נכסים</h3><div class="arow cashrow"><div><span>מזומן</span></div><div class="av2">${num(fmtM(m.cash))}</div></div>${m.savings ? `<div class="arow cashrow"><div><span>🛟 קרן חירום (חיסכון)</span>${m.emergency ? `<small class="note">${num(String(m.emergency.months))} חודשי הוצאות${m.emergency.rate ? ` · ${num(m.emergency.rate + '%')} בשנה` : ''}</small>` : ''}</div><div class="av2">${num(fmtM(m.savings))}</div></div>` : ''}${assetRows + holdRows + angelRows}${assetRows || holdRows || angelRows ? '' : '<p class="empty">עוד אין נכסים שמכניסים כסף. נכס = משהו שמכניס כסף לכיס שלך.</p>'}${angelDone}${candleSrc && st && st.prices && Object.keys(st.prices).length ? '<div class="loans cdl-sheet"><button type="button" data-act="candles">📈 מחירים, נרות וחדשות</button></div>' : ''}
  ${totA != null ? row('<b>סה"כ נכסים</b>', fmtM(totA)) : ''}
  <h3>התחייבויות</h3>${m.liabilities.length ? m.liabilities.map(liabRow).join('') + (totL != null ? row('<b>סה"כ התחייבויות</b>', fmtM(totL)) : '') : '<p class="empty">אין חובות.</p>'}
  <div class="total nw"><span>שווי נקי</span>${num(fmtM(m.netWorth), cls(m.netWorth))}</div>
  ${m.netWorthTotal != null && m.netWorthTotal !== m.netWorth ? `<div class="row nwt"><span>כולל קרן הפנסיה (לא נספרת ליעד — אי אפשר למשוך אותה עכשיו)</span>${num(fmtM(m.netWorthTotal))}</div>` : ''}
  <div class="loans"><button data-act="loan" ${m.canBorrow === false ? 'disabled title="הבנק בודק שתוכל להחזיר — כרגע הוא לא ילווה לך עוד"' : ''}>לקחת הלוואה ${fmtM(m.loanUnit)}</button><button data-act="repay" ${m.canRepay ? '' : 'disabled'}>להחזיר ${fmtM(m.loanUnit)}</button>${m.credit ? `<button data-act="credit" ${m.canPayCredit ? '' : 'disabled'}>לסגור חוב אשראי</button>` : ''}</div>
  <p class="note">כל ${num(fmtM(m.loanUnit))} הלוואה עולים ${num(fmtM(m.loanUnitCost))} בחודש${m.creditPct != null ? ` · חוב אשראי: ${iso(m.creditPct + '%')} בחודש` : ''}.${m.loanRoom != null ? (m.canBorrow === false ? ' הבנק בודק שתוכל להחזיר — כרגע הוא לא ילווה לך עוד.' : ` הבנק ילווה לך עוד עד ${num(fmtM(m.loanRoom))}.`) : ''}</p>
  ${m.realWorldRates && m.realWorldRates.bankLoan && m.realWorldRates.bankLoan.text ? `<p class="reality">${m.liabilities.some((x) => x.realText || x.realWorldRate != null) ? '' : `🌍 הלוואה: ${escI(m.realWorldRates.bankLoan.text)}. `}⚠ הריביות במשחק מוגזמות בכוונה — כדי שתרגיש אותן.</p>` : ''}
  <p class="disclaimer">סימולציה חינוכית — לא ייעוץ השקעות. המספרים מפושטים; לפני החלטה בכסף אמיתי בודקים מקורות רשמיים ומתייעצים עם בעל רישיון.</p>`;
  el.scrollTop = top;
}
let sheetRelease = null;
export function toggleSheet(force) {
  const s = $('#sheet'), b = $('#sheetBack'); const open = force ?? !s.classList.contains('open');
  s.classList.toggle('open', open); b.classList.toggle('on', open);
  $('#sheetBtn')?.setAttribute('aria-expanded', String(open));
  if (sheetRelease) { sheetRelease(); sheetRelease = null; }
  if (open && innerWidth <= 820) sheetRelease = trapFocus(s);   // the bottom sheet is a dialog on phones / tablets (K-8)
  if (open) setTimeout(() => s.querySelector('.sh-close')?.focus(), 30);
  // T5 verify D2: closing the sheet with focus inside it (Escape, ✕, a phone row that opens "פרטי הנכס") hands focus to its button
  else { const a = document.activeElement, sb = $('#sheetBtn'); if (a && s.contains(a) && sb && sb.getClientRects().length) sb.focus({ preventScroll: true }); }
}

/* ============================================================ mentor */
let typeTimer = 0, voiceOn = false, heVoice = null;
export function setVoice(on) {
  voiceOn = !!on;
  const b = $('#voiceBtn'); if (b) { b.setAttribute('aria-pressed', String(voiceOn)); b.title = voiceOn ? 'הקראה: פועלת' : 'הקראה: כבויה'; }
  if (!voiceOn) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
}
export function voiceAvailable() {
  if (!('speechSynthesis' in window)) return false;
  heVoice = (speechSynthesis.getVoices() || []).find((v) => /^(he|iw)/i.test(v.lang)) || null;
  return !!heVoice;
}
if ('speechSynthesis' in window) { try { voiceAvailable(); speechSynthesis.onvoiceschanged = voiceAvailable; } catch (e) { /* ignore */ } }
function speak(t) {
  if (!voiceOn || !heVoice) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.voice = heVoice; u.lang = heVoice.lang; u.rate = 1.04; speechSynthesis.speak(u); } catch (e) { /* ignore */ }
}
let lastMentor = '';
export function mentor(text) {
  if (!text) return;
  text = iso(gz(String(text))); lastMentor = text;   // D4: UI-side mentor lines too (engine lines are already genderized; gz is idempotent)
  const el = $('#mText'), sr = $('#mSr'), box = $('#mentor');
  clearInterval(typeTimer);
  if (sr) sr.textContent = text;
  box.classList.remove('talk'); void box.offsetWidth; box.classList.add('talk');
  const t0 = performance.now(), dur = Math.min(1400, 300 + text.length * 12) * Math.max(0.6, speed);
  el.textContent = '';
  box.classList.remove('open', 'more');
  typeTimer = setInterval(() => { const n = Math.ceil(text.length * Math.min(1, (performance.now() - t0) / dur)); el.textContent = text.slice(0, n); if (n >= text.length) { clearInterval(typeTimer); markMore(); } }, 24);
  speak(text);
}
function markMore() { const el = $('#mText'), box = $('#mentor'); if (el && box) box.classList.toggle('more', el.scrollHeight > el.clientHeight + 2); }
/** Tap on the mentor bar: finish typing, then toggle the full text (phones clamp it). */
export function finishMentor() {
  const box = $('#mentor'), el = $('#mText');
  if (el.textContent !== lastMentor) { clearInterval(typeTimer); el.textContent = lastMentor; markMore(); return; }
  const o = !box.classList.contains('open'); box.classList.toggle('open', o); box.setAttribute('aria-expanded', String(o));
  if (!o) markMore();
}
export function speakLast() { speak(lastMentor); }

/* ============================================================ dice */
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export function showDice(faces) {
  faces = (Array.isArray(faces) ? faces : [faces || 1]).filter(Boolean);
  const box = $('#dice'); if (!box) return;
  [...box.querySelectorAll('.die')].forEach((d, k) => {
    const n = faces[k]; d.hidden = !n; if (!n) return;
    d.querySelectorAll('i').forEach((el, i) => { el.style.visibility = PIPS[n].includes(i) ? 'visible' : 'hidden'; });
  });
  const tot = faces.reduce((a, b) => a + b, 0);
  box.setAttribute('aria-label', faces.length > 1 ? `יצא ${faces.join(' ו־')} — סה"כ ${tot}` : 'יצא ' + tot);
  box.classList.toggle('double', faces.length === 2 && faces[0] === faces[1]);
}
export const showDie = (n) => showDice([n]);
/** DOM dice after the 3D throw settled. */
export function landDice(faces) {
  const box = $('#dice'); showDice(faces);
  box.classList.remove('land'); void box.offsetWidth; box.classList.add('land');
  const tot = faces.reduce((a, b) => a + b, 0);
  $('#dieSr').textContent = (faces.length > 1 ? `יצא ${faces.join(' ו־')}, סה"כ ${tot}` : 'יצא ' + tot) + (faces.length === 2 && faces[0] === faces[1] ? ' — דאבל!' : '');
}
export function shakeDomDice(on) { const box = $('#dice'); if (box) box.classList.toggle('shaking', !!on); }
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export function setRollEnabled(b) {
  const r = $('#roll'); if (r) { r.disabled = !b; r.classList.toggle('ready', !!b); }
  // wave 3a (review MAJOR-1): the tile list waits while the roll waits (a move, a card, the end) — it can never stack with a card
  const l = $('#tilesBtn'); if (l) { l.disabled = !b; l.setAttribute('aria-disabled', String(!b)); }
}
export function focusRoll() { const r = $('#roll'); if (r && !r.disabled && $('#evm').hidden && $('#gm').hidden && !lobbyOpen()) r.focus({ preventScroll: true }); }

/* ============================================================ flying coins */
let motionReduced = null;
/** game.js (T5 CR-S1) tells the UI the effective motion preference. */
export function setMotion(r) { motionReduced = !!r; }
const reduced = () => (motionReduced == null ? reducedMotion() : motionReduced);
export function flyCoins(from, n = 7) {
  const tgt = $('#hCash'); if (!tgt || !from) return;
  if (reduced()) { // T5 CR-U2 / A-23: no flyers — a 120 ms outline pulse on the cash number instead
    tgt.classList.remove('pulse'); void tgt.offsetWidth; tgt.classList.add('pulse'); setTimeout(() => tgt.classList.remove('pulse'), 160); return;
  }
  const r = tgt.getBoundingClientRect(); const tx = r.left + r.width / 2 - 11, ty = r.top + r.height / 2 - 11;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i'); c.className = 'coin'; c.setAttribute('aria-hidden', 'true'); document.body.appendChild(c);
    const fx = from.x - 11, fy = from.y - 11;
    const dx = (Math.random() - 0.5) * 90, dy = -50 - Math.random() * 60;
    const anim = c.animate([
      { transform: `translate(${fx}px,${fy}px) scale(.4)`, opacity: 0 },
      { transform: `translate(${fx + dx}px,${fy + dy}px) scale(1.05)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${tx}px,${ty}px) scale(.55)`, opacity: 0.95 },
    ], { duration: (680 + i * 35) * Math.max(0.6, speed), delay: i * 55 * speed, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards' });
    anim.onfinish = () => { c.remove(); if (i === 0) bumpCash(); };
  }
}

/* ============================================================ coach marks */
let coachRes = null, coachRelease = null, coachPrev = null;
/** Spotlight a target and explain it. Resolves 'next' | 'skip' — or 'none' when the target is not on screen (nothing was shown).
 *  The target stays clickable. T4 §4.4 chrome: `label i/n` for a numbered step; `label` alone when step is null (in-card core
 *  coach, "טיפ" one-liners); skipLabel null = only "הבנתי". tip:true = the lighter one-line hint style. */
export function coach({ target, title, text, step = null, total = null, label = 'הדרכה', skipLabel = 'דלג על ההדרכה', tip = false }) {
  hideCoach(); text = gz(text); title = gz(title);   // D4
  return new Promise((res) => {
    const el = $('#coach'); const t = typeof target === 'string' ? $(target) : target;
    if (!el || !t || !t.getClientRects().length) { res('none'); return; }
    coachRes = res;
    const card = t.closest('#evCard');
    try { t.scrollIntoView({ block: card ? 'center' : 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ }
    const place = () => {
      const r = t.getBoundingClientRect();
      const bw = Math.min(330, innerWidth - 24);
      let pos;
      if (card) {
        // never cover the card's numbers: beside the card on wide screens, pinned to the top (over the HUD) on phones
        const cr = card.getBoundingClientRect();
        if (cr.left - 24 >= bw) pos = `top:${Math.round(Math.max(12, Math.min(innerHeight - 260, r.top - 40)))}px;left:${Math.round(cr.left - bw - 18)}px`;
        else if (innerWidth - cr.right - 24 >= bw) pos = `top:${Math.round(Math.max(12, Math.min(innerHeight - 260, r.top - 40)))}px;left:${Math.round(cr.right + 18)}px`;
        else pos = `top:8px;left:${Math.round((innerWidth - bw) / 2)}px`;
      } else {
        const below = r.top < innerHeight / 2;
        pos = `${below ? `top:${r.bottom + 14}px` : `bottom:${innerHeight - r.top + 14}px`};left:${Math.round(Math.min(innerWidth - bw - 12, Math.max(12, r.left + r.width / 2 - bw / 2)))}px`;
      }
      el.innerHTML = `<div class="ring" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>
        <div class="bubble" role="dialog" aria-label="${esc(title)}" style="${pos};width:${bw}px">
        <small>${esc(label)}${step != null && total ? ` ${step}/${total}` : ''}</small><b>${esc(title)}</b><p>${escI(text)}</p>
        <div class="acts"><button class="primary" data-c="next">הבנתי</button>${skipLabel ? `<button class="chip" data-c="skip">${esc(skipLabel)}</button>` : ''}</div></div>`;
    };
    place(); el.hidden = false; el._place = place; el.classList.toggle('tip', !!tip);
    // the bubble is the topmost thing: Tab stays in it (also over an open phone sheet); closing it gives focus back
    coachPrev = document.activeElement; coachRelease = trapFocus(el);
    if (phoneQ()) { const vd = $('#verdict'); if (vd && vd.className.includes('on')) vd.className = vd.className.replace(/\bon\b/, '').trim(); } // one overlay at a time on phones
    el.onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; const v = b.dataset.c; hideCoach(v); };
    setTimeout(() => el.querySelector('[data-c="next"]')?.focus({ preventScroll: true }), 60);
  });
}
/** T4 §4.4 / §4.7: a one-line "טיפ" through the single overlay queue — on phones it is priority 1 and waits for whatever floats
 *  now (achievement, toast-backed lesson, verdict…) and for an open card / dialog to close; while it is open nothing else floats.
 *  ready() is asked again when its turn comes (false → nothing shown, 'later'). → 'next' | 'skip' | 'none' | 'later' */
export function hint(o, ready = () => true) {
  return new Promise((res) => {
    let fin = false; const end = (v) => { if (!fin) { fin = true; res(v); } };
    overlay('coach', (done) => {
      if (fin || coachOpen() || !ready()) { done(); end('later'); return; }
      const { onShow, ...c } = o;
      const pr = coach({ ...c, target: typeof c.target === 'function' ? c.target() : c.target, label: 'טיפ', step: null, total: null, tip: true });
      if (coachOpen()) { try { onShow && onShow(); } catch (e) { console.warn(e); } }
      pr.then((v) => { done(); end(v); });
    }, () => end('later'));
  });
}
export function hideCoach(v = 'next') {
  const el = $('#coach'); const was = !!el && !el.hidden;
  if (el) { el.hidden = true; el.innerHTML = ''; el._place = null; }
  if (coachRelease) { coachRelease(); coachRelease = null; }
  if (was && coachPrev && el && (document.activeElement === document.body || !document.activeElement || el.contains(document.activeElement) || !document.activeElement.isConnected)) {
    const pv = coachPrev; if (pv.isConnected && pv !== document.body && pv.getClientRects().length) try { pv.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  coachPrev = null;
  if (coachRes) { const r = coachRes; coachRes = null; r(v); }
  pumpOv();
}
addEventListener('resize', () => { const el = $('#coach'); if (el && !el.hidden && el._place) el._place(); });

/* ============================================================ event cards */
let evState = null, evRelease = null;
export function isEventOpen() { return !!evState; }
const ddLevel = (ev) => (ev && ev.data && ev.data.dd ? ev.data.dd.level : -1);

/**
 * Open an engine event as a card. onChoose(optionId, params) is called on every decision; the game calls
 * ctl.update(nextEvent) for multi-step events (trade, sell list, inspections) and ctl.close() when done.
 * ctx.api (optional, game.js): {mentor() → metrics().mentor, hint() → E.requestHint result (counted + saved by the game),
 *   impact(ref) → E.impactFor, focus() → open the focus picker from a payday / education card}. The UI computes no money.
 */
export function openEvent(ev, ctx, onChoose) {
  const m = $('#evm'), c = $('#evCard');
  if (gpOpen) goalPanel(false);   // wave 2: the card wins over the goal panel
  debtChip(null);                 // … and over the new-debt chip (the card is the next thing to read)
  evState = { ev, ctx, onChoose, q: 0, roi: false, hint: null, imp: { open: null, ref: null, cache: new Map() }, shownAt: performance.now() };
  if (phoneQ()) { const vd = $('#verdict'); if (vd && /\bon\b/.test(vd.className)) vd.className = vd.className.replace(/\bon\b/, '').trim(); toastAside(); stickyAside(); } // phones: the new card wins
  renderEvent(true);
  m.hidden = false;
  c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  c.scrollTop = 0;
  c.onclick = onCardClick;
  c.oninput = (e) => { if (e.target.id === 'qs') { evState.q = +e.target.value; tradeUpd(); } };
  if (evRelease) evRelease(); evRelease = trapFocus(c);
  setTimeout(() => focusPrimary(), 60);
  return {
    update(nev) {
      if (!evState) return;
      const prev = evState.ev; evState.ev = nev; evState.imp.cache.clear(); evState.shownAt = performance.now();   // P1: new buttons under the finger
      // a hint belongs to what was known when it was asked: an inspection (new facts) or a new card clears it
      if (evState.hint && (evState.hint.id !== nev.id || evState.hint.dd !== ddLevel(nev))) evState.hint = null;
      if (prev && prev.id !== nev.id) evState.imp.open = null;
      const fa = document.activeElement; const had = !!fa && c.contains(fa);
      const fk = had ? (fa.id ? `#${CSS.escape(fa.id)}` : fa.dataset.o ? `[data-o="${CSS.escape(fa.dataset.o)}"]` : fa.dataset.imp ? `[data-imp="${CSS.escape(fa.dataset.imp)}"]` : null) : null;
      const keep = c.scrollTop; renderEvent(false); c.scrollTop = keep;
      // a re-render replaces the card's DOM: keep keyboard focus on the same control, else on the card's primary (never <body>)
      if (had || !document.activeElement || document.activeElement === document.body) { const t = fk && c.querySelector(fk); if (t && !t.disabled) t.focus({ preventScroll: true }); else focusPrimary(); }
    },
    error(msg) { const e = c.querySelector('.err'); if (e) e.textContent = msg || ''; },
    busy(b) { c.classList.toggle('working', !!b); },
    close() { closeEvent(); },
    el: c,
  };
}
export function closeEvent() {
  const m = $('#evm'), c = $('#evCard');
  if (m) m.hidden = true;
  if (c) { c.onclick = null; c.oninput = null; }
  if (evRelease) { evRelease(); evRelease = null; }
  evState = null;
}
const lobbyOpen = () => { const st = $('#start'); return !!st && !st.hidden; };
/** Keyboard focus on open: the highlighted option at guide; with nothing highlighted (hint / pro, personal cards) the TITLE —
 *  so Enter never picks an option the player did not choose (T2 §15.2). */
function focusPrimary() {
  const c = $('#evCard'); if (!c || !evState || lobbyOpen()) return;
  const p = c.querySelector('.acts button.primary:not(:disabled), .plans button.primary:not(:disabled), .choices button.primary:not(:disabled)');
  if (p) { p.focus({ preventScroll: true }); return; }
  const t = c.querySelector('#evTitle');
  if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
  else c.querySelector('.acts button:not(:disabled)')?.focus({ preventScroll: true });
}
/** P1 2026-11-24: a pointer tap that lands within GHOST_MS of a card / dialog opening or changing is the second half of a
 *  double tap on whatever was under the finger before — never a decision (no double buy / sell / accept). Keyboard
 *  activations (detail 0) and deliberate repeats after the window are unaffected. */
const GHOST_MS = 320;
function ghostTap(e, since) { return !!e && e.detail > 0 && performance.now() - since < GHOST_MS; }
function onCardClick(e) {
  if (!evState) return;
  const sb = e.target.closest('[data-say]');
  if (sb) { const o = !sb.classList.contains('open'); sb.classList.toggle('open', o); sb.setAttribute('aria-expanded', String(o)); return; }
  const roi = e.target.closest('[data-roi]');
  if (roi) { evState.roi = true; const b = $('#roiBox'); if (b) b.hidden = false; roi.setAttribute('aria-expanded', 'true'); sfx('click'); hideCoach(); return; }
  if (e.target.closest('[data-hint]')) { askHint(); return; }
  if (e.target.closest('[data-later]')) { sfx('click'); try { evState.ctx.api.later(); } catch (x) { console.error(x); } return; }
  const rv = e.target.closest('[data-rv]'); if (rv) { sfx('click'); rivalPop(rv); return; }
  const it = e.target.closest('[data-imp]');
  if (it) { evState.imp.ref = it.dataset.imp; sfx('click'); paintImpact(); return; }
  if (e.target.closest('[data-focus-open]')) { sfx('click'); evState.ctx.api && evState.ctx.api.focus && evState.ctx.api.focus(); return; }
  const cf = e.target.closest('[data-cdl-full]'); if (cf) { sfx('click'); candlesFull(cf.dataset.cdlFull); return; }
  const q = e.target.closest('[data-q]');
  if (q) { const d = evState.ev.data; const s = q.dataset.q; evState.q = s === 'max' ? d.maxBuy : s === 'all' ? d.maxSell : s === 'zero' ? 0 : evState.q + +s; sfx('click'); tradeUpd(); return; }
  const b = e.target.closest('button[data-o]');
  if (!b || b.disabled) return;
  if (ghostTap(e, evState.shownAt || 0)) return;
  const id = b.dataset.o;
  const opt = evState.ev.options.find((o) => o.id === id);
  sfx('click');
  if (opt && opt.needsQty) { const q2 = evState.q; if (!q2) return; evState.onChoose(id, { qty: q2 }); return; }
  evState.onChoose(id, {});
}

/* ---------- T2: mentor hint (guide / hint levels; counted by the engine, saved by the game) */
const mentorOf = () => { try { return (evState && evState.ctx.api && evState.ctx.api.mentor && evState.ctx.api.mentor()) || null; } catch (e) { return null; } };
function hintable(ev, M) {
  if (!M || M.level === 'pro' || !evState.ctx.api || !evState.ctx.api.hint) return false;
  if (ev.auto || ev.type === 'trade' || ev.type === 'intro' || ev.type === 'story' || (ev.type === 'mystery' && ev.data && ev.data.kind === 'quiz')) return false;
  return !!M.canHint;
}
async function askHint() {
  const st = evState; if (!st || st.hintBusy) return;
  let r = null;
  st.hintBusy = true;
  try { r = await st.ctx.api.hint(); } catch (e) { console.error(e); }   // wave 3b + worlds: in a room the hint is a server intent (async)
  st.hintBusy = false;
  if (evState !== st) return;   // the card changed while the room answered
  if (!r || r.ok === false || !r.hint) { const e = $('#evCard .err'); if (e) e.textContent = (r && r.error) || 'אין כאן רמז'; return; }
  st.hint = { id: st.ev.id, dd: ddLevel(st.ev), res: r };
  sfx('click');
  const c = $('#evCard'); const keep = c.scrollTop; renderEvent(false); c.scrollTop = keep;
  const p = $('#hintP'); if (p) { try { p.scrollIntoView({ block: 'nearest' }); } catch (x) { /* ignore */ } }
  $('#evCard [data-hint]')?.focus({ preventScroll: true });
}
function hintBtnHtml(ev, M) {
  if (!hintable(ev, M)) return '';
  const used = M.hintsUsed || 0; const open = !!(evState.hint && evState.hint.id === ev.id);
  return `<button type="button" class="chip hintbtn ${open ? 'on' : ''}" data-hint aria-controls="hintP" aria-expanded="${open}">💡 רמז <small class="num">רמזים: ${used}</small></button>`;
}
function hintPanelHtml(ev) {
  const H = evState.hint; if (!H || H.id !== ev.id) return '<div id="hintP" class="hintp" aria-live="polite" hidden></div>';
  const h = H.res.hint; const o = h.optionId ? ev.options.find((x) => x.id === h.optionId) : null;
  return `<div id="hintP" class="hintp" aria-live="polite" tabindex="-1">
    <p class="hh"><b>💡 רמז</b>${o ? ` <span>${escI(shortLabel(o))}</span>` : ' <span>טרייד־אוף — אין כאן תשובה אחת</span>'}</p>
    <ul>${(h.reasons || []).map((t) => `<li>${escI(t)}</li>`).join('')}</ul>
    <p class="note">${escI(h.note || 'רמז לפי מה שידוע עכשיו — לא הבטחה')}</p></div>`;
}
/** after render: outline the hinted option with a dashed "רמז" badge — never the primary class */
function markHint(c, ev) {
  const H = evState.hint; if (!H || H.id !== ev.id || !H.res.hint.optionId) return;
  const b = c.querySelector(`button[data-o="${CSS.escape(H.res.hint.optionId)}"]`); if (!b) return;
  b.classList.add('hinted'); b.insertAdjacentHTML('beforeend', '<small class="hbadge" aria-hidden="true">רמז</small>');
  b.setAttribute('aria-describedby', 'hintP');
}
/** "ריבית משתנה 1% (לפי המוכר: …)" → "ריבית משתנה 1%" */
const shortLabel = (o) => String(o.label || '').replace(/\s*\([^()]*\)\s*$/, '').replace(/\s*·\s*סיכוי.*$/, '').trim() || o.label;

/* ---------- T2: impact panel ("מה זה עושה לי?") — data from E.impactFor only, cached per option for this card state */
const MAJ_ORDER = (o) => (o.kind === 'buy' || o.id === 'start' ? 0 : /^offer:/.test(o.id) ? 2 : o.kind === 'inspect' ? 3 : 1);
function majors(ev) { return ev.options.filter((o) => o.major && o.enabled).sort((a, b) => MAJ_ORDER(a) - MAJ_ORDER(b)); }
function impactPanelHtml(ev, M) {
  if (!evState.ctx.api || !evState.ctx.api.impact) return '';
  const ms = majors(ev); if (!ms.length) return '';
  const I = evState.imp;
  if (!I.ref || !ms.some((o) => o.id === I.ref)) {
    const pr = ms.find((o) => o.primary);
    I.ref = (pr || ms.find((o) => o.kind === 'buy') || ms.find((o) => o.id === 'start') || ms[0]).id;
  }
  // guide: open for the highlighted option — except on a T3 offer, whose setup tiles already carry the numbers (UI-6: setups first)
  if (I.open == null) I.open = !!(M && M.level === 'guide' && ms.some((o) => o.primary)) && !(ev.type === 'business' && ev.data && Array.isArray(ev.data.setups) && ev.data.setups.length);
  const tabs = ms.length > 1 ? `<div class="imp-tabs" role="group" aria-label="איזו אפשרות?">${ms.map((o) => `<button type="button" class="chip" data-imp="${esc(o.id)}" aria-pressed="${o.id === I.ref}">${escI(shortLabel(o))}</button>`).join('')}</div>` : '';
  return `<details class="imp" id="impP" ${I.open ? 'open' : ''}><summary><span>📊 מה זה עושה לי?</span><small>${escI(ms.length > 1 ? 'לפני שבוחרים' : shortLabel(ms[0]))}</small></summary>${tabs}<div class="imp-body" aria-live="polite">${I.open ? impactBodyFor(I.ref) : ''}</div></details>`;
}
function impactBodyFor(ref) {
  const I = evState.imp;
  if (!I.cache.has(ref)) { let v = null; try { v = evState.ctx.api.impact(ref); } catch (e) { console.error(e); } I.cache.set(ref, v); }
  return impactHtml(I.cache.get(ref));
}
function paintImpact() {
  const d = $('#impP'); if (!d || !evState) return;
  d.querySelectorAll('[data-imp]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.imp === evState.imp.ref)));
  const body = d.querySelector('.imp-body'); if (body && d.open) body.innerHTML = impactBodyFor(evState.imp.ref);
}
const mo1 = (x) => (x == null || !Number.isFinite(+x) ? '—' : String(Math.round(+x * 10) / 10));
let fundMonthsNow = null;   // the HUD's metrics().emergency.months (the impact's "before" for the fund row)
const BASIS = { expected: 'לפי הצפי — לא בטוח', branches: 'שתי אפשרויות' };
/** The impact layout (T2 §15.7): before → after summary, the main risk, then "פרטים" (fund, assumptions, two scenarios). Always the disclaimer. */
export function impactHtml(I) {
  if (!I) return '<p class="note">אין כאן נתונים להצגה כרגע.</p>';
  const tr = (label, a, b, c = '') => `<tr><th scope="row">${label}</th><td>${num(a)}</td><td>${num(b, c)}</td></tr>`;
  const rows = [tr('מזומן', fmtM(I.cashBefore), fmtM(I.cashAfter), cls(I.cashAfter - I.cashBefore)),
    tr('תזרים חודשי', sgn(I.cfBefore), sgn(I.cfAfter), cls(I.cfAfter - I.cfBefore)),
    tr('כרית: מזומן + קרן (חודשים)', mo1(I.cushionMonthsBefore), mo1(I.cushionMonthsAfter), cls(I.cushionMonthsAfter - I.cushionMonthsBefore))];
  // playtest: the cushion counts cash, but ★★★ needs the separate 🛟 fund — its own row, in months toward 3, always shown
  if (I.fundMonthsAfter != null) rows.push(tr('🛟 קרן חירום (ל־★★★: 3 חודשים)', fundMonthsNow != null ? `${mo1(fundMonthsNow)}/3` : '—', `${mo1(I.fundMonthsAfter)}/3`, cls(I.fundAfter - I.fundBefore)));
  else if (I.fundBefore !== I.fundAfter) rows.push(tr('🛟 קרן חירום', fmtM(I.fundBefore), fmtM(I.fundAfter), cls(I.fundAfter - I.fundBefore)));
  const P = I.power || {}, Hh = I.happiness || {};
  if (P.delta || P.perMonth) rows.push(tr('🔋 כוח', String(P.before), String(P.after) + (P.perMonth ? ` (${P.perMonth > 0 ? '+' : '−'}${Math.abs(P.perMonth)} בחודש)` : ''), cls(P.delta || P.perMonth)));
  if (Hh.delta) rows.push(tr('😊 אושר', String(Hh.before), String(Hh.after), cls(Hh.delta)));
  const liab = (I.newLiabilities || []).length ? `<p class="mh">חובות חדשים</p><ul class="liab">${I.newLiabilities.map((l) => `<li><span>${escI(l.label)}</span>${num(fmtM(l.amount))}${l.monthly ? ` <small>${num(fmtM(l.monthly))} בחודש</small>` : ''}</li>`).join('')}</ul>` : '';
  const risk = I.mainRisk ? `<p class="risk ${I.mainRisk.key === 'none' ? 'calm' : ''}">${I.mainRisk.key === 'none' ? '✓' : '⚠'} <b>הסיכון העיקרי:</b> ${escI(I.mainRisk.text)}</p>` : '';
  const br = I.branches ? `<div class="branches">${I.branches.map((x) => `<div class="brow"><div class="bl"><b class="num">${Math.round(x.p * 100)}%</b><span>${escI(x.label)}</span></div><i class="chbar"><i style="width:${Math.round(x.p * 100)}%"></i></i><small>מזומן ${num(fmtM(x.cashAfter))} · תזרים ${num(sgn(x.cfAfter))}${x.buyNet != null ? ` · אם קונים: ${num(sgn(x.buyNet))} בחודש` : ''}</small></div>`).join('')}</div>` : '';
  const S = I.scenarios;
  const col = (t, x, what) => `<div class="scol"><b>${t}</b>${row('מזומן', fmtM(x.cash))}${row('תזרים חודשי', sgn(x.cf), cls(x.cf))}${row('כרית (חודשים)', mo1(x.cushionMonths))}${x.forcedLoan > 0 ? `<p class="warn">הבנק ייתן הלוואה של ${num(fmtM(x.forcedLoan))}</p>` : ''}${what && what.length ? `<ul>${what.map((w) => `<li>${escI(w)}</li>`).join('')}</ul>` : ''}</div>`;
  const scen = S ? `<div class="scen">${col('תרחיש רגיל', S.base)}${col('תרחיש קשה (6 חודשים)', S.hard, S.hard.what)}</div>` : '';
  const assum = (I.assumptions || []).length ? `<p class="mh">הנחות</p><ul>${I.assumptions.map((a) => `<li>${escI(a)}</li>`).join('')}</ul>` : '';
  const time = I.time && I.time.note ? `<p class="note">🎓 ${escI(I.time.note)}${I.time.studyMonths ? ` (${num(String(I.time.studyMonths))} חודשים)` : ''}</p>` : '';
  const more = scen || assum || time ? `<details class="more"><summary>פרטים</summary>${time}${scen}${assum}</details>` : '';
  return `${BASIS[I.basis] ? `<p class="chipline"><em class="b">${BASIS[I.basis]}</em></p>` : ''}
    <table class="ba"><thead><tr><td></td><th scope="col">לפני</th><th scope="col">אחרי</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    ${liab}${risk}${br}${more}<p class="disc">${escI(I.disclaimer || 'זה תרחיש לפי מה שידוע עכשיו — לא תחזית ולא הבטחה.')}</p>`;
}
document.addEventListener('toggle', (e) => {   // the impact <details> opens: load the selected option's numbers (on demand only)
  if (!evState || !e.target || e.target.id !== 'impP') return;
  evState.imp.open = e.target.open;
  if (e.target.open) paintImpact();
}, true);

const PAREN_MONEY = /\s*\((?:[+−-]\u2060?)?[₪$][\d,.]+(?:\s*מיליון)?\)\s*$/;
/** "label (long explanation)" → the label on the button and the explanation as a small second line (doodad credit, tax). */
const SPLIT_PAREN = /^(.{4,}?)\s*\(([^()]{12,})\)\s*$/;
function optLabel(o, split = false) {
  if (split && !o.netLabel) { const m = SPLIT_PAREN.exec(o.label); if (m) return `<span>${escI(m[1])}</span><small class="net sub">${escI(m[2])}</small>`; }
  const base = o.netLabel ? o.label.replace(` (${o.netLabel})`, '').replace(`(${o.netLabel})`, '').replace(PAREN_MONEY, '').trim() : o.label;
  const net = o.netLabel ? `<small class="net ${cls(o.net)}">${escI(o.netLabel)}</small>` : '';
  return `<span>${escI(base)}</span>${net}`;
}
function optButtons(ev, filter = () => true, extraCls = '', split = false) {
  const opts = ev.options.filter(filter);
  const long = opts.some((o) => o.label.length > 26 || o.netLabel) || opts.length > 3;
  return `<div class="acts ${long ? 'col' : ''} ${extraCls}">${opts.map((o, i) => { const sp = split && SPLIT_PAREN.test(o.label); return `<div class="opt"><button data-o="${esc(o.id)}" class="${o.primary ? 'primary' : ''} ${o.kind === 'sell' ? 'sell' : ''} ${o.netLabel || sp ? 'hasnet' : ''}" ${o.enabled ? '' : `disabled aria-describedby="why${i}"`}>${optLabel(o, split)}</button>${!o.enabled && o.reason ? `<small class="why" id="why${i}">${escI(o.reason)}</small>` : ''}</div>`; }).join('')}</div>`;
}
const PLAN_ICON = { work: '💼', overtime: '⏱️', study: '🎓', side: '🛠️', rest: '🌿' };
/** Effect chips (T3 UI-1 / UI-10). Every chip carries its sign and words, never colour alone.
 *  ₪ now · `flow` = the signed change to YOUR monthly cashflow (a cost is negative, red) × months · net salary × months ·
 *  😊 · ✨ · 🔋 · 🎓 · risk. Life and story options always carry `flow`; their deprecated `monthly` (= −flow) is never
 *  rendered — that was the old money-sign bug (a baby's cost showed in green). Plan tiles pass `net` (money in hand). */
function effectChips(e = {}, { odds = false } = {}) {
  const c = [];
  const chip = (n, t) => `<em class="fx ${cls(n)}">${t}</em>`;
  const signed = (n) => iso((n > 0 ? '+' : '−') + Math.abs(Math.round(n)));
  if (e.cash) c.push(chip(e.cash, `${iso(sgn(e.cash))} עכשיו`));
  if (e.net != null && e.net !== 0) c.push(chip(e.net, `${iso(sgn(e.net))} בחודש`));
  const flow = 'flow' in e ? e.flow : null;
  if (flow) c.push(chip(flow, `${iso(sgn(flow))} בחודש${e.months ? ` × ${e.months}` : ''}`));
  else if (flow == null && e.monthly) c.push(chip(-e.monthly, `${iso(sgn(-e.monthly))} בחודש${e.months ? ` × ${e.months}` : ''}`)); // legacy card without flow: monthly is a cost
  if (e.salary) c.push(chip(e.salary, `משכורת נטו ${iso(sgn(e.salary))} בחודש${e.salaryMonths ? ` × ${e.salaryMonths}` : ''}`));
  const glow = Math.round(e.glow || 0), hap = Math.round((e.happiness || 0) - ('flow' in e ? glow : 0));
  if (hap) c.push(chip(hap, `😊 ${signed(hap)}`));
  if (glow) c.push(`<em class="fx pos">✨ ${iso('+' + glow)} זמני</em>`);
  if (e.energy) c.push(chip(e.energy, `🔋 ${signed(e.energy)}`));
  if (e.study) c.push(chip(e.study, `🎓 ${signed(e.study)} חודשי לימוד`));
  const R = e.risk;
  if (typeof R === 'number' && R) c.push(`<em class="fx neg">⚠ סיכון ${iso(fmtM(R))}</em>`);
  else if (R && typeof R === 'object' && !odds) c.push(`<em class="fx neg">⚠ ${R.label ? escI(R.label) : `סיכון ${iso(fmtM(R.amount || 0))}`}</em>`);
  return c.join('');
}
/** Monthly plan picker (payday): one tap per plan, current one marked, trade-offs on every tile.
 *  wave 3a (J1 P0-3): compact tiles (icon, name, ONE number); the fund deposit stays inline; the raise and the month's focus are
 *  under "עוד החלטות לחודש"; every tile's full chips + note are in "פירוט" (planDetails). ≤ 8 buttons on screen. */
function planEffects(o, ev) {
  const e0 = o.effects || {}; return { ...e0, net: e0.netDelta != null ? (e0.netDelta || null) : e0.net };
}
function planLabel(o, ev) { return o.id === 'ok' ? (ev.data.planLabel || o.label.replace(/^להמשיך:?\s*/, '')) : o.label; }
function planId(o, ev) { return o.plan || (o.id === 'ok' ? (ev.data.plan || 'current') : o.id.slice(5)); }
/** the one number of a compact tile: ₪ a month when the plan changes the money, else its 🔋 */
function planChip(e) {
  if (e.net) return `<em class="fx ${cls(e.net)}">${iso(sgn(e.net))} בחודש</em>`;
  if (e.energy) return `<em class="fx ${cls(e.energy)}">🔋 ${iso((e.energy > 0 ? '+' : '−') + Math.abs(Math.round(e.energy)))}</em>`;
  return '<em class="fx">בלי שינוי</em>';
}
function planPicker(ev, focusHtml = '', compact = true) {
  const cur = ev.options.find((o) => o.id === 'ok');
  const plans = ev.options.filter((o) => o.id.startsWith('plan:') || o.id === 'ok');
  const raise = ev.options.find((o) => o.id === 'raise');
  const save = ev.options.find((o) => o.id === 'save');
  const rest = ev.options.filter((o) => !o.id.startsWith('plan:') && o.id !== 'ok' && o.id !== 'raise' && o.id !== 'save');
  const tile = (o) => {
    const id = planId(o, ev); const e = planEffects(o, ev);
    const tag = o.id === 'ok' ? '<small class="tagc">התוכנית שלך</small>' : o.primary ? '<small class="tagc rec">מתאים לכוח שלך</small>' : '';
    return `<button class="plan ${o.id === 'ok' ? 'cur' : ''} ${o.primary ? 'rec' : ''}" data-o="${esc(o.id)}" ${o.enabled ? '' : 'disabled'}>
      <span class="pi" aria-hidden="true">${PLAN_ICON[id] || '📅'}</span><b>${escI(planLabel(o, ev))}</b>${tag}<span class="fxs">${compact ? planChip(e) : effectChips(e)}</span>${!compact && e.note ? `<small class="pn">${escI(e.note)}</small>` : ''}</button>`;
  };
  if (!compact) {   // the education card keeps the full tiles (its plans ARE the decision)
    const extra = (save ? saveBtn0(save, ev) : '') + (raise ? raiseBtn0(raise) : '');
    return `<div class="plans">${plans.map(tile).join('')}</div>` + extra + (rest.length ? optButtons({ ...ev, options: rest }) : '');
  }
  const saveBtn = save ? saveBtn0(save, ev, true) : '';
  const raiseBtn = raise ? raiseBtn0(raise) : '';
  const moreBits = [raise ? `📈 העלאה${raise.primary ? ' (מומלץ)' : ''}` : '', focusHtml ? '🎯 מוקד החודש' : ''].filter(Boolean);
  const more = moreBits.length ? `<details class="pdmore"${raise && raise.primary ? ' open' : ''}><summary>עוד החלטות לחודש: ${moreBits.join(' · ')}</summary>${raiseBtn}${focusHtml}</details>` : '';
  return `<div class="plans compact">${plans.map(tile).join('')}</div>` + saveBtn + (rest.length ? optButtons({ ...ev, options: rest }) : '') + more + (cur ? '' : '');
}
function saveBtn0(save, ev, compact = false) {
  return `<button class="raise save ${save.primary ? 'primary' : ''}" data-o="save" ${save.enabled ? '' : 'disabled'}><span>🛟 ${escI(save.label)}</span><small>${save.effects && save.effects.months != null ? `אחרי זה: ${iso(String(save.effects.months))} חודשי הוצאות בצד (היעד: 3)${compact ? '' : ' · '}` : ''}${compact ? '' : `התוכנית נשארת ${escI(ev.data.planLabel || '')}`}</small></button>`;
}
function raiseBtn0(raise) {
  return `<button class="raise ${raise.primary ? 'primary' : ''}" data-o="raise" ${raise.enabled ? '' : 'disabled'}>📈 ${escI(raise.label)}${raise.chance != null ? ` <small>סיכוי ${iso(Math.round(raise.chance * 100) + '%')}</small>` : ''}</button>`;
}
/** "פירוט" of a payday card: the full payslip, every plan's full trade-offs, and the impact panel */
function planDetails(ev, impactHtml0) {
  const plans = ev.options.filter((o) => o.id.startsWith('plan:') || o.id === 'ok');
  const li = (o) => { const e = planEffects(o, ev); return `<li><b><span aria-hidden="true">${PLAN_ICON[planId(o, ev)] || '📅'}</span> ${escI(planLabel(o, ev))}</b><span class="fxs">${effectChips(e)}</span>${e.note ? `<small class="pn">${escI(e.note)}</small>` : ''}</li>`; };
  return `<details class="pddet"><summary>פירוט: התלוש המלא, כל תוכנית במספרים${impactHtml0 ? ', מה זה עושה לי' : ''}</summary><h4>🧾 התלוש</h4>${payslipFull}<h4>📅 התוכניות</h4><ul class="pdplans">${plans.map(li).join('')}</ul>${impactHtml0}</details>`;
}
/** Life-event dilemmas, T3 chain cards (tile L with data.chain) and inbox story cards (type 'story'): each option is a card
 *  with its consequences (chips), one 12/24-month total line and the "במשחק" odds; the default of an inbox item is marked and
 *  announced through aria-describedby (UI-2, UI-10). */
const ODDS_RE = /^\s*במשחק/;
function oddsText(t) { const x = String(t || '').trim(); return !x ? '' : ODDS_RE.test(x) ? x : `במשחק: ${x}`; }
/** Director decision (after the playtests): at מתקדם / מומחה (hint / pro) the cards show only raw amounts — per month, one-time,
 *  durations, odds — never a precomputed "סה״כ ב־24 חודשים" or "+₪X ב־3 חודשים" per option ("pick the biggest number"). The totals
 *  stay one tap away in a collapsed "📊 החשבון המלא" under the options. At מתחיל (guide) they stay on every option. */
const totalsShown = () => { const M = mentorOf(); return !M || !M.level || M.level === 'guide'; };
function totalsRaw(o) {
  const e = o.effects || {};
  if (o.preview) return o.preview.delta3 ? `ברווח העסק ב־3 חודשים: ${num(sgn(o.preview.delta3), cls(o.preview.delta3))}` : '';
  const t12 = e.total12, t24 = e.total24;
  if (t24 == null || (!t24 && !t12)) return '';
  return Math.round(t12) !== Math.round(t24) && t12 != null ? `ב־12 חודשים ${num(sgn(t12), cls(t12))} · ב־24 חודשים ${num(sgn(t24), cls(t24))}` : `ב־24 חודשים: ${num(sgn(t24), cls(t24))}`;
}
/** hint / pro: the per-option totals on demand (rows = [label, html]) */
function totalsOnDemand(rows) {
  const r = rows.filter((x) => x && x[1]); if (!r.length) return '';
  return `<details class="more tots"><summary>📊 החשבון המלא <small>סה״כ לכל אפשרות</small></summary><div class="grid">${r.map(([l, h]) => `<div class="row"><span>${escI(l)}</span><b>${h}</b></div>`).join('')}</div></details>`;
}
function totalsLine(o) {
  if (!totalsShown()) return o.preview && !o.preview.delta3 && o.preview.why ? `<small class="tot why0">${escI(o.preview.why)}</small>` : '';
  const e = o.effects || {}; const biz = !!o.preview;
  // a ₪0 preview says why (engine preview.why: "no stock to reprice", …) instead of a bare zero
  if (biz) return o.preview.delta3 ? `<small class="tot">ברווח העסק ב־3 חודשים: ${num(sgn(o.preview.delta3), cls(o.preview.delta3))}</small>` : o.preview.why ? `<small class="tot why0">${escI(o.preview.why)}</small>` : '';
  const t12 = e.total12, t24 = e.total24;
  if (t24 == null || (!t24 && !t12)) return '';
  if (Math.round(t12) !== Math.round(t24) && t12 != null) return `<small class="tot">סה״כ ב־12 חודשים ${num(sgn(t12), cls(t12))} · ב־24 חודשים ${num(sgn(t24), cls(t24))}</small>`;
  return `<small class="tot">סה״כ ב־24 חודשים: ${num(sgn(t24), cls(t24))}</small>`;
}
/** The line under the text: personal / trade-off tag, "שלב n מתוך m", the due chip, and the chain's "במשחק" hint. */
function storyTagsHtml(ev) {
  const d = ev.data || {};
  const prog = ev.progress || (d.chain && d.chain.id != null && d.chain.progress) || null;
  const tags = [];
  if (ev.type === 'life' || ev.type === 'story') {
    if (d.personal || ev.personal) tags.push('<em class="b">החלטה אישית — אין כאן תשובה נכונה אחת</em>');
    else if (d.values) tags.push('<em class="b">טרייד־אוף — אין כאן תשובה אחת</em>');
  }
  if (prog && prog.of > 1) tags.push(`<em class="b step">שלב ${num(String(prog.n))} מתוך ${num(String(prog.of))}</em>`);
  if (d.dueText) tags.push(`<em class="b due ${d.due != null && d.due <= ((evState && evState.ctx.st && evState.ctx.st.month) || 0) + 1 ? 'urg' : ''}">📬 ${esc(d.dueText)}</em>`);
  const hint = ev.hint || d.hint;
  return (tags.length ? `<p class="chipline">${tags.join('')}</p>` : '') + (hint ? `<p class="godds hintl"><span aria-hidden="true">🎲</span> ${escI(oddsText(hint))}</p>` : '');
}
function effectChoices(ev) {
  const d = ev.data || {};
  const story = ev.type === 'story' || !!(d.chain && d.chain.id != null);   // a T3 story chain (w7's module data.chain {ck|mk} is not one)
  const dflt = d.defaultId && ev.options.length > 1 ? ev.options.find((o) => o.id === d.defaultId) : null;   // a one-option (informational) card has no default to announce
  const choice = (o, i) => {
    const e = o.effects || {}; const od = o.odds && o.odds.text ? oddsText(o.odds.text) : '';
    const isD = dflt && o.id === dflt.id;
    const desc = [!o.enabled ? `why${i}` : '', isD ? 'evDflt' : ''].filter(Boolean).join(' ');
    return `<div class="opt"><button class="choice ${story ? 'stc' : ''} ${o.primary ? 'primary' : ''} ${isD ? 'dflt' : ''}" data-o="${esc(o.id)}" ${o.enabled ? '' : 'disabled'} ${desc ? `aria-describedby="${desc}"` : ''}>
    <b>${escI(o.label)}</b>${o.primary && ev.options.length > 1 ? '<small class="tagc rec">הבחירה של המנטור</small>' : ''}${isD ? `<small class="tagc dflt">${gz('אם לא תחליט — זה מה שיקרה')}</small>` : ''}<span class="fxs">${effectChips(e, { odds: !!od })}</span>${totalsLine(o)}${od ? `<small class="godds"><span aria-hidden="true">🎲</span> ${escI(od)}</small>` : ''}${e.note ? `<small class="pn">${escI(e.note)}</small>` : ''}</button>${!o.enabled && o.reason ? `<small class="why" id="why${i}">${escI(o.reason)}</small>` : ''}</div>`;
  };
  return `<div class="choices">${ev.options.map(choice).join('')}</div>` +
    (totalsShown() ? '' : totalsOnDemand(ev.options.filter((o) => o.enabled).map((o) => [shortLabel(o), totalsRaw(o)]))) +
    (d.cushion && d.cushion.text && story ? `<p class="note cush">🛟 ${escI(d.cushion.text)}</p>` : '') +
    (dflt ? `<p class="note dfl" id="evDflt">${escI(gz(`אם לא תחליט ${d.dueText || 'עד המשכורת הבאה'}: ${dflt.label}`))}</p>` : '');
}
/** Negotiation: offer −5/−10/−15% with the acceptance chance (and the risk of losing the deal). */
function offerRow(offers) {
  return `<div class="nego"><p class="mh">🤝 להציע מחיר נמוך יותר? <small>אם המוכר יסרב — העסקה נסגרת.</small></p><div class="nrow">${offers.map((o) => {
    const pct = +o.id.split(':')[1]; const ch = o.chance != null ? Math.round(o.chance * 100) : null;
    return `<button class="noff" data-o="${esc(o.id)}" ${o.enabled ? '' : 'disabled'}><b>${iso('−' + pct + '%')}</b>${ch != null ? `<small class="${ch >= 60 ? 'pos' : ch >= 35 ? '' : 'neg'}">סיכוי ${iso(ch + '%')}</small><i class="chbar"><i style="width:${ch}%"></i></i>` : ''}${rvChip(o)}</button>`;
  }).join('')}</div></div>`;
}

/** "חסרים ₪X — הבנק ייתן הלוואה של ₪Y (עולה ₪Z בחודש)" — any card that makes you pay more than you have. */
function shortfallLine(d) {
  if (!d || !(d.shortfall > 0)) return '';
  const loan = d.loanAmount || 0;
  return `<p class="warn" role="note"><b>חסרים ${num(fmtM(d.shortfall))}</b>${loan ? ` — הבנק ייתן הלוואה של ${num(fmtM(loan))}${d.loanMonthly ? ` (עולה ${num(fmtM(d.loanMonthly))} בחודש)` : ''}` : ''}</p>`;
}
/** Quiz answers: no pre-highlighted answer, shuffled visually (stable per event; ids unchanged). */
function quizView(ev) {
  const h = (x) => { let k = 2166136261 ^ ev.id; for (const ch of x) k = Math.imul(k ^ ch.charCodeAt(0), 16777619); return k >>> 0; };
  return { ...ev, options: ev.options.map((o) => ({ ...o, primary: false })).sort((a, b) => h(a.id) - h(b.id)) };
}
 /** The mentor's question as a speech bubble at the top of the card (2 lines; tap to read all). */
function say(text) {
  if (!text) return '';
  return `<button type="button" class="say" data-say aria-expanded="false"><span class="av sm" aria-hidden="true">אע</span><span class="sr">אבא עשיר אומר: </span><span class="st" id="evSay">${escI(gz(text))}</span></button>`;
}
function head(ev, M = null) {
  const hb = M ? hintBtnHtml(ev, M) : '';
  const rem = ev.remember || (ev.data && ev.data.remember);   // T3 UI-2: "זוכר?" — the world remembers (distinct style, under the title)
  return `${say(ev.mentor)}<div class="taghead"><span class="tag" style="--c:${esc(ev.color || '#2f6fdb')};--ink:${esc(ev.ink || '#fff')}">${esc(ev.tag || '')}</span>${hb}</div><h2 id="evTitle" tabindex="-1">${escI(ev.title)}</h2>${rem ? `<p class="remember"><span aria-hidden="true">💭</span> ${escI(rem)}</p>` : ''}${ev.text && !(ev.data && ev.data.summaryOnly) ? `<p class="d">${escI(ev.text)}</p>` : ''}${flagsHtml(ev)}`;   // summaryOnly: the numbers are in data.l1 / l2
}
/** T2 due diligence: the deal's public flags under the title — icon + text, never colour alone */
function flagsHtml(ev) {
  const F = ev.data && ev.data.dd && ev.data.dd.flags; if (!F || !F.length) return '';
  return `<p class="chipline ddflags">${F.map((f) => `<em class="b ${f.kind === 'good' ? 'ok' : 'warn'}"><span aria-hidden="true">${f.kind === 'good' ? '✓' : '⚠'}</span> ${escI(f.text)}</em>`).join('')}</p>`;
}
/** ROI equation as an LTR math line (words outside it): ₪450 × 12 ÷ ₪5,000 = 108% בשנה */
function roiEq(d) {
  const roi = d.roi ?? 0; // the engine owns the number (audit D4)
  return `<bdi dir="ltr" class="eq"><span class="${cls(d.cf)}">${fmtM(d.cf)}</span> × 12 ÷ ${fmtM(d.down)} = <b class="${cls(roi)}">${roi}%</b></bdi> בשנה`;
}
/** "⚠ במשחק / 🌍 במציאות" — the engine's honesty line (data.reality); the UI only shows it. */
function realityLine(d) { return d && d.reality ? `<p class="reality">${escI(d.reality)}</p>` : ''; }
/** a liability row + the real-world rate next to it (engine: realWorldRate / realText) */
function liabRow(x) {
  const rw = x.realText ? x.realText : x.realWorldRate != null ? `בעולם האמיתי ≈ ${x.realWorldRate}% בשנה` : '';
  return `<div class="row"><span>${escI(x.label)}${rw ? `<small class="rw">${x.gameRate != null ? `במשחק ${iso(Math.round(x.gameRate * 10) / 10 + '%')} בשנה · ` : ''}${escI(rw)}</small>` : ''}</span><span class="num">${fmtM(x.amount)}</span></div>`;
}
const grid = (rows) => `<div class="grid">${rows.filter(Boolean).join('')}</div>`;
const big = (n, c) => `<b class="big num ${c ?? cls(n)}">${sgn(n)}</b>`;

function renderEvent(first) {
  const { ev, ctx } = evState; const c = $('#evCard');
  c.className = 'card ev-' + ev.type + (ev.golden ? ' golden' : '') + (first ? '' : ' pop-off');
  if (ev.type === 'trade') { if (first || !c.querySelector('#qs')) { c.innerHTML = tradeHtml(ev); fillCandles(ev); } tradeUpd(true); return; }
  const fn = BODY[ev.type] || (() => '');
  let body = '';
  try { body = fn(ev, ctx) || ''; } catch (e) { console.error('card body', e); }
  if (ev.type === 'life' || ev.type === 'story') body += storyTagsHtml(ev);   // T3 UI-2: tags + the chain's odds right under the text
  const hasPlans = ev.options.some((o) => o.id.startsWith('plan:'));
  const hasEffects = ev.options.some((o) => o.effects && !o.id.startsWith('plan:'));
  const offers = ev.options.filter((o) => /^offer:/.test(o.id));
  const M = mentorOf();
  const inDd = (o) => o.kind === 'inspect' && !!(ev.data && ev.data.dd); // inspections live in the due-diligence box
  const actions = ev.type === 'intro' ? introActions(ev)
    : ev.type === 'mystery' && ev.data.kind === 'quiz' ? optButtons(quizView(ev), () => true, 'quiz')
    : ev.type === 'market' && ev.data.kind === 'sell' && ev.data.offers.length ? optButtons(ev, (o) => o.kind !== 'sell') // sales are buttons inside the list
    : ev.type === 'business' && ev.data.mode === 'manage' ? bizActions(ev)
    : ev.type === 'business' && ev.data.mode === 'offer' && Array.isArray(ev.data.setups) && ev.data.setups.length ? bizOfferActions(ev)
    : hasPlans ? planPicker(ev, ev.type === 'payday' && ev.data && ev.data.focus ? focusSection(ev.data.focus, M) : '', ev.type === 'payday')
    : hasEffects ? effectChoices(ev)
    : ev.type === 'mech' && ev.data && ev.data.levels && ev.data.rounds ? auctionActions(ev)   // w13 the transfer market
    : ev.type === 'mech' && ev.data && ((ev.data.rateG != null && Array.isArray(ev.data.beta)) || (ev.data.kind === 'export' && ev.data.range) || (ev.data.kind === 'water' && ev.data.quota != null)) ? WV2.riskActions(WVH2, ev)   // w12 Z / w16 H: cash · month · risk in words
    : WV3.cardKind(ev) ? WV3.cardActions(WVH2, ev)   // w14 / w17 / w18 / w19 / w20: money now · months · the risk in words
    : (offers.length ? offerRow(offers) : '') + optButtons(ev, (o) => !/^offer:/.test(o.id) && !inDd(o), '', ev.type === 'doodad' || ev.type === 'tax');
  const bizM = ev.type === 'business' && ev.data.mode === 'manage';
  const focus = !(hasPlans && ev.type === 'payday') && (ev.type === 'payday' || ev.type === 'edu') && ev.data && ev.data.focus ? focusSection(ev.data.focus, M) : '';
  const pdCompact = hasPlans && ev.type === 'payday';   // wave 3a (J1 P0-3): impact panel + payslip + plan numbers under "פירוט"
  // T3 UI-3: an inbox item can wait — no timer, the default applies at its payday
  const later = ev.type === 'story' && ctx.api && ctx.api.later ? `<button type="button" class="linkbtn later" data-later>אחר כך${ev.data && ev.data.dueText ? ` · ${esc(ev.data.dueText)}` : ''}</button>` : '';
  const hev = (bizM && ev.data && (ev.data.l1 || (ev.data.summary && ev.data.summary.l1))) || pdCompact ? { ...ev, text: '' } : ev;   // T3: L1 says the numbers once (payday: the summary line does)
  const imp = impactPanelHtml(ev, M);
  const keepOpen = first ? [] : [...c.querySelectorAll('details.pdmore[open], details.pddet[open]')].map((d) => d.classList[0]);   // wave 3a: a re-render keeps them open
  c.innerHTML = head(hev, M) + (bizM ? '' : vlineHtml(evState.verdict)) + body + shortfallLine(ev.data) + realityLine(ev.data) + hintPanelHtml(ev) + (pdCompact ? '' : imp) + '<p class="err" role="alert"></p>' + actions + later + focus + (pdCompact ? planDetails(ev, imp) : '');
  for (const k of keepOpen) c.querySelector('details.' + k)?.setAttribute('open', '');
  markHint(c, ev);
  if (first) c.scrollTop = 0;
}

/* ---------- T6 §12.1 deal competition (engine ev.data.rivals / o.rivalRisk; nothing is drawn when the engine sends none) */
const personas = () => { try { return T6S.PERSONAS_FALLBACK && (globalThis.__rrRivals || T6S.PERSONAS_FALLBACK); } catch (e) { return {}; } };
export function setPersonas(p) { if (p && p.saver) globalThis.__rrRivals = p; }
function rivalsRow(ev) {
  const R = ev.data && ev.data.rivals; if (!R || !R.text) return '';
  const who = (R.who || []).filter((w) => w && w.id);
  const head = who.length && R.text.includes(':') ? R.text.slice(0, R.text.indexOf(':') + 1) : R.text;
  const chips = who.map((w) => `<button type="button" class="rvp" data-rv="${esc(w.id)}" aria-expanded="false" aria-controls="rvPop">${esc(w.icon || '')} ${esc(w.name || '')}</button>`).join('');
  return `<div class="rvrow ${R.n ? 'on' : ''}"><p class="rvt">${escI(head)}${chips ? ` <span class="rvwho">${chips}</span>` : ''}</p>${R.n >= 1 && R.note ? `<p class="rvnote">${escI(R.note)}</p>` : ''}<div class="rvpop" id="rvPop" hidden></div></div>`;
}
/** the delay chip on inspect / lower-offer buttons: icon + text, never colour only; it is part of the button's name */
const rvChip = (o) => (o && o.rivalRisk > 0 ? `<small class="rvchip">👥 ${num(Math.round(o.rivalRisk * 100) + '%')} שיקדימו אותך</small>` : '');
function rivalPop(btn) {
  const pop = $('#rvPop'); if (!pop) return;
  const id = btn.dataset.rv; const open = btn.getAttribute('aria-expanded') === 'true';
  $('#evCard')?.querySelectorAll('.rvp[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  if (open) { pop.hidden = true; return; }
  const P = personas()[id] || null;
  if (!P) { pop.hidden = true; return; }
  pop.innerHTML = `<b>${esc(P.icon)} ${esc(P.name)} · ${esc(P.label)}</b><p>${esc(P.rule)}</p><p><b>חזקים כש:</b> ${esc(P.strong)}</p><p><b>חלשים כש:</b> ${esc(P.weak)}</p>`;
  pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
}

/* ---------- T2 due diligence: claimed vs range vs verified + the two inspections (card stays open, ctl.update) */
const REPAIR = { none: 'אין', small: 'קטנים', big: 'גדולים' };
function ddBox(ev) {
  const d = ev.data, D = d.dd; if (!D) return '';
  const ins = ev.options.filter((o) => o.kind === 'inspect'); if (!ins.length) return ''; // golden / starter / verified: nothing to inspect
  const insBtn = (o, i) => {
    const i1 = o.id === 'inspect:1';
    const base = i1 ? 'לבדוק בעצמי' : shortLabel(o);
    const cost = i1 ? (D.inspect1.free ? 'חינם החודש' : `−${D.inspect1.energy} 🔋`) : `${fmtM(D.inspect2.fee)}${D.inspect2.half ? ' · ½ מחיר' : ''}`;
    return `<div class="opt"><button class="insp ${o.primary ? 'primary' : ''}" data-o="${esc(o.id)}" ${o.enabled ? '' : `disabled aria-describedby="dwhy${i}"`}><span><span aria-hidden="true">${i1 ? '🔍' : '🧾'}</span> ${esc(base)}</span><small class="net ${(i1 && D.inspect1.free) || (!i1 && D.inspect2.half) ? 'pos' : ''}">${iso(cost)}</small>${o.primary ? '<small class="tagc rec">המנטור ממליץ לבדוק</small>' : ''}${rvChip(o)}</button>${!o.enabled && o.reason ? `<small class="why" id="dwhy${i}">${escI(o.reason)}</small>` : ''}</div>`;
  };
  return `<div class="ddbox lv${D.level}"><p class="mh">🔎 ${D.level === 0 ? 'לבדוק לפני שקונים?' : 'בדיקה מקצועית — מספרים מדויקים'}</p><div class="acts ddins">${ins.map(insBtn).join('')}</div></div>`;
}
/* ---------- T2 monthly focus on the payday / education card: status + agenda, the picker opens on top (same as the HUD chip) */
function focusSection(F, M) {
  const sug = F.options.find((o) => o.suggested);
  const ag = F.agenda || [];
  const slot = (n) => { const a = ag.find((x) => x.slot === n); return a && a.label ? esc(a.label) : 'ללא'; };
  return `<div class="fsec"><div class="fh"><span class="fi" aria-hidden="true">${F.opsOpen ? '🏪' : FOCUS_ICON[F.current.id] || '🎯'}</span><div><b>🎯 מוקד החודש: ${esc(F.current.label)}</b>
    <small>בחודש הבא: ${slot(1)} · בעוד חודשיים: ${slot(2)}</small></div>
    <button type="button" class="chip" data-focus-open>${F.locked ? 'לתכנן' : 'לבחור מוקד'}</button></div>
    ${F.text ? `<p class="note">${escI(F.text)}</p>` : ''}${sug && M && M.level === 'guide' ? `<p class="note"><b class="tagc rec">המנטור ממליץ:</b> ${esc(sug.label)}</p>` : ''}</div>`;
}

/* ---------- T4 §4.2 intro card (engine type 'intro', feature-detected: shown only once the engine creates it) */
/** Chips with explicit sign semantics: a cost is shown as a red minus (CT§2.5 — effectChips() is not reused here). */
function introChips(e = {}) {
  const c = [];
  const neg = (t) => `<em class="fx neg">${t}</em>`;
  if (e.cash) c.push(e.cash < 0 ? neg(`מזומן ${iso('−' + fmtM(Math.abs(e.cash)))}`) : `<em class="fx pos">מזומן ${iso('+' + fmtM(e.cash))}</em>`);
  if (e.monthly) c.push(neg(`${iso('−' + fmtM(Math.abs(e.monthly)))} בחודש${e.months ? ` × ${e.months}` : ''}`));
  if (e.fee) c.push(neg(`עולה ${iso(fmtM(e.fee))} יותר`));
  if (e.energy) c.push(e.energy < 0 ? neg(`🔋 ${iso('−' + Math.abs(e.energy))} כוח`) : `<em class="fx pos">🔋 ${iso('+' + e.energy)} כוח</em>`);
  return c.join('');
}
function introActions(ev) {
  const d = ev.data || {};
  const main = ev.options.filter((o) => o.id !== 'skip'); const skip = ev.options.find((o) => o.id === 'skip');
  const btn = (o) => d.step === 'glitch'
    ? `<div class="opt"><button class="choice" data-o="${esc(o.id)}" data-intro-opt="${esc(o.id)}" ${o.enabled === false ? 'disabled' : ''}><b>${escI(o.label)}</b><span class="fxs">${introChips(o.effects)}</span></button></div>`
    : `<div class="opt"><button class="${o.primary || main.length === 1 ? 'primary' : ''}" data-o="${esc(o.id)}" data-intro-opt="${esc(o.id)}" ${o.enabled === false ? 'disabled' : ''}>${escI(o.label)}</button></div>`;
  return `<div class="${d.step === 'glitch' ? 'choices' : 'acts col'}">${main.map(btn).join('')}</div>${d.step === 'glitch' ? `<p class="note">${escI(d.note || 'אין כאן תשובה נכונה אחת. כל דרך עולה משהו אחר.')}</p>` : ''}${skip ? `<button class="linkbtn" data-o="skip" data-intro-opt="skip">${escI(skip.label)}</button>` : ''}`;
}

let payslipFull = '';   // the payday card's full payslip (BODY.payday → the "פירוט" box of the same render)
/* ---------- per-type bodies */
/* ---------- w5 (season): an op-asset deal's year at a glance (engine: data.op {next12, avg, best, worst, profileLabel, planned, closedFor},
   data.runwayNeed / runwayAfter) and the tour operator's allotment card (type 'mech', data from season.js tiles.N.describe) */
function miniStrip(list, label) {
  const top = Math.max(1, ...list.map((x) => Math.abs(+x.v || 0)));
  return `<ol class="wp-strip mini12" aria-label="${esc(label)}">${list.map((x) => { const v = +x.v || 0; const h = Math.max(2, Math.round((Math.abs(v) / top) * 30));
    return `<li class="b-${esc(x.band || 'mid')} ${v < 0 ? 'neg' : 'pos'}"><span class="wp-bar" aria-hidden="true"><i style="height:${h}px"></i></span><b class="num">${esc(moneyOf(v, 'tiny'))}</b><small>${esc(x.m)}</small><span class="sr">${esc(x.full || x.m)}: ${esc(mS(v))}</span></li>`; }).join('')}</ol>`;
}
function opStripHtml(d) {
  const O = d.op; const n12 = O.next12 || [];
  const strip = miniStrip(n12.map((x) => ({ v: x.cf, band: x.band, m: MONTH_S[(x.cal || 1) - 1], full: MONTH_HE[(x.cal || 1) - 1] })), '12 החודשים הבאים של הנכס');
  return `<div class="mini opmini"><p class="mh">🌴 ${esc(O.profileLabel || '')}: איך נראית שנה עם הנכס הזה</p>${strip}
    <p class="note">ממוצע ${num(mS(O.avg))} בחודש · החודש הכי חלש ${num(mS(O.worst), cls(O.worst))}${O.planned != null && O.planned !== O.avg ? ` · עם תוכנית מחירים לפי עונה בערך ${num(mS(O.planned))}` : ''}${O.closedFor ? ` · סגור ${num(String(O.closedFor))} חודשים ראשונים` : ''}${O.owner ? ` · ${gw('אתה מנהל', 'את מנהלת')} בעצמך — הכנסה מעבודה עד שיש מנהל` : ''}${O.locked ? ' · הרשת קובעת את המחירים' : ''}.</p>
    ${d.runwayNeed != null ? `<p class="note">🛟 כרית לחורף: החודשים החלשים צריכים בערך ${num(mS(d.runwayNeed))}; אחרי הקנייה יישארו ${num(mS(Math.max(0, d.runwayAfter || 0)))}.</p>` : ''}</div>`;
}
/* ---------- w6 (plant): the supply-contract card (type 'mech', plant.js tiles.C.describe) and a production line's deal block (data.plant) */
function stateGrid(list) {   // [{k, label, v}] → the "how much in each market" mini table (signed short money, the current one marked)
  return `<div class="mt">${list.map((x) => `<div class="${x.cur ? 'cur' : ''}"><small>${esc(x.label)}</small><b class="num ${cls(x.v)}">${esc(mSg(x.v))}</b></div>`).join('')}</div>`;
}
function contractHtml(d) {
  const D = d.delta || {};
  const rows = [row('הקו', esc(d.name || ''), 'wrap'), row('הלקוח רוצה', iso(`${pctI(d.share)} מהקיבולת של משמרת אחת`), 'wrap'), row('לכמה זמן', iso(`${d.months} חודשים`)),
    row('המחיר', iso(`${pctI(1 - (d.price ?? 1))} מתחת למחיר השוק`), 'neg wrap'),
    `<div class="row"><span>ההפרש בתזרים, עכשיו</span>${num(mSg(D.now), 'big ' + cls(D.now))}</div>`,
    row('קנס על חודש שלם בלי ייצור', mS(-(d.penaltyPerMonth || 0)), 'neg')];
  if (!d.countered && d.counter) rows.push(row('הצעה נגדית', iso(`${pctI(1 - d.counter.price)} הנחה במקום ${pctI(1 - (d.price ?? 1))} · סיכוי ${pctI(d.counter.chance)}`), 'wrap'));
  if (d.hazard != null) { const b = d.hazard < 0.02 ? 'low' : d.hazard < 0.06 ? 'mid' : 'high'; rows.push(row('סיכון לתקלה בקו', HZ_HE[b], b === 'high' ? 'neg' : '')); }
  const mt = `<div class="mini"><p class="mh">כמה החוזה מוסיף (או מוריד) לתזרים של הקו בכל מצב שוק</p>${stateGrid([{ label: 'בגאות', v: D.boom }, { label: 'בחודש רגיל', v: D.normal }, { label: 'במיתון', v: D.recession }])}
    ${d.withShift > 1 ? `<p class="note">החישוב כולל מעבר ל${esc(shiftHe(d.withShift))}: החוזה וההזמנות הרגילות לא נכנסים במשמרת אחת.</p>` : ''}</div>`;
  return grid(rows) + mt + (d.note ? `<p class="note">${escI(d.note)}</p>` : '');
}
function plantDealHtml(P, warning) {
  const c = P.cond || {}; const same = c.lo === c.hi;
  const band = P.hazardBand || 'mid';
  const rows = [row('מצב הקו', same ? iso(`${c.lo} מתוך 100`) : iso(`${c.lo}–${c.hi} (לא נבדק)`), ((c.lo ?? 100) < 40 ? 'neg ' : '') + 'wrap'),
    row(P.hazard != null ? 'סיכוי לתקלה בחודש' : 'סיכון לתקלה', P.hazard != null ? iso(`${pct1(P.hazard)} · ${HZ_HE[band]}`) : HZ_HE[band], band === 'high' ? 'neg' : ''),
    row('עלויות קבועות', `${mS(P.fixed)} בחודש`), row('רווח גולמי על כל מכירה', pctI(P.cm))];
  if (P.order) rows.push(row('מסירה', iso(`בעוד ${P.readyIn} חודשים — עד אז אין ייצור`), 'neg wrap'));
  if (P.contract) rows.push(row('חוזה קיים', iso(`${pctI(P.contract.vol)} מהקיבולת · ${P.contract.months} חודשים`), 'wrap'));
  if (P.slotsFree != null) rows.push(row('מקום במפעל', P.slotsFree > 0 ? `עוד ${P.slotsFree} קווים` : 'אין מקום', P.slotsFree > 0 ? '' : 'neg'));
  const mt = `<div class="mini plantmini"><p class="mh">🏭 ${esc(P.label || '')}${P.cyc === 'counter' ? ' (נגד המחזור: מתחזק במיתון)' : ''}: התזרים החודשי בכל מצב שוק</p>${stateGrid([{ label: 'בגאות', v: P.cfBoom }, { label: 'בחודש רגיל', v: P.cfNormal, cur: true }, { label: 'במיתון', v: P.cfRecession }])}
    ${P.runwayNeed != null ? `<p class="note">🛟 כרית לעלויות הקבועות: צריך בערך ${num(mS(P.runwayNeed))}; אחרי המקדמה יישארו ${num(mS(Math.max(0, P.runwayAfter || 0)), P.runwayShort ? 'neg' : '')}.</p>` : ''}
    ${P.note ? `<p class="note">${escI(P.note)}</p>` : ''}</div>`;
  return grid(rows) + mt + (warning && P.runwayShort ? `<p class="warn" role="note">${escI(warning)}</p>` : '');
}
/* ---------- w7 (chain): the site card (type 'mech', chain.js tiles.R.describe — the card stays open after a survey and redraws) and the
   deal block of a branch / DC / e-commerce card (data.chain) */
function siteHtml(d) {
  const locs = d.locs || []; const M = d.mature || {}; const R = d.royalty || {};
  const rw = d.runwayAfter >= 99 ? 'אין עלויות קבועות' : `${mo1(d.runwayAfter)} חודשי עלויות קבועות`;
  const rows = [row('הסניף', `${d.label || ''} · אזור ${(+d.area || 0) + 1}${d.neighbours ? ` · כבר ${d.neighbours} סניפים באזור` : ''}`, 'wrap'),
    row('המיקום', d.surveyed ? locs.map((l) => LOC_HE[l]).join(' או ') : 'עוד לא ידוע (בלי סקר זה ניחוש)', (d.surveyed ? '' : 'neg ') + 'wrap'),
    row('שיפוץ והקמה', `${mS(d.capex)} · מקדמה ${mS(d.down)}`, 'wrap'),
    row('שכירות', `${mS(d.rent)} בחודש${d.esc ? ` · עולה ${pctI(d.esc)} בשנה` : ''}`, 'wrap'),
    row(`${d.fitMonths} חודשי שיפוץ (שכירות ושכר בלי מכירות)`, mS(-(d.fitCost || 0)), 'neg wrap'),
    row('הפסדי חצי השנה הראשונה (צפי)', mS(d.rampLoss), cls(d.rampLoss) + ' wrap'),
    row('המלאי הראשון (החשבון בהמשך)', mS(d.initStock), 'wrap'),
    `<div class="row"><b>מזומן שהפתיחה בולעת</b><b class="big num">${esc(mS(d.cashNeed))}</b></div>`];
  if (d.exactNeed != null) rows.push(row('בדיוק, כולל המלאי — מה שסמנכ"ל כספים רואה', mS(d.exactNeed), 'wrap'));
  rows.push(row('קופה אחרי הפתיחה', rw, (d.runwayAfter < 4 ? 'neg ' : '') + 'wrap'),
    row('יכולת ניהול', d.spanLeft > 0 ? `עוד ${d.spanLeft} סניפים בלי מנהל נוסף` : d.spanLeft === 0 ? 'מלאה: סניף נוסף צריך מנהל אזור' : `כבר ${-d.spanLeft} סניפים מעבר ליכולת`, (d.spanLeft <= 0 ? 'neg ' : '') + 'wrap'));
  const mt = `<div class="mini sitemini"><p class="mh">🛍️ רווח בחודש בוגר (אחרי חצי שנה) לפי המיקום${d.surveyed ? '' : ' — והסיכוי לכל אחד'}</p><div class="mt">${locs.map((l) => `<div><small>${esc(LOC_HE[l] || l)}${!d.surveyed && d.prior && d.prior[l] != null ? ` · ${esc(pctI(d.prior[l]))}` : ''}</small><b class="num ${cls(M[l])}">${esc(mSg(M[l]))}</b>${R[l] != null ? `<small>לזכיין: ${esc(mSg(R[l]))} לך</small>` : ''}</div>`).join('')}</div>
    <p class="note">צפוי ${num(mSg(d.expected), cls(d.expected))} · במקרה הגרוע ${num(mSg(d.worst), cls(d.worst))}</p></div>`;
  const F = d.franchise || {};
  const fr = `<p class="note">🤝 ${F.ok ? `זכיין מוכן לפתוח כאן: דמי כניסה ${num(mS(F.fee))} לך, ו־${esc(pctI(F.pct))} מהמכירות כל חודש — בלי השקעה ובלי מלאי, אבל האיכות שלו.` : !F.sys ? 'זכיינות: צריך קודם מערכת זכיינות (בלוח הרשת).' : 'אין זכיין שמעוניין במיקום הזה.'}</p>`;
  const sv = !d.surveyed ? `<p class="note">🔎 סקר מיקום (${num(mS(d.surveyFee))}) משאיר שתי אפשרויות מתוך שלוש. אחרי הסקר הכרטיס נשאר פתוח.</p>` : '';
  return grid(rows) + mt + fr + sv + (d.note ? `<p class="note">${escI(d.note)}</p>` : '') + (d.warning ? `<p class="warn" role="note">${escI(d.warning)}</p>` : '');
}
function chainDealHtml(C) {
  if (!C || !C.ck) return '';
  const head = C.ck === 'dc' ? `🏬 מרכז הפצה: עלות קבועה ${num(mS(C.fixed))} בחודש · ${esc(pctI(C.cogsCut))} פחות על הסחורה של כל הסניפים${C.saving ? ` — היום בערך ${num(mS(C.saving))} בחודש` : ''}`
    : C.ck === 'ecom' ? `🌐 אתר מכירות: עלות קבועה ${num(mS(C.fixed))} בחודש · עוד ${esc(pctI(C.share))} מהרווח הגולמי של הסניפים, אחרי ${num(String(C.rampMonths))} חודשי הרצה`
    : `🛍️ ${C.count > 1 ? `${num(String(C.count))} סניפים בבת אחת` : 'סניף במיקום ידוע'} · ${num(String(C.fit))} חודשי שיפוץ לפני הפתיחה, ואחריהם הרצה`;
  return `<div class="mini chainmini"><p class="mh">${head}</p>${C.note ? `<p class="note">${escI(C.note)}</p>` : ''}</div>`;
}
/* ---------- w8 (projects): the land card (type 'mech', projects.js tiles.Q.describe — the card stays open after the permit check) and the
   deal block of a stalled project (data.proj) */
function landHtml(d) {
  const P = d.permit || {}; const done = P.lo === 0 && P.hi === 0;
  const C = d.contractors || {}; const Mg = d.margin || {}; const K = d.cost || {};
  const rows = [row('הפרויקט', `${d.units} יחידות · מחירון ${mS(d.list)} ליחידה`, 'wrap'),
    row('הקרקע', `${mS(d.land)}: מקדמה ${mS(d.down)}, הבנק ${mS(d.landLoan)}`, 'wrap'),
    row('היתר בנייה', done ? 'מאושר' : `${P.lo}–${P.hi} חודשים${d.checked ? ' (אחרי בדיקה)' : ' (לא נבדק)'}`, (done || d.checked ? '' : 'neg ') + 'wrap'),
    row('שלבים', `${d.stages} × ${d.stageMonths} חודשים · בערך ${d.months} חודשים עד המסירה`, 'wrap'),
    row('הון עצמי', `${pctI(d.eqReq)} מהקרקע והבנייה — עוד ${mS(d.equityNeed)} אחרי המקדמה`, 'wrap'),
    row('הלוואת הבנייה', d.noPresale ? 'אין מכירות מוקדמות: הבנק מממן נגד הון עצמי גבוה' : `משתחררת אחרי ${pctI(d.presaleReq)} מכירות על הנייר`, 'wrap'),
    row('ריבית במשק · ביקוש', `${d.rate}% · ביקוש ×${d.demand}`, 'wrap'),
    `<div class="row"><b>מזומן אחרי המקדמה</b><b class="big num ${d.cashAfter < d.nextCalls ? 'neg' : ''}">${esc(mS(d.cashAfter))}</b></div>`,
    row(`הון עצמי שעוד צריך${d.active ? ` (גם ל־${d.active} הפרויקטים הפתוחים)` : ''}`, mS(d.nextCalls), (d.cashAfter < d.nextCalls ? 'neg ' : '') + 'wrap')];
  const cell = (t, label) => `<div><small>${esc(label)}</small><b class="num">${esc(mS(K[t]))}</b><small>חריגה עד ${esc(pctI(((C[t] || {}).overrun || [0, 0])[1]))}${(C[t] || {}).failP ? ` · ${esc(pctI(C[t].failP))} סיכון לקריסה` : ''}</small><small class="${cls(Mg[t])}">רווח צפוי ${esc(mSg(Mg[t]))}</small></div>`;
  const mt = `<div class="mini landmini"><p class="mh">🏗️ עלות הבנייה לפי הקבלן — ומה צפוי להישאר</p><div class="mt">${cell('reliable', 'קבלן אמין')}${cell('cheap', 'קבלן זול')}</div></div>`;
  const chk = !d.checked && !done ? `<p class="note">🔎 בדיקת תב"ע (${num(mS(d.checkFee))}) מצמצמת את ההיתר ל־±2 חודשים. אחרי הבדיקה הכרטיס נשאר פתוח.</p>` : '';
  return grid(rows) + mt + chk + (d.note ? `<p class="note">${escI(d.note)}</p>` : '') + (d.warning ? `<p class="warn" role="note">${escI(d.warning)}</p>` : '');
}
function projDealHtml(P) {
  if (!P || P.pk == null) return '';
  return `<div class="mini projmini"><p class="mh">🏗️ ${num(String(P.units))} יחידות · מחירון ${num(mS(P.list))} · ${num(String(P.stages))} שלבים × ${num(String(P.stageMonths))} חודשים${P.done ? ` · ${num(String(P.done))} שלבים כבר בנויים` : ''} · בנייה ${num(mS(P.cost))} · הון עצמי ${esc(pctI(P.eqReq))}</p>${P.note ? `<p class="note">${escI(P.note)}</p>` : ''}</div>`;
}
/* ---------- w9 (energy): the power-site card (type 'mech', energy.js tiles.V.describe — the card stays open after the resource study) and
   the deal blocks of a grid slot / an operating plant or line / the hydrogen pilot (data.slot / data.plant.tech / data.h2), the market card's
   power numbers (data.energy). w10 (market + portfolio): the exchange card (tiles.W: data.market), the private deal (tiles.Y: data.private),
   a fund deal block (data.fund) and the market card's portfolio numbers (data.portfolio). Engine values only. */
function powerSiteHtml(d) {
  const P = d.permit || {}; const S = d.slots || {}; const H = d.partner || {}; const q = d.q || {};
  const rows = [row('הפרויקט', `${TECH_IC[d.tech] || ''} ${TECH_HE[d.tech] || d.tech} · ${d.mw} מגה־ואט`, 'wrap'),
    row('עלות הקמה', `${mS(d.capex)} · ${d.stages} שלבים × ${d.stageMonths} חודשים`, 'wrap'),
    row('ייזום עכשיו', mS(d.dev), 'neg'),
    row('הון עצמי', `${pctI(d.eqReq)} מהעלות לפני שהבנק נכנס — עוד ${mS(d.equityNeed)} אחרי הייזום`, 'wrap'),
    row('היתרים', `${P.lo}–${P.hi} חודשים · בערך ${d.months} חודשים עד שהתחנה מחוברת`, 'wrap'),
    row('תפוקת האתר', `${Math.round((q.lo || 0) * 100)}–${Math.round((q.hi || 0) * 100)}% מהממוצע${d.checked ? ' (אחרי סקר)' : ' (לא נבדק)'}`, (d.checked ? '' : 'neg ') + 'wrap'),
    row('חיבור לרשת', `${S.free || 0} פנויים${S.waiting ? ` · ${S.waiting} פרויקטים כבר מחכים` : ''}${S.queued ? ` · ${S.queued} בתור` : ''}`, ((S.free || 0) <= (S.waiting || 0) ? 'neg ' : '') + 'wrap'),
    row('ריבית במשק · חשמל', `${d.rate}% · ${mwh(d.spot)} (ממוצע ${mwh(d.avg)})`, 'wrap'),
    `<div class="row"><b>מזומן אחרי הייזום</b><b class="big num ${d.cashAfter < d.nextCalls ? 'neg' : ''}">${esc(mS(d.cashAfter))}</b></div>`,
    row(`הון עצמי שעוד צריך${d.active ? ` (גם ל־${d.active} הפרויקטים הפתוחים)` : ''}`, mS(d.nextCalls), (d.cashAfter < d.nextCalls ? 'neg ' : '') + 'wrap')];
  const mt = `<div class="mini sitemini enmini"><p class="mh">☀️ התחנה בחודש רגיל, כשהיא עובדת</p><div class="mt">
    <div><small>לפני החזר חוב</small><b class="num ${cls(d.ebitda)}">${esc(mSg(d.ebitda))}</b><small>תשואה ${esc(String(d.yieldPct))}% בשנה על העלות</small></div>
    <div><small>שווי היוון (DCF)</small><b class="num">${esc(mS(d.dcf))}</b><small>מקום למימון מחדש ${esc(mS(d.refiRoom))}</small></div>
    <div><small>PPA עכשיו</small><b class="num">${esc(d.tech === 'storage' ? mS(d.ppa) : mwh(d.ppa))}</b><small>סולארי בשוק מקבל ${esc(pctI(d.capture))} מהמחיר</small></div></div>
    <p class="note">🤝 עם שותף: הוא שם ${esc(pctI(H.share))} מהייזום ומכל קריאה להון — ומקבל ${esc(pctI(H.share))} מהתחנה. ייזום ${num(mS(H.dev))} · מזומן אחרי ${num(mS(H.cashAfter), H.cashAfter < H.nextCalls ? 'neg' : '')} · הון עצמי שעוד צריך ${num(mS(H.nextCalls))}.</p></div>`;
  const chk = !d.checked ? `<p class="note">🔎 סקר משאבים (${num(mS(d.checkFee))}) מצמצם את טווח התפוקה. אחרי הסקר הכרטיס נשאר פתוח.</p>` : '';
  return grid(rows) + mt + chk + (d.note ? `<p class="note">${escI(d.note)}</p>` : '') + (d.warning ? `<p class="warn" role="note">${escI(d.warning)}</p>` : '');
}
function energyDealHtml(d) {
  let x = '';
  if (d.slot) { const S = d.slot; x += `<div class="mini enmini"><p class="mh">🔌 חיבור לרשת: ${num(String(S.free))} פנויים · ${num(String(S.waiting))} פרויקטים מחכים · ${num(String(S.queued))} בתור (חיבור מהתור לוקח ${num(String(S.queueWait))} חודשים)</p>${S.note ? `<p class="note">${escI(S.note)}</p>` : ''}</div>`; }
  if (d.plant && d.plant.tech) { const P = d.plant; x += `<div class="mini enmini"><p class="mh">${TECH_IC[P.tech] || ''} ${esc(TECH_HE[P.tech] || '')}${P.mw ? ` · ${num(String(P.mw))} מגה־ואט` : ''} · ${esc(OFF_HE[P.offtake] || P.offtake || '')}</p>
    ${grid([row('בחודש רגיל לפני חוב', mSg(P.ebitda), cls(P.ebitda)), row('החזר חוב', mS(-(P.debtService || 0)), 'neg'), `<div class="row"><b>נשאר לך בחודש</b>${num(mSg(P.net), 'big ' + cls(P.net))}</div>`, row('שווי היוון (DCF)', mS(P.dcf)), row('מקום למימון מחדש מיד', mS(P.refiRoom), P.refiRoom > 0 ? 'pos' : '')])}${P.note ? `<p class="note">${escI(P.note)}</p>` : ''}</div>`; }
  if (d.h2) { const H = d.h2; x += `<div class="mini enmini"><p class="mh">🧪 שורף ${num(mS(H.burn))} בחודש · ${num(String(H.months))} חודשים · סיכוי ${num(pctI(H.p))} לשווי ${num(mS(H.payoff))}, אחרת אפס</p>${H.note ? `<p class="note">${escI(H.note)}</p>` : ''}</div>`; }
  if (d.fund) { const F = d.fund; x += `<div class="mini pfmini"><p class="mh">🧱 קרן · נזילות חודשית · תשואה ${num(String(F.yieldPct) + '%')} בשנה${F.dur ? ` · משך ${num(String(F.dur))} שנים` : ''} · אפשר ללוות כנגדה ${num(pctI(F.ltv))}</p>
    <p class="note">רגישות: מניות ${num(String(F.beq || 0))} · אשראי ${num(String(F.bcr || 0))} · נדל"ן ${num(String(F.bpr || 0))}. ${esc(F.redeem || '')}.</p>${F.note ? `<p class="note">${escI(F.note)}</p>` : ''}</div>`; }
  return x;
}
function exchangeHtml(d) {
  const X = d.market || {}; const R = X.regime || {}; const I = X.idx || {}; const F = X.focus;
  const ch = I.px != null ? MV.changeOf(I) : { d: 0, pct: 0 };
  const rows = [row('מצב השוק', `${R.label || ''}${R.sectorLabel ? ` · ${R.sectorLabel}` : ''}`, 'wrap'), row(esc(I.name || 'המדד'), `${MV.pxT(I.px)} · ${ch.d > 0 ? '▲ עלה' : ch.d < 0 ? '▼ ירד' : '— לא זז'} ${Math.round(Math.abs(ch.pct) * 10) / 10}% בחודש האחרון`, 'wrap'), row('התיק שלך בבורסה', mS(X.value || 0))];
  if (F) { const fc = MV.changeOf(F); rows.push(row(`${esc(F.name)} (${esc(F.tk)})`, `${MV.pxT(F.px)} · ${fc.d > 0 ? '▲' : fc.d < 0 ? '▼' : '—'} ${Math.round(Math.abs(fc.pct) * 10) / 10}% · ${F.sectorLabel || ''}${F.seen ? ` · איכות ${F.seen.bandLabel}` : ''}`, 'wrap')); }
  const news = (X.news || []).slice().reverse().slice(0, 4);
  return grid(rows) + (news.length ? `<div class="mini"><p class="mh">📰 חדשות החודש</p><ul class="cdl-news">${news.map((x) => `<li${x.type === 'rumor' ? ' class="rumor"' : ''}>${x.type === 'rumor' ? '🗣️ שמועה: ' : ''}${esc(x.text)}</li>`).join('')}</ul></div>` : '')
    + `<p class="mk-sim" role="note">⚠️ ${esc(MV_SIM)}</p>` + (d.note ? `<p class="note">${escI(d.note)}</p>` : '');
}
const MV_SIM = 'סימולציה — גרף ותוצאה במשחק אינם מבטיחים תוצאה בעולם האמיתי';
const PRIV_TYPE_HE = { pe: 'קרן פרייבט אקוויטי', vc: 'הון סיכון מאוחר', stake: 'אחזקה ישירה בחברה פרטית', prop: 'שותפות נדל"ן', credit: 'אשראי פרטי' };
function privateHtml(d) {
  const P = d.private || {}; const B = P.band || {};
  const rows = [row('ההשקעה', `${PRIV_TYPE_HE[P.type] || P.type || ''} · ${mS(P.size)} (או חצי: ${mS(P.half)})`, 'wrap'),
    row('מכפיל צפוי', `${B.lo}×–${B.hi}×${P.dd ? ' (אחרי בדיקה)' : ' (לא נבדק)'}`, (P.dd ? '' : 'neg ') + 'wrap'),
    P.calls ? row('קריאות לכסף', `${P.calls.n} × ${mS(P.calls.each)}, כל ${P.calls.gap[0]}–${P.calls.gap[1]} חודשים — לא היום`, 'wrap') : '',
    P.lock ? row('נעול', `${P.lock[0]}–${P.lock[1]} חודשים`, 'wrap') : '', P.distFrom ? row('חלוקות', `מחודש ${P.distFrom[0]}–${P.distFrom[1]} אחרי ההתחייבות`, 'wrap') : '',
    row('אפשר ללוות כנגדה', `${pctI(P.ltv)} — שום דבר`, 'neg'),
    `<div class="row"><b>נזיל (מזומן + מניות) מול התחייבויות פתוחות</b><b class="big num ${P.liquid < P.unfunded ? 'neg' : ''}">${esc(`${mS(P.liquid)} / ${mS(P.unfunded)}`)}</b></div>`,
    row('נעול מתוך השווי, אחרי ההשקעה', pctI(P.share), P.share > 0.15 ? 'neg' : ''), row('מזומן אחרי', mS(P.cashAfter), P.cashAfter < 0 ? 'neg' : '')];
  const chk = !P.dd ? `<p class="note">🔎 בדיקת נאותות (${num(mS(P.ddFee))}) מצמצמת את טווח המכפיל. אחרי הבדיקה הכרטיס נשאר פתוח.</p>` : '';
  return grid(rows) + chk + (P.note ? `<p class="note">${escI(P.note)}</p>` : '');
}
function worldMktHtml(d) {   // a module market card's own numbers (w9 energy / w10 portfolio)
  if (d.energy) { const X = d.energy; return grid([row('ריבית במשק', `${X.rate}%`), row('מחיר החשמל', `${mwh(X.spot)} (ממוצע ${mwh(X.avg)})`, 'wrap'), row('סולארי מקבל בשוק', pctI(X.capture)), X.ppaCut != null && X.ppaCut !== 1 ? row('תעריף לחוזים חדשים', `×${X.ppaCut}`) : '', X.months ? row('לכמה זמן', `${X.months} חודשים`) : '']); }
  if (d.portfolio) { const X = d.portfolio; const M2 = d.market || {}; return grid([M2.regime ? row('מצב השוק', M2.regime.label || '') : '', M2.idx ? row('המדד', MV.pxT(M2.idx.px)) : '', row('ריבית במשק', `${X.rate}%`), row('מרווח אשראי', `${X.spread} נק׳ אחוז`),
    row('מינוף (LTV)', `${pctI(X.ltv)}${X.ltv > 1 ? ' — קריאת מרווח' : ''}`, X.ltv > 1 ? 'neg' : ''), X.freezeUntil >= 0 && X.mk === 'freeze' ? row('קרנות קפואות עד', `חודש ${X.freezeUntil}`, 'neg') : '', X.mk === 'gate' ? row('קרנות אשראי נעולות עד', `חודש ${X.gateUntil}`, 'neg') : '', X.flash ? row('הירידה חוזרת', `במשכורת של חודש ${X.flash.back}`, 'pos') : '']) + `<p class="mk-sim" role="note">⚠️ ${esc(MV_SIM)}</p>`; }
  return '';
}
/* ---------- w13 (league + auction): the transfer-market card (type 'mech', auction.js tiles.H; the same card re-describes after an outbid —
   ctl.update, the ghost-tap guard stays), the sponsor / facility block of a deal card (data.league.ck), a league news card's own numbers
   (data.league.mk), a player as a token with an age ring (age in the ring's words, never colour alone) and the live league-table strip.
   Engine values only: the public estimate, the reserve, the levels, the rivals' count, who outbid and at what price, the guide's budget. */
/** w13: the 12-month wage ratio — 0 before the first payday has any revenue (no data yet, never "0 %") */
const wrT = (x) => (+x > 0 ? pctI(x) : 'אין עדיין');
const LOT_BAND_HE = { young: 'כישרון צעיר', prospect: 'צעיר שכבר פותח', prime: 'בשיא', star: 'כוכב', veteran: 'ותיק' };
function tokenHtml(p, { size = '' } = {}) {
  const b = ageBand(p.age); const r = Math.round(+p.rating || +p.r || 0);
  return `<span class="ptok ${size} age-${b.id}" role="img" aria-label="${esc(`${p.name || ''}: גיל ${p.age} (${b.he}), דירוג ${r}`)}"><b class="num">${r}</b><small class="num">${esc(String(p.age))}</small></span>`;
}
function leagueStrip(table, LG) {
  const T = table || []; if (!T.length) return '';
  const us = T.find((x) => x.us) || {};
  const al = `הטבלה עכשיו: ${T.map((x) => `${x.pos}. ${x.name}${x.us ? ' (המועדון שלך)' : ''} ${x.pts} נק׳`).join(', ')}. ${LG && LG.div < 2 ? 'שתיים ראשונות עולות. ' : ''}${LG && LG.div > 0 ? 'שתיים אחרונות יורדות.' : ''}`;
  return `<span class="lgstrip" role="img" aria-label="${esc(al)}" title="${esc(`מקום ${us.pos || ''} מתוך ${T.length}`)}">${T.map((x) => `<i class="${x.us ? 'us' : ''}" data-zone="${esc(x.zone || '')}">${x.us ? '★' : x.pos}</i>`).join('')}</span>`;
}
function auctionHtml(ev) {
  const d = ev.data || {}; const L = d.levels || {};
  const pips = Array.from({ length: d.rounds || 3 }, (_, i) => (i < d.round ? '●' : '○')).join('');
  const lot = `<div class="lot"><span class="lot-tok">${tokenHtml({ name: ev.title, age: d.age, rating: d.r }, { size: 'lg' })}</span><div class="lot-t"><b>${esc(LOT_BAND_HE[d.band] || '')} · גיל ${num(String(d.age))} · דירוג ${num(String(d.r))}</b>
    <small>פוטנציאל ${num(`${d.potLo}–${d.potHi}`)} (טווח — לא הערך האמיתי) · ${d.squadRank <= 11 ? `ייכנס להרכב: מספר ${num(String(d.squadRank))} בסגל שלך` : `מספר ${num(String(d.squadRank))} בסגל — לא בהרכב`}</small>
    <small>שכר ${num(mS(d.wage))} בחודש × ${num(String(d.months))} חודשים = ${num(mS(d.wage * d.months))} · שווי שוק היום ${num(mS(d.mv))}</small></div></div>`;
  const rows = [row('הערכת שווי ציבורית', mS(d.value)), row('מחיר עכשיו', `${mS(d.price)}${d.price > d.value ? ' · מעל ההערכה' : ''}`, d.price > d.value ? 'neg' : ''),
    row('סבב', `${pips} ${d.round} מתוך ${d.rounds}`, 'wrap'),
    row('מועדונים מתמודדים', `👥 ${d.rivals === 1 ? 'מועדון אחד' : `${d.rivals} מועדונים`} — ההערכות שלהם סודיות`, 'wrap'),
    d.outbidBy ? row('מי הציע', `${d.outbidBy} · ${mS(d.price)}`, 'neg wrap') : '',
    row('שכר מול הכנסות עכשיו (12 חודשים)', wrT(d.wageRatio), d.wageRatio > 0.7 ? 'neg' : '')];
  const guide = d.budget > 0 ? `🧭 המנטור קובע מחיר מקסימלי לפני שמתחילים: עד ${num(mS(d.budget))} (92% מההערכה, אם יש כסף ושכר שאפשר לשאת). מעל זה — מוותרים.`
    : '🧭 המנטור היה מוותר כאן: השחקן לא ייכנס להרכב, או שהשכר שלו ידחוף את השכר מעל מה שההכנסות נושאות.';
  const lv = `<div class="mini aucmini"><p class="mh">⚽ ההצעות בסבב הזה</p><ul class="auc-lv">${[['bid', d.round === 1 ? 'מחיר הפתיחה' : 'להשוות'], ['raise', '+15%'], ['jump', '+35%']].map(([k, w]) => `<li class="${L[k] > d.value ? 'over' : ''}"><span>${esc(w)}</span><b class="num">${esc(mS(L[k]))}</b><small>${L[k] > d.value ? `⚠️ מעל ההערכה ב־${esc(mS(L[k] - d.value))}` : `✓ ${esc(mS(d.value - L[k]))} מתחת להערכה`}</small></li>`).join('')}</ul></div>`;
  return lot + grid(rows) + lv + `<p class="note">${escI(guide)}</p>` + (d.note ? `<p class="note">${escI(d.note)}</p>` : '');
}
/** the auction's buttons: each bid with what it takes now and every month, ⚠ over the public estimate (words, not colour), a loan when needed; walk = safe */
function auctionActions(ev) {
  const d = ev.data || {};
  const b = (o, i) => { const P = o.preview || {}; const over = P.risk === 'over';
    const sub = o.id === 'walk' ? 'בלי לשלם כלום · השחקן הבא יגיע' : `${iso(sgn(P.cash || -o.amount))} עכשיו · ${iso(sgn(P.monthly || 0))} בחודש × ${P.months || d.months}${o.loanAmount ? ` · הלוואה ${iso(mS(o.loanAmount))}` : ''}${over ? ' · ⚠️ מעל ההערכה' : ''}`;
    return `<div class="opt"><button data-o="${esc(o.id)}" class="${o.primary ? 'primary' : ''} hasnet auc-b${over ? ' over' : ''}" ${o.enabled ? '' : `disabled aria-describedby="why${i}"`}><span>${escI(o.label)}</span><small class="net sub">${escI(sub)}</small>${o.primary ? '<small class="tagc rec">המנטור</small>' : ''}</button>${!o.enabled && o.reason ? `<small class="why" id="why${i}">${escI(o.reason)}</small>` : ''}</div>`; };
  return `<div class="acts col auc-acts">${ev.options.map(b).join('')}</div>`;
}
function leagueDealHtml(X) {
  if (!X || !X.ck) return '';
  return `<div class="mini lgmini"><p class="mh">${X.ck === 'sponsor' ? `📣 חוזה חסות${X.months ? ` ל־${num(String(X.months))} חודשים` : ''}` : '🏟️ נכס של המועדון'} · שכר מול הכנסות עכשיו ${num(wrT(X.wageRatio), X.wageRatio > 0.7 ? 'neg' : '')}</p>${X.ck === 'sponsor' ? '<p class="note">כסף החסות נספר כהכנסה ביחס השכר — עד שהחוזה נגמר.</p>' : ''}${X.note ? `<p class="note">${escI(X.note)}</p>` : ''}</div>`;
}
function leagueMktHtml(X) {
  const div = DIV_HE[X.div] || '';
  const r = { tv: row('כסף הטלוויזיה עכשיו', `×${X.tvMult} מהבסיס`, 'pos'), fees: row('מחירי השחקנים', '+20% לחצי שנה — לקנות יקר, למכור טוב'), coach: row('הצעירים', 'חצי שנה בלי שיפור', 'neg'),
    cup: row('נכנס לקופה', mSg(X.amount), 'pos'), derby: row('היציע', 'מלא יותר החודש', 'pos'), star: row('השכר עלה ב־30%', X.star || 'השחקן הכי טוב שלך', 'neg wrap') }[X.mk] || '';
  return grid([r, row('הדרג שלך', div)]);
}
/** w11 / w15 (js/render/worldview1115.js): ui.js's own formatters, so the two worlds' HTML reads like every other card */
const WVH = { esc, escI, num, mS, mSg, pctI, row, grid, cls, iso };
const WVH2 = { ...WVH, sgn: mSg, tiny: (n) => money(n) };   // tiny: the HUD's own short money on phones (₪2.4M)   // w12 / w16: signed short money on the option lines
const BODY = {
  mech(ev) {   // a world module's tile card — w5 'N' (allotment), w6 'C' (supply contract), w7 'R' (site), w8 'Q' (land), w9 'V' (power site), w10 'W' / 'Y'
    const d = ev.data || {};
    if (d.tech && d.mw != null && d.slots && d.partner) return powerSiteHtml(d);   // w9
    if (d.market && d.market.idx) return exchangeHtml(d);                          // w10 'W'
    if (d.private && d.private.band) return privateHtml(d);                         // w10 'Y'
    if (d.fairLo != null && d.mgr && d.slotsFree != null) return WV.acquisitionHtml(WVH, ev);   // w11 'Z' (dd re-describes the same card)
    if ((d.kind === 'term' || d.kind === 'buyout') && d.regime && d.mult != null) return WV.investorsHtml(WVH, ev);   // w15 'H'
    if (d.fairLo != null && d.rateG != null && Array.isArray(d.beta)) return WV2.divisionHtml(WVH2, ev);   // w12 'Z' (dd re-describes the same card)
    if ((d.kind === 'export' && d.range) || (d.kind === 'water' && d.quota != null)) return WV2.produceHtml(WVH2, ev);   // w16 'H'
    if (WV3.cardKind(ev)) return WV3.cardHtml(WVH2, ev);   // w14 'J' / w17 'V' / w18 'Z' / w19 'W' / w20 'W' (a check / due diligence re-describes the same card)
    if (d.levels && d.rounds && d.value != null) return auctionHtml(ev);            // w13 'H' (auction.js: every round re-describes the same card)
    if (d.vol != null && d.delta && typeof d.delta === 'object') return contractHtml(d);
    if (d.site && d.mature && d.locs) return siteHtml(d);
    if (d.pk && d.contractors && d.cost && typeof d.cost === 'object') return landHtml(d);
    if (d.share == null || d.upfront == null) return '';
    const rows = [row('הנכס', esc(d.name || '')), row('החדרים שהמפעיל לוקח', iso(Math.round(d.share * 100) + '%') + ` ל־${esc(d.months)} חודשים`), row('ההנחה', iso(Math.round(d.disc * 100) + '%')),
      `<div class="row"><b>מקבלים עכשיו</b>${big(d.upfront, 'pos')}</div>`,
      `<div class="row"><span>הערכה לחצי השנה (עם מול בלי)</span><b class="num ${cls(d.delta)}">${sgn(d.delta)}</b></div>`];
    if (!d.countered && d.counter) rows.push(row('הצעה נגדית', iso(`${Math.round(d.counter.disc * 100)}% הנחה · סיכוי ${Math.round(d.counter.chance * 100)}%`)), row('אם המפעיל יסכים', `${mS(d.counter.upfront)} מראש · ${moneyOf(d.counter.delta, 'short').replace(/^(?=[₪])/, d.counter.delta > 0 ? '+' : '')}`, cls(d.counter.delta)));
    if (d.runway != null) rows.push(row('כרית לחורף עכשיו', `${Math.round(d.runway * 10) / 10} חודשי עלויות קבועות`, d.runway < 3 ? 'neg' : ''));
    const dm = Array.isArray(d.deltaMonths) && d.forecast ? `<div class="mini"><p class="mh">ההפרש החודשי בחצי השנה (תחזית לפי קצב ההזמנות)</p>${miniStrip(d.deltaMonths.map((v, k) => ({ v, band: (d.forecast[k] || {}).tour < 0.9 ? 'off' : 'mid', m: MONTH_S[((d.forecast[k] || {}).cal || 1) - 1], full: MONTH_HE[((d.forecast[k] || {}).cal || 1) - 1] })), 'ההפרש בכל חודש')}</div>` : '';
    return grid(rows) + dm + (d.note ? `<p class="note">${escI(d.note)}</p>` : '');
  },
  intro(ev) {   // T4 §4.2 with the engine's real fields: data.payslip {net, expenses, cashflow, cash}, data.result, data.goal
    const d = ev.data || {}; const P = d.payslip || {};
    if (d.step === 'salary') return grid([row('נטו לחשבון', fmtM(P.net ?? 0)), row('הוצאות קבועות', fmtM(-(P.expenses ?? 0)), 'neg'), `<div class="row"><b>נשאר בסוף החודש</b>${big(P.cashflow ?? 0)}</div>`]);
    if (d.step === 'result') {
      const R = d.result || {}; const g = d.goal || null; const rows = [];
      if (R.cashBefore !== R.cashAfter) rows.push(row('בקופה', `${fmtM(R.cashBefore)} ← ${fmtM(R.cashAfter)}`, cls(R.cashAfter - R.cashBefore)));
      if (R.cfBefore !== R.cfAfter) rows.push(row('נשאר בסוף החודש', `${fmtM(R.cfBefore)} ← ${fmtM(R.cfAfter)}${R.instMonths ? ` · ל־${R.instMonths} חודשים` : ''}`, cls(R.cfAfter - R.cfBefore)));
      if (R.energyBefore !== R.energyAfter && R.energyAfter != null) rows.push(row('🔋 כוח', `${R.energyBefore} ← ${R.energyAfter}`, cls(R.energyAfter - R.energyBefore)));
      const pct = g && g.target ? Math.max(2, Math.min(100, Math.round(((g.value || 0) / g.target) * 100))) : 0;
      return (rows.length ? grid(rows) : '') +
        (g ? `<div class="nextgoal"><b>${esc(d.goalHeading || '🎯 המטרה הבאה')}</b><p>${escI(g.text || g.title || '')}</p>${g.target ? `<div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="${g.target}" aria-valuenow="${g.value || 0}" aria-label="${esc(g.title || 'המטרה הבאה')}"><i style="width:${pct}%"></i></div><small class="num">${fmtM(g.value || 0)} / ${fmtM(g.target)}</small>` : ''}</div>` : '');
    }
    return '';
  },
  payday(ev) {
    const d = { ...ev.data }; const plans = ev.options.some((o) => o.id.startsWith('plan:'));
    if (d.payslip) { d.gross = d.payslip.gross; d.net = d.payslip.net; }
    const ps = d.payslip;
    const rows = [d.gross ? row('ברוטו', sgn(d.gross)) : null, ps && ps.incomeTax ? row('מס הכנסה', fmtM(-ps.incomeTax), 'neg') : null, ps && ps.bl ? row('ביטוח לאומי ובריאות', fmtM(-ps.bl), 'neg') : null, ps && ps.pensionEmployee ? row('פנסיה (שלך)', fmtM(-ps.pensionEmployee), 'neg') : null,
      row(d.gross ? 'משכורת נטו' : 'משכורת', sgn(d.net ?? d.salary), 'pos'), row('הכנסה פסיבית', sgn(d.passive), cls(d.passive)), row('הוצאות', fmtM(-d.expenses), 'neg'), `<div class="row"><b>נכנס לכיס</b>${big(d.cashflow ?? d.amount)}</div>`];
    if (!plans) return grid(rows) + '<p class="note">מעכשיו ימי משכורת יקרו לבד, בלי לעצור את המשחק — המטבעות יעופו ישר לקופה.</p>';
    // wave 3a (J1 P0-3, brief §18): one phone screen — the bottom line + one summary line; the full payslip is under "פירוט"
    payslipFull = grid(rows);
    const parts = [`נטו ${fmtM(d.net ?? d.salary ?? 0)}`, d.passive ? `פסיבי ${sgn(d.passive)}` : '', `הוצאות ${fmtM(d.expenses ?? 0)}`].filter(Boolean);
    return `<div class="pdsum"><div class="row"><b>נכנס לכיס</b>${big(d.cashflow ?? d.amount)}</div><p class="pdline">${escI(parts.join(' · '))}</p></div>` +
      `<h3 class="ph">איך ${gw('תעביר', 'תעבירי')} את החודש הבא?</h3>`;
  },
  life(ev) {
    const d = ev.data || {};
    return d.text ? `<p class="d">${escI(d.text)}</p>` : '';
  },
  /* T3 inbox item (E.inbox card; resolved through E.resolveStory by game.js). A business item shows its last month first. */
  story(ev) {
    const B = ev.data && ev.data.biz; if (!B || !B.l1) return '';
    return l1Html(B.l1, { compact: true }) + (B.signature && B.signature.text ? `<p class="note sig">${escI(`${B.signature.label}: ${B.signature.text}`)}</p>` : '') + l2Details(B.l2);
  },
  deal(ev, ctx) {
    const d = ev.data; const w = ctx.world;
    const rows = [row('מחיר', fmtM(d.cost))];
    if (d.value !== d.cost) rows.push(`<div class="row"><span>שווי בשוק</span><span class="num rtl">${fmtM(d.value)} <small class="${d.discount > 0 ? 'pos' : 'neg'}">(${d.discount > 0 ? 'מציאה: ' : 'מעל השווי: '}${iso(sgn(d.discount))})</small></span></div>`);
    rows.push(`<div class="row"><span>הון עצמי (משלמים עכשיו)</span><b class="num">${fmtM(d.down)}</b></div>`);
    if (d.debt > 0) rows.push(row(`${esc(d.debtLabel)} (חוב)`, fmtM(d.debt)));
    if (d.grow) rows.push(row(d.grow > 0 ? 'עליית ערך' : 'ירידת ערך', iso(`${d.grow > 0 ? '+' : '−'}${Math.round(Math.abs(d.grow) * 1000) / 10}%`) + ' בחודש', d.grow > 0 ? 'pos' : 'neg'));
    if (d.impact) rows.push(row('השפעה', `+${d.impact} בחודש`, 'pos'));
    // T2 due diligence lives IN the grid: the cash-flow row says whose number it is (seller / range / verified)
    const D = d.dd, lv = D ? D.level : -1;
    const badge = D && (lv > 0 || ev.options.some((o) => o.kind === 'inspect')) ? (lv === 2 ? ' <em class="b ok">נבדק ✓</em>' : lv === 1 ? ' <em class="b">טווח מהבדיקה</em>' : ` <em class="b warn">${esc(D.claimed.label || 'לפי המוכר')} · לא נבדק</em>`) : '';
    // T2 verify D4: once checked, the big number is what the check says (level 1: the range, level 2: verified); the seller's claim is a
    // secondary line. data.cf / cfVar / cfFix stay the seller's numbers until level 2 (engine contract).
    const rng = D && lv === 1 && D.range && D.range.cf ? D.range.cf : null;
    if (rng) {
      rows.push(`<div class="row"><span>תזרים חודשי נטו${badge}</span><b class="big num rtl rng ${rng[0] < 0 ? 'neg' : 'pos'}">${iso(`${sgn(rng[0])} עד ${sgn(rng[1])}`)}</b></div>`);
      if (d.cfVar != null) rows.push(row('המוכר אמר', `${sgn(d.cfVar)} (משתנה ${pctTxt(d.rate)}) · ${sgn(d.cfFix)} (קבועה ${pctTxt(d.fixedRate)})`, 'mut'));
      else rows.push(row('המוכר אמר', `${sgn(D.claimed.cf)} בחודש`, 'mut'));
    } else if (d.cfVar != null) {
      rows.push(`<div class="row"><span>תזרים בריבית משתנה (${num(pctTxt(d.rate))})${badge}</span>${big(d.cfVar)}</div>`);
      rows.push(`<div class="row"><span>תזרים בריבית קבועה (${num(pctTxt(d.fixedRate))})</span><b class="num ${cls(d.cfFix)}">${sgn(d.cfFix)}</b></div>`);
    } else rows.push(`<div class="row"><span>תזרים חודשי נטו${badge}</span>${big(d.cf)}</div>`);
    if (D && lv === 2) rows.push(row('המוכר אמר', `${sgn(D.claimed.cf)} בחודש`, 'mut'));
    if (D && lv >= 1 && ctx.world.goal.type !== 'passive') rows.push(lv === 2 && D.verified ? row('שווי שנבדק', fmtM(D.verified.value)) : D.range ? row('שווי לפי הבדיקה', `${fmtM(D.range.value[0])} עד ${fmtM(D.range.value[1])}`) : '');
    if (D && lv >= 1) rows.push(lv === 2 && D.verified ? row('🔧 תיקונים', D.verified.repair ? fmtM(D.verified.repair) : 'אין', D.verified.repair ? 'neg' : '') : D.range ? row('🔧 תיקונים צפויים', esc(REPAIR[D.range.repair] || D.range.repair)) : '');
    let extra = '';
    if (d.cfAt) {
      extra += `<div class="mini"><p class="mh">כמה הנכס מכניס בכל ריבית?</p><div class="mt">${d.cfAt.map((x) => `<div class="${Math.abs(x.rate - d.rate) < 1 ? 'cur' : ''}"><small>${pctTxt(x.rate)}</small><b class="num ${cls(x.cf)}">${sgn(x.cf)}</b></div>`).join('')}</div>
        <p class="note">משתנה = התזרים זז עם הריבית. קבועה = נעול, בלי הפתעות, אבל קצת יקר יותר היום.</p></div>`;
    }
    if (d.op) extra += opStripHtml(d);   // w5: an op-asset's 12 months (strip), its weakest month and the winter runway
    if (d.plant && !d.plant.tech) extra += plantDealHtml(d.plant, d.warning);   // w6: condition, breakdown risk, the month in a boom / normal / recession, delivery, runway
    if (d.chain && d.chain.ck) extra += chainDealHtml(d.chain);   // w7: a branch (fit-out + ramp), a DC (−2 % on goods), e-commerce
    if (d.proj && d.proj.pk) extra += projDealHtml(d.proj);       // w8: a stalled project (units, stages built, cost, equity)
    extra += energyDealHtml(d) + leagueDealHtml(d.league);                                    // w9: a grid slot, an operating plant / line, the hydrogen pilot; w10: a fund
    if (d.cfAtUsd) {
      const imp = d.sens < 0;
      extra += `<div class="mini"><p class="mh">${d.usdLinked ? 'השווי צמוד לדולר.' : imp ? 'יבואן: משלם לספקים בדולרים — דולר חזק פוגע.' : 'יצואן: מוכר בדולרים — דולר חזק עוזר.'}</p><div class="mt">${d.cfAtUsd.map((x, i) => `<div class="${i === 1 ? 'cur' : ''}"><small>דולר ${usdTxt(x.usd)}</small><b class="num ${cls(x.cf)}">${sgn(x.cf)}</b><small>שווי ${fmtC(x.value)}</small></div>`).join('')}</div>
        <p class="note">גידור: ${fmtM(d.hedgeFee)} נועלים את השער הנוכחי ל־${d.hedgeMonths} חודשים.</p></div>`;
    }
    const short = Math.max(0, d.down - d.cash);
    const roiBtn = d.down ? `<button class="chip" data-roi aria-expanded="${evState.roi}" aria-controls="roiBox">${gw('תראה', 'תראי')} לי את החישוב</button>
      <div class="roi" id="roiBox" ${evState.roi ? '' : 'hidden'}>תשואה על ההון = תזרים שנתי ÷ הון עצמי<br>${roiEq(d)}<br><span class="note">התזרים כבר כולל את תשלומי ה${esc(d.debtLabel)}.${d.roiFix != null ? ` בריבית קבועה: ${iso(d.roiFix + '%')} בשנה.` : ''}</span>${d.roiVsLoan ? `<p class="vs">${escI(d.roiVsLoan)}</p>` : ''}</div>` : '';
    const cash = `<p class="note">יש לך ${num(fmtM(d.cash))} במזומן.${short ? ` חסרים ${num(fmtM(short))}${d.loanNeeded ? ` — הבנק ילווה ${num(fmtM(d.loanNeeded))} (עולה ${num(fmtM(d.loanMonthly))} בחודש)` : ''}.` : ''}</p>`;
    const neg = d.negotiated ? `<p class="okmsg">🤝 המוכר הסכים: ${iso('−' + d.negotiated.pct + '%')} — חסכת ${num(fmtM(d.negotiated.saved), 'pos')}</p>` : '';
    return neg + rivalsRow(ev) + grid(rows) + ddBox(ev) + extra + roiBtn + cash;
  },
  doodad(ev) {
    const d = ev.data; const canSkip = ev.options.some((o) => o.id === 'skip');
    const kind = d.need === true ? '<p class="chipline"><em class="b warn">הוצאה הכרחית — אי אפשר לוותר</em></p>' : canSkip ? '<p class="chipline"><em class="b ok">פיתוי — מותר לוותר</em></p>' : '';
    return kind + grid([`<div class="row"><span>מחיר</span><b class="big num neg">${fmtM(d.amount)}</b></div>`,
      d.installments3 ? (() => { const a = d.installments3.amounts || []; return row('3 תשלומים בלי ריבית', a.every((x) => x === a[0]) ? `${a.length} × ${fmtM(a[0])}` : a.map((x) => fmtM(x)).join(' + ')); })() : '',
      d.installment ? `<div class="row"><span>באשראי מתגלגל<small class="rw">עד שתסגור את כל החוב — החוב עצמו לא קטן</small></span>${num(`${fmtM(d.installment)} ריבית בחודש`, 'neg')}</div>` : '',
      d.sub ? `<div class="row"><span>כמנוי<small class="rw">כל עוד הוא פעיל (במשחק אי אפשר לבטל)</small></span>${num(`${fmtM(d.sub)} בחודש`, 'neg')}</div>` : '']) +
      `<p class="note">יש לך ${num(fmtM(d.cash))} במזומן.${d.shortfall == null && d.amount > d.cash ? gz(' אין מספיק — אם תשלם, הבנק ייתן הלוואה.') : ''}</p>`;
  },
  market(ev) {
    const d = ev.data;
    if (d.energy || d.portfolio) return worldMktHtml(d);   // w9 / w10 module market cards
    if (d.league && d.league.mk) return leagueMktHtml(d.league);   // w13
    if (d.mn && d.mn.mk) return WV.mnNewsHtml(WVH, d.mn);   // w11
    if (d.pf && d.pf.mk) return WV.pfNewsHtml(WVH, d.pf);   // w15
    if (d.hd && d.hd.mk) return WV2.hdNewsHtml(WVH2, d.hd);   // w12
    if (d.hv && d.hv.mk) return WV2.hvNewsHtml(WVH2, d.hv);   // w16
    if ((d.credit && d.credit.mk) || (d.trials && d.trials.mk) || (d.insure && d.insure.mk) || (d.bell && d.bell.mk) || (d.funds && d.funds.mk)) return WV3.newsHtml(WVH2, d);   // w14 / w17 / w18 / w19 / w20
    if (d.kind === 'sell') {
      if (!d.offers.length) return '<p class="empty">אין לך נכסים מהסוג הזה.</p>';
      return `<div class="sells">${d.offers.map((o) => `<div class="sellrow"><div><b>${esc(o.name)}</b><p class="note">הצעה ${num(fmtM(o.offer))}${o.debt ? ` · סוגרים חוב ${num(fmtM(o.debt))}` : ''} · נכנס לך <b class="num pos">${fmtM(o.netAfterTax ?? o.net)}</b>${o.tax ? ` <small>(אחרי מס ${num(fmtM(o.tax))})</small>` : ''}<br>רווח על ההון: ${num(sgn(o.profit), cls(o.profit))} · מוותר על ${num(sgn(o.cf), cls(o.cf))} בחודש</p></div><button data-o="sell:${esc(o.assetId.slice(1))}" class="sell">למכור</button></div>`).join('')}</div>`;
    }
    if (d.kind === 'rate' || d.kind === 'fx') return fromTo(d.from, d.to, d.kind === 'rate' ? pctTxt : usdTxt, d.kind === 'rate' ? 'הריבית' : 'הדולר', d.kind === 'rate' ? -1 : 0);
    if (d.kind === 'reval') return d.changed.length ? grid([row('השינוי בשווי הנכסים שלך', sgn(d.valueChange), cls(d.valueChange))]) + '<p class="note">זה משנה את השווי הנקי, לא את המזומן.</p>' : '<p class="empty">אין לך נכסים מהסוג הזה.</p>';
    if (d.kind === 'exitwave') return `<p class="note">${d.pulled.length ? `${d.pulled.length} מהסטארט־אפים שלך יגיעו לתוצאה עכשיו.` : 'אין לך סטארט־אפים שמגיעים לאקזיט עכשיו.'}</p>`;
    if (d.kind === 'markdown') return `<p class="note">${d.marked.length ? `השווי על הנייר של ${d.marked.length} סטארט־אפים ירד. זה עוד לא הפסד אמיתי.` : 'אין לך סטארט־אפים — זה לא נוגע בך.'}</p>`;
    if (d.kind === 'match') return grid([row('כל שקל שתתרום', 'מוכפל!', 'pos')]);
    if (d.amount != null) return d.amount ? grid([`<div class="row"><span>${d.kind === 'repair' ? `${d.count} נכסים לתיקון` : d.kind === 'div' ? `דיבידנד על ${esc(d.ticker)}` : 'השפעה על המזומן'}</span>${big(d.amount)}</div>`]) : '<p class="empty">הפעם זה לא נוגע אליך.</p>';
    return '';
  },
  crisis(ev) {
    const d = ev.data;
    return grid([...d.lines.map((l) => row(esc(l.label), sgn(l.amount), cls(l.amount))), `<div class="row"><b>סה"כ</b>${big(d.amount)}</div>`]) +
      (d.passive > 0 ? `<p class="note">הנכסים שלך ממשיכים לעבוד: ${num(sgn(d.passive), 'pos')} בחודש גם עכשיו.</p>` : '<p class="note">הנכסים ממשיכים לעבוד גם כשאתה לא.</p>') +
      (d.gold ? `<p class="note">בזמן משבר הזהב קופץ ב־${num(d.gold + '%')}${d.goldAfter ? ` — אונקייה תהיה שווה ${num(fmtM(d.goldAfter))}` : ''}.</p>` : '');
  },
  mystery(ev) {
    const d = ev.data;
    if (d.kind === 'quiz') return `<div class="quizq"><b>${escI(d.question)}</b><p class="note">${typeof d.reward === 'number' ? `תשובה נכונה = ${num(fmtM(d.reward), 'pos')}` : 'תשובה נכונה = שיעור חדש בספרייה + ⚡1. אין פרס כספי — רק הבנה.'}</p></div>`;
    if (d.kind === 'cash') return grid([`<div class="row"><span>${d.amount >= 0 ? 'נכנס לך' : 'יוצא לך'}</span>${big(d.amount)}</div>`]);
    if (d.kind === 'raise') return grid([row('המשכורת עולה', `${sgn(d.amount)} בחודש`, 'pos')]);
    if (d.kind === 'expense') return grid([row('ההוצאות משתנות', `${sgn(d.amount)} בחודש`, d.amount > 0 ? 'neg' : 'pos')]);
    if (d.kind === 'boost') return d.assetName ? grid([row(esc(d.assetName), `${sgn(d.amount)} בחודש`, 'pos')]) : '';
    if (d.kind === 'shares') return grid([row(`${N(d.qty)} יחידות ${esc(d.ticker)}`, fmtM(d.value), 'pos')]);
    if (d.kind === 'impact') return grid([row('נקודות השפעה', `+${d.impact}`, 'pos')]);
    if (d.kind === 'usd') return grid([row('שער הדולר זז', `${d.delta > 0 ? '+' : '−'}₪${Math.abs(d.delta).toFixed(2)}`)]);
    return '';
  },
  bank(ev) {
    const d = ev.data;
    return fromTo(d.from, d.to, pctTxt, 'הריבית', -1) + grid([
      d.variableCount ? row(`${d.variableCount} משכנתאות בריבית משתנה`, fmtM(d.variableDebt)) : row('משכנתאות בריבית משתנה', 'אין'),
      `<div class="row"><span>השפעה על התזרים החודשי</span>${big(d.monthlyImpact)}</div>`,
      d.variableCount ? row(`אם תקבע עכשיו (${num(pctTxt(d.fixedRate))})`, iso(`${sgn(d.cfIfFixed)} במקום ${sgn(d.cfNow)}`), cls(d.cfIfFixed - d.cfNow)) : '',
      d.variableCount ? row('עמלת קיבוע', fmtM(d.refiFee)) : '',
    ]);
  },
  upgrade(ev) {
    const d = ev.data;
    const ups = d.upgrades.map((u) => `<div class="uprow"><b>${esc(u.name)}</b><span class="note">${esc(u.label)} · ${num(fmtM(u.cost))} ← ${num(sgn(u.gain), 'pos')} בחודש · ${num(u.roi + '%')} בשנה · שווי ${num(sgn(u.valueUp), 'pos')}</span></div>`).join('');
    const trims = d.trims.map((t) => `<div class="uprow"><b>לקצץ: ${esc(t.label)}</b><span class="note">עולה פעם אחת ${num(fmtM(t.cost))} · חוסך ${num(fmtM(t.cut), 'pos')} כל חודש — לתמיד</span></div>`).join('');
    return (ups || trims) ? `<div class="ups">${ups}${trims}</div>` : '<p class="empty">אין לך עכשיו מה לשדרג.</p>';
  },
  fx(ev) {
    const d = ev.data; const ex = d.exposure || { cf: 0, value: 0 };
    return fromTo(d.from, d.to, usdTxt, 'הדולר', 0) + grid([
      d.exposureText ? row('נכסים שמושפעים', escI(d.exposureText)) : row('נכסים שמושפעים', [cnt(d.importers, 'יבואן', 'יבואנים'), cnt(d.exporters, 'יצואן', 'יצואנים')].join(' · ')),
      row('אם הדולר יעלה עוד 10%', `${sgn(ex.cf)} בחודש`, cls(ex.cf)),
      d.importers ? row('גידור היבוא', `${fmtM(d.hedgeFeeImporters)} ל־${d.hedgeMonths} חודשים`) : '',
      d.exporters ? row('גידור היצוא', `${fmtM(d.hedgeFeeExporters)} ל־${d.hedgeMonths} חודשים`) : '',
    ]) + '<p class="note">גידור = ביטוח על השער. קונים אותו כשהשער נוח לך, לא באמצע סערה.</p>';
  },
  shipping(ev) {
    const d = ev.data;
    if (d.fee != null) return grid([row('ביטוח משלוחים', `${fmtM(d.fee)} ל־${d.months} חודשים`), row('מצב היום', d.insured ? `מבוטח עד חודש ${d.insuredUntil}` : 'לא מבוטח', d.insured ? 'pos' : '')]);
    return grid([`<div class="row"><span>${d.insured && d.amount === 0 ? 'הביטוח כיסה את הנזק' : 'השפעה על המזומן'}</span>${d.amount ? big(d.amount) : '<b class="num pos">₪0</b>'}</div>`]);
  },
  pitch(ev) {
    const d = ev.data;
    const dots = (n, lbl, warn) => `<div class="meter"><span>${lbl}</span><i>${[1, 2, 3].map((k) => `<b class="${k <= n ? (warn ? 'on warn' : 'on') : ''}"></b>`).join('')}</i></div>`;
    return `<p class="chipline"><em class="b">${esc(d.sector)}</em></p><div class="meters">${dots(d.team, 'צוות')}${dots(d.traction, 'מכירות')}${dots(d.hype, 'הייפ', true)}</div>
      <div class="odds"><b>האמת על סטארט־אפים</b><p>${escI(d.odds)}</p><p class="note">הייפ גבוה = משלמים יותר על אותו סיכוי. התוצאה תתגלה בעוד ${esc(d.revealHint)}. ${d.active ? `כבר יש לך ${d.active} השקעות פעילות.` : ''}</p></div>`;
  },
  giving(ev) {
    const d = ev.data;
    return `<div class="wbox"><div class="wl"><span>ההשפעה שלך</span><b class="num">${d.impact}/${d.impactTarget}</b></div><div class="track"><i style="width:${Math.min(100, (d.impact / Math.max(1, d.impactTarget)) * 100)}%"></i></div></div>` +
      grid([row('יעילות המטרה', `×${d.eff}`, d.eff >= 1 ? 'pos' : 'neg')]) +
      `<p class="note">${d.eff < 1 ? gz('שים לב: חלק גדול מהכסף לא מגיע למטרה עצמה.') : 'תרומה נותנת קצת השפעה עכשיו, והשאר מגיע לאורך החודשים הבאים — וממשיך לגדול.'}${d.pledge ? ` הוראת קבע: ${num(fmtM(d.pledge.amount))} בחודש ← ${num('+' + d.pledge.impact)} השפעה כל חודש.` : ''}</p>`;
  },
  /* v3.1 K tile: a managed business (offer → manage). Owner-run = active income; with a manager = passive.
     T3 (rules 4): layered — the offer leads with the setups and the seasons; the manage card leads with 3 numbers and one
     "why" sentence (L1), then the open decisions; "פרטים" = L2 (groups, cash bridge, receivables, stock), "דוח מלא" = L3. */
  business(ev) {
    const d = ev.data || {};
    const kind = (e) => `<div class="bizkind"><p><b>${gw('אתה עובד בו', 'את עובדת בו')}</b> = הכנסה <b>אקטיבית</b> (משרה נוספת) · 🔋 ${nrg(-(e.ownerEnergy || 0))} בחודש.</p><p><b>עם מנהל</b> = הכנסה <b>פסיבית</b> שנספרת ליעד · 🔋 ${nrg(-(e.managerEnergy || 0))} — אבל משלמים לו משכורת.</p></div>`;
    if (d.mode === 'offer') {
      const L = (d.forecast3 && d.forecast3.lines) || []; const ln = (k) => L.find((x) => x.k === k);
      const rev = ln('revenue'), gp = ln('gp'), np = ln('np');
      const A = d.archetype || {};
      const chips = `<p class="chipline"><em class="b">${BIZ_ICON[A.icon] || '🏪'} ${esc(A.short || A.name || 'עסק')}</em>${A.price ? `<em class="b">מחיר ל${esc(unitOne(A.unit))}: ${num(fmtP(A.price))}</em>` : ''}</p>`;
      if (Array.isArray(d.setups) && d.setups.length) return chips;   // T3 UI-6: the setups lead (bizOfferActions), then the seasons and the rest
      return chips +
        grid([`<div class="row"><span>הון לפתיחה</span><b class="num">${fmtM(d.startCapital)}</b></div>`,
          rev ? row('הכנסות ב־3 החודשים הראשונים (בלי מע"מ)', fmtM(rev.amount)) : '',
          gp ? row(`רווח גולמי${gp.pct != null ? ` (${gp.pct}%)` : ''}`, fmtM(gp.amount), cls(gp.amount)) : '',
          np ? `<div class="row"><span>רווח נקי צפוי ב־3 חודשים</span>${big(np.amount)}</div>` : '',
          d.forecast3 && d.forecast3.cashChange != null ? row('הקופה אחרי 3 חודשים', sgn(d.forecast3.cashChange), cls(d.forecast3.cashChange)) : '']) +
        (d.breakEven && d.breakEven.text ? `<p class="note">⚖️ ${escI(d.breakEven.text)}</p>` : '') + kind(d) +
        '<p class="note">תחזית בלבד: לקוחות, מחירים והפתעות משנים את התוצאה כל חודש.</p>';
    }
    const s = d.summary || {}; const h = s.hist || []; const last = h[h.length - 1];
    const passive = s.incomeKind === 'passive' || s.manager;
    const settings = grid([row('מחיר', fmtP(s.price ?? 0)), row('עובדים', String(s.staff ?? 0) + (s.manager ? ' + מנהל' : '')),
      row('שיווק בחודש', fmtM(s.marketing || 0)), row('משיכה לכיס שלך בחודש', fmtM(s.draw || 0)),
      row('בקופת העסק', fmtM(s.cash || 0), cls(s.cash || 0)), s.valuation ? row(gz('שווי אם תמכור'), fmtM(s.valuation.price || 0)) : '']);
    const sparkH = h.length > 1 ? `<div class="mini"><p class="mh">רווח נקי לפי חודש</p>${spark(h.map((x) => x.np), { color: (last && last.np >= 0) ? 'var(--green)' : 'var(--red)', w: 300, h: 34 })}</div>` : '';
    const kindChip = `<em class="b ${passive ? 'ok' : 'warn'}">${passive ? 'עם מנהל — הכנסה פסיבית (נספרת ליעד)' : gw('אתה עובד בו', 'את עובדת בו') + ' — הכנסה אקטיבית (לא נספרת ליעד)'}</em><em class="b">🔋 ${nrg(-(s.ownerEnergy || 0))} בחודש</em>`;
    const L1 = d.l1 || s.l1;
    if (L1) {   // T3 layered card
      const L2 = d.l2 || s.l2 || {}, L3 = s.l3 || {};   // the engine puts last month's report on ev.data.l2 (and the summary)
      const stage = d.stage ?? s.stage; const sig = d.signature || s.signature; const cal = d.calendar;
      const groups = (L2.groups || []).filter((g) => g.amount || g.k === 'profit');
      const gHtml = groups.length ? `<p class="mh">החודש האחרון בקבוצות</p>${grid(groups.map((g) => g.k === 'profit' ? `<div class="row"><b>${esc(g.label)}</b>${big(g.amount)}</div>` : row(esc(g.label), sgn(g.amount), cls(g.amount))))}` : '';
      const bridge = (L2.cashBridge || []).filter((x) => x.amount);
      const bHtml = bridge.length ? `<p class="mh">מהרווח לקופה</p><ul class="bridge">${bridge.map((x) => `<li><span>${escI(x.text)}</span>${num(sgn(x.amount), cls(x.amount))}</li>`).join('')}</ul>` : '';
      const R = L2.receivables || {}; const St = L2.stock;
      const ar = R.now ? `<p class="note">🧾 לקוחות חייבים לעסק: ${num(fmtM(R.now))}${(R.terms || []).length ? ` · ${R.terms.map((t) => `${num(fmtM(t.amount))}${t.client ? ` (${escI(t.client)})` : ''} בחודש ${num(String(t.due))}`).join(' · ')}` : ''}</p>` : '';
      const stock = St ? `<p class="note">📦 במלאי ${num(N(St.units || 0))} יחידות${St.cover != null ? ` · מספיק לבערך ${num(String(St.cover))} חודשים` : ''}${St.onOrder ? ` · בדרך ${num(N(St.onOrder))}` : ''}${St.value ? ` · שווי ${num(fmtM(St.value))}` : ''}</p>` : '';
      const l3lines = (L3.lines || []).filter((x) => x.amount || x.always);
      const l3 = l3lines.length ? `<details class="more bizl3"><summary>דוח מלא</summary>${grid(l3lines.map((x) => x.bold ? `<div class="row"><b>${esc(x.label)}</b><b class="num ${cls(x.amount)}">${sgn(x.amount)}</b></div>` : row(esc(x.label), sgn(x.amount), cls(x.amount))))}${(L3.notes || []).length ? `<ul class="bnotes">${L3.notes.slice(0, 6).map((t) => `<li>${escI(t && typeof t === 'object' ? t.text || '' : String(t ?? ''))}</li>`).join('')}</ul>` : ''}${L3.breakEven && L3.breakEven.text ? `<p class="note">⚖️ ${escI(L3.breakEven.text)}</p>` : ''}${L3.totals && L3.totals.months ? `<p class="note">מאז הפתיחה (${num(String(L3.totals.months))} חודשים): מחזור ${num(fmtM(L3.totals.revenue || 0))} · רווח נקי ${num(sgn(L3.totals.netProfit || 0), cls(L3.totals.netProfit || 0))} · משכת ${num(fmtM(L3.totals.drawnNet || 0))}</p>` : ''}</details>` : '';
      // a summary without the month's report (engine: manage card) has no cash change → show the business's cash instead of a fake ₪0
      const L1x = !L1.sentence && !L1.cashDelta && (L1.revenue || L1.profit) ? { ...L1, cashNow: s.cash || 0 } : L1;
      return `<p class="chipline">${kindChip}</p>` + stageRow(stage) + l1Html(L1x) +
        (sig && sig.text ? `<p class="note sig">📌 ${escI(sig.label)}: ${escI(sig.text)}</p>` : '') +
        bizItemsHtml(ev) + calLine(s.seasonProfile, cal) +
        `<details class="more bizl2"><summary>פרטים</summary>${gHtml}${bHtml}${ar}${stock}${seasonStrip(s.seasonProfile, cal, null)}<p class="mh">ההגדרות של העסק</p>${settings}${sparkH}</details>` + l3 +
        (d.forecast3 != null ? `<p class="note">אם לא משנים כלום — תחזית ל־3 חודשים: ${num(sgn(d.forecast3), cls(d.forecast3))} רווח נקי.</p>` : '');
    }
    return `<p class="chipline">${kindChip}</p>` +
      grid([last ? `<div class="row"><span>רווח נקי בחודש האחרון</span>${big(last.np)}</div>` : '',
        row('מחיר', fmtP(s.price ?? 0)), row('עובדים', String(s.staff ?? 0) + (s.manager ? ' + מנהל' : '')),
        row('שיווק בחודש', fmtM(s.marketing || 0)), row('משיכה לכיס שלך בחודש', fmtM(s.draw || 0)),
        row('בקופת העסק', fmtM(s.cash || 0), cls(s.cash || 0)),
        s.valuation ? row(gz('שווי אם תמכור'), fmtM(s.valuation.price || 0)) : '']) + sparkH +
      (s.breakEven && s.breakEven.text ? `<p class="note">⚖️ ${escI(s.breakEven.text)}</p>` : '') +
      (d.forecast3 != null ? `<p class="note">אם לא משנים כלום — תחזית ל־3 חודשים: ${num(sgn(d.forecast3), cls(d.forecast3))} רווח נקי.</p>` : '');
  },
  tax(ev) {
    const d = ev.data || {};
    const canReport = ev.options.some((o) => o.id === 'report');
    return grid([d.refund ? row('החזר מס (שילמת יותר מדי במשכורת)', sgn(d.refund), 'pos') : '',
      d.bill ? row('מס על העסק הצדדי שלא דווח', fmtM(-d.bill), 'neg') : '',
      (d.refund && d.bill) ? `<div class="row"><b>סה"כ</b>${big(d.net)}</div>` : '',
      d.paidTotal ? row('מס הכנסה וביטוח לאומי ששילמת עד עכשיו', fmtM(d.paidTotal)) : '',
      d.effectiveRate ? row('מס אפקטיבי מהברוטו', iso(d.effectiveRate + '%')) : '']) +
      (canReport ? '<p class="note">🧾 עסק צדדי בלי תיק = חוב מס שמחכה לסוף השנה, ואם לא מגיעים לכאן — עוד 10% קנס. פתיחת תיק = מקדמות קטנות כל חודש, בלי הפתעות.</p>' : '');
  },
  edu(ev) {
    const d = ev.data || {}; const p = Math.round((d.studyProgress || 0) * 100);
    return `<div class="wbox"><div class="wl"><span>🎓 התקדמות בלימודים</span><b class="num">${p}%</b></div><div class="track"><i style="width:${Math.max(1, p)}%"></i></div>
      <p class="note">${p >= 100 ? 'סיימת ללמוד — ההעלאה כבר בתלוש.' : 'בסוף הלימודים: העלאה קבועה בברוטו. עד אז — שכר לימוד ופחות כוח.'}</p></div>`;
  },
};
/** signed small number as an LTR isolate (−12 / +4) */
const nrg = (n) => `<span class="num">${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}</span>`;
const BIZ_ICON = { coffee: '☕', washer: '🧺', pizza: '🍕', rocket: '📱', box: '📦' };
const unitOne = (u) => ({ 'כוסות': 'כוס', 'כביסות': 'כביסה', 'פיצות': 'פיצה', 'הזמנות': 'הזמנה', 'מנויים': 'מנוי' }[u] || 'יחידה');
const BIZ_DONE = { 'biz:suggest': 'ההמלצה בוצעה', 'biz:manager': 'עדכנת את המנהל', 'biz:price:up': 'המחיר עלה', 'biz:price:down': 'המחיר ירד', 'biz:mkt:up': 'יותר שיווק', 'biz:mkt:down': 'פחות שיווק', 'biz:hire': 'גייסת עובד', 'biz:fire': 'פיטרת עובד', 'biz:draw:up': 'תמשוך יותר לכיס', 'biz:draw:down': 'תמשוך פחות', 'biz:order': 'הזמנת מלאי', 'biz:expand': 'העסק מתרחב' };
/* ---------- T3 business layers (UI-4/5/6): L1 three numbers + one sentence, growth stage, the seasons calendar */
const MON_SHORT = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const MON_LONG = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
/** L1: מחזור / רווח / מזומן (this month's change in the business's cash) + the engine's one "why" sentence. */
export function l1Html(L, { compact = false } = {}) {
  if (!L) return '';
  const empty = !L.revenue && !L.profit && !L.cashDelta;
  const cell = (k, v, signed) => `<div class="l1n"><small>${k}</small><b class="num ${signed ? cls(v) : ''}">${signed ? sgn(v) : fmtM(v)}</b></div>`;
  if (empty) return `<p class="note l1e">עוד אין חודש מלא בעסק — המספרים יופיעו אחרי יום המשכורת.</p>`;
  return `<div class="l1 ${compact ? 'sm' : ''}" role="group" aria-label="החודש האחרון בעסק">${cell('מחזור', L.revenue || 0, false)}${cell('רווח נקי', L.profit || 0, true)}${L.cashNow != null ? cell('בקופת העסק', L.cashNow, false) : cell('מזומן בקופה', L.cashDelta || 0, true)}</div>` +
    (L.sentence ? `<p class="why1">${escI(L.sentence)}</p>` : '') + (L.toOwner ? `<p class="note">לכיס שלך: ${num(fmtM(L.toOwner), 'pos')}</p>` : '');
}
/** Growth stage pips — the same words as the city (T5 vocab.levelText / levelHint). */
function stageRow(stage) {
  if (stage == null || !Number.isFinite(+stage)) return '';
  const L = { kind: 'biz', n: +stage }; const t = stageText(L); if (!t) return '';
  return `<div class="alevel bizstage"><span class="pips" role="img" aria-label="${esc(t)}">${[1, 2, 3].map((i) => `<i class="${i <= +stage ? 'on' : ''}"></i>`).join('')}</span><b>${esc(t)}</b><small>${escI(stageHint(L) || '')}</small></div>`;
}
/** 12 mini bars (game month 1 = January); the current month outlined; the text names the strong / weak months (no colour-only info). */
function seasonStrip(profile, cal, A) {
  const P = Array.isArray(profile) ? profile : null; if (!P || P.length !== 12) return cal && cal.label ? `<p class="note">🗓️ ${esc(cal.label)}${cal.season ? ` · ${esc(cal.season)}` : ''}</p>` : '';
  const max = Math.max(1.2, ...P.map((x) => x.mult || 1));
  const cur = cal && cal.m ? cal.m : null;
  const strong = P.filter((x) => x.mult >= 1.15).sort((a, b) => b.mult - a.mult), weak = P.filter((x) => x.mult <= 0.85);
  const txt = [strong.length ? `חזקים: ${strong.map((x) => MON_LONG[x.m - 1]).join(', ')}` : '', weak.length ? `חלשים: ${weak.map((x) => MON_LONG[x.m - 1]).join(', ')}` : ''].filter(Boolean).join(' · ') || 'בלי עונות חזקות במיוחד';
  void A;
  return `<div class="seasons"><p class="mh">🗓️ עונות בעסק${cal && cal.label ? ` · עכשיו ${esc(cal.label)}${cal.season ? ` (${esc(cal.season)})` : ''}` : ''}</p>
    <div class="sbars" aria-hidden="true">${P.map((x) => `<i class="${x.m === cur ? 'cur' : ''} ${x.mult >= 1.15 ? 'hi' : x.mult <= 0.85 ? 'lo' : ''}" style="--h:${Math.round(((x.mult || 1) / max) * 100)}%"><s></s><small>${MON_SHORT[x.m - 1]}</small></i>`).join('')}</div>
    <p class="note">${esc(txt)}</p></div>`;
}
/** One calendar line for the manage card: now + the strong / weak months (the bars are in "פרטים"). */
function calLine(profile, cal) {
  const P = Array.isArray(profile) && profile.length === 12 ? profile : null; if (!cal || !cal.label) return '';
  const strong = P ? P.filter((x) => x.mult >= 1.15).sort((a, b) => b.mult - a.mult).map((x) => MON_LONG[x.m - 1]) : [];
  return `<p class="note calln">🗓️ עכשיו ${esc(cal.label)}${cal.season ? ` (${esc(cal.season)})` : ''}${strong.length ? ` · חודשים חזקים: ${esc(strong.join(', '))}` : ''}</p>`;
}
/** T3 UI-6: the offer's setups as choices — start capital, 3-month profit AND cash, a loan when needed, the setup's note. */
function bizOfferActions(ev) {
  const d = ev.data || {}; const S = d.setups || [];
  const starts = ev.options.filter((o) => /^start(:|$)/.test(o.id)); const rest = ev.options.filter((o) => !/^start(:|$)/.test(o.id));
  const tile = (o, i) => {
    const su = S.find((x) => x.id === o.id) || {}; const f = su.forecast3 || {};
    const chips = [`<em class="fx">הון ${iso(fmtM(su.startCapital ?? o.startCapital ?? d.startCapital ?? 0))}</em>`,
      f.netProfit != null ? `<em class="fx ${cls(f.netProfit)}">רווח ב־3 חודשים ${iso(sgn(f.netProfit))}</em>` : '',
      f.cashChange != null ? `<em class="fx ${cls(f.cashChange)}">קופה ב־3 חודשים ${iso(sgn(f.cashChange))}</em>` : '',
      o.loanAmount ? `<em class="fx neg">הלוואה ${iso(fmtM(o.loanAmount))}${o.loanMonthly ? ` · ${iso(fmtM(o.loanMonthly))} בחודש` : ''}</em>` : ''].join('');
    return `<div class="opt"><button class="choice setup ${o.primary ? 'primary' : ''}" data-o="${esc(o.id)}" ${o.enabled ? '' : `disabled aria-describedby="swhy${i}"`}><b>${escI(su.label || shortLabel(o))}</b>${o.primary ? '<small class="tagc rec">הבחירה של המנטור</small>' : ''}<span class="fxs">${chips}</span>${su.note ? `<small class="pn">${escI(su.note)}</small>` : ''}</button>${!o.enabled && o.reason ? `<small class="why" id="swhy${i}">${escI(o.reason)}</small>` : ''}</div>`;
  };
  const kind = `<div class="bizkind"><p><b>${gw('אתה עובד בו', 'את עובדת בו')}</b> = הכנסה <b>אקטיבית</b> (משרה נוספת) · 🔋 ${nrg(-(d.ownerEnergy || 0))} בחודש.</p><p><b>עם מנהל</b> = הכנסה <b>פסיבית</b> שנספרת ליעד · 🔋 ${nrg(-(d.managerEnergy || 0))} — אבל משלמים לו משכורת.</p></div>`;
  return `<h3 class="ph">איך פותחים?</h3><div class="choices">${starts.map(tile).join('')}</div>` +
    `<p class="note">"קופה" = כמה מזומן נשאר בעסק אחרי מלאי, לקוחות שעוד לא שילמו ומס. תחזית בלבד — לא הבטחה.</p>` +
    seasonStrip(d.seasonProfile, null, null) + (d.eventsText ? `<p class="note">🎲 ${escI(d.eventsText)}</p>` : '') +
    (d.breakEven && d.breakEven.text ? `<p class="note">⚖️ ${escI(d.breakEven.text)}</p>` : '') +
    `<details class="more bizmore"><summary>איך עובד עסק במשחק</summary>${kind}</details>` + optButtons({ ...ev, options: rest });
}
/** data.biz.l2 of an inbox business card: last month in groups + from profit to cash, one tap away ("פרטים") */
function l2Details(L2) {
  if (!L2) return '';
  const groups = (L2.groups || []).filter((g) => g.amount || g.k === 'profit'); const bridge = (L2.cashBridge || []).filter((x) => x.amount);
  if (!groups.length && !bridge.length) return '';
  return `<details class="more bizl2"><summary>פרטים</summary>${groups.length ? `<p class="mh">החודש האחרון בקבוצות</p>${grid(groups.map((g) => g.k === 'profit' ? `<div class="row"><b>${esc(g.label)}</b>${big(g.amount)}</div>` : row(esc(g.label), sgn(g.amount), cls(g.amount))))}` : ''}${bridge.length ? `<p class="mh">מהרווח לקופה</p><ul class="bridge">${bridge.map((x) => `<li><span>${escI(x.text)}</span>${num(sgn(x.amount), cls(x.amount))}</li>`).join('')}</ul>` : ''}</details>`;
}
/** T3 UI-5: this business's open decisions first (q:<item>:<choice> → resolveStory; the card stays open). */
function bizItemsHtml(ev) {
  const items = (ev.data && ev.data.inbox) || []; if (!items.length) return '';
  return items.map((it) => {
    const dflt = it.options.find((c) => c.default);
    const btn = (c, i) => {
      const id = `q:${it.itemId}:${c.id}`; const o = ev.options.find((x) => x.id === id) || c;
      const od = c.odds && c.odds.text ? oddsText(c.odds.text) : ''; const pv = c.preview && c.preview.delta3;
      const isD = dflt && dflt.id === c.id; const wid = `qwhy${it.itemId}_${i}`;
      return `<div class="opt"><button class="choice stc biz ${isD ? 'dflt' : ''} ${o.primary ? 'primary' : ''}" data-o="${esc(id)}" ${o.enabled ? '' : 'disabled'} aria-describedby="${[!o.enabled ? wid : '', isD ? `qd${it.itemId}` : ''].filter(Boolean).join(' ')}"><b>${escI(c.label)}</b>${isD ? `<small class="tagc dflt">${gz('אם לא תחליט — זה מה שיקרה')}</small>` : ''}<span class="fxs">${!totalsShown() ? '' : pv ? `<em class="fx ${cls(pv)}">ברווח ב־3 חודשים ${iso(sgn(pv))}</em>` : '<em class="fx">בלי שינוי ברווח הצפוי</em>'}${!pv && c.preview && c.preview.why ? `<small class="pn why0">${escI(c.preview.why)}</small>` : ''}${c.effects && c.effects.cash ? `<em class="fx ${cls(c.effects.cash)}">${iso(sgn(c.effects.cash))} עכשיו</em>` : ''}</span>${od ? `<small class="godds"><span aria-hidden="true">🎲</span> ${escI(od)}</small>` : ''}${c.effects && c.effects.note ? `<small class="pn">${escI(c.effects.note)}</small>` : ''}</button>${!o.enabled && (o.reason || c.reason) ? `<small class="why" id="${wid}">${escI(o.reason || c.reason)}</small>` : ''}</div>`;
    };
    return `<section class="bizq" aria-label="${esc(it.title)}"><p class="mh">📬 ${escI(it.title)} ${it.data && it.data.dueText ? `<em class="b due urg">${esc(it.data.dueText)}</em>` : ''}</p>${it.text ? `<p class="d">${escI(it.text)}</p>` : ''}<div class="choices">${it.options.map(btn).join('')}</div>${totalsShown() ? '' : totalsOnDemand(it.options.filter((c) => c.enabled !== false).map((c) => [c.label, c.preview && c.preview.delta3 ? `${num(sgn(c.preview.delta3), cls(c.preview.delta3))} ב־3 חודשים` : 'בלי שינוי ברווח הצפוי']))}${dflt ? `<p class="note dfl" id="qd${it.itemId}">${escI(gz(`אם לא תחליט עד המשכורת הבאה: ${dflt.label}`))}</p>` : ''}</section>`;
  }).join('');
}
/** Business decisions: each one with its 3-month effect on net profit, 🔋 cost and cash you must inject. Stays open until "המשך". */
function bizActions(ev) {
  const biz = ev.options.filter((o) => o.kind === 'biz');
  const sell = ev.options.find((o) => o.id === 'biz:sell');
  const rest = ev.options.filter((o) => o.kind !== 'biz' && o.id !== 'biz:sell' && !/^q:/.test(o.id));
  const tile = (o, i) => {
    const e = o.effects || {}; const dl = e.delta3 || 0;
    const chips = [o.enabled && totalsShown() ? `<em class="fx ${cls(dl)}">${dl ? `${iso(sgn(dl))} ב־3 חודשים` : 'בלי שינוי ברווח'}</em>` : '',
      o.enabled && e.energy ? `<em class="fx">🔋 ${nrg(-Math.abs(e.energy))} בחודש</em>` : '',
      o.cashNeeded > 0 ? `<em class="fx neg">הזרמה מכיסך ${iso(fmtM(o.cashNeeded))}</em>` : ''].join('');
    return `<div class="opt"><button class="choice biz ${o.primary ? 'primary' : ''}" data-o="${esc(o.id)}" ${o.enabled ? '' : `disabled aria-describedby="bwhy${i}"`}><b>${escI(o.label)}</b><span class="fxs">${chips}</span></button>${!o.enabled && o.reason ? `<small class="why" id="bwhy${i}">${escI(o.reason)}</small>` : ''}</div>`;
  };
  const sl = sell && sell.sale ? `<div class="sellrow biz"><div><b>למכור את העסק</b><p class="note">נכנס לך <b class="num pos">${fmtM(sell.sale.net)}</b>${sell.sale.tax ? ` <small>(אחרי מס ${num(fmtM(sell.sale.tax))})</small>` : ''}${sell.sale.text ? `<br>${escI(sell.sale.text)}` : ''}</p></div><button data-o="biz:sell" class="sell" ${sell.enabled ? '' : 'disabled'}>למכור</button></div>` : '';
  const lr = ev.data && ev.data.lastResult;
  const done = lr ? `<p class="okmsg">✔ ${escI(BIZ_DONE[lr.action] || 'ההחלטה נקלטה')} — נכנס לתוקף מהחודש הבא.</p>` : '';
  const items = !!((ev.data && ev.data.inbox) || []).length && !!(ev.data && (ev.data.l1 || (ev.data.summary && ev.data.summary.l1)));   // the open items are in the body (T3 UI-5)
  return `${done}${vlineHtml(evState && evState.verdict)}<h3 class="ph">${items ? 'ועוד החלטות לחודש הזה' : 'מה עושים החודש?'}</h3><div class="choices bizgrid">${biz.map(tile).join('')}</div>${totalsShown() ? '' : totalsOnDemand(biz.filter((o) => o.enabled).map((o) => { const dl = (o.effects || {}).delta3 || 0; return [o.label, dl ? `${num(sgn(dl), cls(dl))} ב־3 חודשים` : 'בלי שינוי ברווח']; }))}${sl}` + optButtons({ ...ev, options: rest });
}

/* ============================================================ v3.2: decision verdict (choose().decision) */
const VERDICT = { strong: ['החלטה חזקה', 'pos'], ok: ['החלטה סבירה', 'ok'], mixed: ['יש מה לשפר', 'mid'], risky: ['החלטה מסוכנת', 'neg'], costly: ['החלטה יקרה', 'neg'] };
export const PRINCIPLE = { cashflow: 'תזרים', cushion: 'כרית ביטחון', debt_cost: 'מחיר החוב', leverage: 'מינוף', rate_risk: 'סיכון ריבית', diversification: 'פיזור', time_in_market: 'זמן בשוק', opportunity_cost: 'מחיר הוויתור', risk_size: 'גודל הסיכון', fees_tax: 'מסים ועמלות', time: 'זמן וכוח', knowledge: 'ידע' };
function verdictParts(d) {
  const [label, c] = VERDICT[d.verdict] || ['ההחלטה שלך', 'mid'];
  let why = String(d.why || '');
  if (d.score >= 85 && /^היה עדיף:/.test(why)) why = why.replace(/^היה עדיף:\s*/, 'קרוב מאוד לטוב ביותר. טיפה עדיף: ');
  const pr = (d.principles || []).map((p) => PRINCIPLE[p]).filter(Boolean)[0];
  return { label, c, why, pr };
}
/** a one-line verdict inside an open card (trade window / business decisions) */
function vlineHtml(d) {
  if (!d) return '';
  const v = verdictParts(d);
  return `<p class="vline ${v.c}" role="status"><b class="num">${Math.round(d.score)}</b><span><b>${esc(v.label)}</b> · ${escI(v.why)}</span></p>`;
}
let vdT = 0;
/** Small, non-blocking verdict pill above the mentor bar after a decision (tap to hide). */
export function verdict(d, { inCard = false } = {}) {
  if (!d || d.score == null) return;
  if (inCard && evState) {
    evState.verdict = d;
    const c = $('#evCard'); if (!c) return;
    c.querySelector('.vline')?.remove();
    const ph = c.querySelector('.bizgrid') && c.querySelector('h3.ph');
    if (ph) ph.insertAdjacentHTML('beforebegin', vlineHtml(d)); else { const h = c.querySelector('#evTitle'); if (h) h.insertAdjacentHTML('afterend', vlineHtml(d)); }
    return;
  }
  overlay('verdict', (done) => {
    let el = $('#verdict');
    if (!el) { el = document.createElement('div'); el.id = 'verdict'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    const v = verdictParts(d);
    const hide = () => { clearTimeout(vdT); el.className = v.c; done(); };
    el.onclick = hide;
    el.innerHTML = `<b class="vs num">${Math.round(d.score)}</b><div><small>${esc(v.label)}${v.pr ? ` · ${esc(v.pr)}` : ''}</small><span>${escI(v.why)}</span></div>`;
    const bar = $('#bar')?.getBoundingClientRect();
    if (bar) { el.style.bottom = Math.round(innerHeight - bar.top + 8) + 'px'; el.style.left = Math.round(bar.left + bar.width / 2) + 'px'; }
    el.className = 'on ' + v.c;
    clearTimeout(vdT);
    vdT = setTimeout(hide, Math.min(6000, 2600 + v.why.length * 35) * Math.max(0.7, speed) * (phoneQ() ? 0.8 : 1));
  });
}
const cnt = (n, one, many) => (n === 0 ? `אין ${many}` : n === 1 ? `${one} אחד` : `${n} ${many}`);
const FEM = new Set(['הריבית', 'ההשפעה']);
/** "X עלה/ירד/לא זז" with gender agreement (הריבית עלתה, הדולר עלה). */
const moved = (what, dir) => { const f = FEM.has(what); return dir === 0 ? `${what} ${f ? 'לא זזה' : 'לא זז'}` : `${what} ${dir > 0 ? (f ? 'עלתה' : 'עלה') : (f ? 'ירדה' : 'ירד')}`; };
function fromTo(a, b, f, what, goodDir) {
  const dir = Math.sign(b - a); const good = goodDir ? dir * goodDir : 0;
  return `<div class="fromto"><span class="num">${f(a)}</span><i class="${good > 0 ? 'pos' : good < 0 ? 'neg' : ''}">${dir > 0 ? ICON.up : dir < 0 ? ICON.down : '='}</i><b class="num ${good > 0 ? 'pos' : good < 0 ? 'neg' : ''}">${f(b)}</b><small>${moved(what, dir)}</small></div>`;
}

/** Index fund: price path so far + the engine's projection RANGE (p10/p50/p90, invest.js projectRange) — never a promised return. */
/** the compounding box for any index-fund view (game.js index modal) — engine data only */
export function indexBox(ix) { return ix && ix.projection ? compoundBox(ix) : ''; }
function compoundBox(d) {
  const hist = (d.history && d.history.length > 1 ? d.history : null);
  const P = d.projection;
  let range = '';
  if (P && P.p50) {
    const mx = Math.max(P.p90 || 0, 1);
    const bar = (lbl, v, c) => `<div><i class="${c}" style="height:${Math.max(6, (v / mx) * 70)}px"><s style="height:${Math.min(100, (P.contributed / Math.max(1, v)) * 100)}%"></s></i><small>${lbl}</small><b class="num">${fmtC(v)}</b></div>`;
    range = `<p class="note c">${num(fmtM(P.monthly))} בחודש במשך ${P.years} שנה (שמת ${num(fmtC(P.contributed))}) — לאן זה יכול להגיע:</p>
      <div class="cbars">${bar('תרחיש רע', P.p10, 'lo')}${bar('תרחיש אמצעי', P.p50, 'mid')}${bar('תרחיש טוב', P.p90, 'hi')}</div>
      ${P.lossChance != null ? `<p class="note c">סיכוי לסיים מתחת למה ששמת: ${num(Math.round(P.lossChance * 100) + '%')}</p>` : ''}
      <p class="note">${escI(P.text || P.note || '')} החלק הכהה = מה ששמת; השאר = תשואה על תשואה.</p>`;
  }
  return `<div class="comp"><p class="mh">📈 קרן מחקה מדד — ריבית דריבית (בלי הבטחות)</p>${hist ? spark(hist, { color: 'var(--green)', w: 300, h: 40 }) : ''}${range}</div>`;
}

/* ---------- CATALOG-25 §3.9: light candle view. game.js registers the source (js/candlelog.js view model, built from the prices
   the game really had); the UI only draws it: a compact chart in the trade card and the full view (💼 / the report / the card). */
let candleSrc = null;
/** fn() → Promise<view model | null> (js/candlelog.js viewModel) */
export function setCandleSource(fn) { candleSrc = typeof fn === 'function' ? fn : null; }
function fillCandles(ev) {
  const host = $('#qCdl'); if (!host || !candleSrc) return;
  const id = ev.id, tk = ev.data && ev.data.ticker;
  Promise.resolve(candleSrc()).then((vm) => {
    if (!vm || !evState || evState.ev.id !== id || !host.isConnected) return;
    const s = vm.list.find((x) => x.tk === tk); if (!s) return;
    host.innerHTML = cdlMini(s); host.hidden = false;
    cdlMount(host.querySelector('.cdl-host'), s, { compact: true });
  }).catch((e) => console.warn('candles', e));
}
/** the full view (a dialog over whatever is open); key = a listing key or a ticker (null → the first listing) */
export async function candlesFull(key = null) {
  if (!candleSrc) return;
  let vm = null; try { vm = await candleSrc(); } catch (e) { console.warn('candles', e); }
  if (!vm || !vm.list.length) { toast('אין כאן ניירות ערך למעקב'); return; }
  const all = vm.list.concat(vm.ended);
  let cur = (all.find((s) => s.key === key) || all.find((s) => s.tk === key) || vm.list[0]).key;
  let chart = null;
  const mount = (c) => { const s = all.find((x) => x.key === cur); const host = c.querySelector('.cdl-body .cdl-host'); if (chart) chart.destroy(); chart = s && host ? cdlMount(host, s, {}) : null; };
  await modal({ tag: '📈 מחירים ונרות', color: '#2459b8', title: 'איך זזו המחירים', cls: 'cdlm', wide: true, html: cdlFull(vm, cur), dismissable: true,
    actions: [{ label: 'סגירה', cls: 'primary' }], onOpen: (c) => mount(c),
    onExtra: (e) => {
      const b = e.target.closest('[data-cdl-tab]'); if (!b) return;
      cur = b.dataset.cdlTab; sfx('click');
      const c = $('#gmCard'); const f = c.querySelector('.cdl-full'); if (!f) return;
      f.outerHTML = cdlFull(vm, cur); mount(c);
      c.querySelector(`[data-cdl-tab="${CSS.escape(cur)}"]`)?.focus({ preventScroll: true });
    } });
  if (chart) chart.destroy();
}

/* ---------- trade window (v1.1: slider dir=ltr, clamp, ±steps, max/all/reset, repeated buy/sell, 'סיום') */
function tradeHtml(ev) {
  const d = ev.data; const [s1, s2] = d.step || [10, 100]; const u = esc(d.unit);
  return `${head(ev)}${vlineHtml(evState && evState.verdict)}<div class="grid"><div class="row"><span>${esc(d.name)}</span><b class="big num" id="qprice">${fmtP(d.price)}</b></div>
    <div class="row"><span>יש לך</span><span class="num rtl" id="qhold"></span></div><div class="row" id="qgainRow" hidden><span>${gz('אם תמכור הכל עכשיו')}</span><b class="num" id="qgain"></b></div><div class="row"><span>מזומן</span><span class="num" id="qcash"></span></div>
    ${d.div ? `<div class="row"><span>תשלום חודשי ליחידה</span><span class="num pos">${fmtP(d.div)}</span></div>` : ''}</div>
    <div class="cdl-mini" id="qCdl" data-tk="${esc(d.ticker)}" hidden></div>
    ${d.ticker === 'IDX' || d.kind === 'index' || d.index ? compoundBox(d) : ''}${realityLine(d)}
    ${d.wiped && d.wiped.qty ? `<p class="warn">המטבע הקודם (${esc(d.wiped.oldName)}) מת: ${N(d.wiped.qty)} יחידות ששוות היו ${num(fmtM(d.wiped.value))} — נמחקו.</p>` : ''}
    <label class="sr" for="qs">כמות ${u}</label><input type="range" id="qs" dir="ltr" min="0" step="1" value="0">
    <div class="qty" dir="ltr"><button data-q="${-s2}">−${N(s2)}<span class="sr"> ${u}</span></button><button data-q="${-s1}">−${N(s1)}<span class="sr"> ${u}</span></button><output id="qv" aria-live="polite">0</output><button data-q="${s1}">+${N(s1)}<span class="sr"> ${u}</span></button><button data-q="${s2}">+${N(s2)}<span class="sr"> ${u}</span></button></div>
    <div class="qty chips"><button class="chip" data-q="max">מקסימום לקנייה</button><button class="chip" data-q="all">כל ה${u} שלי</button><button class="chip" data-q="zero">איפוס</button></div>
    <p class="note c" id="qinfo"></p><p class="err" role="alert" id="qerr"></p>
    <div class="acts trade">${(() => { const P = (id) => (ev.options || []).some((o) => o.id === id && o.primary); const M = mentorOf(); const guide = !M || M.level === 'guide';
      const pb = P('buy'), ps = P('sell'), pd = P('done') || (guide && !pb && !ps); // hint / pro: no highlighted button at all
      return `<button data-o="buy" class="${pb ? 'primary' : ''}">לקנות</button><button data-o="sell" class="sell${ps ? ' primary' : ''}">למכור</button><button data-o="done" class="${pd ? 'primary' : ''}">סיום</button>`; })()}</div>
    <p class="note c">אפשר לקנות ולמכור כמה פעמים. טעית? אפשר למכור באותו מחיר. כשמסיימים — "סיום".</p>`;
}
function tradeUpd(fromEvent = false) {
  if (!evState || evState.ev.type !== 'trade') return;
  const d = evState.ev.data; const c = $('#evCard');
  const s1 = (d.step || [10])[0];
  // first tap must do something: start from one step (what you can afford; else what you can sell)
  if (fromEvent) evState.q = d.maxBuy > 0 ? Math.min(s1, d.maxBuy) : d.maxSell > 0 ? Math.min(s1, d.maxSell) : 0;
  const sayEl = $('#evSay'); if (sayEl && evState.ev.mentor) sayEl.innerHTML = escI(gz(evState.ev.mentor));
  const lim = Math.max(d.maxBuy, d.maxSell);
  let q = Math.max(0, Math.min(Math.round(evState.q) || 0, lim)); evState.q = q;
  $('#qv').value = N(q); $('#qv').textContent = N(q);
  const sl = $('#qs'); sl.max = String(lim); sl.value = String(q); sl.disabled = !lim; sl.setAttribute('aria-valuetext', `${N(q)} ${d.unit}`);
  $('#qprice').textContent = fmtP(d.price);
  $('#qhold').textContent = `${N(d.qty)} ${d.unit} · ${fmtM(d.holdingValue)}${d.qty ? ` · קנית בממוצע ${fmtP(d.avg)}` : ''}`;
  $('#qcash').textContent = fmtM(d.cash);
  $('#qgainRow').hidden = !d.qty;
  if (d.qty) {
    const g = $('#qgain'); const ug = d.unrealizedGain ?? 0; // engine numbers only (audit D3/D4)
    const taxTxt = ug > 0 && d.unrealizedTax ? ` <small class="mut">(מס רווחי הון: ${fmtM(-d.unrealizedTax)})</small>` : ug > 0 && d.taxRate ? ` <small class="mut">(על הרווח משלמים מס רווחי הון ${Math.round(d.taxRate * 100)}%)</small>` : '';
    g.innerHTML = `${(ug > 0 ? '+' : '') + fmtM(ug)}${taxTxt}`; g.className = 'num rtl ' + cls(ug);
  }
  const lr = d.lastResult;
  const last = lr && fromEvent ? `${lr.action === 'buy' ? 'קנית' : 'מכרת'} ${N(lr.qty)} ב־${iso(fmtP(lr.price))}. ` : '';
  $('#qinfo').innerHTML = q ? `${last}עסקה של <b class="num">${fmtM(q * d.price)}</b>${d.div ? ` · ${num(sgn(q * d.div), 'pos')} בחודש` : ''}` : last ? `${last}אפשר להמשיך או לסיים.` : gw('בחר', 'בחרי') + ' כמות עם הסרגל או הכפתורים';
  $('#qerr').textContent = '';
  const bb = c.querySelector('[data-o="buy"]'), sb = c.querySelector('[data-o="sell"]');
  bb.disabled = !q || q > d.maxBuy; sb.disabled = !q || q > d.maxSell;
  bb.textContent = q && q <= d.maxBuy ? `לקנות ${N(q)}` : 'לקנות';
  sb.textContent = q && q <= d.maxSell ? `למכור ${N(q)}` : 'למכור';
  bb.title = !d.maxBuy ? 'אין מספיק מזומן' : ''; sb.title = !d.maxSell ? 'אין לך מה למכור' : '';
  c.querySelector('[data-q="max"]').disabled = !d.maxBuy; c.querySelector('[data-q="all"]').disabled = !d.maxSell;
}

/* ============================================================ free screen area for the camera */
export function freeRect() {
  const W = innerWidth, H = innerHeight;
  const hud = $('#hud')?.getBoundingClientRect(); const bar = $('#bar')?.getBoundingClientRect(); const sh = $('#sheet');
  let x0 = 0, x1 = W, y0 = hud ? hud.bottom + 4 : 0, y1 = bar ? bar.top - 4 : H;
  if (sh && getComputedStyle(sh).position === 'fixed' && W > 820) {
    const r = sh.getBoundingClientRect();
    if (r.width && r.left > W / 2) x1 = r.left - 6; else if (r.width) x0 = r.right + 6;
  }
  if (y1 - y0 < 200) { y0 = Math.max(0, y1 - 200); }
  return { x0, y0, x1, y1 };
}


/* ============================================================ v3: ⚡ roll-energy chip */
export function renderRollEnergy(g, msNext) {
  const b = $('#hEnergy'); if (!b) return;
  const re = $('#rollEn');
  if (!g) { b.hidden = true; if (re) re.hidden = true; return; }
  if (re) { re.hidden = false; re.textContent = `⚡${g.value}`; re.className = g.value <= 3 ? 'low' : ''; }
  b.hidden = false;
  $('#hEnVal').textContent = `${g.value}`;
  b.classList.toggle('low', g.value <= 3); b.classList.toggle('empty', g.value <= 0);
  const t = $('#hEnT');
  if (g.value < g.max && msNext > 0) { const s = Math.ceil(msNext / 1000); t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } else t.textContent = '';
  b.title = `⚡ ${g.value}/${g.max} זריקות — כל הטלה עולה זריקה אחת`;   // T4 N15
  // T4 N15 + T7 label-in-name: the accessible name starts with the visible "⚡25" and ends with a hidden "זריקות מתוך 25"
  b.removeAttribute('aria-label');
  const sr = $('#hEnSr'); if (sr) sr.textContent = ` זריקות מתוך ${g.max}`;
}

/* ============================================================ v3: lessons unlocked */
export function lessonToast(list, onOpen) {
  (list || []).map(displayLesson).forEach((l, i) => {   // wave 3a: display overrides (js/data/lessons-meta.js LESSON_DISPLAY)
    const text = `📚 שיעור חדש בספרייה: ${l.title}`; const action = onOpen ? { label: 'לקרוא', fn: () => onOpen(l) } : null;
    if (!phoneQ()) { setTimeout(() => toast(text, { kind: 'gold', action, keep: true }), i * 1400); return; }   // §4.7: lessons are never dropped
    // phones: one floating thing at a time (the lesson waits for a coach / achievement / verdict to clear)
    const ms = Math.round(Math.max(1300, Math.min(3200, 900 + text.length * 38)) * (action ? 2.4 : 1));
    overlay('lesson', (done) => { toast(text, { kind: 'gold', action, ms, keep: true }); setTimeout(done, ms + 300); });
  });
}
/** One lesson as a reading card (in-game). */
/** One lesson as a reading card (in-game). T4 CR-U-T4-10: S-B2 (long text → עוד ▾), S-B3 example, S-B4 where you learned it,
 *  S-B5 the game's simplification, S-B6 practice — from library.js (lobby lane; loaded lazily, every line optional). */
export async function lessonCard(l) {
  l = displayLesson(l);
  let LIB = null, PR = null;
  try { [LIB, PR] = await Promise.all([import('./library.js'), import('./practice.js').catch(() => null)]); } catch (e) { LIB = null; }
  const m = (LIB && LIB.meta && LIB.meta(l.id)) || {}; const ctx = l.ctx || (LIB && LIB.contextOf && LIB.contextOf(l.id)) || null;
  const t = String(l.text || '');
  const text = t.length > 160 ? `<p class="lesson">${escI(t.slice(0, 150).replace(/\s+\S*$/, ''))}…</p><details class="lmore"><summary>עוד ▾</summary><p class="lesson">${escI(t)}</p></details>` : `<p class="lesson">${escI(t)}</p>`;
  const lines = [];
  if (m.example) lines.push(`<p class="ls-line">🔢 דוגמה: ${escI(m.example)}</p>`);
  if (ctx && ctx.m != null) lines.push(`<p class="ls-line">📍 למדת את זה בחודש ${num(String(ctx.m))}${ctx.ev ? ` — "${escI(ctx.ev)}"` : ''}${ctx.num && ctx.num.label && ctx.num.value != null ? ` · ${escI(ctx.num.label)} ${escI(typeof ctx.num.value === 'number' ? fmtM(ctx.num.value) : String(ctx.num.value))}` : ''}</p>`);
  if (m.sim) lines.push(`<p class="ls-line">🎲 פישוט של המשחק: ${escI(m.sim)}</p>`);
  try {
    const st = LIB && LIB.practiceStats ? LIB.practiceStats() : {}; let n = 0, r = 0;
    const topics = PR && PR.PRACTICE ? [...new Set(PR.PRACTICE.filter((x) => (x.after || []).includes(l.id)).map((x) => x.topic))] : [];
    for (const tp of topics) if (st[tp]) { n += st[tp].n || 0; r += st[tp].right || 0; }
    if (n) lines.push(`<p class="ls-line">💡 תרגלת: ${r} מתוך ${n} נכונות</p>`);
  } catch (e) { /* optional */ }
  return modal({ tag: 'ספריית השיעורים', color: '#7c3aed', title: l.title, html: text + lines.join(''), actions: [{ label: 'הבנתי', cls: 'primary' }], dismissable: true });
}

/* ============================================================ T2: monthly focus picker (HUD chip + payday / education card) */
/** focusPicker(block, {level}) → Promise<{id, slot}|null>. block = metrics().focus (engine). Tiles: icon, label, cost chips,
 *  one benefit line, one "לא כדאי כש…" line, disabled reason; guide only: the suggested tile. Agenda slots are free. */
export function focusPicker(F, { level = 'hint', slot: slot0 = null } = {}) {
  if (!F) return Promise.resolve(null);
  let slot = slot0 != null ? slot0 : F.locked ? 1 : 0, sel = null;
  const ag = (n) => (F.agenda || []).find((x) => x.slot === n) || { id: null, label: null };
  const costChips = (o) => {
    const c = [], k = o.cost || {};
    if (k.energy) c.push(`<em class="fx neg">🔋 ${iso('−' + k.energy)}</em>`);
    if (k.happiness) c.push(`<em class="fx ${k.happiness > 0 ? 'neg' : 'pos'}">😊 ${iso((k.happiness > 0 ? '−' : '+') + Math.abs(k.happiness))}</em>`);
    if (k.cash) c.push(`<em class="fx neg">${iso('−' + fmtM(k.cash))}</em>`);
    return c.join('') || '<em class="fx">חינם</em>';
  };
  const tile = (o) => {
    const curM = slot === 0 && F.current.id === o.id && o.id !== 'none';
    const off = slot === 0 ? (!o.enabled || F.locked) : false;
    const now = slot !== 0 && !o.enabled && o.reason ? `<small class="why">כרגע: ${escI(o.reason)}</small>` : '';
    return `<button type="button" class="ftile ${sel === o.id ? 'sel' : ''} ${curM ? 'cur' : ''}" data-fid="${esc(o.id)}" aria-pressed="${sel === o.id}" ${off ? 'disabled' : ''}>
      <span class="fhd"><span class="fi" aria-hidden="true">${FOCUS_ICON_ID[o.icon] || FOCUS_ICON[o.id] || '🎯'}</span><b>${esc(o.label)}</b>${curM ? '<small class="tagc">נבחר לחודש הזה</small>' : o.suggested && level === 'guide' ? '<small class="tagc rec">המנטור ממליץ</small>' : ''}</span>
      <span class="fxs">${costChips(o)}</span><small class="fb">${escI(o.benefit || '')}</small>${o.notBest && o.notBest !== '—' ? `<small class="fn">${escI(o.notBest)}</small>` : ''}
      ${slot === 0 && !o.enabled && o.reason ? `<small class="why">${escI(o.reason)}</small>` : now}</button>`;
  };
  const slots = () => `<div class="fslots" role="group" aria-label="לאיזה חודש?">${[[0, 'החודש', F.current.id === 'none' ? (F.locked ? 'חודש רגיל' : 'עוד לא נבחר') : F.current.label], [1, 'בחודש הבא', ag(1).label || 'ללא'], [2, 'בעוד חודשיים', ag(2).label || 'ללא']]
    .map(([n, t, v]) => `<button type="button" class="fslot" data-slot="${n}" aria-pressed="${slot === n}"><b>${t}</b><small>${esc(v)}</small></button>`).join('')}</div>`;
  const body = () => `${slots()}
    ${slot === 0 && F.locked ? `<p class="note">כבר בחרת מוקד לחודש הזה (${esc(F.current.label)}). אפשר לתכנן את החודשים הבאים — זה בחינם.</p>` : slot ? '<p class="note">תכנון לחודש שיבוא: בלי תשלום עכשיו. ביום המשכורת המוקד נכנס לתוקף ומשלמים עליו.</p>' : '<p class="note">משלמים עכשיו, והמוקד פועל עד יום המשכורת. מוקד אחד בחודש.</p>'}
    <div class="ftiles">${F.options.filter((o) => slot === 0 || o.id !== 'none').slice().sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0)).map(tile).join('')}</div>
    ${slot ? `<button type="button" class="chip fnone" data-fid="none">ללא</button>` : ''}`;
  let root = null;
  const paint = (keep) => { if (!root) return; root.querySelector('.fbody').innerHTML = body(); if (keep) root.querySelector(keep)?.focus({ preventScroll: true }); const go = root.querySelector('.acts button[data-i="0"]'); if (go) { go.disabled = !sel; go.textContent = sel ? `לבחור: ${(F.options.find((o) => o.id === sel) || { label: 'ללא' }).label}` : 'לבחור'; } };
  return modal({ tag: 'מוקד החודש', color: '#0e7490', title: gz('על מה תשים את הראש החודש?'), wide: true, cls: 'fpick', dismissable: true,
    html: `<div class="fbody">${body()}</div>`,
    actions: [{ label: 'לבחור', cls: 'primary', v: 'go', dis: true }, { label: 'סגירה', v: null }],
    onOpen: (c) => { root = c; setTimeout(() => { c.scrollTop = 0; c.querySelector('.fslot[aria-pressed="true"]')?.focus({ preventScroll: true }); }, 80); },
    onExtra: (e) => {
      const sl = e.target.closest('[data-slot]'); if (sl) { slot = +sl.dataset.slot; sel = null; sfx('click'); paint(`[data-slot="${slot}"]`); return; }
      const t = e.target.closest('[data-fid]'); if (!t || t.disabled) return;
      sel = t.dataset.fid; sfx('click'); paint(`[data-fid="${sel}"]`);
      if (sel === 'none' && slot) root.querySelector('.acts button[data-i="0"]')?.click(); // "ללא" clears the slot at once
    } }).then((v) => (v === 'go' && sel ? { id: sel, slot } : null));
}

/* ============================================================ T2: mentor level (free / history; the engine refuses elsewhere) */
export async function mentorPicker(M, { locked = false, levels = null } = {}) {
  const L = levels || {};
  if (locked) {
    await modal({ tag: 'רמת המנטור', color: '#7c3aed', title: `המנטור: ${M ? M.label : ''}`, html: '<p class="d">בדירוג כולם משחקים באותה רמה. מספר הרמזים מופיע בטבלה.</p>', actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true });
    return null;
  }
  let pick = null;
  const ids = ['guide', 'hint', 'pro'].filter((id) => L[id]);
  const v = await modal({ tag: 'רמת המנטור', color: '#7c3aed', title: gz('כמה עזרה תרצה?'), dismissable: true, cls: 'mpick',
    html: `<div class="mlevels">${ids.map((id) => `<button type="button" class="mlevel ${M && M.level === id ? 'cur' : ''}" data-lv="${id}" ${M && M.level === id ? 'aria-current="true"' : ''}><b>${esc(L[id].label)}</b>${M && M.level === id ? '<small class="tagc">עכשיו</small>' : ''}<small>${esc(L[id].desc || '')}</small></button>`).join('')}</div>
      ${M ? `<p class="note">רמזים עד עכשיו: ${num(String(M.hintsUsed || 0))}. השינוי נרשם בניתוח שבסוף.</p>` : ''}`,
    actions: [{ label: 'סגירה', cls: 'primary', v: null }],
    onExtra: (e) => { const b = e.target.closest('[data-lv]'); if (!b) return; pick = b.dataset.lv; $('#gm .acts button')?.click(); } });
  void v;
  if (!pick || (M && pick === M.level)) return null;
  const ok = await confirmBox(`לעבור לרמה "${L[pick].label}"? ${L[pick].desc || ''}`, { yes: 'כן, לעבור', no: 'ביטול', title: 'רמת המנטור' });
  return ok ? pick : null;
}

/* ============================================================ T2: economy gauge — HUD chip → modal, and a sheet box */
/** T2 verify D2: the official figure's age is the engine's `officialLag` (1 month with the research focus, else 3) — no UI-side number. */
const lagTxt = (n) => { const k = Number.isFinite(+n) ? Math.max(0, Math.round(+n)) : 3; return k === 0 ? 'מהחודש הזה' : k === 1 ? 'מלפני חודש' : k === 2 ? 'מלפני חודשיים' : `מלפני ${k} חודשים`; };
function econBlockHtml(X, big = false) {
  const off = X.official && X.official.length ? X.official[X.official.length - 1] : null;
  const hist = (X.hist || []).map((h) => h.s);
  const w = 280, h = 44;
  const line = hist.length > 1 ? `<svg class="espark" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" aria-hidden="true"><line x1="0" x2="${w}" y1="${h - 0.33 * h}" y2="${h - 0.33 * h}" class="g1"/><line x1="0" x2="${w}" y1="${h - 0.62 * h}" y2="${h - 0.62 * h}" class="g2"/><polyline points="${hist.map((v, i) => `${(i / (hist.length - 1)) * (w - 4) + 2},${(h - 2 - (v / 100) * (h - 4)).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round"/></svg>` : '';
  const tr = X.trend > 0 ? '↗' : X.trend < 0 ? '↘' : '→';
  return `<div class="econ ${big ? 'big' : ''}" role="img" aria-label="מד הכלכלה: ${esc(X.label)}, ${X.signal} מתוך 100">${gaugeSvg(X.signal, big ? 120 : 64)}<div><b>${esc(X.label)} <span aria-hidden="true">${tr}</span></b><small class="num">${X.signal}/100</small></div></div>
    ${X.sharp ? `<p class="chipline"><em class="b ok">🔬 מדויק יותר עד חודש ${X.sharpUntil}</em></p>` : ''}
    ${line}<p class="note">נתון רשמי (${lagTxt(X.officialLag)}): <b>${off ? esc(off.label) : 'עוד לא פורסם'}</b>${off && off.m ? ` <small>· על חודש ${num(String(off.m))}</small>` : ''}</p>
    ${X.report && X.report.text ? `<p class="note erep"><span aria-hidden="true">🔬</span> ${escI(X.report.text)}</p>` : ''}<p class="note">${escI(X.text || '')}</p>`;
}
export function econModal(X) {
  if (!X) return Promise.resolve();
  return modal({ tag: 'מד הכלכלה', color: '#2459b8', title: 'מה קורה בכלכלה?', html: econBlockHtml(X, true), actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true });
}

/* ============================================================ T2 §15.9: the end-of-game analysis (inserted into the end screen) */
const VERD_L = { strong: 'חזקה', ok: 'סבירה', mixed: 'יש מה לשפר', risky: 'מסוכנת', costly: 'יקרה' };
/** what you chose, in words: the decision record keeps the option id; ids that read as words stay, the rest get a name */
const OPT_NAME = { 'inspect:1': 'בדיקה בסיסית', 'inspect:2': 'בדיקה מקצועית', pass: 'ויתור', buy: 'קנייה', buyVar: 'קנייה בריבית משתנה', buyFix: 'קנייה בריבית קבועה', buyHedge: 'קנייה עם גידור', pay: 'תשלום', inst3: '3 תשלומים', credit: 'אשראי', sub: 'מנוי', skip: 'ויתור', ok: 'להמשיך', save: 'הפקדה לקרן', raise: 'בקשת העלאה', start: 'פתיחת העסק', refi: 'קיבוע ריבית', report: 'פתיחת תיק' };
const optName = (r) => { const o = String(r.o ?? ''); if (!o) return ''; if (OPT_NAME[o]) return OPT_NAME[o]; const m = /^offer:(\d+)/.exec(o); if (m) return `הצעה ${m[1]}% פחות`; if (r.type === 'focus' && FOCUS_LABEL[o]) return FOCUS_LABEL[o]; return /^[a-z][\w:.-]*$/i.test(o) ? '' : o; };
const FOCUS_LABEL = { scout: 'חיפוש עסקאות', debt: 'סדר בחובות', ops: 'יום עבודה על העסק', frugal: 'ביקורת הוצאות', network: 'קשרים', research: 'מעקב אחרי הכלכלה', none: 'חודש רגיל' };
const LUCK_L = { dd: 'הפתעות בעסקאות', cycle: 'מצב הכלכלה' };
export function endAnalysisHtml(end) {
  if (!end) return '';
  const L = end.learning || null; const R = end.ddRecap || null; const P = end.econPath || null;
  if (!L && !(R && R.length) && !P) return '';
  const pro = L && L.mentor === 'pro';
  const out = [];
  if (L) {
    const bh = L.byHint || {}; const w = bh.withHint || {}, wo = bh.without || {};
    const hints = L.mentor !== 'pro' || L.hints ? `<p class="ea-l">💡 רמזים: <b class="num">${L.hints || 0}</b>${w.n ? ` · עם רמז ${num(String(w.avg))} (${w.n}) · בלי רמז ${num(String(wo.avg ?? '—'))} (${wo.n || 0})` : ''}</p>` : '';
    const lc = (L.levelChanges || []).length ? `<p class="ea-l">🧭 החלפת רמה: ${L.levelChanges.map((x) => `חודש ${x.m}`).join(', ')}</p>` : '';
    const parts = L.luck && L.luck.parts ? Object.entries(L.luck.parts).filter(([k, v]) => LUCK_L[k] && v) : [];
    const luck = parts.length ? `<p class="ea-l">🎲 מזל: ${parts.map(([k, v]) => `${LUCK_L[k]} ${num(sgn(v), cls(v))}`).join(' · ')}</p>` : '';
    const rv = (L.review || []).slice(); const list = pro ? rv : rv.slice().sort((a, b) => (a.score ?? 100) - (b.score ?? 100)).slice(0, 5);
    const items = list.map((r) => `<li class="${(r.score ?? 100) < 60 ? 'low' : ''}"><span class="sc num">${Math.round(r.score ?? 0)}</span><span><b>${escI(r.c || '')}</b>${optName(r) ? ` · ${escI(optName(r))}` : ''}${r.hinted ? ' <em class="b">רמז</em>' : ''}<small>${VERD_L[r.verdict] ? esc(VERD_L[r.verdict]) + ' · ' : ''}${escI(r.why || '')}${r.best && (r.score ?? 100) < 85 && !/עדיף/.test(r.why || '') ? ` · הכי טוב היה: ${escI(r.best)}` : ''}</small></span></li>`).join('');
    out.push(`${hints}${lc}${luck}${items ? `<h4>${pro ? 'כל ההחלטות' : '5 ההחלטות ששווה לחשוב עליהן'}</h4><ol class="ea-rev">${items}</ol>` : ''}`);
  }
  if (R && R.length) {
    out.push(`<h4>🔎 מוצהר מול בפועל</h4><table class="ea-dd"><thead><tr><th scope="col">נכס</th><th scope="col">מוצהר</th><th scope="col">בפועל</th></tr></thead><tbody>${R.map((x) => `<tr><th scope="row">${escI(x.name)}${x.level ? ` <small>${x.level === 2 ? 'נבדק' : 'בדיקה בסיסית'}</small>` : ''}</th><td>${num(sgn(x.claimedCf))}</td><td>${num(sgn(x.cf), cls(x.cf - x.claimedCf))}${x.repair ? `<small> · תיקונים ${num(fmtM(x.repair))}</small>` : ''}</td></tr>`).join('')}</tbody></table>${end.ddPassed ? `<p class="note">ויתרת על ${end.ddPassed} עסקאות אחרי בדיקה.</p>` : ''}`);
  }
  if (P && P.truth && P.truth.length > 1) {
    const T = P.truth, S = P.signal || [], n = T.length, w = 300, h = 60;
    const PH = { exp: 'var(--green)', slow: '#d6a01e', rec: 'var(--red)', recov: 'var(--blue)' };
    const bw = w / n;
    const bands = T.map((x, i) => `<rect x="${(i * bw).toFixed(1)}" y="${h - 12}" width="${(bw + 0.5).toFixed(1)}" height="12" fill="${PH[x.phase] || 'var(--mut)'}"/>`).join('');
    const pts = S.map((x) => `${(((x.m - 1) / Math.max(1, n - 1)) * (w - 4) + 2).toFixed(1)},${(h - 16 - (x.s / 100) * (h - 20)).toFixed(1)}`).join(' ');
    const seen = [...new Set(T.map((x) => x.label))];
    out.push(`<h4>📊 ${escI(P.text || 'עכשיו אפשר לראות מה באמת היה')}</h4><svg class="ea-econ" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="מצב הכלכלה לאורך המשחק: ${esc(seen.join(', '))}">${bands}<polyline points="${pts}" fill="none" stroke="var(--ink)" stroke-width="1.6"/></svg>
      <p class="ea-legend">${seen.map((lb) => { const ph = (T.find((x) => x.label === lb) || {}).phase; return `<span><i style="background:${PH[ph] || 'var(--mut)'}"></i>${esc(lb)}</span>`; }).join('')}<span><i class="ln"></i>מה שהמד הראה</span></p>`);
  }
  return `<details class="end-analysis" ${pro ? 'open' : ''}><summary><span>🔎 ניתוח</span><small>${pro ? 'כל ההחלטות שלך' : 'החלטות, מזל ומה באמת היה'}</small></summary>${out.join('')}</details>`;
}

/* ============================================================ T4: practice chip (§10.1, feature-detected: onboard.js calls it when the engine has E.practiceDue) */
let practiceEl = null;
export function practiceChip(q, onAnswer) {
  hidePractice();
  const ctrls = $('#bar .ctrls'); if (!ctrls || !q) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip practice'; b.id = 'practiceChip';
  b.setAttribute('aria-label', 'שאלת תרגול קצרה, לא חובה — 💡 שאלת רגע'); b.textContent = '💡 שאלת רגע';
  ctrls.insertBefore(b, $('#sheetBtn')); practiceEl = b;
  announce('יש שאלת תרגול קצרה ליד כפתור ההטלה, לא חובה');
  b.onclick = async () => {
    hidePractice();
    let done = false;
    const html = `<p class="lesson">${escI(q.q || '')}</p><div class="pans">${(q.answers || []).map((a, i) => `<button type="button" data-pa="${i}">${escI(a)}</button>`).join('')}</div><p class="note">לא משפיע על הכסף במשחק.</p><div class="pres" aria-live="polite"></div>`;
    await modal({ tag: `💡 שאלת רגע${q.topicName ? ' · ' + q.topicName : ''}`, color: '#0e7490', html, dismissable: true, cls: 'practice',
      actions: [{ label: 'דלג', v: null }],
      onExtra: async (e) => {
        const a = e.target.closest('[data-pa]'); if (!a || done) return;
        done = true; const idx = +a.dataset.pa; let r = null;
        try { r = await onAnswer(idx); } catch (x) { console.error(x); }
        const card = $('#gmCard'); card.querySelectorAll('[data-pa]').forEach((x) => { x.disabled = true; });
        if (r && r.ok) {
          const right = card.querySelector(`[data-pa="${r.correct}"]`); if (right) { right.insertAdjacentHTML('afterbegin', '✓ '); right.classList.add('right'); }
          if (!r.right) { a.insertAdjacentHTML('afterbegin', '✗ '); a.classList.add('wrong'); }   // the picked answer stays readable (icon + word, not colour only)
          card.querySelector('.pres').innerHTML = `<p class="${r.right ? 'pos' : 'neg'}"><b>${r.right ? '✓ נכון!' : '✗ לא בדיוק.'}</b> ${escI(r.why || '')}</p>${r.sim ? `<p class="note">🎲 מספרים של משחק: ${escI(r.sim)}</p>` : ''}`;
          announce(r.right ? 'נכון!' : 'לא בדיוק');
        }
        const btn = card.querySelector('.acts button'); if (btn) { btn.textContent = 'ממשיכים'; btn.classList.add('primary'); btn.focus(); }
      } });
  };
}
export function hidePractice() { if (practiceEl) { practiceEl.remove(); practiceEl = null; } const o = $('#practiceChip'); if (o) o.remove(); }

/* ============================================================ T4: dream (E-7, feature-detected: game.js calls these when the engine sends dreams) */
/** list = choose().dream [{id, title}]; dream = metrics().dream (icon + name for S-D16 / S-D17). */
export function dreamToast(list, dream = null) {
  const icon = (dream && dream.icon) || '🎯';
  for (const d of list || []) overlay('dream', (done) => {
    toast(`${d.icon || icon} משימה הושלמה: ${d.title || ''}`, { kind: 'gold', keep: true });   // T4 verify D3: important feedback, never dropped by the cap
    if (dream && dream.name) mentor(`${d.title || ''} — צעד אמיתי לכיוון ${dream.name}.`);
    announce(`משימה הושלמה: ${d.title || ''}`);
    setTimeout(done, 2600);
  });
}
export function renderDream(dream) {
  let el = $('#hDream'); const g = $('#hGoal');
  if (!dream || !dream.missions || !g) { if (el) el.hidden = true; return; }
  if (!el) { el = document.createElement('button'); el.id = 'hDream'; el.type = 'button'; el.className = 'hcard hdream'; g.insertAdjacentElement('afterend', el); el.onclick = () => dreamModal(dream); }
  const done = dream.missions.filter((x) => x && x.done).length;
  el.hidden = false; el.innerHTML = `<span aria-hidden="true">${esc(dream.icon || '🎯')}</span><b class="num">${done}/${dream.missions.length}</b>`;
  el.setAttribute('aria-label', `החלום: ${dream.name || ''}, ${done} מתוך ${dream.missions.length} משימות`);
  el.onclick = () => dreamModal(dream);
}
export function dreamModal(dream) {
  if (!dream) return Promise.resolve();
  const ms = dream.missions || []; const done = ms.filter((x) => x && x.done).length;
  return modal({ tag: 'החלום שלך', color: '#be185d', title: `${dream.icon || ''} ${dream.name || ''}`,
    html: `<div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="${ms.length}" aria-valuenow="${done}" aria-label="משימות"><i style="width:${ms.length ? Math.round((done / ms.length) * 100) : 0}%"></i></div>
      ${dream.line ? `<p class="d">${escI(dream.line)}</p>` : ''}
      <ul class="dms">${ms.map((x) => { const p = Math.round((x.progress || 0) * 100); const dm = x.doneMonth ?? x.m; return `<li class="${x.done ? 'ok' : ''}"><span aria-hidden="true">${x.done ? '✓' : '○'}</span> ${escI(x.title || '')}${x.done ? `<small>${dm ? ` · הושלם בחודש ${num(String(dm))}` : ' · הושלם'}</small>` : p > 0 ? `<small> · ${num(p + '%')}</small><i class="dbar" aria-hidden="true"><i style="width:${p}%"></i></i>` : ''}</li>`; }).join('')}</ul>
      <p class="note">החלום לא משנה את הכוכבים ואת הניצחון. הוא מראה לך את הדרך שלך.</p>`,
    actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true });
}
/** T4 S-M7: learning-mode tag on the HUD world card. */
export function worldTag(learn) {
  const w = $('#hWorld'); if (!w) return;
  let t = $('#hLearn');
  if (!learn) { if (t) t.remove(); return; }
  if (!t) { t = document.createElement('em'); t.id = 'hLearn'; t.className = 'b learn'; t.textContent = '🎓 תרגול'; $('#hWorldName')?.insertAdjacentElement('afterend', t); }
}

/* ============================================================ v3: history mode — newspaper + market strip */
let paperT = 0;
export function newspaper(item) {
  const el = $('#paper'); if (!el || !item) return;
  overlay('rumour', (done) => {
    clearTimeout(paperT);
    el.innerHTML = `<div class="np"><div class="np-h"><b>${esc(item.head || 'העיתון')}</b><small>${esc(item.ymText || item.ym || '')}</small></div><p>${escI(item.text)}</p></div>`;
    const c = el.firstElementChild; requestAnimationFrame(() => c.classList.add('in'));
    paperT = setTimeout(() => { c.classList.remove('in'); c.classList.add('out'); setTimeout(done, 300); }, Math.max(2600, 1400 + item.text.length * 40) * Math.max(0.6, speed));
  });
}
export function historyStrip(hist, wi) {
  const el = $('#hist'); if (!el) return;
  if (!wi || !wi.ymText) { el.hidden = true; return; }
  el.hidden = false;
  const vals = (hist || []).map((x) => x.index).filter((x) => x != null);
  const first = vals[0], last = vals[vals.length - 1];
  const chg = first ? Math.round((last / first - 1) * 1000) / 10 : 0;
  el.innerHTML = `<div class="hh"><b>${esc(wi.ymText)}</b><span class="num ${cls(chg)}">${iso((chg > 0 ? '+' : '') + chg + '%')}</span></div>${vals.length > 1 ? spark(vals, { color: chg >= 0 ? 'var(--green)' : 'var(--red)', w: 220, h: 38 }) : '<p class="note">המדד יתחיל להתקדם בתשלום הראשון</p>'}
    <div class="hv">${wi.rate != null ? `<span>ריבית ${iso(wi.rate + '%')}</span>` : ''}${wi.cpi != null ? `<span>מדד מחירים ${(+wi.cpi).toFixed(1)}</span>` : ''}${wi.usd != null ? `<span>$ ${(+wi.usd).toFixed(2)}</span>` : ''}</div>`;
}

/* ============================================================ v3: the story of your life (before the end screen) */
export function lifeStory(sum, { won = false } = {}) {
  const el = $('#story'); if (!el || !sum) return Promise.resolve();
  return new Promise((res) => {
    const yrs = Math.round((sum.years ?? ((sum.age || 0) - (sum.startAge || 0))) * 10) / 10;
    el.innerHTML = `<div class="st-card">
      <small>סיפור החיים שלך</small>
      <div class="st-age"><b class="num" id="stAge">${Math.floor(sum.startAge || sum.age || 0)}</b><span>שנים</span></div>
      <div class="st-row">
        ${sum.family ? `<span>👨‍👩‍👧 ${esc(sum.family)}</span>` : ''}
        ${sum.happiness != null ? `<span>😊 אושר ${Math.round(sum.happiness)}</span>` : ''}
        ${sum.freeTimeMonths != null ? `<span>🌿 ${sum.freeTimeMonths} חודשים חופשיים</span>` : ''}
        ${sum.pension != null ? `<span>🏝️ פנסיה ${iso(fmtC(sum.pension))}</span>` : ''}
      </div>
      <p class="st-s" id="stS"></p>
      <button class="primary" id="stGo">לסיכום המלא</button></div>`;
    el.hidden = false; el.className = 'story ' + (won ? 'won' : 'lost');
    requestAnimationFrame(() => el.classList.add('in'));
    const a0 = sum.startAge || sum.age || 0, a1 = sum.age || a0;
    const t0 = performance.now(), dur = 1300 * Math.max(0.6, speed);
    const step = (now) => { const p = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - p, 3); const n = $('#stAge'); if (n) n.textContent = Math.floor(a0 + (a1 - a0) * e); if (p < 1) requestAnimationFrame(step); else { sfx('tick'); } };
    requestAnimationFrame(step);
    const sent = String(sum.sentence || ''); let i = 0; const sEl = $('#stS');
    const calm = reduced();
    let ty = 0;
    if (calm) { if (sEl) sEl.textContent = sent; } // T5 CR-U2: the whole sentence at once, no auto-close
    else ty = setInterval(() => { i += 2; if (sEl) sEl.textContent = sent.slice(0, i); if (i >= sent.length) clearInterval(ty); }, 28);
    let done = false;
    const release = trapFocus(el);
    const close = () => { if (done) return; done = true; clearInterval(ty); release(); el.classList.remove('in'); setTimeout(() => { el.hidden = true; res(); }, calm ? 0 : 350); };
    $('#stGo').onclick = close;
    setTimeout(() => $('#stGo')?.focus({ preventScroll: true }), 60); // UX§2.5: focus moves to the button
    void yrs; // T6 §6.1 / A11Y-13: no timed dismissal — the button closes it

  });
}

/* ============================================================ T5 CR-B2: "פרטי הנכס" (tap a city item / Enter on a sheet row) */
/** info = js/render/assetinfo.js assetInfo(key, metrics, {level}) — the UI only formats. → Promise<'sheet'|'ops'|undefined> */
export function assetInfo(key, info, ctx = {}) {
  if (!info) return Promise.resolve();
  const val = (r) => r.kind === 'money' ? num(fmtM(r.value || 0)) : r.kind === 'signed' ? num(sgn(r.value || 0), cls(r.value || 0))
    : r.kind === 'energy' ? `<span class="num neg">−${Math.abs(Math.round(r.value || 0))}</span> 🔋` : r.kind === 'count' ? `${num(N(r.value || 0))}${r.unit ? ' ' + esc(r.unit) : ''}` : escI(String(r.value ?? ''));
  const L = info.level;
  const pips = L && L.of ? `<span class="pips" role="img" aria-label="${esc(info.levelText || '')}">${Array.from({ length: L.of }, (_, i) => `<i class="${i < (L.n || 0) ? 'on' : ''}"></i>`).join('')}</span>` : '';
  const html = `${info.rows && info.rows.length ? `<div class="grid">${info.rows.map((r) => `<div class="row"><span>${esc(r.label)}</span><span>${val(r)}</span></div>`).join('')}</div>` : ''}
    ${info.levelText ? `<div class="alevel">${pips}<b>${esc(info.levelText)}</b>${info.levelHint ? `<small>${escI(info.levelHint)}</small>` : ''}</div>` : ''}
    ${info.activity ? `<p class="chipline"><em class="b"><span aria-hidden="true">${esc(info.activity.emoji || '')}</span> ${esc(info.activity.text || '')}</em></p>` : ''}`;
  const acts = [];
  if (info.business && ctx.opsOpen) acts.push({ label: 'לנהל את העסק', cls: 'primary', v: 'ops' });
  if (info.sheetRow) acts.push({ label: 'לדוח הכספי', cls: acts.length ? '' : 'primary', v: 'sheet' });
  acts.push({ label: 'סגירה', cls: acts.length ? '' : 'primary', v: undefined });
  return modal({ tag: info.kindLabel || 'פרטי הנכס', color: '#0e7490', title: info.title || '', html, actions: acts, dismissable: true, cls: 'ainfo' }).then((v) => {
    if (v === 'sheet') { toggleSheet(true); setTimeout(() => { const r = document.querySelector(`#sheet [data-asset="${CSS.escape(info.sheetRow)}"]`); if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 1200); r.querySelector('button')?.focus({ preventScroll: true }); } }, 80); }
    if (v === 'ops') bus.emit('asset:ops', { key });
    return v;
  });
}
/** T5 CR-B1: a business changed stage (the scene already animates the building). */
/**
 * T5 §4.2 one feedback entry point. kind ∈ levelUp | levelDown | achievement | worldEntry | milestone | toast | lesson | verdict.
 * B channel (#achv card, never dropped, first in line): levelUp, worldEntry, achievement. C channel (#toast): levelDown (kept),
 * milestone (kept), toast, lesson. D: verdict. Holds and turbo / reduced motion follow the channels above.
 */
export function feedback(kind, p = {}) {
  const { level, name } = p;
  if (kind === 'levelUp') {
    if (!level) return;
    const label = level.label || '';
    achievementToast({ kind: 'levelUp', first: true, label: T5S.U1, name: name || 'העסק', desc: fillT(T5S.U2, { n: level.n, label }), pips: { n: level.n }, sound: 'none' });
    announce(`${name || 'העסק'}: ${fillT(T5S.U2, { n: level.n, label })}`);
    return;
  }
  if (kind === 'levelDown') {
    if (!level) return;
    const t = fillT(T5S.D1, { name: name || 'העסק', label: level.n === 0 ? 'בהתחלה' : level.label || '' });
    sfx('loss'); toast('⚠️ ' + t, { kind: 'bad', keep: true }); announce(t);
    return;
  }
  if (kind === 'milestone') { const t = T5S.M[p.q]; if (t) { sfx('coin'); toast('🎯 ' + t, { kind: 'gold', keep: true }); } return; }
  if (kind === 'worldEntry') { if (p.world) worldBanner(p.world, mapNo(p.world.id) === 1 && groupOf(p.world.id) ? fillT(T5S.W2, { g: groupOf(p.world.id).name }) : T5S.W1); return; }   // the first map of a world says the world
  if (kind === 'achievement') return achievementToast(p);
  if (kind === 'lesson') return lessonToast(p.list || [], p.open);
  if (kind === 'verdict') return verdict(p.decision || p, p.opts || {});
  if (kind === 'toast') return toast(p.text, p);
}
const T5S = { U1: 'העסק התקדם!', U2: 'שלב {n} מתוך 3 · {label}', D1: '{name}: חזרה לשלב "{label}". כדאי להציץ בלוח העסק.', W1: 'מפה חדשה נפתחה', W2: 'עולם חדש: {g}',
  M: { 1: 'רבע מהדרך לחופש!', 2: 'חצי מהדרך לחופש!', 3: 'שלושה רבעים מהדרך. כמעט שם!' } };
/** T5 §4.2: hold B / C / D (true) or release them (false) */
export function holdFeedback(on) { fbHold = !!on; if (!fbHold) { pumpOv(); if (tq.length && !tBusy) nextToast(); } }
/** T5 §4.2: drop everything queued (a new game / back to the lobby); what is on screen finishes on its own.
 *  {toasts:false} keeps the C pills (shell notices such as the T1 save / renderer messages are queued around a game start). */
export function flushFeedback({ toasts = true } = {}) {
  if (toasts) tq.length = 0;
  aq.length = 0; for (const x of ovq.splice(0)) x.cancel?.(); clearTimeout(ovT); fbHold = false;
  const c = stickyCur; stickyCur = null; const el = document.getElementById('t6news'); if (el) { el.hidden = true; el.className = ''; } if (c) c.done();
}
/* T5 §4.1 progress milestones: 25 / 50 / 75 % of the freedom meter, once per game each (a resumed game starts from where it is) */
let msBase = null;
function milestoneCheck(pc) {
  const q = Math.min(3, Math.floor(pc / 25));
  if (msBase == null) { msBase = q; return; }
  if (q > msBase) { const top = q; msBase = q; feedback('milestone', { q: top }); }
}

/* ============================================================ T6: rivals panel, deal competition outcomes, practice rewind chrome */
const RP = {
  title: 'היריבים על אותו לוח', sub: 'אותן קוביות ואותם קלפים — כל אחד מחליט אחרת. רואים רק עד החודש שלך.', you: gw('אתה', 'את'),
  row: 'שווי נקי {nw} · הכנסה פסיבית {pas}', pct: '{p}% מהדרך לחופש', foot: 'מה יקרה להם הלאה — בסוף המשחק.',
  computing: 'היריבים משחקים…', noworker: 'היריבים יופיעו בסוף המשחק.', unavailable: 'היריבים לא זמינים כרגע.',
  lost: 'עסקאות שהלכו ליריבים', revealIn: 'נשמע איך זה הלך בעוד {n} חודשים', rules: 'הכללים של {name}',
};
const fillT = (t, v) => String(t).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
const MARK_TXT = { buy: 'קנה', sell: 'מכר', forced: 'הלוואה כפויה', crisis: 'משבר', burnout: 'שחיקה', win: 'יצא מהמירוץ', bailout: 'הבנק נכנס', jobless: 'פיטורים', recession: 'מיתון', crash: 'נפילה במדד', story: 'החלטה בחיים', rivalLost: 'הפסיד עסקה', rivalReveal: 'שמע איך הלך' };
/** body of the rivals sheet. d = {me:{nw, pas, pct}, view (ghosts.view(month)), personas, lost:[…]|null, month} */
export function rivalsPanelHtml(d) {
  const V = d.view || { state: 'off', ghosts: {} }; const P = d.personas || personas();
  const bar = (p) => `<i class="t6bar" aria-hidden="true"><i style="width:${Math.max(2, Math.min(100, p))}%"></i></i>`;
  const rowHtml = (who, nw, pas, p, extra = '', open = '') => `<div class="t6rp-row"><div class="t6rp-h"><b>${who}</b><span>${iso(fillT(RP.row, { nw: fmtM(nw), pas: fmtM(pas) }))}</span></div>${bar(p)}<small>${iso(fillT(RP.pct, { p }))}${extra}</small>${open}</div>`;
  const me = d.me || {};
  const rows = [rowHtml(esc(RP.you), me.nw || 0, me.pas || 0, me.pct || 0)];
  const state = V.state === 'noworker' ? RP.noworker : V.state === 'unavailable' ? RP.unavailable : V.state === 'computing' ? RP.computing : '';
  for (const id of T6S.ARCH_IDS) {
    const p = P[id]; const g = (V.ghosts || {})[id] || {}; const r = (g.rows || [])[(g.rows || []).length - 1];
    const who = `${esc(p.icon)} ${esc(p.name)} · ${esc(p.label)}`;
    const marks = (g.marks || []).slice(-3).map((k) => `<li>${num('חודש ' + k[0])} ${esc(MARK_TXT[k[1]] || '')}${k[4] ? ' · ' + escI(k[4]) : ''}</li>`).join('');
    const det = `<details class="t6rp-rule"><summary>${esc(fillT(RP.rules, { name: p.name }))}</summary><p>${esc(p.rule)}</p><p><b>חזקים כש:</b> ${esc(p.strong)}</p><p><b>חלשים כש:</b> ${esc(p.weak)}</p>${marks ? `<ul>${marks}</ul>` : ''}</details>`;
    if (g.error || !r) { rows.push(`<div class="t6rp-row"><div class="t6rp-h"><b>${who}</b><span>${esc(g.error ? '—' : state ? '…' : '—')}</span></div>${det}</div>`); continue; }
    const esc2 = g.escaped && g.escaped.status === 'won' ? ` · ${esc(T6S.escapedVerb(p))} מהמירוץ בחודש ${num(String(g.escaped.m))}` : '';
    rows.push(rowHtml(who, r[1] * 100, r[4], Math.floor(r[6] / 10), esc2, det));
  }
  const lost = Array.isArray(d.lost) && d.lost.length ? `<h3 class="t6rp-lh">${esc(RP.lost)}</h3><ul class="t6rp-lost">${d.lost.map((x) => `<li>${escI(x.text || `${x.by && x.by.name ? `${x.by.icon || ''} ${x.by.name} · ` : ''}${x.name || ''}${x.m ? ` · חודש ${x.m}` : ''}`)}${x.revealed ? '' : x.revealAt ? ` <small>${esc(fillT(RP.revealIn, { n: Math.max(0, x.revealAt - (d.month || 0)) }))}</small>` : ''}</li>`).join('')}</ul>` : '';
  return `<p class="d">${esc(RP.sub)}</p>${state ? `<p class="note" role="status">${esc(state)}</p>` : ''}<div class="t6rp">${rows.join('')}</div>${lost}<p class="note">${esc(RP.foot)}</p>`;
}
/** the 👥 bottom sheet (dialog: focus trap + Escape). Live: game.js calls rivalsPanelUpdate while it is open. */
export function rivalsPanel(d) {
  return modal({ tag: '👥 יריבים', color: '#6b4fd8', title: RP.title, html: `<div id="t6rpBody">${rivalsPanelHtml(d)}</div>`, actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true, cls: 't6-sheet' });
}
export function rivalsPanelOpen() { return !!document.getElementById('t6rpBody') && shown('#gm'); }
export function rivalsPanelUpdate(d) { const b = document.getElementById('t6rpBody'); if (b && shown('#gm')) { const open = [...b.querySelectorAll('details[open]')].map((x) => [...b.querySelectorAll('details')].indexOf(x)); b.innerHTML = rivalsPanelHtml(d); const all = b.querySelectorAll('details'); open.forEach((i) => all[i] && (all[i].open = true)); } }

/** §12.1 lost to a rival: an outcome panel (no timed dismissal). r = choose().rival {lost, by:{icon,name}, how, text, sub} */
export function rivalLost(r) {
  if (!r) return Promise.resolve();
  return modal({ tag: '👥 תחרות על עסקה', color: '#6b4fd8', title: r.text || '', html: `<div role="status" aria-live="polite">${r.sub ? `<p class="d">${escI(r.sub)}</p>` : ''}${r.dd ? `<p class="note">🔎 ${escI(r.dd)}</p>` : ''}</div>`, actions: [{ label: r.button || 'הבנתי', cls: 'primary' }] });
}
/** a reveal line ("שמעת מעומר: …"): stays until tapped or until the next roll (clearStickyNews), never timed.
 *  T7 polish: on phones it goes through the single overlay queue — it never shows over (or under) an open card / dialog / life
 *  story; when a card opens while it is on screen it steps aside and comes back once the board is clear (never dropped). */
let stickyCur = null;   // {text, done} of the line on screen
export function stickyNews(text) {
  if (!text) return;
  overlay('rival', (done) => {
    let el = document.getElementById('t6news');
    if (!el) { el = document.createElement('div'); el.id = 't6news'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.innerHTML = `<span>${escI(text)}</span><button type="button" class="ibtn sm" aria-label="סגירה">✕</button>`;
    el.querySelector('button').onclick = () => clearStickyNews();
    el.hidden = false; el.className = 'on';
    stickyCur = { text, done };
  });
}
export function clearStickyNews() {
  const el = document.getElementById('t6news'); if (el) { el.hidden = true; el.className = ''; }
  const c = stickyCur; stickyCur = null; if (c) c.done();
}
/** phones: a card / dialog that opens over a reveal line wins; the line waits in the queue and returns when the board is clear */
function stickyAside() {
  const c = stickyCur; if (!c || !phoneQ()) return;
  stickyCur = null; const el = document.getElementById('t6news'); if (el) { el.hidden = true; el.className = ''; }
  c.done(); setTimeout(() => stickyNews(c.text), 0);   // re-queued once the card / dialog is on screen (the queue then waits for it)
}

/** §7.5 banner in a practice branch. info = {back(), compare()} | null */
export function branchBanner(info) {
  let el = document.getElementById('t6branch');
  if (!info) { if (el) el.hidden = true; document.body.classList.remove('t6-inbranch'); return; }
  if (!el) { el = document.createElement('div'); el.id = 't6branch'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'ענף תרגול'); document.body.appendChild(el); }
  el.innerHTML = `<span>🧪 ענף תרגול — המשחק המקורי שמור</span><button type="button" data-b="back">חזרה למקור</button><button type="button" data-b="compare">השוואה</button>`;
  el.onclick = (e) => { const b = e.target.closest('[data-b]'); if (!b) return; sfx('click'); if (b.dataset.b === 'back') info.back(); else info.compare(); };
  el.hidden = false; document.body.classList.add('t6-inbranch');
}
/** §7.4 "רגעי החלטה": newest first; → Promise<k0 | undefined> */
export function momentsSheet(points, { title = 'רגעי החלטה', note = '' } = {}) {
  const list = (points || []).slice().reverse().slice(0, 40);
  const VW = { strong: 'החלטה חזקה', ok: 'החלטה סבירה', mixed: 'יש מה לשפר', risky: 'החלטה מסוכנת', costly: 'החלטה יקרה' };
  let pick;
  const rows = list.map((p) => {
    const chose = optName({ o: p.o, type: p.type }) || '';
    const line = chose ? fillT('חודש {m} · {title} · בחרת: {chose}', { m: p.m, title: p.c || '', chose }) : fillT('חודש {m} · {title}', { m: p.m, title: p.c || '' });
    return `<li><span>${escI(line)}${VW[p.v] ? `<small>${esc(VW[p.v])}</small>` : ''}</span><button type="button" data-k0="${p.k0 | 0}">🔁 לחזור לכאן</button></li>`;
  }).join('');
  return modal({ tag: '🧪 תרגול', color: '#0f766e', title, html: `${note ? `<p class="d">${esc(note)}</p>` : ''}<p class="note">נפתח ענף תרגול. המשחק המקורי נשמר.</p><ol class="t6mo-list">${rows || '<li>אין עדיין החלטות לחזור אליהן.</li>'}</ol>`,
    actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true, cls: 't6-sheet',
    onExtra: (e) => { const b = e.target.closest('[data-k0]'); if (!b) return; pick = +b.dataset.k0; document.querySelector('#gm .acts button')?.click(); } }).then(() => pick);
}
/** §7.5 "השוואה": both lines on one graph (original dashed) over the months both played, the facts at that month, the limits */
export function compareSheet({ branchTl, originTl, month }) {
  const o = T6S.tlUpTo(originTl, month); const b = branchTl;
  const ro = T6S.tlRows(o).pop(), rb = T6S.tlRows(b).pop();
  const id = 'cmp';
  const opts = { id, compareTl: o, compareLabel: 'המקור', alt: `המקור מול הענף עד חודש ${month}` };
  const fact = (lab, a, c) => `<tr><th scope="row">${esc(lab)}</th><td>${a}</td><td>${c}</td></tr>`;
  const facts = ro && rb ? `<table class="t6-table"><caption>${esc(`בחודש ${month}`)}</caption><thead><tr><th scope="col"></th><th scope="col">המקור</th><th scope="col">הענף</th></tr></thead><tbody>
    ${fact('שווי נקי', num(fmtM(ro[1] * 100)), num(fmtM(rb[1] * 100)))}${fact('מזומן וחיסכון', num(fmtM(ro[2] * 100)), num(fmtM(rb[2] * 100)))}${fact('הכנסה פסיבית', num(fmtM(ro[4])), num(fmtM(rb[4])))}${fact('😊 אושר', num(String(ro[7])), num(String(rb[7])))}</tbody></table>` : '';
  return modal({ tag: '🧪 ענף תרגול', color: '#0f766e', title: 'המקור מול הענף', wide: true, cls: 't6-sheet',
    html: `${b && T6S.tlRows(b).length ? T6S.graphBlock(b, opts) : ''}${facts}${T6S.limitsHtml(true)}`, actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true,
    onOpen: (c) => T6S.wireSummary(c, (gid) => (gid === id ? { tl: b, opts } : null)) });
}

/* ============================================================ T3: business monthly toast (UI-4), the inbox list (UI-3), calendar (UI-7) */
/** n = engine business news (T3 fields: revenue, profit, cashDelta, why, decide, stage). The toast's "פרטים" opens the month (L2). */
export function bizNews(n, { decide } = {}) {
  if (!n) return;
  const head = `🏪 ${n.name || 'העסק'}: מחזור ${fmtC(n.revenue || 0)} · רווח ${sgn(n.profit ?? n.netProfit ?? 0)} · קופה ${sgn(n.cashDelta || 0)}`;
  const open = () => { if (evState || shown('#gm')) { toast('אפשר לראות את פרטי החודש בין תורות, או בכרטיס העסק'); return; } bizMonth(n); };   // phones: one layer at a time
  toast(head, { kind: (n.profit ?? 0) < 0 ? 'bad' : '', sub: (n.why && n.why.sentence) || '', action: { label: 'פרטים', fn: open } });
  const ev = (n.events || []).find((x) => x && x.title);
  if (ev && n.decide == null) toast(`🏪 ${ev.title}${ev.text ? ': ' + ev.text : ''}`);
  if (n.decide != null) { toast(`🏪 יש החלטה בעסק${ev ? `: ${ev.title}` : ''}`, { kind: 'gold', action: decide ? { label: 'לפתוח', fn: decide } : null }); announce('יש החלטה בעסק'); }
}
/** L2 of one simulated month, from the news itself (why.profit = what moved the profit, why.cash = from profit to cash). */
export function bizMonth(n) {
  const W = n.why || {};
  const list = (arr, title) => { const a = (arr || []).filter((x) => x && x.amount); return a.length ? `<p class="mh">${title}</p><ul class="bridge">${a.map((x) => `<li><span>${escI(x.text)}</span>${num(sgn(x.amount), cls(x.amount))}</li>`).join('')}</ul>` : ''; };
  const evs = (n.events || []).filter((x) => x && x.title).map((x) => `<p class="note">🎲 <b>${escI(x.title)}</b>${x.text ? ` — ${escI(x.text)}` : ''}</p>`).join('');
  return modal({ tag: `🏪 ${n.name || 'העסק'}`, color: '#b45309', title: `החודש בעסק${n.cal ? ` · ${MON_LONG[(n.cal - 1) % 12] || ''}` : ''}`, dismissable: true,
    html: l1Html({ revenue: n.revenue || 0, profit: n.profit ?? n.netProfit ?? 0, cashDelta: n.cashDelta || 0, toOwner: n.toOwner || 0, sentence: W.sentence || '' }) +
      `<details class="more"><summary>פרטים</summary>${list(W.profit, 'מה הזיז את הרווח')}${list(W.cash, 'מהרווח לקופה')}${n.revenueGross ? `<p class="note">כולל מע״מ: ${num(fmtM(n.revenueGross))}</p>` : ''}</details>${evs}`,
    actions: [{ label: 'סגירה', cls: 'primary' }] });
}
/** The 📬 list → Promise<card | null>. cards = E.inbox(S). Due-this-payday items first; no timers, no countdown. */
export function inboxList(cards, { month = 0 } = {}) {
  const C = (cards || []).slice().sort((a, b) => ((a.data && a.data.due) || 99) - ((b.data && b.data.due) || 99));
  let pick = null;
  const row = (c) => {
    const d = c.data || {}; const dflt = c.options.find((o) => o.default) || null; const urg = d.due != null && d.due <= month + 1;
    return `<li><button type="button" class="ibrow ${urg ? 'urg' : ''}" data-item="${esc(String(c.itemId))}"><span class="ibt" style="--c:${esc(c.color || '#4b6584')}">${esc(c.tag || '')}</span><b>${escI(c.title)}</b>
      <small>${d.dueText ? `📬 ${esc(d.dueText)}` : ''}${dflt ? ` · ${gz('אם לא תחליט')}: ${escI(dflt.label)}` : ''}</small></button></li>`;
  };
  return modal({ tag: '📬 החלטות פתוחות', color: '#4b6584', title: C.length ? (C.length === 1 ? 'החלטה אחת מחכה לך' : `${C.length} החלטות מחכות לך`) : 'אין החלטות פתוחות', dismissable: true, cls: 'inbox',
    html: C.length ? `<ul class="iblist">${C.map(row).join('')}</ul><p class="note">אין שעון. מה ש${gw('לא תחליט', 'לא תחליטי')} — ייסגר לבד לפי ברירת המחדל, ביום המשכורת שכתוב.</p>` : '<p class="d">כל ההחלטות סגורות.</p>',
    actions: [{ label: 'סגירה', cls: 'primary' }],
    onExtra: (e) => { const b = e.target.closest('[data-item]'); if (!b) return; pick = C.find((c) => String(c.itemId) === b.dataset.item) || null; document.querySelector('#gm .acts button')?.click(); } }).then(() => pick);
}
/** UI-7 calendar chip tap */
export function calendarModal(cal, { biz = false } = {}) {
  if (!cal) return Promise.resolve();
  return modal({ tag: '🗓️ לוח השנה', color: '#0e7490', title: `${cal.label}${cal.season ? ` · ${cal.season}` : ''}`, dismissable: true,
    html: `<p class="d">${biz ? 'בעסק יש חודשים חזקים וחלשים, ואפשר לדעת אותם מראש. העונות של העסק מופיעות בכרטיס שלו.' : 'כל חודש במשחק הוא חודש בשנה. בעסקים יש עונות — חגים, קיץ, חזרה ללימודים.'}</p>`,
    actions: [{ label: 'סגירה', cls: 'primary' }] });
}
/** T4 §4.3 `next`: the tutorial goal chain (metrics().nextGoal) as a HUD card after #hGoal; the dream card takes over when it is done. */
export function renderNext(g, { show = true } = {}) {
  let el = $('#hNext'); const anchor = $('#hGoal');
  if (!g || g.done || !anchor || !show) { if (el) el.hidden = true; return; }
  if (!el) { el = document.createElement('div'); el.id = 'hNext'; el.className = 'hcard hnext'; el.setAttribute('role', 'status'); anchor.insertAdjacentElement('afterend', el); }
  const pct = g.target ? Math.max(2, Math.min(100, Math.round(((g.value || 0) / g.target) * 100))) : 0;
  const val = g.valText || (g.target ? (g.unit === '₪' ? `${money(g.value || 0)} / ${money(g.target)}` : `${N(g.value || 0)} / ${N(g.target)}`) : '');
  const ms = g.step != null && g.of;   // wave 3a: a rung of the near-goal ladder (js/hudgoal.js nextMilestone) — tap opens the goal panel
  const sig = `${g.id}|${g.title}|${val}|${g.step}`; if (el.dataset.sig === sig && !el.hidden) return; el.dataset.sig = sig;
  el.hidden = false; el.classList.toggle('ms', !!ms);
  const sub = ms ? `<small><span class="nk">היעד הקרוב</span> · ${escI(g.valNum || val)}${g.valUnit ? ' ' + esc(g.valUnit) : ''} · שלב ${g.step} מתוך ${g.of}</small>` : val ? `<small class="num">${esc(val)}</small>` : '';
  el.innerHTML = `<span aria-hidden="true">${esc(g.icon || '🎯')}</span><span class="nt"><b>${esc(g.title || '')}</b>${sub}</span>${g.target ? `<i class="nbar" aria-hidden="true"><i style="width:${pct}%"></i></i>` : ''}`;
  el.setAttribute('aria-label', `${ms ? `היעד הקרוב (שלב ${g.step} מתוך ${g.of})` : 'המטרה הבאה'}: ${g.title || ''}${val ? `, ${val}` : ''}`);
  if (ms && !el._wired) { el._wired = true; el.addEventListener('click', () => { if (el.classList.contains('ms') && typeof goalPanel === 'function') goalPanel(!goalPanelOpen(), { focus: true }); }); }
}

/* ============================================================ 3D upgrade wave 1 (team ג): tile sheet, tile list, board tools, turn chip */
/** The small accessible sheet for one board tile (data from js/render/tiles.js tileSheet()): icon, full name, what happens there,
 *  "you are here" (gz: masculine / feminine) / "עוד N צעדים". Opened by a tap / click / Enter on a tile (3D raycast or 2D button) or from the tile list. */
export function tileSheet(d, { onList = null } = {}) {
  if (!d) return Promise.resolve();
  const html = `<div class="tsheet"><span class="tsicon" aria-hidden="true">${esc(d.emoji || '')}</span>
    <p class="d">${escI(d.desc || '')}</p>
    <p class="twhere${d.here ? ' here' : ''}"><b>${esc(gz(d.where))}</b>${d.short && d.short !== d.name ? `<small> · על הלוח: ${esc(d.short)}</small>` : ''}</p></div>`;
  const acts = [{ label: 'סגירה', cls: 'primary' }];
  if (onList) acts.push({ label: 'כל המשבצות', v: 'list' });
  return modal({ tag: `משבצת ${d.index + 1}`, color: '#2f6fdb', title: d.name, html, actions: acts, dismissable: true, cls: 'tinfo' })
    .then((v) => { if (v === 'list' && onList) onList(); return v; });
}
/** The text alternative of the board: every tile as a button (index, icon, short name, distance) → resolves with the chosen index. */
export function tileList(items, { pos = 0 } = {}) {
  let chosen = null;
  const rows = items.map((t) => `<li><button type="button" data-tile="${t.index}" class="${t.index === pos ? 'here' : ''}"${t.index === pos ? ' aria-current="location"' : ''}>
    <span class="tn num" aria-hidden="true">${t.index + 1}</span><span aria-hidden="true">${esc(t.emoji)}</span><b>${esc(t.name)}</b><small>${esc(gz(t.where))}</small></button></li>`).join('');
  return modal({ tag: 'הלוח', color: '#2f6fdb', title: 'המשבצות בלוח', html: `<ol class="tlist" aria-label="המשבצות, לפי סדר המשחק">${rows}</ol>`, actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true, cls: 'tlistc',
    onOpen: (c) => { setTimeout(() => { const h = c.querySelector('.tlist button.here'); if (h) { h.scrollIntoView({ block: 'center' }); h.focus({ preventScroll: true }); } }, 60); },
    onExtra: (e) => { const b = e.target.closest('button[data-tile]'); if (!b) return; chosen = Number(b.dataset.tile); sfx('click'); $('#gmCard .acts button[data-i="0"]')?.click(); } })
    .then(() => chosen);
}
/** Floating board tools over the free board area: "מבט ראשי" (3D only) and the tile list. Created once; game.js wires them. */
export function boardTools({ onHome, onList } = {}) {
  let box = $('#boardTools');
  if (!box) {
    box = document.createElement('div'); box.id = 'boardTools'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'כלי הלוח');
    box.innerHTML = `<button id="homeViewBtn" class="ibtn" type="button" aria-label="מבט ראשי: חזרה לזווית ההתחלתית" title="מבט ראשי"><span aria-hidden="true">🎯</span></button>
      <button id="tilesBtn" class="ibtn" type="button" aria-label="רשימת המשבצות בלוח" title="המשבצות בלוח"><span aria-hidden="true">📋</span></button>`;
    document.body.appendChild(box);
  }
  const h = $('#homeViewBtn'), l = $('#tilesBtn');
  if (onHome) h.onclick = () => { sfx('click'); onHome(); };
  if (onList) l.onclick = () => { sfx('click'); onList(); };
  return box;
}
/** Place the board tools and the turn chip inside the free board rect (game.js frame()). r = null keeps the last rect (HUD resize).
 *  wave 3a (review MINOR-1): the tools never sit under the HUD, the mentor bar or the report — a landscape phone has a short free
 *  rect, so the first free spot of a few candidates is used (bottom corner → just under the HUD → the other corner → beside it). */
const BLOCKERS = '#hud, #bar, #sheet, #hLifeMore, #goalPanel, #toast';   // a long toast (a lesson with "לקרוא") also takes the spot
const COVERS = '#start, #evm, #gm, #loading, #coach, #story, #recover';
let dockT = 0, dockN = 0;
export function placeBoardUi(r, { kind = '3d', show = true } = {}) {
  const box = $('#boardTools'); const s = document.documentElement.style;
  if (r) { s.setProperty('--fr-x0', Math.round(r.x0) + 'px'); s.setProperty('--fr-x1', Math.round(r.x1) + 'px'); s.setProperty('--fr-y0', Math.round(r.y0) + 'px'); s.setProperty('--fr-y1', Math.round(r.y1) + 'px'); }
  if (!box) return;
  box.hidden = !show; box.dataset.kind = kind; const h = $('#homeViewBtn'); if (h) h.hidden = kind !== '3d';
  if (show) { dockN = 0; dockTools(box); }
}
function dockTools(box) {
  try {
    const cs = getComputedStyle(document.documentElement); const px = (k, d) => { const v = parseFloat(cs.getPropertyValue(k)); return Number.isFinite(v) ? v : d; };
    const x0 = px('--fr-x0', 0), x1 = px('--fr-x1', innerWidth), y0 = px('--fr-y0', 0), y1 = px('--fr-y1', innerHeight);
    const n = [...box.querySelectorAll('.ibtn')].filter((b) => !b.hidden).length || 1; const W = n * 44 + (n - 1) * 8, H = 44;
    const prev = box.style.visibility; box.style.visibility = 'hidden';   // elementFromPoint skips the tools themselves
    let covered = false;
    const hits = (x, y) => {   // how many of 5 probe points of the tools' box at (x, y) land on the HUD / bar / report (5 = off screen)
      if (x < 0 || y < 0 || x + W > innerWidth || y + H > innerHeight) return 5;
      let k = 0;
      for (const [px2, py2] of [[x + 2, y + 2], [x + W - 2, y + 2], [x + 2, y + H - 2], [x + W - 2, y + H - 2], [x + W / 2, y + H / 2]]) {
        const e = document.elementFromPoint(px2, py2); if (e && e.closest(COVERS)) covered = true;
        if (e && e.closest(BLOCKERS)) k++;
      }
      return k;
    };
    const blocked = (x, y) => hits(x, y) > 0;
    const hudB = Math.max(0, ...[...document.querySelectorAll('#hud > *')].filter((e) => e.offsetParent).map((e) => { const q = e.getBoundingClientRect(); return q.right > x0 && q.left < x0 + 10 + W + 54 ? q.bottom : 0; }));
    const cands = [[x0 + 10, y1 - 52], [x0 + 10, hudB + 6], [x1 - 10 - W, y1 - 52], [x1 - 10 - W, hudB + 6], [x0 + 10, y0 + 6], [x0 + 10 + 54 * 2, hudB + 6]];
    // a landscape phone leaves no 44 px band between the HUD rows and the bar: beside the HUD's own tool row is free board
    const ht = document.querySelector('#hud .htools'); if (ht && ht.offsetParent) { const q = ht.getBoundingClientRect(); cands.push([q.right + 8, q.top + (q.height - H) / 2], [q.left - 8 - W, q.top + (q.height - H) / 2]); }
    let pick = cands.find(([x, y]) => y >= 0 && !blocked(x, y));
    if (!pick) { let best = 9; for (const c of cands) { const k = hits(c[0], c[1]); if (k < best) { best = k; pick = c; } } pick = pick || cands[0]; }
    box.style.visibility = prev;
    // a lobby / card / dialog / loading screen covers the board: the HUD under it cannot be measured — try again shortly
    if (covered) { clearTimeout(dockT); if (dockN++ < 40) dockT = setTimeout(() => dockTools(box), 500); return; }
    dockN = 0;
    box.style.left = Math.round(pick[0]) + 'px'; box.style.top = Math.round(pick[1]) + 'px';
    box.dataset.dock = String(cands.indexOf(pick));
  } catch (e) { box.style.visibility = ''; }
}
/* wave 3a (review MAJOR-1): Esc closes the tile list / tile sheet wherever focus is (they are always the top dialog) */
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const c = $('#gmCard'); const m = $('#gm');
  if (!m || m.hidden || !c || !(c.classList.contains('tlistc') || c.classList.contains('tinfo')) || m.contains(document.activeElement)) return;
  c.querySelector('.acts button[data-i="0"]')?.click();
});
let chipT = 0;
/** §13 the short turn state: "זורקים…" / "זזים N צעדים" / "נחתת על …". role=status, aria-live polite (always in the DOM, so it is
 *  announced); `quiet` updates the text without announcing it (the dice and the landing already have their own announcements).
 *  null clears it. Reduced motion: no fade (css). */
export function turnChip(text, { quiet = false, ms = 0 } = {}) {
  let el = $('#turnChip');
  if (!el) { el = document.createElement('p'); el.id = 'turnChip'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-atomic', 'true'); document.body.appendChild(el); }
  clearTimeout(chipT);
  if (text === undefined) return el;
  if (!text) { el.setAttribute('aria-live', 'off'); el.classList.remove('on'); chipT = setTimeout(() => { el.textContent = ''; el.setAttribute('aria-live', 'polite'); }, reduced() ? 0 : 220); return el; }
  el.setAttribute('aria-live', quiet ? 'off' : 'polite');
  el.textContent = text; el.classList.add('on');
  if (ms) chipT = setTimeout(() => turnChip(null), ms);
  return el;
}

/* ============================================================ wave 3a (J1 P0-1): summarise a free run after the ★ limit */
/** the one-time offer (and the confirm of the HUD 🏁 button) → 'sum' | 'go' | undefined */
export function summaryOffer({ limit, month } = {}) {
  return modal({ tag: '🏁 הכוכבים', color: '#b45309', title: `עבר מועד הכוכבים (חודש ${limit})`,
    html: `<p class="d">${escI(`עכשיו חודש ${month}. מכאן כבר אי אפשר לקבל כוכבים בריצה הזאת — אבל אפשר להמשיך לנסות לצאת מהמירוץ.`)}</p>
      <p class="d">רוצה לסכם עכשיו ולראות מה למדת? הסיכום מראה את הגרף, את ההחלטות שהשפיעו ואת "רגעי ההחלטה" — ו<b>מסיים את הריצה הזאת</b>.</p>`,
    actions: [{ label: '🏁 לסכם את הריצה', cls: 'primary', v: 'sum' }, { label: 'להמשיך לשחק', v: 'go' }], dismissable: true, cls: 'sumoffer' });
}
/** the HUD's 🏁 button (in the tool row) while a summary is possible; hidden otherwise */
export function sumRunBtn(show, onClick) {
  let b = $('#sumRunBtn');
  if (!show) { if (b) b.hidden = true; return; }
  const row = $('#hud .htools'); if (!row) return;
  if (!b) { b = document.createElement('button'); b.id = 'sumRunBtn'; b.type = 'button'; b.className = 'ibtn'; b.textContent = '🏁'; b.setAttribute('aria-label', 'לסכם את הריצה (עבר מועד הכוכבים)'); b.title = 'לסכם את הריצה'; row.insertBefore(b, row.firstChild); }
  b.hidden = false; b.onclick = () => { sfx('click'); onClick && onClick(); };
}

/* ============================================================ wave 3a (J1 P0-4, brief §18): "💼 ניהול כסף" — one entry for the money actions */
/** the hub button beside "הדוח שלי" in the control bar (always on screen, never behind "⋯") */
export function moneyHubBtn(onClick) {
  let b = $('#hubBtn');
  if (!b) {
    const at = $('#sheetBtn'); if (!at) return null;
    b = document.createElement('button'); b.id = 'hubBtn'; b.type = 'button'; b.className = 'chip hubbtn';
    b.innerHTML = '<span aria-hidden="true">💼</span><span class="hb-t"> ניהול כסף</span>'; b.setAttribute('aria-haspopup', 'dialog'); b.title = 'ניהול כסף';
    at.insertAdjacentElement('afterend', b);
  }
  b.onclick = () => { sfx('click'); onClick && onClick(); };
  return b;
}
/** the hub sheet (model: js/hudgoal.js moneyHubModel) → the chosen act id, or undefined */
export function moneyHub(H) {
  let chosen;
  const row = (r) => `<li class="mh-row" data-row="${esc(r.id)}"><div class="mh-h"><span class="mh-i" aria-hidden="true">${esc(r.icon)}</span><div><b>${esc(r.title)}</b><small>${escI(r.value)}</small></div></div>
    <div class="mh-acts">${r.acts.map((a) => `<button type="button" class="chip" data-hub="${esc(a.act)}" ${a.on ? '' : 'disabled'}>${escI(a.label)}</button>`).join('')}</div></li>`;
  return modal({ tag: '💼 ניהול כסף', color: '#0f766e', title: 'הכסף שלך', cls: 'mhub',
    html: `<p class="d">מזומן עכשיו: <b class="num">${escI(H.cashText)}</b>. כל פעולה פותחת את החשבון שלה לפני שהיא קורית.</p><ul class="mh-list">${H.rows.map(row).join('')}</ul>${(H.more || []).length ? `<div class="mh-more">${H.more.map((a) => `<button type="button" class="chip" data-hub="${esc(a.act)}">${escI(a.label)}</button>`).join('')}</div>` : ''}`,
    actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true,
    onExtra: (e) => { const b = e.target.closest('button[data-hub]'); if (!b || b.disabled) return; chosen = b.dataset.hub; sfx('click'); $('#gmCard .acts button[data-i="0"]')?.click(); } })
    .then(() => chosen);
}

/* ============================================================ worlds wave 1: the generic world panel (metrics().worldIndicators.panel)
   DESIGN §4.2: a module describes its panel (gauges, a 12-month strip, a ring, rows, actions with ids / labels / enabled / reason /
   suggested); this renders ANY such descriptor without world-specific rules. w5 = "עונות ותפוסה". Actions go through E.worldAction
   (game.js passes onAct); the sheet stays open and redraws from a fresh descriptor after each action. */
const TIER_HE = { budget: 'זול', standard: 'רגיל', premium: 'יוקרה' };
const PROF_HE = { beach: 'חוף', winterSun: 'שמש חורף', flat: 'כל השנה', waterpark: 'פארק מים', mixed: 'חוף + כנסים' };
const xT = (x) => '×' + (Math.round(+x * 100) / 100).toFixed(2);
function gaugeHtml(g, pid = '') {
  const has = g.value != null && Number.isFinite(+g.value);
  const min = g.min ?? 0, max = g.max ?? Math.max(g.ref ? g.ref * 2 : 1, has ? +g.value : 1);
  const pos = (x) => Math.max(0, Math.min(100, ((x - min) / Math.max(1e-9, max - min)) * 100));
  // w6 gauges: utilisation %, cost coverage ×1.52, runway in months (w5: demand ×, runway). w7: liquidity months, span % of capacity
  // (high is bad), stock cover months (ref = the player's cover rule), brand 0–100. w8: cash ÷ equity still owed ×, the rate %, demand ×.
  const xRun = pid === 'proj' && g.id === 'runway';
  // w9: operating income (₪) vs the target, the rate %, the spot price (₪/MWh) vs its 12-month average, solar capture %; w10: net worth (₪) vs the
  // target, LTV % (over 100 % = a margin call), liquid in two days (₪) vs what is owed
  if (g.unit === '₪' || g.id === 'spot' || g.id === 'capture' || g.id === 'ltv') {
    const has2 = g.value != null && Number.isFinite(+g.value);
    const f2 = (x) => (g.unit === '₪' ? mS(x) : g.id === 'spot' ? `₪${N(x)}` : pctI(x));
    const min2 = g.min ?? 0, max2 = g.max ?? Math.max(g.ref ? g.ref * (g.unit === '₪' ? 1.25 : 1.6) : 1, has2 ? +g.value : 1);
    const pos2 = (x) => Math.max(0, Math.min(100, ((x - min2) / Math.max(1e-9, max2 - min2)) * 100));
    const bad = g.id === 'ltv' ? +g.value > g.ref : g.id === 'liquid' ? +g.value < g.ref : g.id === 'capture' ? +g.value < g.ref : g.id === 'spot' ? false : +g.value < g.ref;
    const ref = g.id === 'ltv' ? `מעל ${f2(g.ref)} = קריאת מרווח` : g.id === 'liquid' ? `החובות וההתחייבויות: ${f2(g.ref)}` : g.id === 'spot' ? `ממוצע 12 חודשים: ${f2(g.ref)}` : g.id === 'capture' ? `מתחת ל־${f2(g.ref)} = מחיר צהריים נמוך לסולארי` : `היעד: ${f2(g.ref)}`;
    return `<div class="wp-g${bad ? ' low' : ''}" data-g="${esc(g.id || '')}"><div class="wp-gl"><span>${esc(g.label)}</span><b class="num">${esc(has2 ? f2(g.value) : 'אין עדיין')}</b></div>
    <div class="wp-gbar" aria-hidden="true"><i style="width:${has2 ? pos2(+g.value) : 0}%"></i>${g.ref != null ? `<s style="inset-inline-start:${pos2(g.ref)}%"></s>` : ''}</div>
    ${g.ref != null ? `<small>${esc(ref)}${bad ? (g.id === 'ltv' ? ' · גבוה' : ' · נמוך') : ''}</small>` : ''}</div>`;
  }
  const fmtG = (x) => (g.id === 'tour' || g.id === 'demand' ? (g.id === 'tour' ? tourTxt(x) : xT(x)) : g.id === 'util' || g.id === 'span' ? pctI(x) : g.id === 'coverage' || xRun ? xT(x)
    : g.id === 'runway' || g.id === 'liq' || g.id === 'cover' ? `${Math.round(+x * 10) / 10} חודשים` : g.id === 'rate' ? `${Math.round(+x * 100) / 100}%` : g.id === 'brand' ? String(Math.round(+x)) : String(Math.round(+x * 100) / 100));
  const txt = !has ? (g.id === 'liq' || xRun ? '—' : 'אין עדיין') : fmtG(g.value);
  const highBad = g.id === 'span' || g.id === 'rate';   // over the span / a rate above normal is the bad side
  const low = has && g.ref != null && (highBad ? +g.value > g.ref : +g.value < g.ref);
  const refTxt = g.id === 'tour' || g.id === 'demand' || g.id === 'rate' ? `רגיל = ${esc(fmtG(g.ref))}` : g.id === 'span' ? 'עד 100% — מעבר לזה כל הסניפים מוכרים פחות' : g.id === 'cover' ? `היעד שלך: ${esc(fmtG(g.ref))}`
    : `${!has && g.id === 'liq' ? 'אין עלויות קבועות · ' : !has && xRun ? 'אין קריאות פתוחות · ' : ''}כדאי לפחות ${esc(g.id === 'runway' && !xRun ? String(g.ref) : fmtG(g.ref))}`;
  return `<div class="wp-g${low ? ' low' : ''}" data-g="${esc(g.id || '')}"><div class="wp-gl"><span>${esc(g.label)}</span><b class="num">${esc(txt)}</b></div>
    <div class="wp-gbar" aria-hidden="true"><i style="width:${has ? pos(+g.value) : 0}%"></i>${g.ref != null ? `<s style="inset-inline-start:${pos(g.ref)}%"></s>` : ''}</div>
    ${g.ref != null ? `<small>${refTxt}${low ? (highBad ? ' · גבוה' : ' · נמוך') : ''}</small>` : ''}</div>`;
}
function stripHtml(S) {
  const ms = (S && S.months) || []; if (!ms.length) return '';
  const top = Math.max(1, ...ms.map((x) => Math.abs(+x.cf || 0)));
  return `<section class="wp-sec"><h3>${esc(S.label || '12 החודשים הבאים')}</h3><ol class="wp-strip">${ms.map((x, i) => {
    const v = +x.cf || 0; const h = Math.max(3, Math.round((Math.abs(v) / top) * 46));
    return `<li class="b-${esc(x.band || 'mid')} ${v < 0 ? 'neg' : 'pos'}${i === 0 ? ' now' : ''}"><span class="wp-bar" aria-hidden="true"><i style="height:${h}px"></i></span><b class="num">${esc(moneyOf(v, 'tiny'))}</b><small>${esc(MONTH_S[(x.cal || 1) - 1])}${i === 0 ? ' · עכשיו' : ''}</small><span class="sr">${esc(MONTH_HE[(x.cal || 1) - 1])}: ${esc(mS(v))}, ${esc(BAND_HE[x.band] || '')}</span></li>`;
  }).join('')}</ol><p class="wp-legend"><span class="b-peak">☀️ עונה</span><span class="b-mid">🌤️ רגיל</span><span class="b-off">🌧️ שפל</span></p></section>`;
}
function ringHtml(R, target) {
  if (!R) return '';
  const n = R.window || 12; const vals = (R.values || []).slice(-n); const sum = vals.reduce((s, x) => s + (+x || 0), 0); const avg = Math.round(sum / n);
  const top = Math.max(1, target || 0, ...vals.map((x) => Math.abs(+x || 0)));
  const segs = []; const r = 42, cx = 50, cy = 50, gap = 0.06;
  for (let i = 0; i < n; i++) {
    const v = i < vals.length ? +vals[i] || 0 : null; const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2 + gap, a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2 - gap;
    const p = (a, rr) => `${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
    const k = v == null ? 0 : Math.max(0.15, Math.min(1, Math.abs(v) / top));
    segs.push(`<path d="M${p(a0, r)} A${r} ${r} 0 0 1 ${p(a1, r)}" class="${v == null ? 'empty' : v < 0 ? 'neg' : target && v >= target ? 'met' : 'pos'}" style="opacity:${v == null ? 1 : (0.35 + 0.65 * k).toFixed(2)}"/>`);
  }
  return `<section class="wp-sec wp-ringsec"><h3>${esc(R.label || 'ממוצע 12 החודשים')}</h3><div class="wp-ring"><svg viewBox="0 0 100 100" aria-hidden="true">${segs.join('')}</svg>
    <div class="wp-rc"><b class="num">${esc(mS(avg))}</b><small>${target ? `מתוך ${esc(mS(target))}` : 'בחודש'}</small></div></div>
    <p class="note">${vals.length < n ? `נספרו ${vals.length} מתוך ${n} חודשים — חודש שעוד לא היה נספר כאפס.` : `ממוצע ${n} ימי המשכורת האחרונים.`} כל חודש נכנס לממוצע — גם החורף.</p></section>`;
}
/** w6: one bar per line (panel.bars) — the breakdown risk. Exact chance when the module shows it (the operations engineer), else the band. */
function barsHtml(B) {
  const items = (B && B.items) || []; if (!items.length) return '';
  const exact = items.some((x) => x.value != null);
  const W = { low: 18, mid: 50, high: 88 };
  return `<section class="wp-sec"><h3>${esc(B.label || 'סיכון לתקלה')}</h3><ul class="wp-bars">${items.map((x) => {
    const w = x.value != null ? Math.max(3, Math.min(100, Math.round(Math.sqrt(Math.min(1, +x.value / 0.3)) * 100))) : W[x.band] || 50;
    const t = x.value != null ? `${pct1(x.value)} · ${HZ_HE[x.band] || ''}` : HZ_HE[x.band] || '';
    return `<li class="hz-${esc(x.band || 'mid')}" data-asset="${esc(x.assetId || '')}"><span class="wb-n">${esc(x.name || '')}</span><span class="wb-bar" aria-hidden="true"><i style="width:${w}%"></i></span><b class="num">${esc(t)}</b></li>`;
  }).join('')}</ul>${exact ? '' : '<p class="note">את הסיכוי המדויק רואה רק מי שמכירה כל רעד במכונה (מהנדסת התפעול). כאן רואים את הרמה: מצב נמוך = יותר תקלות.</p>'}</section>`;
}
/** w6: the plant line on top of the panel (worldIndicators.plant) */
function plantLine(P) {
  if (!P) return '';
  const sh = (P.shocks || []).map((x) => x.n).filter(Boolean);
  return `<p class="wp-now">🏭 <b>${num(`${P.lines}/${P.slots}`)}</b> קווים${P.lines ? ` · עלויות קבועות ${num(mS(P.fixedMonth))} בחודש · תזרים הקווים ${num(mSg(P.cfMonth), cls(P.cfMonth))}` : ''}${P.breakdowns ? ` · תקלות עד היום ${num(String(P.breakdowns))}` : ''}${P.penalties ? ` · קנסות ${num(mS(P.penalties))}` : ''}${P.grant ? ' · 🎁 מענק אוטומציה' : ''}${P.noShift3Until ? ` · 🌙 בלי משמרת לילה עד חודש ${num(String(P.noShift3Until))}` : ''}${sh.length ? ` · ${sh.map((x) => esc(x)).join(' · ')}` : ''}</p>`;
}
/** w6: the lines (panel.rows of plant.js): condition (light + pips + number), maintenance, shift, utilisation, this month, value, debt, state badges */
function plantRowsHtml(rows) {
  if (!rows || !rows.length) return '<p class="empty">עוד אין לך קווי ייצור. קו CNC, מכונת הזרקה או מפעל מזון יופיעו כאן עם המצב, הניצולת והסיכון לתקלה שלהם.</p>';
  return `<section class="wp-sec"><h3>הקווים שלך החודש</h3><ul class="wp-rows">${rows.map((r) => {
    const uPct = r.cap > 0 ? Math.round((+r.util || 0) / r.cap * 100) : 0;
    const badges = [r.pending ? `<em class="b">⏳ מגיע בחודש ${esc(r.readyAt)}</em>` : '', r.down ? `<em class="b warn">🔧 בתקלה עד חודש ${esc(r.downUntil)}</em>` : '', r.mothball ? '<em class="b">💤 מושבת</em>' : '',
      r.contract ? `<em class="b ok">📝 חוזה ${pctI(r.contract.vol)} עד חודש ${esc(r.contract.until)}</em>` : '', r.auto ? '<em class="b">🤖 אוטומציה</em>' : '', r.solar ? '<em class="b">☀️ סולארי</em>' : '', r.lease ? '<em class="b">מבנה בשכירות</em>' : ''].join('');
    const cond = r.pending ? '' : `<span class="wp-cond" aria-label="מצב ${esc(r.cond)} מתוך 100, ${esc(LIGHT_HE[r.condLight] || '')}"><span aria-hidden="true">${LIGHT_DOT[r.condLight] || ''} ${pipsOf(r.condPips)}</span> מצב <b class="num">${esc(r.cond)}</b></span>`;
    return `<li class="wp-row" data-asset="${esc(r.assetId)}" data-light="${esc(r.pending || r.mothball ? 'off' : r.down ? 'red' : r.condLight || '')}"><div class="wp-rh"><b>${esc(r.name)}</b><small>${esc(r.label || '')}</small>${badges}</div>
      <div class="wp-rm">${cond}${r.pending ? '' : `<span>תחזוקה ${esc(MAINT_HE[r.maint] || r.maint || '')}</span><span>${esc(shiftHe(r.shift))}</span><span>${r.down || r.mothball ? 'לא מייצר' : `ניצולת <b class="num">${uPct}%</b>`}</span>`}
      <span class="${cls(r.cfNow)}">החודש ${num(mSg(r.cfNow))}</span><span>שווי ${num(mS(r.value))}</span>${r.debt ? `<span>חוב ${num(mS(r.debt))}</span>` : ''}${r.penalty ? `<span class="neg">קנס ${num(mS(r.penalty))}</span>` : ''}</div></li>`;
  }).join('')}</ul></section>`;
}
/* ---------- w7 (chain) panel: the chain line and the branch rows; w8 (projects): the projects line, the timeline (gantt), the equity-call
   calendar, the project rows, rentals and plots. Engine values only (worldIndicators.chain / .proj and panel.*); amounts via E.money. */
function chainLine(C) {
  if (!C) return '';
  const sh = (C.shocks || []).map((x) => x.n).filter(Boolean);
  return `<p class="wp-now">🛍️ <b>${num(`${C.branches}/${C.span}`)}</b> סניפים מול יכולת הניהול (${num(String(C.managers))} מנהלי אזור${C.franchises ? ` · ${num(String(C.franchises))} בזכיינות` : ''}) · עלויות קבועות ${num(mS(C.fixedMonth))} בחודש · קופה ${num(mS(C.liquid))} · מלאי ${num(mS(C.stock))}${C.transit ? ` + בדרך ${num(mS(C.transit))}` : ''}${C.payables ? ` · חוב לספקים ${num(mS(C.payables))}` : ''} · עלות הסחורה ${esc(pctI(C.cogs))} · תשלום לספקים אחרי ${num(String(C.terms))} יום${C.dc ? ' · 🏬 מרכז הפצה' : ''}${C.ecom ? ' · 🌐 אתר' : ''}${C.fill < 0.98 ? ` · ⚠️ המלאי מכסה רק ${esc(pctI(C.fill))} מהביקוש` : ''}${C.lost ? ` · מכירות שאבדו ${num(mS(C.lost))}` : ''}${C.markdowns ? ` · הנחות על עודפים ${num(mS(C.markdowns))}` : ''}${sh.length ? ` · ${sh.map((x) => esc(x)).join(' · ')}` : ''}</p>`;
}
function chainRowsHtml(rows) {
  if (!rows || !rows.length) return '<p class="empty">עוד אין לך סניפים. מיקום לסניף מגיע במשבצת "מיקום לסניף", וסניפים במיקום ידוע — במשבצת "הזדמנות".</p>';
  return `<section class="wp-sec"><h3>הסניפים שלך החודש</h3><ul class="wp-rows">${rows.map((r) => {
    const badges = [!r.own ? '<em class="b">🤝 זכיינות</em>' : '', !r.open ? `<em class="b warn">🚧 בשיפוץ עד חודש ${esc(r.openAt)}</em>` : '', r.count > 1 ? `<em class="b">${esc(r.count)} סניפים</em>` : '',
      r.badFranchisee ? '<em class="b warn">⚠️ זכיין בעייתי</em>' : '', r.lost > 0 ? '<em class="b warn">📭 נגמר המלאי</em>' : ''].join('');
    const stage = `<span class="wp-cond" aria-label="שלב הרצה ${esc(r.stage)} מתוך 4: ${esc(STAGE4[r.stage] || '')}"><span aria-hidden="true">${pips4(r.stage)}</span> ${esc(STAGE4[r.stage] || '')}${r.open && r.ramp < 1 ? ` <b class="num">${esc(pctI(r.ramp))}</b>` : ''}</span>`;
    return `<li class="wp-row" data-asset="${esc(r.assetId)}" data-light="${!r.open ? 'off' : r.badFranchisee ? 'red' : r.stage >= 4 ? 'green' : 'amber'}"><div class="wp-rh"><b>${esc(r.name)}</b><small>${esc(r.label || '')} · אזור ${esc((+r.area || 0) + 1)}${r.locLabel ? ` · ${esc(r.locLabel)}` : r.own ? ' · מיקום עוד לא ידוע' : ''}</small>${badges}</div>
      <div class="wp-rm">${stage}${r.open ? `<span>מכירות ${num(mS(r.sales))}</span>` : ''}${r.royalty != null ? `<span>תמלוגים ${num(mS(r.royalty))}</span>` : ''}<span class="${cls(r.cfNow)}">החודש ${num(mSg(r.cfNow))}</span>${r.own ? `<span>בחודש בוגר ${num(mSg(r.mature), cls(r.mature))}</span><span>שכירות ${num(mS(r.rent))}</span>` : ''}${r.neighbours ? `<span>${num(String(r.neighbours))} שכנים באזור</span>` : ''}<span>שווי ${num(mS(r.value))}</span>${r.debt ? `<span>חוב ${num(mS(r.debt))}</span>` : ''}</div></li>`;
  }).join('')}</ul></section>`;
}
function projsLine(PJ) {
  if (!PJ) return '';
  const sh = (PJ.shocks || []).map((x) => x.n).filter(Boolean);
  return `<p class="wp-now">🏗️ <b>${num(String(PJ.open))}</b> פרויקטים פתוחים · ריבית ${num(PJ.rate + '%')} · הלוואת בנייה ${num(PJ.loanRate + '%')} בחודש (מצטברת לחוב) · ביקוש ×${num(String(PJ.demand))}${PJ.completed ? ` · ${num(String(PJ.completed))} הושלמו (${num(mSg(PJ.profit), cls(PJ.profit))})` : ''}${PJ.forcedSales ? ` · ⚠️ ${num(String(PJ.forcedSales))} נמכרו בכפייה` : ''}${PJ.holdingPaid ? ` · עלויות המתנה ${num(mS(PJ.holdingPaid))}` : ''}${sh.length ? ` · ${sh.map((x) => esc(x)).join(' · ')}` : ''}</p>`;
}
/** w8: the timeline of every project — a bar of the permit + one cell per stage (filled = built), its state in words. Accessible: a list;
 *  every bar is an img whose name says the same as the words under it (the bar adds nothing a screen reader misses). */
/** a permit range the module shows — w9's projects carry a placeholder (± 99 months) until the permit lands: shown as "unknown", never its numbers */
const permitOk = (p) => !!(p && Number.isFinite(+p.lo) && Number.isFinite(+p.hi) && p.hi - p.lo <= 36);
function ganttHtml(G) {
  if (!G || !G.length) return '';
  return `<section class="wp-sec"><h3>לוח זמנים</h3><ol class="wp-gantt">${G.map((r) => {
    const n = Math.max(1, r.stages | 0); const pct = Math.max(0, Math.min(1, +r.pct || 0));
    const state = r.phase === 'permit' ? `ממתין להיתר${permitOk(r.permit) ? `: עוד ${r.permit.lo}–${r.permit.hi} חודשים` : r.permit ? ' (עוד לא ידוע מתי)' : ''}` : r.phase === 'done' ? 'הושלם' : `שלב ${Math.min(n, (r.stage | 0) + 1)} מתוך ${n} · ${Math.round(pct * 100)}%`;
    const flags = [r.paused ? '⏸ מושהה' : '', r.delayed ? '⏳ עיכוב באתר' : '', r.phase === 'build' && r.gate === false ? '🔒 הבנק מחכה למכירות' : '', r.slot === false ? '🔌 בלי חיבור לרשת — הבנק לא מממן' : ''].filter(Boolean);
    const cells = Array.from({ length: n }, (_, i) => { const f = Math.max(0, Math.min(1, pct * n - i)); return `<i class="gs${f >= 1 ? ' done' : f > 0 ? ' part' : ''}" style="--f:${Math.round(f * 100)}%"></i>`; }).join('');
    return `<li data-asset="${esc(r.assetId)}"><span class="gn">${esc(r.name)}</span><span class="gbarw" role="img" aria-label="${esc(`${r.name}: ${state}${flags.length ? ', ' + flags.join(', ') : ''}`)}"><i class="gp${r.phase === 'permit' ? ' on' : ''}">📋</i>${cells}</span><small class="gst">${esc(state)}${flags.length ? ` · ${esc(flags.join(' · '))}` : ''}</small></li>`;
  }).join('')}</ol><p class="note">📋 = ההיתר; כל משבצת = שלב. משבצת מלאה = שלב שכבר נבנה.</p></section>`;
}
/** w8: the equity-call calendar — what each project still needs from your cash and from when; the total against the cash */
function callsHtml(calls, PJ, month) {
  if (!calls || !calls.length) return '';
  const sum = calls.reduce((s, x) => s + (+x.amount || 0), 0);
  return `<section class="wp-sec"><h3>קריאות להון עצמי</h3><ul class="wp-calls">${calls.map((c) => `<li data-asset="${esc(c.assetId)}"><span>${esc(c.name)}</span><small>${c.from > month ? `מחודש ${esc(c.from)}` : 'כבר עכשיו'}</small><b class="num">${esc(mS(c.amount))}</b></li>`).join('')}
    <li class="tot"><span>סך הכול</span><small>${PJ && PJ.runway != null ? `המזומן מכסה ×${esc(String(PJ.runway))}` : ''}</small><b class="num">${esc(mS(sum))}</b></li></ul>
    <p class="note">הון עצמי נגבה מהמזומן שלך בכל יום משכורת שבו שלב צריך אותו. בלי מזומן — השלב עומד, והריבית ממשיכה לרוץ.</p></section>`;
}
function projRowsHtml(rows) {
  if (!rows || !rows.length) return '<p class="empty">עוד אין לך פרויקטים. קרקע מגיעה במשבצת "קרקע לפרויקט"; פרויקט תקוע או מגרש — במשבצת "הזדמנות".</p>';
  return `<section class="wp-sec"><h3>הפרויקטים שלך</h3><ul class="wp-rows">${rows.map((r) => {
    const badges = [`<em class="b">${esc(PHASE_HE[r.phase] || r.phase || '')}</em>`, r.paused ? '<em class="b warn">⏸ מושהה</em>' : '', r.delayed ? '<em class="b warn">⏳ עיכוב באתר</em>' : '', r.failed ? '<em class="b warn">הקבלן פשט רגל</em>' : '',
      (r.stallRun || 0) > 0 ? `<em class="b warn">⛔ עומד ${esc(r.stallRun)} מתוך ${esc(r.callIn)} — אחר כך הבנק קורא להלוואה</em>` : '', r.partner ? `<em class="b">🤝 שותף ${esc(pctI(r.partner))}</em>` : '', r.combo ? '<em class="b">קומבינציה</em>' : '', r.selfFund ? '<em class="b">מממן שלבים מההון שלך</em>' : '',
      r.plan === 'hold' ? '<em class="b ok">🔑 משאיר להשכרה</em>' : ''].join('');
    const sold = r.noPresale ? '<span>בלי מכירות מוקדמות</span>' : `<span class="${r.gate ? 'pos' : ''}">נמכרו ${num(`${r.presold}/${r.units}`)} (${esc(pctI(r.presoldPct))}) · יעד ${esc(pctI(r.target))}${r.gate ? ' · 🔓 הבנק בפנים' : ` · 🔒 הבנק מחכה ל־${esc(pctI(r.gateReq))}`}</span>`;
    return `<li class="wp-row" data-asset="${esc(r.assetId)}" data-light="${(r.stallRun || 0) > 0 || r.paused ? 'red' : r.phase === 'permit' ? 'off' : r.delayed ? 'amber' : 'green'}"><div class="wp-rh"><b>${esc(r.name)}</b><small>${esc(CTR_HE[r.tier] || '')} · ${esc(String(r.units))} יחידות</small>${badges}</div>
      <div class="wp-rm"><span>${r.phase === 'permit' ? (r.permit ? `היתר בעוד ${esc(r.permit.lo)}–${esc(r.permit.hi)} חודשים` : 'ממתין להיתר') : `שלב ${num(`${Math.min(r.stages, r.stage + 1)}/${r.stages}`)} · ${esc(pctI(r.pct))}`}</span>${sold}${r.monthCost ? `<span>שלב בחודש ${num(mS(r.monthCost))}</span>` : ''}${r.equityGap ? `<span class="neg">הון עצמי שעוד צריך ${num(mS(r.equityGap))}</span>` : ''}<span>הלוואה ${num(mS(r.loan))}</span>${r.mezz ? `<span>מזנין ${num(mS(r.mezz))}</span>` : ''}${r.deposits ? `<span>מקדמות בליווי ${num(mS(r.deposits))}</span>` : ''}<span>ריבית שנצברה ${num(mS(r.interest))}</span><span>שווי לפי עלות ${num(mS(r.value))}</span><span>חוב ${num(mS(r.debt))}</span><span class="${cls(r.projected)}">רווח צפוי ${num(mSg(r.projected))}</span></div></li>`;
  }).join('')}</ul></section>`;
}
function rentPlotHtml(PJ, P) {
  const rent = (P && P.rentals) || []; const plots = (PJ && PJ.plots) || [];
  if (!rent.length && !plots.length) return '';
  return `<section class="wp-sec"><h3>מושכר ומגרשים</h3><ul class="wp-rows">${rent.map((r) => `<li class="wp-row" data-asset="${esc(r.assetId)}" data-light="green"><div class="wp-rh"><b>${esc(r.name)}</b><em class="b ok">🔑 מושכר</em></div><div class="wp-rm"><span>${num(String(r.units))} דירות</span><span class="pos">שכירות נטו ${num(mS(r.noi))} בחודש</span><span>שווי ${num(mS(r.value))}</span><span>משכנתא ${num(mS(r.debt))}</span></div></li>`).join('')}${plots.map((r) => `<li class="wp-row" data-asset="${esc(r.assetId)}" data-light="off"><div class="wp-rh"><b>${esc(r.name)}</b><em class="b">🚧 מגרש</em></div><div class="wp-rm"><span>שווי ${num(mS(r.value))}</span><span>אפשר להתחיל פרויקט או למכור — למטה</span></div></li>`).join('')}</ul></section>`;
}
function rowsHtml(rows, P) {
  if (P && P.id === 'plant') return plantRowsHtml(rows);
  if (P && P.id === 'chain') return chainRowsHtml(rows);   // w7
  if (P && P.id === 'proj') return projRowsHtml(rows);     // w8
  if (P && P.id === 'energy') return energyRowsHtml(rows); // w9
  if (!rows || !rows.length) return '<p class="empty">עוד אין לך נכסים עונתיים. מלון, ספא או מרכז כנסים יופיעו כאן עם התפוסה שלהם.</p>';
  return `<section class="wp-sec"><h3>הנכסים שלך החודש</h3><ul class="wp-rows">${rows.map((r) => {
    const pct = r.closed ? 0 : Math.round((+r.occ || 0) * 100); const k = Math.round((r.closed ? 0 : (+r.occDecile || 0)) / 2);
    const badges = [r.closed ? '<em class="b warn">סגור עכשיו</em>' : '', r.wing ? '<em class="b warn">אגף סגור</em>' : '', r.locked ? '<em class="b">חוזה ניהול</em>' : '',
      r.owner ? `<em class="b warn">${gw('אתה מנהל', 'את מנהלת')} בעצמך</em>` : '', r.allot ? `<em class="b ok">הקצאה ${Math.round((r.allot.share || 0) * 100)}% עד חודש ${esc(r.allot.until)}</em>` : ''].join('');
    return `<li class="wp-row" data-asset="${esc(r.assetId)}"><div class="wp-rh"><b>${esc(r.name)}</b>${badges}</div>
      <div class="wp-rm"><span class="wp-occ" aria-label="תפוסה ${pct}%"><span aria-hidden="true">${r.closed ? '🔒' : '▮'.repeat(k) + '▯'.repeat(5 - k)}</span> <b class="num">${pct}%</b></span>
      <span>${esc(PROF_HE[r.profile] || r.profile || '')}</span><span>מחיר עכשיו: ${esc(TIER_HE[r.tier] || r.tier || '')}</span><span>מוניטין <b class="num">${esc(r.rep)}</b></span><span>${r.staff === 'seasonal' ? 'צוות עונתי' : 'צוות קבוע'}</span>
      <span>תוכנית: עונה ${esc(TIER_HE[r.peak] || '')} · שפל ${esc(TIER_HE[r.off] || '')}</span><span class="${cls(r.cfNow)}">החודש ${num(sgn(r.cfNow))}</span></div></li>`;
  }).join('')}</ul></section>`;
}
function actionsHtml(acts, rows) {
  if (!acts || !acts.length) return '';
  const name = (id) => ((rows || []).find((r) => r.assetId === id) || {}).name || '';
  const groups = new Map();
  for (const a of acts) { const g = a.assetId || ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(a); }
  const btn = (a, i) => `<button type="button" class="chip wp-act${a.suggested ? ' sug' : ''}${a.current ? ' cur' : ''}${WP_CONFIRM.has(a.id) ? ' risky' : ''}" data-wact="${i}" data-aid="${esc(a.id)}" ${a.enabled ? '' : 'disabled'} ${a.current ? 'aria-pressed="true"' : ''}${a.reason ? ` title="${esc(a.reason)}"` : ''}>${a.current ? '✓ ' : a.suggested ? '💡 ' : ''}${escI(a.assetId && name(a.assetId) ? a.label.replace(name(a.assetId) + ': ', '') : a.label)}${!a.enabled && a.reason ? `<small> · ${esc(a.reason)}</small>` : ''}</button>`;
  const idx = new Map(acts.map((a, i) => [a, i]));
  // w6: radio-like actions (maintenance policy, shifts) sit together on one labelled row; the rest flow after them
  const body = (list) => { const out = []; let k = 0;
    while (k < list.length) { const id = list[k].id; let j = k; while (j < list.length && list[j].id === id) j++;
      const run = list.slice(k, j);
      out.push(run.length > 1 && WP_SEG[id] ? `<div class="wp-seg" role="group" aria-label="${esc(WP_SEG[id])}"><span class="wp-segl">${esc(WP_SEG[id])}</span>${run.map((a) => btn(a, idx.get(a))).join('')}</div>` : run.map((a) => btn(a, idx.get(a))).join(''));
      k = j; }
    return out.join(''); };
  return `<section class="wp-sec"><h3>מה אפשר לעשות עכשיו</h3>${[...groups].map(([g, list]) => `<div class="wp-ag"><h4>${esc(g ? name(g) : 'כל העסק')}</h4><div class="wp-acts">${body(list)}</div></div>`).join('')}
    <p class="note">💡 = מה שהמנטור היה בוחר עכשיו. כל פעולה נכנסת לחודש הזה מיד (בלי להטיל קוביות).</p></section>`;
}
/* ---------- w9 (energy) panel: the line on top, the projects (rows), the plants (DCF, LTV, refinancing room, DSCR), sites, the pilot */
function energyLine(EN) {
  if (!EN) return '';
  const sh = (EN.shocks || []).map((x) => ({ heat: '🔥 גל חום', sand: '🌪️ סופת חול', curtail: '⛔ הגבלת רשת', ppaCut: 'קיצוץ בתעריף' }[x.t] || '')).filter(Boolean);
  return `<p class="wp-now">☀️ הכנסה תפעולית אחרי החזר חוב ${num(mSg(EN.income), cls(EN.income))} מתוך ${num(mS(EN.target))} בחודש · ריבית ${num(EN.rate + '%')} (בנייה ${num(String(Math.round(EN.buildRate * 1200) / 100) + '%')} בשנה) · חשמל ${num(mwh(EN.px))}${EN.spike ? ' <b>(קפיצה)</b>' : ''} · ממוצע ${num(mwh(EN.avg))} · סולארי מקבל ${num(pctI(EN.capture))} מהמחיר · PPA לסולארי עכשיו ${num(mwh(EN.ppaNow))}
    · 🔌 ${num(String((EN.slots || {}).free || 0))} חיבורים פנויים${(EN.slots || {}).waiting ? ` · ${num(String(EN.slots.waiting))} פרויקטים מחכים לחיבור` : ''}${((EN.slots || {}).queue || []).length ? ` · בתור: ${EN.slots.queue.map((q) => `חודש ${num(String(q.at))}`).join(', ')}` : ''}
    ${EN.refis ? ` · מימון מחדש ×${num(String(EN.refis))} (${num(mS(EN.refiCash))})` : ''}${EN.lpNext ? ` · חלוקה למשקיעים בחודש ${num(String(EN.lpNext))}` : ''}${EN.squeeze ? ` · <b class="neg">⚠️ ${num(`${EN.squeeze}/${EN.squeezeLimit}`)} חודשים שהתחנות לא מכסות את החוב</b>` : ''}${sh.length ? ` · ${sh.map((x) => esc(x)).join(' · ')}` : ''}</p>`;
}
function energyRowsHtml(rows) {
  if (!rows || !rows.length) return '';
  return `<section class="wp-sec"><h3>הפרויקטים בבנייה</h3><ul class="wp-rows">${rows.map((r) => {
    const badges = [`<em class="b">${esc(PHASE_HE[r.phase] || r.phase || '')}</em>`, r.slot ? '<em class="b ok">🔌 מחובר לרשת</em>' : '<em class="b warn">🔌 בלי חיבור לרשת</em>', r.paused ? '<em class="b warn">⏸ מושהה</em>' : '', r.delayed ? '<em class="b warn">⏳ עיכוב באתר</em>' : '',
      (r.stallRun || 0) > 0 ? `<em class="b warn">⛔ עומד ${esc(r.stallRun)} מתוך ${esc(r.callIn)} — אחר כך הבנק מוכר אותו</em>` : '', r.stake < 1 ? `<em class="b">🤝 ${esc(pctI(r.stake))} שלך</em>` : '', r.offtake ? `<em class="b">בסיום: ${esc(OFF_HE[r.offtake] || r.offtake)}</em>` : ''].join('');
    return `<li class="wp-row" data-asset="${esc(r.assetId)}" data-light="${(r.stallRun || 0) > 0 || r.paused || !r.slot ? 'red' : r.phase === 'permit' ? 'off' : r.delayed ? 'amber' : 'green'}"><div class="wp-rh"><b>${TECH_IC[r.tech] || ''} ${esc(r.name)}</b><small>${esc(TECH_HE[r.tech] || '')} · ${num(String(r.mw))} מגה־ואט</small>${badges}</div>
      <div class="wp-rm"><span>${r.phase === 'permit' ? (permitOk(r.permit) ? `היתרים בעוד ${esc(r.permit.lo)}–${esc(r.permit.hi)} חודשים` : 'ממתין להיתרים — עוד לא ידוע מתי') : `שלב ${num(`${Math.min(r.stages, r.stage + 1)}/${r.stages}`)} · ${esc(pctI(r.pct))}`}</span><span>עלות הקמה ${num(mS(r.capex))}</span>${r.equityGap ? `<span class="neg">הון עצמי שעוד צריך ${num(mS(r.equityGap))}</span>` : ''}<span>הלוואת בנייה ${num(mS(r.loan))}</span><span>ריבית שנצברה ${num(mS(r.interest))}</span>${r.costToComplete ? `<span>עד הסוף ${num(mS(r.costToComplete))}</span>` : ''}${r.q ? `<span>תפוקת האתר ${num(`${Math.round(r.q.lo * 100)}–${Math.round(r.q.hi * 100)}%`)}</span>` : ''}<span>שווי ${num(mS(r.value))}</span><span>חוב ${num(mS(r.debt))}</span></div></li>`;
  }).join('')}</ul></section>`;
}
function plantsHtml(rows, EN) {
  const sites = (EN && EN.sites) || []; const h2 = (EN && EN.h2) || [];
  if (!(rows || []).length && !sites.length && !h2.length) return '<section class="wp-sec"><h3>התחנות שלך</h3><p class="empty">עוד אין לך תחנות שעובדות. אתר לפרויקט מגיע במשבצת "אתר אנרגיה"; תחנה שעובדת וחיבור לרשת — במשבצת "הזדמנות".</p></section>';
  const pl = (rows || []).map((r) => `<li class="wp-row" data-asset="${esc(r.assetId)}" data-light="${r.down ? 'red' : r.cf < 0 ? 'amber' : 'green'}"><div class="wp-rh"><b>${TECH_IC[r.tech] || ''} ${esc(r.name)}</b><small>${esc(TECH_HE[r.tech] || '')}${r.mw ? ` · ${num(String(r.mw))} מגה־ואט` : ''}</small><em class="b">${esc(OFF_HE[r.offtake] || r.offtake || '')}${r.offtake === 'ppa' && r.ppa ? ` · ${r.tech === 'storage' ? esc(mS(r.ppa)) + ' למגה־ואט בחודש' : esc(mwh(r.ppa))}` : ''}</em>${r.stake < 1 ? `<em class="b">🤝 ${esc(pctI(r.stake))} שלך</em>` : ''}${r.down ? '<em class="b warn">⛔ מושבתת החודש</em>' : ''}${r.suggestedRefi ? '<em class="b ok">💡 שווה לממן מחדש</em>' : ''}</div>
    <div class="wp-rm">${r.mwh ? `<span>${num(N(r.mwh))} מגה־ואט שעה · ${num(mwh(r.price))}</span>` : ''}<span>הכנסות ${num(mS(r.rev))}</span><span>תפעול ${num(mS(r.opex))}</span><span>החזר חוב ${num(mS(r.debtService))}</span><span class="${cls(r.cf)}">נשאר החודש ${num(mSg(r.cf), cls(r.cf))}</span><span class="${cls(r.runRate)}">בחודש רגיל ${num(mSg(r.runRate), cls(r.runRate))}</span>${r.dscr != null ? `<span>כיסוי החוב ×${num(String(r.dscr))}</span>` : ''}
      <span>שווי היוון (DCF) ${num(mS(r.dcf))}</span><span>חוב ${num(mS(r.debt))}${r.ltv != null ? ` · ${num(pctI(r.ltv))} מהשווי (עד ${num(pctI(r.ltvMax))})` : ''}</span><span class="${r.refiRoom >= 1000000 ? 'pos' : ''}">מקום למימון מחדש ${num(mS(r.refiRoom))}</span><span>עוד ${num(String(r.tenor))} חודשי החזר</span></div></li>`).join('');
  const st = sites.map((x) => `<li class="wp-row" data-asset="${esc(x.assetId)}" data-light="off"><div class="wp-rh"><b>🏜️ ${esc(x.name)}</b><em class="b">קרקע לפרויקט</em></div><div class="wp-rm"><span>${esc(TECH_HE[x.tech] || '')} · ${num(String(x.mw))} מגה־ואט</span><span>אפשר להתחיל בהיתרים — למטה</span></div></li>`).join('');
  const hh = h2.map((x) => `<li class="wp-row" data-asset="${esc(x.assetId)}" data-light="${x.done ? (x.hit ? 'green' : 'red') : 'amber'}"><div class="wp-rh"><b>🧪 ${esc(x.name)}</b><em class="b${x.done && !x.hit ? ' warn' : ''}">${x.done ? (x.hit ? 'הצליח' : 'נסגר') : 'בניסוי'}</em></div><div class="wp-rm">${x.done ? '' : `<span class="neg">שורף ${num(mS(x.burn))} בחודש</span><span>התוצאה בחודש ${num(String(x.revealAt))}</span>`}</div></li>`).join('');
  return `<section class="wp-sec"><h3>התחנות שלך</h3><ul class="wp-rows">${pl}${st}${hh}</ul><p class="note">"בחודש רגיל" = מה שנספר ליעד: תפוקה ממוצעת, מחיר ממוצע של 12 חודשים, אחרי החזר החוב. "נשאר החודש" = מה שבאמת נכנס.</p></section>`;
}
/** the season HUD numbers (w5 worldIndicators.season) as one line on top of the panel */
function seasonLine(se) {
  if (!se) return '';
  return `<p class="wp-now">${BAND_IC[se.band] || ''} <b>${esc(MONTH_HE[se.cal - 1] || '')}</b> · ${esc(BAND_HE[se.band] || '')} · ביקוש בעיר ${num(tourTxt(se.tour))}${se.festival ? ' · 🎪 פסטיבל החודש' : ''}${se.line ? ` · קו עונתי ${num(fmtM(se.line))} מתוך ${num(fmtM(se.lineMax))}` : ''}${(se.shocks || []).length ? ` · ${se.shocks.map((x) => esc(x.n)).filter(Boolean).join(' · ')}` : ''}</p>`;
}
/** w6–w8: actions that cannot be undone ask for a second tap (sell a line / the building, close / convert a branch, a clearance sale, sell
 *  the DC, a project, a plot or a rental); radio-like groups get a row label */
const WP_CONFIRM = new Set(['sellLine', 'leaseback', 'close', 'convert', 'clearance', 'dcLeaseback', 'sellProj', 'sellPlot', 'sellRent',
  'sellStake', 'sellPlant', 'sellSlot', 'sellNow', 'secondary', 'sell', 'wageCut', 'raise', 'bridge', 'pivot']);   // w15: a round / a bridge sell part of the company (the first tap shows the dilution); a pivot loses 40 % of the users   // w13: a player's sale; the wage cut (the star leaves for free)   // w9 / w10: a stake, a plant, a slot, a fund now (−5 %), a private stake (−25 %)
const WP_SEG = { maint: 'תחזוקה', shift: 'משמרות', cover: 'מלאי: חודשי כיסוי', presale: 'יעד מכירות מוקדמות', develop: 'להתחיל פרויקט', offtake: 'בסיום: איך מוכרים את החשמל' };
/* ---------- w13 (league) panel "המועדון והטבלה": the club line, the gauges (wages ÷ revenue in %, the rank with the cliff, strength vs the
   tier, the stands' fill), the table (an accessible <table>: the zones are words + ▲ / ▼, our row named), the squad as tokens with an age ring
   (market value vs book, wage, contract, injured / on loan / academy / in the eleven) with each player's own actions, then the club's actions.
   Actions keep their index in panel.actions (data-wact), so the panel's one handler (two taps for a sale) serves them. */
function leagueGauge(g) {
  const v = +g.value || 0;
  if (g.id === 'wageRatio') { const bad = v > g.ref; const pos = Math.min(100, (v / (g.max || 1.2)) * 100);
    return `<div class="wp-g${bad ? ' low' : ''}" data-g="wageRatio"><div class="wp-gl"><span>${esc(g.label)}</span><b class="num">${esc(wrT(v))}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${pos}%"></i><s style="inset-inline-start:${(g.ref / (g.max || 1.2)) * 100}%"></s></div><small>היעד: עד ${esc(pctI(g.ref))} · מעל 80% בסוף העונה = קנס${bad ? ' · גבוה' : ''}</small></div>`; }
  if (g.id === 'rank') { const up = v <= g.ref; const pos = ((8 - v) / 7) * 100;
    return `<div class="wp-g${v >= 7 ? ' low' : ''}" data-g="rank"><div class="wp-gl"><span>${esc(g.label)}</span><b class="num">מקום ${esc(String(v))} מתוך 8</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${pos}%"></i><s style="inset-inline-start:${((8 - g.ref) / 7) * 100}%"></s></div><small>${up ? '▲ באזור העלייה (מקום 1–2)' : v >= 7 ? '▼ באזור הירידה (מקום 7–8)' : 'באמצע — מקום 1–2 עולים, 7–8 יורדים'}</small></div>`; }
  if (g.id === 'strength') { const d = Math.round((v - g.ref) * 10) / 10;
    return `<div class="wp-g${d < 0 ? ' low' : ''}" data-g="strength"><div class="wp-gl"><span>${esc(g.label)}</span><b class="num">${esc(String(v))}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, (v - 35) / 50 * 100))}%"></i><s style="inset-inline-start:${Math.max(0, Math.min(100, (g.ref - 35) / 50 * 100))}%"></s></div><small>ממוצע הדרג ${esc(String(g.ref))} · ${d >= 0 ? `+${d} מעליו` : `${d} מתחתיו`}</small></div>`; }
  const bad = v < g.ref;
  return `<div class="wp-g${bad ? ' low' : ''}" data-g="${esc(g.id)}"><div class="wp-gl"><span>${esc(g.label)}</span><b class="num">${esc(pctI(v))}</b></div><div class="wp-gbar" aria-hidden="true"><i style="width:${Math.min(100, v * 100)}%"></i><s style="inset-inline-start:${g.ref * 100}%"></s></div><small>רגיל: ${esc(pctI(g.ref))}${bad ? ' · נמוך' : ''}</small></div>`;
}
function leagueLine(LG) {
  if (!LG) return '';
  const La = LG.last || {}; const P = LG.payoff || {};
  return `<p class="wp-now">🏟️ <b>${esc(LG.divName)}</b> · עונה ${num(String(LG.season))} · מחזור ${num(`${LG.round}/${LG.rounds}`)}${LG.window ? ' · <b>🔁 חלון העברות פתוח</b> (מכירה בלי הנחה)' : ' · מחוץ לחלון: מכירה ב־10% פחות'} · הכנסות החודש ${num(mS(La.rev || 0))} (כרטיסים ${num(mS(La.gate || 0))}, טלוויזיה ${num(mS(La.tv || 0))}, מרצ׳נדייז ${num(mS(La.merch || 0))}) · שכר ${num(mS(LG.wages))} · תפעול ${num(mS(La.ops || 0))} · נשאר ${num(mSg(La.cf || 0), cls(La.cf || 0))}
    · ${P.up ? `עלייה: הכנסות ×${num(String(P.up))}` : 'בדרג העליון'}${P.down ? ` · ירידה: ×${num(String(P.down))}` : ''} · פרס על מקום 1 ${num(mS((LG.prize || [])[0] || 0))}, מקום 3 ${num(mS((LG.prize || [])[2] || 0))}
    · ${num(String(LG.seats))} מקומות${LG.build ? ` · 🏗️ מרחיבים: שלב ${num(String(LG.build.stage))} מתוך 2 עד חודש ${num(String(LG.build.at))}` : ''}${LG.train ? ' · מתחם אימונים' : ''}${LG.academy ? ' · אקדמיה' : ''}${LG.naming && LG.naming.until >= 0 ? ` · שם האצטדיון נמכר (${LG.naming.mode === 'now' ? 'כסף מראש' : '8% מהכרטיסים'})` : ''}${LG.ffp ? ` · <b class="neg">⚠️ ${num(String(LG.ffp))} קנסות יציבות</b>` : ''}${LG.sold ? ` · נמכרו ${num(String(LG.sold))} (${num(mSg(LG.soldGain), cls(LG.soldGain))} מול הספרים)` : ''}</p>`;
}
function leagueTableHtml(T, LG) {
  if (!T || !T.length) return '';
  const zone = (z) => (z === 'up' ? '▲ עולה' : z === 'down' ? '▼ יורדת' : '');
  return `<section class="wp-sec"><h3>הטבלה · ${esc((LG && LG.divName) || '')}</h3><table class="lgtbl"><caption class="sr">טבלת הליגה: מקום, מועדון, נקודות ואזור. שתיים ראשונות עולות דרג, שתיים אחרונות יורדות.</caption>
    <thead><tr><th scope="col">מקום</th><th scope="col">מועדון</th><th scope="col">נק׳</th><th scope="col">אזור</th></tr></thead><tbody>${T.map((x) => `<tr class="${x.us ? 'us' : ''}" data-zone="${esc(x.zone || '')}"><td class="num">${esc(String(x.pos))}</td><th scope="row">${x.us ? '★ ' : ''}${esc(x.name)}${x.us ? ' <small>(שלך)</small>' : ''}</th><td class="num">${esc(String(x.pts))}</td><td>${esc(zone(x.zone))}</td></tr>`).join('')}</tbody></table>
    <p class="note">בין מקום 2 למקום 3 עובר הצוק: שתי הראשונות עולות וההכנסות קופצות, השלישית נשארת.</p></section>`;
}
function squadHtml(P, acts) {
  const rows = P.rows || []; if (!rows.length) return '';
  const byP = new Map(); acts.forEach((a, i) => { if (a.param && /^p\d+$/.test(a.param) && ['sell', 'renew', 'loanOut'].includes(a.id)) { if (!byP.has(a.param)) byP.set(a.param, []); byP.get(a.param).push([a, i]); } });
  const AL = { sell: 'למכור', renew: 'לחדש חוזה', loanOut: 'להשאיל' };
  const btn = ([a, i], r) => `<button type="button" class="chip wp-act${a.suggested ? ' sug' : ''}${WP_CONFIRM.has(a.id) ? ' risky' : ''}" data-wact="${i}" data-aid="${esc(a.id)}" data-pid="${esc(r.pid)}" ${a.enabled ? '' : 'disabled'} aria-label="${esc(a.label)}"${a.reason ? ` title="${esc(a.reason)}"` : ''}>${a.suggested ? '💡 ' : ''}${esc(AL[a.id] || a.id)}${a.id === 'sell' && a.price != null ? ` <small class="num">${esc(mS(a.price))}</small>` : ''}</button>`;
  return `<section class="wp-sec"><h3>הסגל (${num(String(rows.length))} שחקנים) · השווי הנקי סופר את הספרים, לא את השוק</h3><ul class="wp-rows squad">${rows.map((r) => {
    const b = ageBand(r.age);
    const badges = [r.starter ? '<em class="b ok">בהרכב</em>' : '', r.injured ? '<em class="b warn">🩹 פצוע</em>' : '', r.loaned ? '<em class="b">↔ בהשאלה</em>' : '', r.academy ? '<em class="b">🌱 אקדמיה</em>' : '', r.monthsLeft <= 6 ? `<em class="b warn">⏳ ${esc(String(r.monthsLeft))} חודשים לסוף החוזה</em>` : ''].join('');
    const gain = r.mv - r.book;
    return `<li class="wp-row prow" data-pid="${esc(r.pid)}" data-light="${r.injured ? 'red' : r.starter ? 'green' : 'off'}"><div class="wp-rh">${tokenHtml(r)}<div class="pr-n"><b>${esc(r.name)}</b><small>גיל ${esc(String(r.age))} · ${esc(b.he)} · דירוג ${esc(String(r.rating))} · פוטנציאל ${esc(`${r.potLo}–${r.potHi}`)}</small></div>${badges}</div>
      <div class="wp-rm"><span>בשוק ${num(mS(r.mv))}</span><span>בספרים ${num(mS(r.book))}</span><span class="${cls(gain)}">${gain >= 0 ? 'רווח במכירה' : 'הפסד במכירה'} ${num(mSg(gain), cls(gain))}</span><span>שכר ${num(mS(r.wage))} בחודש</span><span>חוזה עד חודש ${num(String(r.until))}</span></div>
      ${(byP.get(r.pid) || []).length ? `<div class="wp-acts pr-acts">${byP.get(r.pid).map((x) => btn(x, r)).join('')}</div>` : ''}</li>`;
  }).join('')}</ul><p class="note">הטבעת סביב הדירוג = הגיל: צעיר עד 21, עולה עד 24, בשיא עד 28, אחרי השיא עד 30, ותיק. מכירה מבקשת לחיצה שנייה.</p></section>`;
}
function leagueActsHtml(acts) {
  const list = acts.map((a, i) => [a, i]).filter(([a]) => !(a.param && /^p\d+$/.test(a.param)));
  if (!list.length) return '';
  return `<section class="wp-sec"><h3>המועדון והאצטדיון</h3><div class="wp-acts">${list.map(([a, i]) => `<button type="button" class="chip wp-act${a.suggested ? ' sug' : ''}${WP_CONFIRM.has(a.id) ? ' risky' : ''}" data-wact="${i}" data-aid="${esc(a.id)}" ${a.enabled ? '' : 'disabled'}${a.reason ? ` title="${esc(a.reason)}"` : ''}>${a.suggested ? '💡 ' : ''}${escI(a.label)}${!a.enabled && a.reason ? `<small> · ${esc(a.reason)}</small>` : ''}</button>`).join('')}</div>
    <p class="note">💡 = מה שהמנטור היה בוחר עכשיו. כל פעולה נכנסת לחודש הזה מיד (בלי להטיל קוביות).</p></section>`;
}
/** w11 / w15 panel buttons: the action's index in panel.actions (data-wact), 💡 the mentor's pick, a sub-line (price / CAC / dilution) */
function wvBtn(a, i, label, sub) {
  return `<button type="button" class="chip wp-act${a.suggested ? ' sug' : ''}${WP_CONFIRM.has(a.id) || WV2.needsArm(a) || WV3.needsArm(a) ? ' risky' : ''}" data-wact="${i}" data-aid="${esc(a.id)}" ${a.enabled ? '' : 'disabled'} aria-label="${esc(`${a.suggested ? '💡 ' : ''}${label}${sub ? ` ${sub}` : ''}${!a.enabled && a.reason ? ` · ${a.reason}` : ''}${label !== a.label ? ` — ${a.label}` : ''}`)}"${a.reason ? ` title="${esc(a.reason)}"` : ''}>${a.suggested ? '💡 ' : ''}${escI(label)}${sub ? ` <small>${escI(sub)}</small>` : ''}${!a.enabled && a.reason ? `<small> · ${esc(a.reason)}</small>` : ''}</button>`;
}
function leaguePanelHtml(P, LG) {
  const acts = P.actions || [];
  return `${leagueLine(LG)}<div class="wp-gauges">${(P.gauges || []).map(leagueGauge).join('')}</div>${leagueTableHtml(P.table, LG)}${squadHtml(P, acts)}${leagueActsHtml(acts)}`;
}
export function worldPanelHtml(P, { season = null, target = 0, plant = null, chain = null, proj = null, energy = null, league = null, multinational = null, platform = null, holding = null, harvest = null, month = 0, ...rest } = {}) {
  if (!P) return '';
  { const h3 = WV3.panelHtml(WVH2, P, { ...rest, month }, wvBtn); if (h3 != null) return h3; }   // w14 credit / w17 trials / w18 insure / w19 bell / w20 funds
  if (P.id === 'league') return leaguePanelHtml(P, league);   // w13
  if (P.id === 'multinational') return WV.mnPanelHtml(WVH, P, multinational, wvBtn);   // w11
  if (P.id === 'platform') return WV.pfPanelHtml(WVH, P, platform, wvBtn);   // w15
  if (P.id === 'holding') return WV2.hdPanelHtml(WVH2, P, holding, wvBtn);   // w12
  if (P.id === 'harvest') return WV2.hvPanelHtml(WVH2, P, harvest, wvBtn);   // w16
  const names = [...(P.rows || []), ...(P.rentals || []), ...((proj && proj.plots) || []), ...(P.plants || []), ...((energy && energy.sites) || []), ...((energy && energy.h2) || [])];   // w8 / w9: actions on rentals, plots, plants, sites are named too
  return `${seasonLine(season)}${plantLine(plant)}${chainLine(chain)}${projsLine(proj)}${P.id === 'energy' ? energyLine(energy) : ''}<div class="wp-gauges">${(P.gauges || []).map((g) => gaugeHtml(g, P.id)).join('')}</div>${stripHtml(P.strip)}${ringHtml(P.ring, target)}${barsHtml(P.bars)}${P.id === 'proj' || P.id === 'energy' ? ganttHtml(P.gantt) + callsHtml(P.calls, proj, month) : ''}${rowsHtml(P.rows, P)}${P.id === 'proj' ? rentPlotHtml(proj, P) : ''}${P.id === 'energy' ? plantsHtml(P.plants, energy) : ''}${actionsHtml(P.actions, names)}`;
}
/**
 * Open the world panel. get() → {panel, season, target} (fresh each time); onAct(action) → Promise<{ok, error?, toast?}>.
 * Resolves when the player closes it.
 */
export function worldPanel(get, onAct) {
  let D = get(); if (!D || !D.panel) return Promise.resolve();
  let busyAct = false;
  const draw = (c) => { const b = c.querySelector('.wp-body'); if (b) { const st = c.scrollTop; b.innerHTML = worldPanelHtml(D.panel, D); c.scrollTop = st; } };
  return modal({ tag: D.panel.title || 'לוח המפה', color: ({ plant: '#9a3412', chain: '#9b1c24', proj: '#854d0e', energy: '#155e75', market: '#a16207', league: '#7f1d1d', multinational: '#92400e', platform: '#4c1d95', holding: '#14532d', harvest: '#075985', ...WV3.PANEL_COLOR })[D.panel.id] || '#0e7490', title: D.panel.title || 'לוח המפה', cls: 'wpanel', wide: true,
    html: `<div class="wp-body">${worldPanelHtml(D.panel, D)}</div><p class="wp-msg" aria-live="polite"></p>`,
    actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true,
    // a long sheet opens at its top (the modal focuses "סגירה" at the bottom, which scrolled phones to the end): focus the title instead
    onOpen: (c) => setTimeout(() => { const h = c.querySelector('#gmTitle'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } c.scrollTop = 0; }, 80),
    onExtra: async (e) => {
      const b = e.target.closest('button[data-wact]'); if (!b || b.disabled || busyAct) return;
      const a = (D.panel.actions || [])[+b.dataset.wact]; if (!a) return;
      const c0 = $('#gmCard');
      if ((WP_CONFIRM.has(a.id) || WV2.needsArm(a) || WV3.needsArm(a)) && b.dataset.arm !== '1') {   // the first tap only arms the button (a sale cannot be undone; w12 a restructuring; w16 a hedge's deposit)
        c0?.querySelectorAll('button[data-arm="1"]').forEach((x) => { x.dataset.arm = ''; x.classList.remove('arm'); });
        b.dataset.arm = '1'; b.classList.add('arm'); sfx('click');
        const at = WV3.armText(a, D, WVH2) || WV.armText({ ...a, amountText: a.amount != null ? mS(a.amount) : '' }, D.platform) || WV2.armText(a, D, WVH2);   // w14 / w17 / w18 / w19 / w20 first: their sales, floats, stops and the gate   // w15: the dilution before the confirming tap · w12 / w16: the sale, the ★ cap, the hedge's deposit
        const m0 = c0?.querySelector('.wp-msg'); if (m0) { m0.textContent = at || `אי אפשר לבטל את זה. לחיצה נוספת על הכפתור מאשרת: ${a.label}`; m0.className = 'wp-msg neg'; }
        // the same words right under the armed button's group (the live line sits at the panel's end, out of view on a long panel)
        c0?.querySelectorAll('.wp-armnote').forEach((x) => x.remove()); const host = b.closest('.wp-seg, .wp-acts'); if (host && m0) { const n = document.createElement('p'); n.className = 'wp-armnote neg'; n.setAttribute('aria-hidden', 'true'); n.textContent = m0.textContent; host.after(n); }
        return;
      }
      busyAct = true; sfx('click');
      let r = null; try { r = await onAct(a); } catch (x) { r = { ok: false, error: x && x.message }; }
      busyAct = false;
      const c = $('#gmCard'); if (!c || !c.classList.contains('wpanel')) return;
      D = get() || D; draw(c);
      const msg = c.querySelector('.wp-msg'); if (msg) { msg.textContent = r && r.ok === false ? (r.error || 'לא אפשרי עכשיו') : (r && r.toast) || 'בוצע'; msg.className = 'wp-msg ' + (r && r.ok === false ? 'neg' : 'pos'); }
      const same = c.querySelector(`button[data-wact="${b.dataset.wact}"]`); (same && !same.disabled ? same : c.querySelector('.acts button.primary'))?.focus();
    } });
}
export const worldPanelOpen = () => !!document.querySelector('#gm:not([hidden]) #gmCard.wpanel');

/* ============================================================ w10 מרכז הפיננסים: the market screen ("הבורסה והתיק")
   get() → panelData (panel + worldIndicators.market / .portfolio); onAct(action) → E.worldAction; api = game.js marketApi (the engine's pure
   market.preview / qtyFor / tradeBlock, cash, month). A trade is ALWAYS previewed: the form computes market.preview for the exact quantity
   and the confirm button sends that quantity ("<id>:<b|s>:<qty>") — the costs on screen are the costs the engine charges. */
const MKF = { mS, mSg, ex: (n) => fmtM(Math.round(+n || 0)) };
export function marketPanel(get, onAct, api = {}) {
  let D = get(); if (!D || !D.panel) return Promise.resolve();
  const view = { tab: 'list', sel: null, side: 'b', unit: 'cash', amount: 0 };
  let chart = null; let busyAct = false;
  const coOf = (id) => { if (!id) return null; const MK = D.market || {}; if (id === 'IDX') return MK.idx; if (/^g\d+$/.test(id)) { const g = (MK.grave || [])[+id.slice(1)]; return g ? { ...g, sectorLabel: (MK.sectors || {})[g.sector] || '', status: g.reason } : null; } return (MK.cos || []).find((c) => c.id === id) || null; };
  const actBtns = (pred) => { const acts = (D.panel.actions || []).map((a, i) => [a, i]).filter(([a]) => pred(a)); if (!acts.length) return '';
    return `<div class="wp-acts">${acts.map(([a, i]) => `<button type="button" class="chip wp-act${a.suggested ? ' sug' : ''}${a.urgent ? ' urgent' : ''}${WP_CONFIRM.has(a.id) ? ' risky' : ''}" data-wact="${i}" data-aid="${esc(a.id)}" ${a.enabled ? '' : 'disabled'}>${a.suggested ? '💡 ' : ''}${escI(a.label)}${a.preview && a.preview.qty ? `<small> · עמלה ${esc(mS(a.preview.commission))} · מרווח ${esc(mS(a.preview.spreadCost))}${a.preview.tax ? ` · מס ${esc(mS(a.preview.tax))}` : ''} · ${a.preview.side === 'b' ? 'יוצא' : 'נכנס'} ${esc(mS(a.preview.total))}</small>` : a.preview && a.preview.ltvAfter != null ? `<small> · מינוף אחרי ${esc(pctI(a.preview.ltvAfter))} · ריבית ${esc(mS(a.preview.monthly))} בחודש</small>` : ''}${!a.enabled && a.reason ? `<small> · ${esc(a.reason)}</small>` : ''}</button>`).join('')}</div>`; };
  const series = (c) => (c ? marketSeries(c, { news: (D.market || {}).news || [], live: c.status == null || c.status === 'listed' || c.status === 'halted', month: D.month }) : null);
  const body = () => {
    const MK = D.market || {}; const PF = D.portfolio || {};
    const live = (MK.cos || []).filter((c) => c.status === 'listed' || c.status === 'halted');
    const counts = { list: live.length + 1, closed: (MK.cos || []).length - live.length + (MK.grave || []).length, funds: (PF.funds || []).length + (PF.privates || []).length };
    let main = '';
    if (view.tab === 'list') main = MV.listHtml(MK, MKF, view.sel, D.month);
    else if (view.tab === 'closed') main = MV.closedHtml(MK, MKF, view.sel);
    else if (view.tab === 'funds') main = MV.fundsHtml(PF, MKF, actBtns);
    else main = `<section class="wp-sec"><h3>מינוף, הגנה ומה המנטור היה עושה</h3>${actBtns((a) => !a.assetId)}<p class="note">💡 = מה שהמנטור היה בוחר עכשיו. מסחר במניה — מתוך הכרטיס שלה (העלויות מופיעות לפני האישור).</p></section>`;
    const c = (view.tab === 'list' || view.tab === 'closed') ? coOf(view.sel) : null;
    let detail = '';
    if (c) {
      const ro = c.status != null && c.status !== 'listed' && c.status !== 'halted';
      const res = !ro && c.id !== 'IDX' ? actBtns((a) => a.coId === c.id && (a.id === 'research' || (a.id === 'trade' && a.guide))) : '';
      const block = ro ? null : api.block ? api.block(c.id) : null;
      detail = MV.detailHtml(c, series(c), MK, MKF, { readOnly: ro, research: res ? `<h4 class="cdl-h3">🔎 מחקר והצעות המנטור</h4>${res}` : '', trade: ro ? '' : MV.tradeFormHtml(c, view, api.cash ? api.cash() : 0, MKF, block) });
    }
    return `${MV.headHtml(MK, PF, D.month)}<div class="wp-gauges">${(D.panel.gauges || []).map((g) => gaugeHtml(g, 'market')).join('')}</div>${MV.ladderHtml(D.panel.ladder, MKF, PF)}${MV.tabsHtml(view.tab, counts)}${detail}${main}`;
  };
  const pv = () => {
    const c = coOf(view.sel); const box = $('#mkPv'); if (!c || !box) return;
    const side = view.side === 's' && c.held && c.held.qty ? 's' : 'b'; const amt = Math.max(0, Math.floor(+view.amount || 0));
    const qty = side === 's' ? Math.min(amt, c.held.qty) : view.unit === 'qty' ? amt : (api.qtyFor ? api.qtyFor(c.id, amt) : 0);
    const P = amt && api.preview ? api.preview(c.id, side, qty) : null;
    box.innerHTML = MV.previewHtml(P ? { ...P, side } : amt ? { side, qty: 0 } : null, c, MKF, api.cash ? api.cash() : 0);
  };
  const mount = (card) => {
    if (chart) { chart.destroy(); chart = null; }
    const host = card.querySelector('.mk-detail .cdl-host'); const c = coOf(view.sel);
    if (host && c) chart = cdlMount(host, series(c), { label: `נרות חודשיים של ${c.name} (${c.tk}). חיצים לבחירת חודש` });
    pv();
  };
  const draw = (card, keepScroll = true) => { const b = card.querySelector('.wp-body'); if (!b) return; const st = card.scrollTop; b.innerHTML = body(); if (keepScroll) card.scrollTop = st; mount(card); };
  const act = async (a, card) => {
    if (busyAct) return; busyAct = true; sfx('click');
    let r = null; try { r = await onAct(a); } catch (x) { r = { ok: false, error: x && x.message }; }
    busyAct = false;
    const c = $('#gmCard'); if (!c || !c.classList.contains('mpanel')) return;
    D = get() || D; if (a.id === 'trade') view.amount = 0;
    if (view.sel && !coOf(view.sel)) view.sel = null;   // a company that left the list (its claims paid) — back to the list
    draw(c);
    const msg = c.querySelector('.wp-msg'); if (msg) { msg.textContent = r && r.ok === false ? (r.error || 'לא אפשרי עכשיו') : (r && r.toast) || 'בוצע'; msg.className = 'wp-msg ' + (r && r.ok === false ? 'neg' : 'pos'); }
    void card;
  };
  return (api.ready ? api.ready() : Promise.resolve()).catch(() => null).then(() => modal({ tag: 'הבורסה והתיק', color: '#a16207', title: D.panel.title || 'הבורסה והתיק', cls: 'wpanel mpanel', wide: true,
    html: `<div class="wp-body">${body()}</div><p class="wp-msg" aria-live="polite"></p>`,
    actions: [{ label: 'סגירה', cls: 'primary' }], dismissable: true,
    onOpen: (c) => {
      mount(c);
      c.oninput = (e) => { if (e.target.id === 'mkAmt') { view.amount = +e.target.value || 0; pv(); } };
      setTimeout(() => { const h = c.querySelector('#gmTitle'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } c.scrollTop = 0; }, 80);
    },
    onExtra: async (e) => {
      const c = $('#gmCard');
      const t = e.target.closest('[data-mtab]'); if (t) { view.tab = t.dataset.mtab; view.sel = null; sfx('click'); draw(c, false); c.querySelector(`[data-mtab="${view.tab}"]`)?.focus({ preventScroll: true }); return; }
      const co = e.target.closest('[data-mco]'); if (co) { const id = co.dataset.mco; view.sel = view.sel === id ? null : id; view.side = 'b'; view.unit = 'cash'; view.amount = 0; sfx('click'); draw(c); if (view.sel) { const d = c.querySelector('#mkDetail'); d?.scrollIntoView({ block: 'start' }); d?.querySelector('.cdl-chart')?.focus({ preventScroll: true }); } return; }
      const sd = e.target.closest('[data-mside]'); if (sd && !sd.disabled) { view.side = sd.dataset.mside; view.amount = 0; draw(c); c.querySelector(`[data-mside="${view.side}"]`)?.focus({ preventScroll: true }); return; }
      const un = e.target.closest('[data-munit]'); if (un) { view.unit = un.dataset.munit; view.amount = 0; draw(c); c.querySelector(`[data-munit="${view.unit}"]`)?.focus({ preventScroll: true }); return; }
      const q = e.target.closest('[data-mq]'); if (q) { view.amount = +q.dataset.mq || 0; const inp = c.querySelector('#mkAmt'); if (inp) inp.value = String(view.amount); pv(); return; }
      const go = e.target.closest('[data-mgo]'); if (go && !go.disabled && go.dataset.mgo) {
        if (go.classList.contains('risky') && go.dataset.arm !== '1') { go.dataset.arm = '1'; go.classList.add('arm'); const m0 = c.querySelector('.wp-msg'); if (m0) { m0.textContent = 'מכירה אי אפשר לבטל. לחיצה נוספת מאשרת.'; m0.className = 'wp-msg neg'; } return; }
        await act({ id: 'trade', param: go.dataset.mgo }, c); return; }
      const b = e.target.closest('button[data-wact]'); if (!b || b.disabled) return;
      const a = (D.panel.actions || [])[+b.dataset.wact]; if (!a) return;
      if (WP_CONFIRM.has(a.id) && b.dataset.arm !== '1') {
        c.querySelectorAll('button[data-arm="1"]').forEach((x) => { x.dataset.arm = ''; x.classList.remove('arm'); });
        b.dataset.arm = '1'; b.classList.add('arm'); sfx('click');
        const m0 = c.querySelector('.wp-msg'); if (m0) { m0.textContent = `אי אפשר לבטל את זה. לחיצה נוספת על הכפתור מאשרת: ${a.label}`; m0.className = 'wp-msg neg'; }
        return;
      }
      await act(a, c);
    } })).then((v) => { if (chart) chart.destroy(); const c = $('#gmCard'); if (c) c.oninput = null; return v; });
}
