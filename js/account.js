// מירוץ העכברים — account deletion (Google Play: delete the account and its data from inside the app; docs/full-upgrade/ACCOUNT_DELETION.md).
// One flow, two hosts: the lobby's profile screen (js/lobby.js) and the public page /delete-account.html. The server does the real work
// (public.rr_delete_account in supabase/migrations/20261127_delete_account.sql: re-checks the nickname, hands owned groups over, deletes);
// this module explains, asks for the nickname, confirms twice, calls net.deleteAccount and then cleans this browser.
// No DOM or storage access at import time (Node tests import the key lists).

/* ------------------------------------------------------------ what is removed from this browser */
/** Always removed after a successful deletion: the identity and everything that points at the deleted server account. */
export const SERVER_KEYS = ['rr-player', 'rr2-pending-finish', 'rr2-seen-chal', 'rr2-room-last', 'rr2-room-pending'];
/** Removed too when "למחוק גם את ההתקדמות במכשיר הזה" is on: this game's local progress and saves (js/saves.js SWEEP_KEYS + slots). */
export const DEVICE_KEYS = ['rr2-progress', 'rr2-energy', 'rr2-library', 'rr2-quiz-credit', 'rr2-coach', 'rr2-onboarded', 'rr2-reveal',
  'rr2-ghosts', 'rr2-branches', 'rr2-last-game', 'rr2-sum-offered', 'rr2-ref'];
/** Never removed: device preferences that are not progress and not personal (sound / motion / theme, feature flags, renderer fallback). */
export const KEPT_KEYS = ['rr2-settings', 'rr2-flags', 'rr2-fallback', 'rr2-chat-mute'];
/** sessionStorage (this tab only): the one-shot resume config may hold a ranked game → removed; the tab's connection id and the
 *  lobby's "account deleted" notice flag (js/lobby.js DEL_FLAG) are not personal → kept. */
export const SESSION_REMOVED = ['rr2-resume-once'], SESSION_KEPT = ['rr2-conn', 'rr2-acct-deleted'];
const SLOT = 'rr2-save-', BAK = 'rr2-bak:', QUAR = 'rr2-quarantine:';
/** free-play slots (free / learning / history / practice branch) belong to the device; every other slot is a ranked game of the account
 *  (rr2-save-<result id>, rr2-save-<daily|weekly|challenge…>-<world>-<seed>). */
const DEVICE_SLOT = /^rr2-save-(free|learn|history|branch)-/;
const base = (k) => (k.startsWith(BAK) ? k.slice(BAK.length) : k.startsWith(QUAR) ? k.slice(QUAR.length) : k);
export const isServerKey = (k) => { const b = base(k); return SERVER_KEYS.includes(b) || (b.startsWith(SLOT) && !DEVICE_SLOT.test(b)); };
export const isDeviceKey = (k) => { const b = base(k); return DEVICE_KEYS.includes(b) || b.startsWith(SLOT) || k.startsWith(BAK) || k.startsWith(QUAR); };
/** → the keys of `all` to remove (device = the checkbox) */
export function keysToClear(all, { device = false } = {}) { return all.filter((k) => isServerKey(k) || (device && isDeviceKey(k))); }
/** Removes them from localStorage (+ the one-shot resume config from sessionStorage). → removed keys */
export function clearLocal({ device = false, storage = null, session = null } = {}) {
  let st = storage, ss = session;
  try { st = st || globalThis.localStorage; } catch (e) { st = null; }
  try { ss = ss || globalThis.sessionStorage; } catch (e) { ss = null; }
  const all = [];
  try { for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k != null) all.push(k); } } catch (e) { /* blocked storage */ }
  const out = keysToClear(all, { device });
  for (const k of out) { try { st.removeItem(k); } catch (e) { /* ignore */ } }
  try { if (ss) for (const k of SESSION_REMOVED) ss.removeItem(k); } catch (e) { /* ignore */ }
  return out;
}

/* ------------------------------------------------------------ the flow (markup + behaviour) */
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const STR = {
  h: 'מחיקת החשבון',
  lead: 'אפשר למחוק את החשבון שלך וכל המידע שלו מהשרת. המחיקה סופית ואי אפשר לבטל אותה.',
  open: '🗑️ מחיקת החשבון…',
  whatH: 'מה יימחק מהשרת',
  what: ['הכינוי שלך והמזהה האקראי של השחקן', 'כל התוצאות שלך: אתגר יומי, שבועי ואתגרי קבוצות, כולל משחקים שמורים בשרת', 'ההתקדמות שלך: כוכבים, הישגים, רצף ימים, הכלי שבחרת',
    'החברות שלך בקבוצות, ההודעות בפיד של החברים וזריקות ⚡ שמחכות לך', 'אחרי המחיקה הכינוי שלך לא יופיע יותר בשום טבלה'],
  groupsH: 'מה קורה לקבוצות שלך',
  groups: 'קבוצה שאתה מנהל עוברת לחבר הוותיק ביותר שנשאר בה. קבוצה שאתה החבר היחיד בה נמחקת עם האתגרים שלה. התוצאות של חברים אחרים לא נפגעות.',
  keptH: 'מה נשאר',
  kept: 'לא נשאר שום מידע אישי עליך. שם של קבוצה או אתגר שיצרת בקבוצה שממשיכה להתקיים נשאר אצל החברים שלה, בלי שום קישור אליך. זריקות ⚡ ששלחת וחבר עוד לא אסף יישארו אצלו.',
  nickL: 'כדי לאשר, הקלד את הכינוי שלך',
  devL: 'למחוק גם את ההתקדמות במכשיר הזה',
  devHint: 'כוכבים, משחקים שמורים, שיעורים ו־⚡ ששמורים בדפדפן הזה. בלי הסימון הם יישארו כאן ואפשר להמשיך לשחק כאורח.',
  next: 'המשך', cancel: 'ביטול',
  sure: (n) => `בטוח? החשבון „${n}” יימחק לצמיתות. אי אפשר לשחזר אותו, גם לא עם קוד השחזור.`,
  yes: 'כן, למחוק לצמיתות', back: 'לא, לחזור',
  busy: 'מוחקים…',
  mismatch: 'הכינוי שהקלדת לא תואם לכינוי של החשבון. הקלד אותו בדיוק כמו שהוא מופיע.',
  empty: 'הקלד את הכינוי שלך כדי לאשר.',
  offline: 'אין חיבור לאינטרנט. כדי למחוק את החשבון צריך חיבור לשרת. שום דבר לא נמחק — נסה שוב כשיש חיבור.',
  gone: 'השרת לא מכיר את החשבון הזה — כנראה הוא כבר נמחק ממכשיר אחר. הסרנו אותו גם מהמכשיר הזה, ואפשר להמשיך לשחק כאורח.',
  unavailable: 'המחיקה עוד לא זמינה. נסו שוב מאוחר יותר, או בקשו מחיקה במייל orikenen.b@gmail.com.',
  renamed: (n) => `הכינוי של החשבון השתנה במכשיר אחר. הכינוי הנוכחי: ${n}`,
  done: 'החשבון נמחק. המידע שלך הוסר מהשרת.',
  doneDev: 'גם ההתקדמות במכשיר הזה נמחקה.',
  doneKeep: 'ההתקדמות במכשיר הזה נשארה. אפשר להמשיך לשחק כאורח.',
};
/** The section markup. nickname = the current one (shown so it can be typed exactly). idp = id prefix (two hosts never collide). */
export function deleteSectionHtml(nickname, { idp = 'acct', cls = 'lb-card pf-delete' } = {}) {
  const n = esc(nickname);
  return `<section class="${cls} acct" id="${idp}" aria-labelledby="${idp}H">
  <h2 id="${idp}H">${STR.h}</h2>
  <p class="lb-note">${STR.lead}</p>
  <button type="button" class="chip danger acct-open" data-acct="open" aria-expanded="false" aria-controls="${idp}Box">${STR.open}</button>
  <div class="acct-box" id="${idp}Box" hidden>
    <div class="acct-step" data-step="1">
      <h3 class="lb-sub">${STR.whatH}</h3><ul class="acct-list">${STR.what.map((x) => `<li>${x}</li>`).join('')}</ul>
      <h3 class="lb-sub">${STR.groupsH}</h3><p class="acct-p">${STR.groups}</p>
      <h3 class="lb-sub">${STR.keptH}</h3><p class="acct-p">${STR.kept}</p>
      <form class="lb-form acct-form" data-acct="form" novalidate>
        <label for="${idp}Nick">${STR.nickL}: <b class="acct-nick" dir="auto">${n}</b></label>
        <input id="${idp}Nick" name="confirm" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" dir="auto" maxlength="40" aria-describedby="${idp}Err1" required>
        <label class="acct-check"><input type="checkbox" id="${idp}Dev" name="device" checked aria-describedby="${idp}DevHint"><span>${STR.devL}</span></label>
        <p class="lb-note" id="${idp}DevHint">${STR.devHint}</p>
        <p class="err" id="${idp}Err1" role="alert"></p>
        <div class="acct-acts"><button type="submit" class="acct-next">${STR.next}</button><button type="button" class="chip" data-acct="cancel">${STR.cancel}</button></div>
      </form>
    </div>
    <div class="acct-step" data-step="2" hidden>
      <p class="acct-warn" id="${idp}Sure" tabindex="-1">${STR.sure(n)}</p>
      <div class="acct-acts"><button type="button" class="acct-danger" data-acct="confirm" aria-describedby="${idp}Sure">${STR.yes}</button><button type="button" class="chip" data-acct="back">${STR.back}</button></div>
      <p class="err" id="${idp}Err2" role="alert"></p>
    </div>
    <div class="acct-step" data-step="3" hidden><p class="acct-done" id="${idp}Done" tabindex="-1" role="status"></p></div>
  </div>
</section>`;
}
/**
 * Wires a section made by deleteSectionHtml. opts: { net (js/net.js), onDeleted({device, result, removed}) — the host decides what
 * comes next (the lobby reloads; the public page shows the done step), online() → bool (tests) }.
 */
export function mountDelete(sec, { net, onDeleted = null, online = () => (typeof navigator === 'undefined' || navigator.onLine !== false) } = {}) {
  if (!sec || sec.dataset.mounted) return;
  sec.dataset.mounted = '1';
  const $ = (s) => sec.querySelector(s);
  const box = $('.acct-box'), openB = $('[data-acct="open"]'), form = $('[data-acct="form"]'), input = form.querySelector('input[name="confirm"]');
  const dev = form.querySelector('input[name="device"]'), err1 = $('#' + sec.id + 'Err1'), err2 = $('#' + sec.id + 'Err2');
  const steps = [...sec.querySelectorAll('.acct-step')];
  const step = (n) => { steps.forEach((s) => { s.hidden = s.dataset.step !== String(n); }); };
  const focus = (el) => setTimeout(() => { try { el.focus(); } catch (e) { /* ignore */ } }, 30);
  const nick = () => String((net.me() || {}).nickname || '');
  /** the nickname may have changed on another device: ask the server (silently; offline keeps the local one). → changed? */
  const refresh = async () => {
    const before = nick();
    try { if (net.refreshNickname && online()) await net.refreshNickname(); } catch (e) { /* offline / server: keep the local one */ }
    sec.querySelectorAll('.acct-nick').forEach((el) => { el.textContent = nick(); });
    return nick() !== before;
  };
  const show = (on) => {
    box.hidden = !on; openB.setAttribute('aria-expanded', String(on)); openB.hidden = on;
    if (on) { step(1); err1.textContent = ''; err2.textContent = ''; input.value = ''; focus(input); refresh(); } else focus(openB);
  };
  const finish = (device, result, gone) => {
    const removed = clearLocal({ device });
    const done = $('#' + sec.id + 'Done'); done.textContent = gone ? STR.gone : `${STR.done} ${device ? STR.doneDev : STR.doneKeep}`;
    step(3); openB.hidden = true; focus(done);
    if (onDeleted) onDeleted({ device, result, removed, gone: !!gone });
  };
  openB.addEventListener('click', () => show(true));
  sec.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-acct]'); if (!b || !sec.contains(b)) return;
    const a = b.dataset.acct;
    if (a === 'cancel') return show(false);
    if (a === 'back') { step(1); err2.textContent = ''; return focus(input); }
    if (a !== 'confirm') return;
    err2.textContent = '';
    if (!online()) { err2.textContent = STR.offline; return; }
    const label = b.textContent; b.disabled = true; b.textContent = STR.busy; b.setAttribute('aria-busy', 'true');
    let result;
    try { result = await net.deleteAccount(input.value.trim()); }
    catch (e) {
      b.disabled = false; b.textContent = label; b.removeAttribute('aria-busy');
      const code = e && e.code;
      if (code === 'unauthorized') { if (net.forget) net.forget(); return finish(false, null, true); }   // already deleted elsewhere: no dead identity here
      if (code === 'confirm_mismatch') {                                     // renamed on another device since this page loaded
        const changed = await refresh();
        step(1); input.value = ''; err1.textContent = changed ? STR.renamed(nick()) : STR.mismatch; focus(input); return;
      }
      err2.textContent = code === 'offline' ? STR.offline : code === 'missing_rpc' ? STR.unavailable : (e && e.message) || STR.offline;
      focus(b); return;
    }
    finish(!!dev.checked, result, false);
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    err1.textContent = '';
    const v = input.value.trim();
    if (!v) { err1.textContent = STR.empty; return focus(input); }
    if (v !== nick()) { err1.textContent = STR.mismatch; input.setAttribute('aria-invalid', 'true'); return focus(input); }
    input.removeAttribute('aria-invalid');
    if (!online()) { err1.textContent = STR.offline; return; }
    const sure = $('#' + sec.id + 'Sure'); sure.textContent = STR.sure(nick());
    step(2); focus(sure);
  });
  sec.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !box.hidden && steps[2].hidden) { ev.stopPropagation(); show(false); } });
}
