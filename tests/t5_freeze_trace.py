#!/usr/bin/env python3
# T5 part B / T7 §3.3 — root cause of the long main-thread task(s) after the lobby appears (CR-19).
# Records a CDP trace (devtools.timeline + v8 cpu profiler + gpu) from navigation until the 3D init behind the lobby is quiet,
# plus in-page WebGL call timing (an init script wraps the GL prototypes, no app edit), then prints:
#   * the longest tasks on CrRendererMain (start, duration);
#   * for the longest task: self time by trace event name, and the top JS functions by sampled self time (url:line);
#   * GL time per method inside long tasks (compile/link/status = "shader" bucket; tex/buffer uploads; draws);
#   * the verdict of the T7 §3.3 decision rule: shader-bound (GL compile/link/status ≥ 60 % of the longest task),
#     JS-bound (JS self time ≥ 60 %), else mixed.
# Usage: python3 tests/t5_freeze_trace.py [URL] [--block-life] [--warm] [--label=x] [--outdir=/tmp/t5b/trace] [--query=hq]
#   --block-life  E1: assets/life/* and assets/history/* answer 404 (the app has procedural fallbacks)
#   --warm        E2: load the page once, then trace a second load in the SAME browser (warm GPU program cache) in a new context
# Fixed conditions as tests/perf_probe.py: google-chrome headless, swiftshader, every non-local host fails DNS (no Supabase).
import asyncio, gzip, json, os, sys, time
from collections import defaultdict
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
POS = [a for a in sys.argv[1:] if not a.startswith('--')]
URL = POS[0] if POS else 'http://localhost:8802/'
if OPT.get('query'): URL += ('&' if '?' in URL else '?') + OPT['query']
OUT = OPT.get('outdir', '/tmp/t5b/trace'); LABEL = OPT.get('label', 'run')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info',
        '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost, EXCLUDE 127.0.0.1']
CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'disabled-by-default-v8.cpu_profiler',
        'blink.user_timing', 'gpu', 'disabled-by-default-gpu.service', 'toplevel', 'v8']
FAKE_ME = {'id': '0b0b0b0b-0000-4000-8000-00000000beef', 'secret': 'perf-probe-secret', 'nickname': 'פרוב'}
INIT = r"""
(() => {
  window.__t = { lt: [], gl: {}, glCalls: {}, inTask: {}, marks: {} };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) __t.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  const mo = new MutationObserver(() => { const l = document.getElementById('loading');
    if (!__t.marks.lobby && document.querySelector('.lb-home') && (!l || l.hidden || getComputedStyle(l).display === 'none')) __t.marks.lobby = Math.round(performance.now()); });
  mo.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
  const M = ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'useProgram',
    'texImage2D', 'texSubImage2D', 'texStorage2D', 'generateMipmap', 'bufferData', 'bufferSubData', 'drawElements', 'drawArrays',
    'drawArraysInstanced', 'drawElementsInstanced', 'readPixels', 'getError', 'uniformMatrix4fv', 'getUniformLocation', 'getActiveUniform', 'getActiveAttrib'];
  const log = []; window.__t.glLog = log;   // [t0, dur, method] for calls ≥ 2 ms
  for (const C of [self.WebGLRenderingContext, self.WebGL2RenderingContext]) {
    if (!C) continue; const P = C.prototype;
    for (const f of M) {
      const o = P[f]; if (!o || o.__w) continue;
      const w = function () { const t = performance.now(); try { return o.apply(this, arguments); } finally { const d = performance.now() - t;
        __t.gl[f] = (__t.gl[f] || 0) + d; __t.glCalls[f] = (__t.glCalls[f] || 0) + 1; if (d >= 2 && log.length < 5000) log.push([Math.round(t), +d.toFixed(1), f]); } };
      w.__w = 1; P[f] = w;
    }
  }
})();
"""
SHADER = {'compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'getUniformLocation', 'getActiveUniform', 'getActiveAttrib', 'useProgram'}
UPLOAD = {'texImage2D', 'texSubImage2D', 'texStorage2D', 'generateMipmap', 'bufferData', 'bufferSubData'}
DRAW = {'drawElements', 'drawArrays', 'drawArraysInstanced', 'drawElementsInstanced', 'readPixels', 'getError'}

def log(*a): print(*a, flush=True)

async def read_stream(cdp, handle):
    chunks = []
    while True:
        r = await cdp.send('IO.read', {'handle': handle, 'size': 1 << 20})
        d = r.get('data', '')
        chunks.append(d.encode('latin-1') if r.get('base64Encoded') else d.encode('utf-8'))
        if r.get('eof'): break
    await cdp.send('IO.close', {'handle': handle})
    raw = b''.join(chunks)
    if r.get('base64Encoded'):
        import base64; raw = base64.b64decode(b''.join(chunks))
    return raw

def analyse(events, page_t):
    # threads
    names = {}
    for e in events:
        if e.get('ph') == 'M' and e.get('name') == 'thread_name': names[(e['pid'], e['tid'])] = e['args']['name']
    main = [k for k, v in names.items() if v == 'CrRendererMain']
    # pick the renderer main thread with the most RunTask time
    tot = defaultdict(float)
    for e in events:
        if e.get('ph') == 'X' and e.get('name') in ('RunTask', 'ThreadControllerImpl::RunTask') and (e['pid'], e['tid']) in main: tot[(e['pid'], e['tid'])] += e.get('dur', 0)
    if not tot: return {'error': 'no renderer main thread'}
    mt = max(tot, key=tot.get)
    xs = [e for e in events if e.get('ph') == 'X' and (e['pid'], e['tid']) == mt]
    tasks = sorted([e for e in xs if e['name'] in ('RunTask', 'ThreadControllerImpl::RunTask')], key=lambda e: -e.get('dur', 0))
    t0 = min(e['ts'] for e in xs)
    top = tasks[:3]
    out = {'tasks': [{'startMs': round((e['ts'] - t0) / 1000), 'durMs': round(e['dur'] / 1000)} for e in top]}
    # self time per event name inside the longest task
    det = []
    for task in top[:2]:
        a, b = task['ts'], task['ts'] + task['dur']
        inside = sorted([e for e in xs if a <= e['ts'] and e['ts'] + e.get('dur', 0) <= b and e is not task], key=lambda e: (e['ts'], -e.get('dur', 0)))
        # self time: subtract direct children (stack walk)
        selft = defaultdict(float); stack = []
        for e in inside:
            while stack and stack[-1]['ts'] + stack[-1].get('dur', 0) <= e['ts']: stack.pop()
            if stack: selft[stack[-1]['name']] -= e.get('dur', 0)
            selft[e['name']] += e.get('dur', 0); stack.append(e)
        covered = sum(e.get('dur', 0) for e in inside if not any(p['ts'] <= e['ts'] and e['ts'] + e.get('dur', 0) <= p['ts'] + p.get('dur', 0) and p is not e for p in inside[:0]))
        det.append({'task': {'startMs': round((a - t0) / 1000), 'durMs': round(task['dur'] / 1000)},
                    'selfByEvent': sorted([[k, round(v / 1000)] for k, v in selft.items() if v > 5000], key=lambda x: -x[1])[:15]})
    out['detail'] = det
    # JS sampling profile from ProfileChunk events (same pid; profiler thread)
    nodes = {}; samples = []; tstart = None; lastt = None
    for e in events:
        if e.get('name') == 'Profile' and e['pid'] == mt[0]: tstart = e['args']['data'].get('startTime'); lastt = tstart
        if e.get('name') == 'ProfileChunk' and e['pid'] == mt[0]:
            d = e['args']['data']; cp = d.get('cpuProfile', {})
            for nd in cp.get('nodes', []): nodes[nd['id']] = nd
            for sid, dt in zip(cp.get('samples', []), d.get('timeDeltas', [])):
                lastt = (lastt or 0) + dt; samples.append((lastt, sid))
    if samples and top:
        a, b = top[0]['ts'], top[0]['ts'] + top[0]['dur']
        js = defaultdict(float); idle = 0; prog = 0; n = 0
        for i, (t, sid) in enumerate(samples):
            if not (a <= t <= b): continue
            dt = (samples[i + 1][0] - t) if i + 1 < len(samples) else 0
            nd = nodes.get(sid, {}); cf = nd.get('callFrame', {})
            fn = cf.get('functionName') or '(anonymous)'; url = cf.get('url', '').split('/')[-1]
            key = f"{fn} {url}:{cf.get('lineNumber', -1) + 1}" if url else fn
            js[key] += dt; n += 1
        out['jsTop'] = sorted([[k, round(v / 1000)] for k, v in js.items()], key=lambda x: -x[1])[:20]
        out['samplesInTask'] = n
    # GPU process busiest events
    gp = defaultdict(float)
    for e in events:
        if e.get('ph') == 'X' and names.get((e['pid'], e['tid']), '').startswith(('CrGpuMain', 'VizCompositorThread', 'GpuMain')): gp[e['name']] += e.get('dur', 0)
    out['gpuTop'] = sorted([[k, round(v / 1000)] for k, v in gp.items()], key=lambda x: -x[1])[:10]
    return out

async def one(b, warm):
    if warm:
        ctx0 = await b.new_context(viewport={'width': 1300, 'height': 820}, service_workers='block')
        await ctx0.add_init_script(seed_js()); p0 = await ctx0.new_page(); p0.set_default_timeout(240000)
        await p0.goto(URL); await p0.wait_for_selector('.lb-home'); await p0.wait_for_timeout(45000); await ctx0.close()
    ctx = await b.new_context(viewport={'width': 1300, 'height': 820}, service_workers='block')
    await ctx.add_init_script(seed_js()); await ctx.add_init_script(INIT)
    if 'block-life' in OPT:
        await ctx.route('**/assets/life/**', lambda r: r.fulfill(status=404, body='')); await ctx.route('**/assets/history/**', lambda r: r.fulfill(status=404, body=''))
    pg = await ctx.new_page(); pg.set_default_timeout(240000)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    cdp = await ctx.new_cdp_session(pg)
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
    done = asyncio.get_event_loop().create_future()
    cdp.on('Tracing.tracingComplete', lambda e: done.set_result(e.get('stream')) if not done.done() else None)
    await cdp.send('Tracing.start', {'transferMode': 'ReturnAsStream', 'traceConfig': {'includedCategories': CATS, 'recordMode': 'recordContinuously'}})
    t = time.time(); await pg.goto(URL)
    await pg.wait_for_function('__t.marks.lobby != null', timeout=240000)
    # wait until the main thread was quiet (no long task ending) for 6 s, max 90 s after the lobby
    quiet_since = time.time()
    last = 0
    while time.time() - t < 120:
        await asyncio.sleep(1.5)
        try: lt = await pg.evaluate('__t.lt.length')
        except Exception: continue  # noqa: BLE001 — the evaluate itself waits behind a long task
        if lt != last: last = lt; quiet_since = time.time()
        if time.time() - quiet_since > 6 and time.time() - t > 8: break
    info = await pg.evaluate("({lt: __t.lt, gl: __t.gl, calls: __t.glCalls, glLog: __t.glLog, lobby: __t.marks.lobby, ready: !!(window.__rrBooted)})")
    try: info['programs'] = await pg.evaluate("import('/js/scene.js').then(s => { try { return s.perfStats ? s.perfStats() : s.renderStats(); } catch (e) { return String(e); } })")
    except Exception as e: info['programs'] = repr(e)[:100]  # noqa: BLE001
    await cdp.send('Tracing.end'); h = await done
    raw = await read_stream(cdp, h)
    await ctx.close()
    return raw, info, errs

def seed_js():
    return ("if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded','1'); localStorage.setItem('rr2-onboarded','1');"
            f"localStorage.setItem('rr-player', {json.dumps(json.dumps(FAKE_ME, ensure_ascii=False))}); }}")

async def main():
    from playwright.async_api import async_playwright
    os.makedirs(OUT, exist_ok=True)
    la = os.getloadavg()[0]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        raw, info, errs = await one(b, 'warm' in OPT)
        await b.close()
    fn = f'{OUT}/trace-{LABEL}.json.gz'; open(fn, 'wb').write(gzip.compress(raw))
    tr = json.loads(raw); events = tr['traceEvents'] if isinstance(tr, dict) else tr
    res = analyse(events, 0)
    lt = sorted(info['lt'], key=lambda x: -x[1])
    longest = lt[0] if lt else [0, 0]
    # GL time inside the longest long task (from the in-page log: calls ≥ 2 ms) + totals
    a, d = longest; inl = defaultdict(float)
    for t0, dur, f in info.get('glLog') or []:
        if a <= t0 <= a + d: inl[f] += dur
    sh = sum(v for k, v in inl.items() if k in SHADER); up = sum(v for k, v in inl.items() if k in UPLOAD); dr = sum(v for k, v in inl.items() if k in DRAW)
    tot = {k: round(v) for k, v in sorted(info['gl'].items(), key=lambda x: -x[1])}
    shT = sum(v for k, v in info['gl'].items() if k in SHADER)
    jsself = sum(v for k, v in (res.get('jsTop') or []) if not k.startswith(('(program)', '(idle)', '(garbage collector)'))) if res.get('jsTop') else None
    verdict = 'shader-bound' if d and sh / d >= 0.6 else ('JS-bound' if d and jsself is not None and (jsself - sh - up - dr) / d >= 0.6 else 'mixed')
    rep = {'label': LABEL, 'url': URL, 'loadavg': round(la, 2), 'blockLife': 'block-life' in OPT, 'warm': 'warm' in OPT,
           'lobbyMs': info['lobby'], 'longTasks': lt[:6], 'longTasksTotalMs': sum(x[1] for x in info['lt']), 'longestMs': d,
           'glInLongest': {'shaderMs': round(sh), 'uploadMs': round(up), 'drawMs': round(dr), 'byMethod': {k: round(v) for k, v in sorted(inl.items(), key=lambda x: -x[1])}},
           'glTotalMs': tot, 'glCalls': info['calls'], 'glShaderTotalMs': round(shT), 'jsSampledInLongestMs': jsself,
           'trace': res, 'scene': info.get('programs'), 'pageErrors': errs[:5], 'verdict': verdict, 'traceFile': fn}
    json.dump(rep, open(f'{OUT}/freeze-{LABEL}.json', 'w'), ensure_ascii=False, indent=1)
    log(json.dumps({k: rep[k] for k in ('label', 'loadavg', 'lobbyMs', 'longTasks', 'longTasksTotalMs', 'longestMs', 'glInLongest', 'glShaderTotalMs', 'jsSampledInLongestMs', 'verdict')}, ensure_ascii=False))
    log('trace tasks', json.dumps(res.get('tasks')), '\nselfByEvent', json.dumps((res.get('detail') or [{}])[0].get('selfByEvent'), ensure_ascii=False))
    log('jsTop', json.dumps((res.get('jsTop') or [])[:14], ensure_ascii=False)); log('gpuTop', json.dumps(res.get('gpuTop'), ensure_ascii=False))
    log('glTotal', json.dumps(tot)); log('scene', json.dumps(info.get('programs'))[:400])

if __name__ == '__main__':
    asyncio.run(main())
