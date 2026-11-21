// TEST STUB of ui.js (only what the lobby uses).
export function toast(t) { (window.__toasts ||= []).push(t); const el = document.getElementById('toast'); if (el) { el.textContent = t; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 2000); } }
export function achievementToast(a) { (window.__achToasts ||= []).push(a.name); toast('🏅 ' + a.name); }
export async function modal() { return undefined; }
export async function confirmBox(text) { (window.__confirms ||= []).push(String(text)); return window.__confirmAnswer ?? true; } // T4 review M-4: records the question; tests may answer false
