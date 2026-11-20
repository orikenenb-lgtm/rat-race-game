// מירוץ העכברים 2.0 — WebAudio synth sounds. No files: every cue is built from oscillators + filtered noise.
// API: sfx(name), setMuted(b), isMuted(), unlock()  (call unlock on the first user gesture).
// Cues: roll, hop, coin, loss, buy, sell, card, win, lose, unlock, achievement, golden, click, clack, rattle, tick.
import { bus } from './bus.js';

const SETTINGS = 'rr2-settings';
const readSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS) || '{}') || {}; } catch (e) { return {}; } };
const writeSettings = (patch) => { try { localStorage.setItem(SETTINGS, JSON.stringify({ ...readSettings(), ...patch })); } catch (e) { /* private mode */ } };

let ctx = null, master = null, noiseBuf = null;
let muted = !!readSettings().muted;
const MASTER = 0.2;

function ac() {
  if (ctx) return ctx;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  try {
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = MASTER;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
  return ctx;
}

/** Resume the audio context. Must run inside a user gesture at least once (mobile autoplay rules). */
export function unlock() {
  const c = ac();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
export function setMuted(b) { muted = !!b; writeSettings({ muted }); }
export function isMuted() { return muted; }

/* ---------------- building blocks */
function tone(c, t, { type = 'sine', f = 440, f2 = null, dur = 0.15, vol = 0.4, attack = 0.005, delay = 0, detune = 0 } = {}) {
  const t0 = t + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.03);
}
function noise(c, t, { dur = 0.1, vol = 0.3, type = 'bandpass', f = 1200, f2 = null, q = 1, delay = 0, attack = 0.003 } = {}) {
  const t0 = t + delay;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t0);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl); fl.connect(g); g.connect(master);
  s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.03);
}
/** Bell-ish tone: a few inharmonic partials. */
function bell(c, t, f, { dur = 0.6, vol = 0.25, delay = 0 } = {}) {
  [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([m, v]) => tone(c, t, { f: f * m, dur: dur / (m > 1 ? 1.6 : 1), vol: vol * v, delay, attack: 0.004 }));
}

const R = () => Math.random();
const CUES = {
  tick(c, t) { tone(c, t, { type: 'sine', f: 1500, dur: 0.025, vol: 0.06 }); },
  click(c, t) { tone(c, t, { type: 'square', f: 1900, dur: 0.03, vol: 0.08 }); },
  hop(c, t) { const f = 620 + R() * 140; tone(c, t, { type: 'triangle', f, f2: f * 0.72, dur: 0.07, vol: 0.22 }); noise(c, t, { dur: 0.03, vol: 0.05, type: 'highpass', f: 3000 }); },
  roll(c, t) {
    for (let i = 0; i < 7; i++) {
      const d = i * 0.055 + R() * 0.02;
      noise(c, t, { delay: d, dur: 0.035, vol: 0.32 - i * 0.03, type: 'bandpass', f: 1800 + R() * 1800, q: 5 });
      tone(c, t, { delay: d, type: 'square', f: 260 + R() * 120, dur: 0.025, vol: 0.05 });
    }
  },
  coin(c, t) {
    tone(c, t, { type: 'square', f: 988, dur: 0.08, vol: 0.11 });
    tone(c, t, { type: 'square', f: 1319, dur: 0.26, vol: 0.11, delay: 0.07 });
    tone(c, t, { type: 'sine', f: 2637, dur: 0.2, vol: 0.06, delay: 0.07 });
  },
  loss(c, t) {
    tone(c, t, { type: 'sine', f: 170, f2: 55, dur: 0.38, vol: 0.55, attack: 0.008 });
    noise(c, t, { dur: 0.18, vol: 0.18, type: 'lowpass', f: 500 });
    tone(c, t, { type: 'triangle', f: 330, f2: 247, dur: 0.3, vol: 0.08, delay: 0.05 });
  },
  buy(c, t) {
    noise(c, t, { dur: 0.09, vol: 0.14, type: 'highpass', f: 4500 });
    [784, 1047, 1568].forEach((f, i) => tone(c, t, { type: 'triangle', f, dur: 0.22, vol: 0.2, delay: 0.05 + i * 0.06 }));
    bell(c, t, 2093, { delay: 0.2, dur: 0.45, vol: 0.12 });
  },
  sell(c, t) {
    noise(c, t, { dur: 0.07, vol: 0.12, type: 'highpass', f: 4000 });
    [1175, 880, 1319].forEach((f, i) => tone(c, t, { type: 'triangle', f, dur: 0.18, vol: 0.18, delay: 0.04 + i * 0.07 }));
  },
  clack(c, t) {
    noise(c, t, { dur: 0.05, vol: 0.4, type: 'bandpass', f: 2600 + R() * 1400, q: 6 });
    tone(c, t, { type: 'triangle', f: 380 + R() * 160, f2: 220, dur: 0.06, vol: 0.14 });
    noise(c, t, { delay: 0.045 + R() * 0.03, dur: 0.035, vol: 0.18, type: 'bandpass', f: 3200, q: 6 });
  },
  rattle(c, t) {
    for (let i = 0; i < 4; i++) noise(c, t, { delay: i * 0.05 + R() * 0.02, dur: 0.03, vol: 0.22, type: 'bandpass', f: 2000 + R() * 2200, q: 7 });
  },
  card(c, t) {
    noise(c, t, { dur: 0.16, vol: 0.12, type: 'bandpass', f: 500, f2: 2600, q: 1.2 });
    tone(c, t, { type: 'sine', f: 520, f2: 820, dur: 0.1, vol: 0.12, delay: 0.06 });
  },
  win(c, t) {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, t, { type: 'triangle', f, dur: 0.32, vol: 0.24, delay: i * 0.11 }));
    [523, 659, 784, 1047].forEach((f) => tone(c, t, { type: 'square', f, dur: 0.9, vol: 0.045, delay: 0.46, attack: 0.02 }));
    bell(c, t, 2093, { delay: 0.46, dur: 1.0, vol: 0.14 });
  },
  lose(c, t) {
    [392, 330, 262].forEach((f, i) => tone(c, t, { type: 'sine', f, dur: 0.42, vol: 0.22, delay: i * 0.2, attack: 0.02 }));
  },
  unlock(c, t) {
    [523, 784, 1047, 1568].forEach((f, i) => tone(c, t, { type: 'triangle', f, dur: 0.2, vol: 0.18, delay: i * 0.07 }));
    for (let i = 0; i < 6; i++) tone(c, t, { type: 'sine', f: 2400 + R() * 1600, dur: 0.12, vol: 0.05, delay: 0.3 + i * 0.05 });
  },
  achievement(c, t) {
    bell(c, t, 1047, { dur: 0.5, vol: 0.22 });
    bell(c, t, 1568, { dur: 0.8, vol: 0.22, delay: 0.12 });
    tone(c, t, { type: 'triangle', f: 784, dur: 0.5, vol: 0.08, delay: 0.12 });
  },
  golden(c, t) {
    for (let i = 0; i < 10; i++) tone(c, t, { type: 'sine', f: 1500 + R() * 1800, dur: 0.14, vol: 0.07, delay: i * 0.045 });
    bell(c, t, 1568, { delay: 0.1, dur: 0.9, vol: 0.18 });
    bell(c, t, 2349, { delay: 0.28, dur: 0.9, vol: 0.12 });
  },
};

let lastAt = {};
/** Play a named cue (no-op when muted, unknown, or audio is still locked). */
export function sfx(name) {
  if (muted || !name) return;
  const f = CUES[name];
  if (!f) return;
  const c = ac();
  if (!c) return;
  if (c.state !== 'running') { c.resume().catch(() => {}); return; }
  // avoid machine-gunning the exact same cue within a few ms (e.g. several effects in one result)
  const now = c.currentTime;
  if (lastAt[name] != null && now - lastAt[name] < 0.04) return;
  lastAt[name] = now;
  try { f(c, now + 0.005); } catch (e) { /* ignore */ }
}

bus.on('sfx', (p) => sfx(typeof p === 'string' ? p : p && p.name));
