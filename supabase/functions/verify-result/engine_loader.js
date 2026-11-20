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

/** bundle: object or JSON text. Returns the engine module namespace (same exports as js/engine.js). */
export async function loadEngine(bundle) {
  const b = typeof bundle === 'string' ? JSON.parse(bundle) : bundle;
  const urls = {}; const visiting = new Set();
  const urlOf = (p) => {
    if (urls[p]) return urls[p];
    if (b.files[p] == null) throw new Error('engine bundle: missing module ' + p);
    if (visiting.has(p)) throw new Error('engine bundle: import cycle at ' + p);
    visiting.add(p);
    const src = b.files[p].replace(SPEC, (_m, pre, q, rel) => pre + q + urlOf(join(p, rel)) + q);
    visiting.delete(p);
    return (urls[p] = 'data:text/javascript;base64,' + b64(src));
  };
  return import(urlOf(b.entry));
}
