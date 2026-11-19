// TEST STUB of audio.js: records cues in window.__sfx.
let muted = false;
export function sfx(name) { (window.__sfx ||= []).push(name); }
export function setMuted(b) { muted = !!b; }
export function isMuted() { return muted; }
export function unlock() {}
