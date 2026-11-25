#!/usr/bin/env node
// tools/staging/gateway.mjs — the API host of the LOCAL staging stack (plays https://<ref>.supabase.co on http://127.0.0.1:$GW_PORT).
//   /rest/v1/*            → PostgREST (as the anon role: like Supabase's gateway with the publishable key, no user JWT)
//   /functions/v1/room    → Deno running supabase/functions/room/index.ts           (verify_jwt = false unless listed below)
//   /functions/v1/verify-result → Deno running supabase/functions/verify-result/index.ts
//   /site/js/*            → static files of $RR_SRC/js (verify-result's RR_ENGINE_BASE_URL: the "live site" it hashes)
// Like the hosted gateway: every /rest/v1 and /functions/v1 request needs the `apikey` header (= $STG_ANON) except CORS preflights;
// RR_STAGING_VERIFY_JWT=room,verify-result makes those functions demand a JWT in Authorization (= deploying WITHOUT --no-verify-jwt:
// the players' calls then fail 401, ONLINE_RELEASE.md B2). One JSON line per request on stdout.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { join, normalize } from 'node:path';

const env = process.env;
const PORT = +env.GW_PORT, ANON = env.STG_ANON, SRC = env.RR_SRC;
const UP = { rest: +env.PGRST_PORT, room: +env.ROOM_PORT, 'verify-result': +env.VERIFY_PORT };
const VERIFY_JWT = new Set((env.RR_STAGING_VERIFY_JWT || '').split(',').map((s) => s.trim()).filter(Boolean));
if (!PORT || !ANON || !SRC) { console.error('gateway: GW_PORT, STG_ANON, RR_SRC required (source tools/staging/env.sh)'); process.exit(2); }

const b64u = (b) => Buffer.from(b).toString('base64url');
function jwtOk(h) {   // HS256 signed with the stack's secret, not expired
  const m = /^Bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(h || ''); if (!m) return false;
  if (b64u(createHmac('sha256', env.STG_JWT_SECRET).update(`${m[1]}.${m[2]}`).digest()) !== m[3]) return false;
  try { const p = JSON.parse(Buffer.from(m[2], 'base64url')); return !p.exp || p.exp * 1000 > Date.now(); } catch (e) { return false; }
}
const send = (res, status, body, extra = {}) => {
  const data = body == null ? '' : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra }); res.end(data);
};
async function body(req) { const parts = []; let n = 0; for await (const c of req) { n += c.length; if (n > 8e6) throw new Error('body too large'); parts.push(c); } return Buffer.concat(parts); }
function forward(req, res, port, path, buf) {
  return new Promise((resolve) => {
    const headers = { ...req.headers, host: `127.0.0.1:${port}` };
    delete headers.apikey; delete headers['content-length'];
    if (buf.length) headers['content-length'] = String(buf.length);
    const up = http.request({ host: '127.0.0.1', port, path, method: req.method, headers }, (u) => {
      res.writeHead(u.statusCode, u.headers); u.pipe(res); u.on('end', () => resolve(u.statusCode));
    });
    up.on('error', (e) => { send(res, 503, { code: 'STAGING_UPSTREAM_DOWN', message: String(e.message) }); resolve(503); });
    up.end(buf);
  });
}
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.mjs': 'text/javascript' };
http.createServer(async (req, res) => {
  const t0 = performance.now(); let status = 0; const url = new URL(req.url, 'http://x'); const p = url.pathname;
  try {
    if (p === '/__staging/health') { send(res, 200, { ok: true, verify_jwt: [...VERIFY_JWT] }); status = 200; return; }
    if (p.startsWith('/site/js/') && req.method === 'GET') {
      const rel = normalize(decodeURIComponent(p.slice('/site/'.length)));
      if (!rel.startsWith('js/') || rel.includes('..')) { send(res, 404, { message: 'not found' }); status = 404; return; }
      try { const data = await readFile(join(SRC, rel)); res.writeHead(200, { 'content-type': TYPES[rel.slice(rel.lastIndexOf('.'))] || 'text/plain' }); res.end(data); status = 200; }
      catch (e) { send(res, 404, { message: 'not found' }); status = 404; }
      return;
    }
    const rest = p.startsWith('/rest/v1/'); const fm = /^\/functions\/v1\/([a-z0-9_-]+)(\/.*)?$/.exec(p);
    if (!rest && !fm) { send(res, 404, { message: 'no Route matched with those values' }); status = 404; return; }
    const buf = await body(req);
    if (req.method !== 'OPTIONS' && req.headers.apikey !== ANON) {
      send(res, 401, req.headers.apikey ? { message: 'Invalid API key' } : { message: 'No API key found in request', hint: 'No `apikey` request header or url param was found.' }); status = 401; return;
    }
    if (rest) { status = await forward(req, res, UP.rest, p.slice('/rest/v1'.length) + url.search, buf); return; }
    const fn = fm[1];
    if (!UP[fn] || fn === 'rest') { send(res, 404, { code: 'NOT_FOUND', message: 'Requested function was not found' }); status = 404; return; }
    if (req.method !== 'OPTIONS' && VERIFY_JWT.has(fn) && !jwtOk(req.headers.authorization)) {
      send(res, 401, { code: 401, message: req.headers.authorization ? 'Invalid JWT' : 'Missing authorization header' }); status = 401; return;
    }
    status = await forward(req, res, UP[fn], `/${fn}${fm[2] || ''}${url.search}`, buf);
  } catch (e) { if (!res.headersSent) send(res, 500, { message: String(e.message) }); status = 500; }
  finally { if (!p.startsWith('/site/') && p !== '/__staging/health') console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, p, status, ms: Math.round(performance.now() - t0) })); }
}).listen(PORT, '127.0.0.1', () => console.log(`gateway http://127.0.0.1:${PORT} → rest :${UP.rest} room :${UP.room} verify-result :${UP['verify-result']} verify_jwt=[${[...VERIFY_JWT]}]`));
