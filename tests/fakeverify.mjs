#!/usr/bin/env node
// verify-result replay sidecar for the offline fake backend (tests/fakebackend.py, T7 §2.5). Started once per FakeBackend.
// Loads the engine exactly as tests/verify.test.mjs does (tools/build-edge.mjs collect → bundleText → engine_loader) and answers
// newline-delimited JSON on stdin/stdout:
//   in : {"rid":n,"row":{mode, world, profession, seed, max_months, status, months, passive, expenses, net_worth, claim_stars,
//          claim_progress, daily_key|weekly_key|challenge_day ...},"actions":[...]}
//   out: {"rid":n,"ok":bool,"error":str|null,"status":http|null,"result":{...},"diff":{...}}
// "status" is set only when verify_core throws a VerifyError (e.g. bad_char 422) — the fake answers that HTTP status, as index.ts does.
import { createInterface } from 'node:readline';
import { collect, bundleText } from '../tools/build-edge.mjs';
import { loadEngine } from '../supabase/functions/verify-result/engine_loader.js';
import { verifyGame } from '../supabase/functions/verify-result/verify_core.js';

const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
let E;
try { E = await loadEngine(bundleText(collect())); }
catch (e) { out({ ready: false, error: String(e && e.stack || e).slice(0, 500) }); process.exit(1); }
out({ ready: true });

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let q;
  try { q = JSON.parse(line); } catch (e) { return out({ rid: null, ok: false, error: 'bad_json', status: 400 }); }
  try {
    const r = verifyGame(E, q.row, q.actions);
    out({ rid: q.rid, ok: !!r.ok, error: r.ok ? null : r.error, status: null, result: r.result, diff: r.diff || null });
  } catch (e) {
    out({ rid: q.rid, ok: false, error: e && e.code ? e.code : 'replay:' + String(e && e.message || e).slice(0, 300), status: e && e.status ? e.status : null });
  }
});
rl.on('close', () => process.exit(0));
