// Load the engine from a bundle {entry, files:{path: source}} WITHOUT writing files and WITHOUT changing the code:
// every module becomes a data: URL whose relative import specifiers are replaced by the data: URLs of its dependencies
// (built leaves-first, memoised). Identical data: URLs are the same module record, so shared modules (worlds/common.js,
// worlds/w1.js) are instantiated once, exactly like in the browser. Works in Deno (Supabase Edge Runtime) and Node ≥ 18.
const SPEC = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\2/g;

function join(base, rel) {
  const parts = base.split('/'); parts.pop();
  for (const seg of rel.split('/')) { if (seg === '.' || seg === '') continue; if (seg === '..') parts.pop(); else parts.push(seg); }
  return parts.join('/');
}
function b64(s) {
  const bytes = new TextEncoder().encode(s); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Module data: URLs for `files` (static imports must resolve; a DYNAMIC import of a module the bundle leaves out — js/data/real.js, history
 *  mode only — is kept as written and would only fail if called, which a ranked replay never does). Same sources ⇒ same URLs ⇒ the same
 *  module instances across calls (the core modules a world pack imports are the core's own instances). */
function urlsFor(files) {
  const urls = {}; const visiting = new Set();
  const urlOf = (p) => {
    if (urls[p]) return urls[p];
    if (files[p] == null) throw new Error('engine bundle: missing module ' + p);
    if (visiting.has(p)) throw new Error('engine bundle: import cycle at ' + p);
    visiting.add(p);
    const src = files[p].replace(SPEC, (m, pre, q, rel) => { const t = join(p, rel); if (files[t] == null && /import\s*\(/.test(pre)) return m; return pre + q + urlOf(t) + q; });
    visiting.delete(p);
    return (urls[p] = 'data:text/javascript;base64,' + b64(src));
  };
  return urlOf;
}
/** bundle: object or JSON text. Returns the engine module namespace (same exports as js/engine.js). */
export async function loadEngine(bundle) {
  const b = typeof bundle === 'string' ? JSON.parse(bundle) : bundle;
  return import(urlsFor(b.files)(b.entry));
}
/**
 * Worlds wave 0: load a lazy world's pack on top of a loaded core and register it. core / pack: objects or JSON texts ({entry, files}).
 * The pack's imports of core modules (worlds/common.js …) resolve to the core's data: URLs = the very modules the core engine uses.
 * Returns the world config (E.registerWorld's result).
 */
export async function loadWorldPack(E, core, pack) {
  const c = typeof core === 'string' ? JSON.parse(core) : core; const p = typeof pack === 'string' ? JSON.parse(pack) : pack;
  const ns = await import(urlsFor({ ...c.files, ...p.files })(p.entry));
  return E.registerWorld(ns.default);
}
