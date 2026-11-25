// w14 רובע הבנקים / w17 גבעת המעבדות / w18 חוף הסערות / w19 פעמון הבורסה / w20 רחוב הקרנות — the five worlds' own model keys as
// procedural stand-ins (no .glb is ever requested) and the painters that dress them from the city level (vocab.normLevel):
//
// w14 bank_hall (credit.js cityModels → kind 'bank'): a stone hall with four columns and a pediment, a round brass vault door, five stacks
//   behind it = the loan book by segment (height ∝ its share, the segment's colour), a capital-ratio column at the side (fill ∝ the ratio
//   on a 0–20 % scale, red under 8 %, brass under 10 %, green above; marks at 8 % and 10 %) and up to six depositors queueing at the door
//   (the engine's queue: confidence falling towards a run). A run turns the vault door red.
// w17 lab_block (trials.js cityModels → kind 'lab'): a white lab with a glass band and a shelf of eight flasks in front — one per candidate
//   slot: the liquid rises with the stages (the engine's fill), amber = waiting for a go / stop decision, teal = in a trial, gold = a drug
//   on the market, violet = discovery, a tilted red flask = a failed readout, a blue cap = licensed to a partner; an empty slot has no flask;
//   a plant annex when the lab owns one.
// w18 insurer_hq (insure.js cityModels → kind 'ins'): an office under a big indigo umbrella, five small umbrellas = the lines (size ∝ the
//   share of premium; red = priced under the market, green = above, grey = closing), up to three rings over the roof = XoL layers, an inner
//   dome = the quota share, a gold plaque = a cat bond, a storm cloud in the storm season, a solvency column (red < 100 %, amber < 120 %).
// w19 exchange_floor (bell.js cityModels → kind 'listco'): a dark exchange with columns, a brass bell on the roof once the company is
//   listed, a ticker band (green when the price ≥ the peers', red under), six bars = six months of EBITDA, the two divisions (a plant with a
//   chimney, a shop) with a crane while growth capex is running, a red flag when an activist moved in.
// w20 trading_floor (funds.js cityModels → kind 'fund'): a dark tower with a screen of twelve bars (green up = long, red down = short,
//   height ∝ the weight on a ±30 % scale), a ring = money managed vs its peak, a barrier at the door when redemptions are gated, red arrows
//   when redemptions wait, a blue kiosk = the index product.
// The paint* functions are the only writers. Nothing steps (no updater): the same with and without reduced motion. Pure three.js, no DOM,
// no engine import.
import * as THREE from 'three';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
const flat = (c) => new THREE.MeshBasicMaterial({ color: c });
const box = (g, w, h, d, c, x = 0, y = 0, z = 0, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), o === 'flat' ? flat(c) : mat(c, o)); m.position.set(x, y + h / 2, z); g.add(m); return m; };
const cyl = (g, rt, rb, h, c, x = 0, y = 0, z = 0, seg = 12, o) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c, o)); m.position.set(x, y + h / 2, z); g.add(m); return m; };
/** a vertical bar whose bottom stays at y0: scale.y = h (geometry is 1 tall, centred) */
const setBar = (m, y0, h) => { const k = Math.max(0.01, h); m.scale.y = k; m.position.y = y0 + k / 2; };
const columns = (g, n, w, y, z, h, c, r = 0.06) => { for (let i = 0; i < n; i++) cyl(g, r, r * 1.1, h, c, -w / 2 + (w * i) / (n - 1), y, z, 10, { roughness: 0.5 }); };
const pediment = (g, w, d, x, y, z, c) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(w / 1.7, w / 1.7, d, 3), mat(c, { roughness: 0.55 })); p.rotation.set(Math.PI / 2, 0, Math.PI / 2); p.scale.set(1, 1, 0.35); p.position.set(x, y, z); g.add(p); return p; };
export const RED = '#dc2626', GREEN = '#16a34a', AMBER = '#d97706', GREY = '#94a3b8';

/* ============================================================ w14: the bank hall */
export const SEG_COL = Object.freeze({ mort: '#2563eb', sme: '#16a34a', dev: '#d97706', cons: '#db2777', corp: '#475569' });
const SEGS = ['mort', 'sme', 'dev', 'cons', 'corp'];
function bankHall() {
  const g = new THREE.Group(); g.name = 'standin:bank';
  box(g, 1.9, 0.12, 1.5, '#d6cdbd', 0, 0, 0, { roughness: 0.9 });
  box(g, 1.3, 0.75, 0.8, '#e7e2d6', 0, 0.12, -0.15, { roughness: 0.6 });
  box(g, 1.45, 0.08, 0.95, '#cfc6b4', 0, 0.87, -0.12, { roughness: 0.6 });
  columns(g, 4, 1.15, 0.12, 0.32, 0.75, '#f5f5f4');
  pediment(g, 1.45, 0.2, 0, 1.05, 0.3, '#e7e2d6');
  // the vault door (round, brass) on the hall's front between the middle columns
  const door = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 24), mat('#b45309', { metalness: 0.7, roughness: 0.3 })); door.rotation.x = Math.PI / 2; door.position.set(0, 0.42, 0.27); door.name = 'standin:vault'; g.add(door);
  // the book: five stacks behind the hall
  const stacks = SEGS.map((k, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.2), mat(SEG_COL[k], { roughness: 0.6 })); m.position.set(-0.56 + i * 0.28, 0.12, -0.72); m.name = 'standin:seg:' + k; g.add(m); return m; });
  // the capital-ratio column (a glass tube with a fill) and its marks at 8 % and 10 %
  const tube = cyl(g, 0.075, 0.075, 0.9, '#e2e8f0', 0.82, 0.12, 0.2, 14, { transparent: true, opacity: 0.45 }); tube.name = 'standin:capTube';
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 14), flat(GREEN)); fill.position.set(0.82, 0.12, 0.2); fill.name = 'standin:capFill'; g.add(fill);
  for (const [r, c] of [[0.08, RED], [0.1, '#ca8a04']]) { const mk = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 6, 20), flat(c)); mk.rotation.x = Math.PI / 2; mk.position.set(0.82, 0.12 + (r / 0.2) * 0.9, 0.2); g.add(mk); }
  // depositors queueing at the door
  const queue = new THREE.Group(); queue.name = 'standin:queue'; g.add(queue);
  for (let i = 0; i < 6; i++) { const p = new THREE.Group(); p.position.set(-0.05 + (i % 3) * 0.16 - 0.16, 0.12, 0.5 + Math.floor(i / 3) * 0.17); cyl(p, 0.04, 0.05, 0.16, ['#1e3a8a', '#7c2d12', '#065f46'][i % 3], 0, 0, 0, 8); const h = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), mat('#f5d0b0')); h.position.y = 0.2; p.add(h); queue.add(p); }
  g.userData.bank = { door, stacks, fill, queue };
  paintBank(g, null);
  return g;
}
/** level (normalised, kind 'bank') → the stacks, the capital column, the queue, the vault door */
export function paintBank(g, L) {
  const B = g && g.userData && g.userData.bank; if (!B) return false;
  const on = !!(L && L.kind === 'bank');
  const segs = on ? L.segs : SEGS.map((k, i) => ({ seg: k, share: [0.4, 0.2, 0.15, 0.1, 0.15][i] }));
  const hs = B.stacks.map((m, i) => { const s = (segs.find((x) => x.seg === SEGS[i]) || {}).share || 0; const h = s > 0 ? 0.08 + s * 1.6 : 0.01; setBar(m, 0.12, h); m.visible = s > 0; return Math.round(h * 100) / 100; });
  const cap = on ? L.cap : 0.12; const fh = Math.max(0.01, Math.min(1, cap / 0.2)) * 0.9; setBar(B.fill, 0.12, fh);
  B.fill.material.color.set(cap < 0.08 ? RED : cap < 0.1 ? '#ca8a04' : GREEN);
  const q = on ? Math.min(6, L.queue) : 0; B.queue.children.forEach((p, i) => { p.visible = i < q; });
  const run = on && L.run; B.door.material.color.set(run ? RED : '#b45309');
  g.userData.bankState = { cap, capFill: Math.round(fh * 100) / 100, capColor: cap < 0.08 ? 'red' : cap < 0.1 ? 'amber' : 'green', stacks: hs, queue: q, run };
  return true;
}

/* ============================================================ w17: the lab and its flasks */
export const FLASK_COL = Object.freeze({ dec: '#f59e0b', run: '#14b8a6', drug: '#eab308', lab: '#a78bfa', dead: RED });
function labBlock() {
  const g = new THREE.Group(); g.name = 'standin:lab';
  box(g, 1.9, 0.08, 1.6, '#cbd5e1', 0, 0, 0, { roughness: 0.9 });
  box(g, 1.4, 0.72, 0.75, '#f8fafc', 0, 0.08, -0.3, { roughness: 0.5 });
  const band = box(g, 1.42, 0.2, 0.77, '#5eead4', 0, 0.42, -0.3, { roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.8 }); band.name = 'standin:glass';
  for (const x of [-0.45, 0, 0.45]) cyl(g, 0.06, 0.06, 0.16, '#94a3b8', x, 0.8, -0.35, 8);
  // the shelf of eight flasks
  box(g, 1.6, 0.04, 0.26, '#78716c', 0, 0.22, 0.42);
  for (const x of [-0.78, 0.78]) box(g, 0.04, 0.22, 0.24, '#57534e', x, 0, 0.42);
  const flasks = []; for (let i = 0; i < 8; i++) {
    const f = new THREE.Group(); f.position.set(-0.7 + i * 0.2, 0.26, 0.42); f.name = 'standin:flask' + i; g.add(f);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 0.3, 14, 1, true), new THREE.MeshStandardMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.35, roughness: 0.1, side: THREE.DoubleSide })); glass.position.y = 0.15; f.add(glass);
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.064, 1, 14), flat(FLASK_COL.dec)); liq.position.y = 0.05; f.add(liq);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 10), mat('#64748b')); cap.position.y = 0.32; f.add(cap);
    flasks.push({ f, liq, cap });
  }
  const plant = new THREE.Group(); plant.name = 'standin:plant'; plant.position.set(0.72, 0.08, -0.62); g.add(plant);
  box(plant, 0.42, 0.34, 0.34, '#e2e8f0', 0, 0, 0); cyl(plant, 0.04, 0.05, 0.36, '#64748b', 0.12, 0.34, 0, 8);
  g.userData.lab = { flasks, plant };
  paintLab(g, null);
  return g;
}
/** level (normalised, kind 'lab') → each flask's liquid, colour, crack and cap; the plant annex */
export function paintLab(g, L) {
  const B = g && g.userData && g.userData.lab; if (!B) return false;
  const fl = L && L.kind === 'lab' ? L.flasks : [{ state: 'run', fill: 0.3 }, { state: 'dec', fill: 0.25 }, null, null, null, null, null, null];
  const st = [];
  B.flasks.forEach((F, i) => { const x = fl[i]; F.f.visible = !!x; if (!x) { st.push(null); return; }
    const cracked = !!x.cracked || x.state === 'dead'; const fill = cracked ? 0.15 : x.state === 'drug' ? 1 : x.state === 'lab' ? 0.2 : Math.max(0.08, +x.fill || 0);
    F.liq.material.color.set(cracked ? FLASK_COL.dead : FLASK_COL[x.state] || FLASK_COL.dec); F.liq.scale.y = Math.max(0.01, 0.26 * fill); F.liq.position.y = 0.01 + (0.26 * fill) / 2;
    F.f.rotation.z = cracked ? 0.55 : 0; F.cap.material.color.set(x.lic ? '#2563eb' : '#64748b');
    st.push({ state: cracked ? 'dead' : x.state, fill: Math.round(fill * 100) / 100, cracked, lic: !!x.lic }); });
  B.plant.visible = !!(L && L.plant);
  g.userData.labState = { flasks: st, plant: B.plant.visible };
  return true;
}

/* ============================================================ w18: the insurer under its umbrellas */
const LINES = ['car', 'coast', 'inland', 'health', 'bi'];
const umbrella = (g, c) => { const u = new THREE.Group(); cyl(u, 0.012, 0.012, 0.34, '#334155', 0, 0, 0, 6); const top = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.08, 10), mat(c, { roughness: 0.6 })); top.position.y = 0.36; u.add(top); u.userData.top = top; g.add(u); return u; };
function insurerHq() {
  const g = new THREE.Group(); g.name = 'standin:insurer';
  box(g, 1.9, 0.08, 1.6, '#c7d2e4', 0, 0, 0, { roughness: 0.9 });
  box(g, 1.0, 0.8, 0.7, '#e2e8f0', 0, 0.08, -0.3, { roughness: 0.5 });
  for (let r = 0; r < 3; r++) box(g, 1.02, 0.06, 0.72, '#93c5fd', 0, 0.22 + r * 0.22, -0.3, { roughness: 0.2, metalness: 0.3 });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.35, 16), mat('#4f46e5', { roughness: 0.55 })); roof.position.set(0, 1.06, -0.3); roof.name = 'standin:roof'; g.add(roof);
  const qs = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#a5b4fc', transparent: true, opacity: 0.5 })); qs.position.set(0, 1.24, -0.3); qs.name = 'standin:qs'; g.add(qs);
  const rings = [0, 1, 2].map((i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.62 + i * 0.14, 0.018, 6, 40), flat('#38bdf8')); m.rotation.x = Math.PI / 2; m.position.set(0, 1.0 + i * 0.12, -0.3); m.name = 'standin:xol' + i; g.add(m); return m; });
  const lines = LINES.map((k, i) => { const u = umbrella(g, '#4f46e5'); u.position.set(-0.72 + i * 0.36, 0.08, 0.45); u.name = 'standin:line:' + k; return u; });
  const bond = box(g, 0.22, 0.14, 0.03, '#eab308', 0.62, 0.3, 0.06, { metalness: 0.7, roughness: 0.3 }); bond.name = 'standin:bond';
  const cloud = new THREE.Group(); cloud.name = 'standin:cloud'; cloud.position.set(0, 1.85, -0.2); g.add(cloud);
  for (const [x, y, s] of [[-0.25, 0, 0.22], [0.05, 0.07, 0.28], [0.32, 0, 0.2]]) { const c = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), mat('#475569', { roughness: 1 })); c.position.set(x, y, 0); cloud.add(c); }
  const tube = cyl(g, 0.07, 0.07, 0.9, '#e2e8f0', -0.82, 0.08, 0.05, 14, { transparent: true, opacity: 0.45 }); tube.name = 'standin:svTube';
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 14), flat(GREEN)); fill.position.set(-0.82, 0.08, 0.05); fill.name = 'standin:svFill'; g.add(fill);
  g.userData.ins = { lines, rings, qs, bond, cloud, fill };
  paintIns(g, null);
  return g;
}
/** level (normalised, kind 'ins') → the line umbrellas, XoL rings, the quota-share dome, the cat-bond plaque, the storm cloud, solvency */
export function paintIns(g, L) {
  const B = g && g.userData && g.userData.ins; if (!B) return false;
  const on = !!(L && L.kind === 'ins');
  const ls = B.lines.map((u, i) => { const x = on ? L.lines.find((y) => y.line === LINES[i]) || { share: 0 } : { share: 0.2, rel: 0 }; const s = x.share || 0; u.visible = s > 0;
    const k = 0.55 + s * 2.2; u.scale.set(k, k, k); const col = x.stop ? GREY : x.rel < 0 ? RED : x.rel > 0 ? GREEN : '#4f46e5'; u.userData.top.material.color.set(col);
    return { line: LINES[i], size: Math.round(k * 100) / 100, color: x.stop ? 'grey' : x.rel < 0 ? 'red' : x.rel > 0 ? 'green' : 'indigo' }; });
  const xol = on ? L.xol : 0; B.rings.forEach((m, i) => { m.visible = i < xol; });
  B.qs.visible = on && L.qs; B.bond.visible = on && L.bond; B.cloud.visible = on && L.season;
  const sv = on ? L.solvency : 1.4; const fh = Math.max(0.01, Math.min(1, sv / 2)) * 0.9; setBar(B.fill, 0.08, fh); B.fill.material.color.set(sv < 1 ? RED : sv < 1.2 ? '#ca8a04' : GREEN);
  g.userData.insState = { lines: ls, xol, qs: B.qs.visible, bond: B.bond.visible, cloud: B.cloud.visible, solvency: sv, svColor: sv < 1 ? 'red' : sv < 1.2 ? 'amber' : 'green' };
  return true;
}

/* ============================================================ w19: the exchange with its bell */
function exchangeFloor() {
  const g = new THREE.Group(); g.name = 'standin:exchange';
  box(g, 1.9, 0.1, 1.6, '#57493a', 0, 0, 0, { roughness: 0.9 });
  box(g, 1.3, 0.8, 0.7, '#44403c', 0, 0.1, -0.35, { roughness: 0.6 });
  columns(g, 6, 1.2, 0.1, 0.05, 0.8, '#d6d3d1', 0.05);
  box(g, 1.4, 0.08, 0.85, '#78716c', 0, 0.9, -0.3);
  pediment(g, 1.4, 0.2, 0, 1.08, 0.02, '#a8a29e');
  const ticker = box(g, 1.25, 0.1, 0.03, GREEN, 0, 0.72, 0.1, 'flat'); ticker.name = 'standin:ticker';
  // the bell on the roof (a lathe: a flared brass cup), its yoke
  const bell = new THREE.Group(); bell.name = 'standin:bell'; bell.position.set(0, 1.22, -0.35); g.add(bell);
  const pts = [[0, 0.32], [0.08, 0.3], [0.11, 0.22], [0.13, 0.1], [0.18, 0.02], [0.2, 0]].map(([x, y]) => new THREE.Vector2(x, y));
  const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), mat('#b45309', { metalness: 0.75, roughness: 0.3, side: THREE.DoubleSide })); bell.add(cup);
  box(bell, 0.46, 0.04, 0.05, '#292524', 0, 0.34, 0); for (const x of [-0.21, 0.21]) box(bell, 0.04, 0.38, 0.05, '#292524', x, -0.04, 0);
  // six months of EBITDA as bars, on a small board in front-left
  const bars = []; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.06), flat('#fbbf24')); m.position.set(-0.84 + i * 0.09, 0.1, 0.55); m.name = 'standin:candle' + i; g.add(m); bars.push(m); }
  // the two divisions: a plant (chimney) and a shop (awning), each with a crane while growth capex runs
  const mkDiv = (x, kind) => { const d = new THREE.Group(); d.position.set(x, 0.1, 0.5); d.name = 'standin:div:' + kind; g.add(d);
    if (kind === 'plant') { box(d, 0.3, 0.2, 0.24, '#78716c'); cyl(d, 0.035, 0.045, 0.3, '#57534e', 0.08, 0.2, -0.05, 8); } else { box(d, 0.3, 0.18, 0.22, '#e7e5e4'); box(d, 0.32, 0.04, 0.08, '#be123c', 0, 0.16, 0.12); }
    const crane = new THREE.Group(); crane.name = 'standin:grow'; d.add(crane); box(crane, 0.02, 0.42, 0.02, '#eab308', -0.17, 0, 0); box(crane, 0.24, 0.02, 0.02, '#eab308', -0.08, 0.42, 0); d.userData.crane = crane; return d; };
  const divs = { plant: mkDiv(0.32, 'plant'), chain: mkDiv(0.74, 'chain') };
  const flag = new THREE.Group(); flag.name = 'standin:activist'; flag.position.set(-0.6, 0.98, -0.1); g.add(flag); box(flag, 0.015, 0.4, 0.015, '#292524'); box(flag, 0.2, 0.12, 0.01, RED, 0.1, 0.27, 0);
  g.userData.listco = { bell, ticker, bars, divs, flag };
  paintList(g, null);
  return g;
}
/** level (normalised, kind 'listco') → the bell, the ticker colour, the EBITDA bars, the divisions and their cranes, the activist flag */
export function paintList(g, L) {
  const B = g && g.userData && g.userData.listco; if (!B) return false;
  const on = !!(L && L.kind === 'listco');
  B.bell.visible = on && L.listed; B.ticker.visible = on && L.listed;
  const up = !on || L.price >= L.peer; B.ticker.material.color.set(up ? GREEN : RED);
  const c = on ? L.candle : [0.8, 0.85, 0.9, 0.88, 0.95, 1]; const hs = B.bars.map((m, i) => { const v = c[i] ?? 0; const h = v > 0 ? 0.05 + v * 0.4 : 0.01; setBar(m, 0.1, h); m.visible = v > 0; return Math.round(h * 100) / 100; });
  const ds = {}; for (const k of ['plant', 'chain']) { const d = on ? L.divs.find((x) => x && x.div === k) : { growing: 0 }; B.divs[k].visible = !!d; B.divs[k].userData.crane.visible = !!(d && d.growing > 0); ds[k] = d ? (d.growing > 0 ? 'growing' : 'on') : 'sold'; }
  B.flag.visible = on && L.activist;
  g.userData.listState = { bell: B.bell.visible, ticker: B.ticker.visible ? (up ? 'green' : 'red') : 'off', bars: hs, divs: ds, activist: B.flag.visible };
  return true;
}

/* ============================================================ w20: the trading floor and its book */
function tradingFloor() {
  const g = new THREE.Group(); g.name = 'standin:fund';
  box(g, 1.9, 0.08, 1.6, '#162033', 0, 0, 0, { roughness: 0.9 });
  box(g, 0.9, 1.35, 0.7, '#0f172a', 0, 0.08, -0.4, { roughness: 0.3, metalness: 0.4 });
  for (let r = 0; r < 5; r++) box(g, 0.92, 0.03, 0.72, '#155e75', 0, 0.3 + r * 0.24, -0.4, 'flat');
  // the screen: a dark panel with a zero line and twelve bars
  box(g, 1.5, 0.62, 0.04, '#020617', 0, 0.1, 0.15).name = 'standin:screen';
  box(g, 1.44, 0.012, 0.012, '#e2e8f0', 0, 0.4, 0.18, 'flat');
  const bars = []; for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.02), flat(GREEN)); m.position.set(-0.66 + i * 0.12, 0.4, 0.19); m.name = 'standin:pos' + i; g.add(m); bars.push(m); }
  // money managed vs its peak: a ring on the tower's top (the arc ∝ the share of the peak)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 40, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: '#22d3ee', side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 1.45, -0.4); ring.name = 'standin:aum'; g.add(ring);
  const gate = box(g, 0.6, 0.06, 0.06, '#f59e0b', 0, 0.3, 0.55); gate.name = 'standin:gate'; for (const x of [-0.3, 0.3]) { const p = box(g, 0.04, 0.34, 0.04, '#78716c', x, 0, 0.55); p.name = 'standin:gatePost'; gate.userData[x < 0 ? 'l' : 'r'] = p; }
  const out = new THREE.Group(); out.name = 'standin:outflow'; out.position.set(0.72, 0.1, 0.5); g.add(out);
  for (let i = 0; i < 3; i++) { const a = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6), flat(RED)); a.rotation.z = -Math.PI / 2; a.position.set(i * 0.09, 0.05, 0); out.add(a); }
  const kiosk = new THREE.Group(); kiosk.name = 'standin:index'; kiosk.position.set(-0.75, 0.08, -0.5); g.add(kiosk); box(kiosk, 0.26, 0.3, 0.22, '#1d4ed8'); box(kiosk, 0.2, 0.08, 0.01, '#bfdbfe', 0, 0.18, 0.115);
  g.userData.fund = { bars, ring, gate, out, kiosk };
  paintFund(g, null);
  return g;
}
/** level (normalised, kind 'fund') → the twelve positions, the ring vs the peak, the gate, the outflow arrows, the index kiosk */
export function paintFund(g, L) {
  const B = g && g.userData && g.userData.fund; if (!B) return false;
  const on = !!(L && L.kind === 'fund');
  const book = on ? L.book.map((b) => b.w) : Array(12).fill(1 / 12);
  const ws = B.bars.map((m, i) => { const w = book[i] || 0; const h = Math.min(1, Math.abs(w) / 0.3) * 0.28; m.visible = Math.abs(w) > 0.001;
    m.scale.y = Math.max(0.005, h); m.position.y = 0.4 + (w >= 0 ? h / 2 : -h / 2); m.material.color.set(w >= 0 ? GREEN : RED); return Math.round(w * 1000) / 1000; });
  const dd = on ? L.dd : 1; const old = B.ring.geometry; B.ring.geometry = new THREE.RingGeometry(0.22, 0.3, 40, 1, 0, Math.PI * 2 * Math.max(0.02, Math.min(1, dd))); old.dispose();
  B.ring.material.color.set(dd >= 0.98 ? '#22d3ee' : dd >= 0.9 ? '#f59e0b' : RED);
  const gate = on && L.gate; B.gate.visible = gate; B.gate.userData.l.visible = gate; B.gate.userData.r.visible = gate;
  B.out.visible = on && L.pending; B.kiosk.visible = on && L.idx;
  g.userData.fundState = { book: ws, longs: ws.filter((w) => w > 0.001).length, shorts: ws.filter((w) => w < -0.001).length, ring: Math.round(dd * 100) / 100, gate, outflow: B.out.visible, idx: B.kiosk.visible };
  return true;
}

/** The five model keys, built in every world (unique names: no other world has a .glb for them). */
export const W1420 = Object.freeze({ bank_hall: bankHall, lab_block: labBlock, insurer_hq: insurerHq, exchange_floor: exchangeFloor, trading_floor: tradingFloor });
