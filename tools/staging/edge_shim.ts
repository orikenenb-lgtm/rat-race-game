// tools/staging/edge_shim.ts — run one Supabase Edge Function (index.ts) under plain Deno the way the Edge Runtime does:
//   * the function's own `Deno.serve(handler)` is captured and served on 127.0.0.1:$RR_EDGE_PORT (the runtime owns the socket);
//   * the runtime's injected env (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_DB_URL, …) comes from start.sh;
//   * every request logs one JSON line: wall ms, CPU ms of this process during the request (node:process cpuUsage), and whether it
//     was the first POST of the isolate (= the cold start that loads the pinned engine). Supabase's limit is 2 s CPU per request.
// Usage: deno run --allow-net --allow-env --allow-read --allow-sys tools/staging/edge_shim.ts <path to index.ts>
import process from 'node:process';

const port = Number(Deno.env.get('RR_EDGE_PORT'));
const target = Deno.args[0];
if (!port || !target) { console.error('edge_shim: RR_EDGE_PORT and the path of index.ts are required'); Deno.exit(2); }
const name = Deno.env.get('RR_EDGE_NAME') ?? target;
let posts = 0;
const realServe = Deno.serve.bind(Deno);
type Handler = (req: Request, info?: unknown) => Response | Promise<Response>;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (a: any, b?: any) => {
  const handler: Handler = typeof a === 'function' ? a : (b ?? a.handler);
  return realServe({ port, hostname: '127.0.0.1', onListen: () => console.log(JSON.stringify({ edge: name, listening: port })) }, async (req, info) => {
    const t0 = performance.now(); const c0 = process.cpuUsage(); const first = req.method === 'POST' && ++posts === 1;
    let status = 0;
    try { const r = await handler(req, info); status = r.status; return r; }
    finally {
      const c = process.cpuUsage(c0);
      console.log(JSON.stringify({ edge: name, m: req.method, status, ms: Math.round(performance.now() - t0), cpu_ms: Math.round((c.user + c.system) / 1000), cold: first }));
    }
  });
};
await import(new URL(target, `file://${Deno.cwd()}/`).href);
