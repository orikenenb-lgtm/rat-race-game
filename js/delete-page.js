// /delete-account.html — the public "delete your account" page (Google Play "Delete account URL"). No analytics, no third parties:
// talks only to the game's own server through js/net.js, and only when the visitor asks (restore a recovery code / delete).
//   * this browser holds a game identity ('rr-player') → the same deletion flow as in the game (js/account.js);
//   * no identity → a recovery code can be pasted (net.restore checks it on the server), then the same flow;
//   * always: an e-mail request (mailto with a prefilled Hebrew + English subject and body; the nickname field only fills the body).
import { net } from './net.js';
import { deleteSectionHtml, mountDelete } from './account.js';

const MAIL = 'orikenen.b@gmail.com';
const SUBJECT = 'בקשה למחיקת חשבון — מירוץ העכברים / Account deletion request — Rat Race';
export function mailBody(nick) {
  const n = String(nick || '').trim() || '________';
  return `שלום,\nאני מבקש/ת למחוק את החשבון שלי במשחק מירוץ העכברים ואת כל המידע שלו.\nהכינוי שלי במשחק: ${n}\n\n`
    + `Hello,\nPlease delete my Rat Race (מירוץ העכברים) account and all of its data.\nMy in-game nickname: ${n}\n`;
}
export const mailHref = (nick) => `mailto:${MAIL}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(mailBody(nick))}`;

const $ = (s) => document.querySelector(s);
function showHas() {
  const me = net.me();
  $('#webNone').hidden = true;
  const box = $('#webHas');
  box.innerHTML = `<p>בדפדפן הזה יש חשבון של המשחק: <b dir="auto"></b></p>` + deleteSectionHtml(me.nickname, { idp: 'webDel', cls: 'web-del' });
  box.querySelector('p b').textContent = me.nickname;
  mountDelete($('#webDel'), { net, onDeleted: () => { const p = box.querySelector(':scope > p'); if (p) p.hidden = true; } });
}
function showNone() {
  $('#webHas').innerHTML = '';
  $('#webNone').hidden = false;
}
function init() {
  $('#webLoading').hidden = true;
  if (net.hasMe() && net.me().nickname) showHas(); else showNone();
  $('#webRestore').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = $('#webCodeErr'); err.textContent = '';
    const code = ev.target.code.value.trim();
    if (!code) { err.textContent = 'הדבק את קוד השחזור.'; ev.target.code.focus(); return; }
    const b = ev.target.querySelector('button'); b.disabled = true;
    try { await net.restore(code); showHas(); setTimeout(() => { const o = document.querySelector('#webDel [data-acct="open"]'); if (o) o.focus(); }, 30); }
    catch (e) { err.textContent = !navigator.onLine ? 'אין חיבור לאינטרנט. נסה שוב כשיש חיבור.' : 'קוד השחזור לא תקין, או שהחשבון כבר נמחק.'; ev.target.code.focus(); }
    finally { b.disabled = false; }
  });
  const nick = $('#mailNick'), link = $('#mailLink');
  const upd = () => { link.href = mailHref(nick.value); };
  nick.addEventListener('input', upd); upd();
  if (net.hasMe()) { nick.value = net.me().nickname || ''; upd(); }
}
init();
