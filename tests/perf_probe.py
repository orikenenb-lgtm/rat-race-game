#!/usr/bin/env python3
# Performance probe + budget gate (T7 §3). Measures a served copy of the game (default the real copy http://localhost:8772/).
#
#   python3 tests/perf_probe.py [--base=URL] [--cond=desk|3g|phone] [--runs=3] [--leak] [--twod] [--label=base|branch]
#                               [--out=FILE.json] [--gate] [--wait-quiet=600]
#   python3 tests/perf_probe.py --ab=BASE_URL,BRANCH_URL [--cond=…] [--runs=3] [--leak] [--twod] [--outdir=/tmp/t7perf/<ts>]
#        alternates base, branch, base, branch… (ABAB, one browser process per run) and writes base.json, branch.json, compare.md
#   python3 tests/perf_probe.py --compare BASE.json BRANCH.json [--md=FILE]      before/after table (+ gate verdicts of BRANCH)
#   python3 tests/perf_probe.py --gate-file RUN.json [RUN2.json …]               gate saved runs against tests/perf_budgets.json
#
# Fixed conditions (§3.1): /usr/bin/google-chrome headless, swiftshader WebGL, --no-proxy-server and every non-localhost host fails
# DNS (MAP * ~NOTFOUND) — so production Supabase is unreachable WITHOUT request interception (no route overhead; this is why the
# probe is on guard_lint's allowlist). Any response from a non-local host fails the run (externalResponses). Fresh context per run,
# HTTP cache disabled, localStorage rr2-onboarded=1 + a fake rr-player identity (QA App. A), so the lobby really tries its RPCs.
# Gating uses the DOM fallback marks (they exist on the base copy too); rr:* performance marks (CR-18) are recorded when present.
# Noise (§3.9): a run is valid when the 1-min load average at its start is ≤ load_max (perf_budgets.json, env RR_PERF_LOAD_MAX
# overrides — set 0 to force INCONCLUSIVE, PF-E). Timing gates from any noisy run print INCONCLUSIVE(noisy), never PASS.
# Phase A (T5 verify D11): a new (unseeded) player — on the branch the T4 tutorial opens its first card with #roll disabled. Both copies
# are measured with the SAME probe and the same unseeded storage; "roll" timings (clickToRollMs / navToRollMs / bytesBeforeRoll) end
# at the first game input = #roll enabled OR the first card / coach button on screen (mark gameInput; rollEnabledMs is kept too).
# On a copy without the tutorial card the two marks are the same moment, so base and branch stay comparable.
# Not in part A (they exit 2 if asked): --long (PF-19), --trace (§3.3 freeze trace), --heap (§3.5 retainers), PF-15 hidden-tab draws.
# Phase B (--leak) uses no Playwright element handles (T7 F-3): see the note above phase_b().
import asyncio, json, os, statistics, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
POS = [a for a in sys.argv[1:] if not a.startswith('--')]
BUDGETS = json.load(open(os.path.join(HERE, 'perf_budgets.json'), encoding='utf-8'))
LOAD_MAX = float(os.environ.get('RR_PERF_LOAD_MAX', BUDGETS.get('load_max', 2.5)))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info',
        '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost, EXCLUDE 127.0.0.1']
NET3G = {'offline': False, 'latency': 562.5, 'downloadThroughput': 180000, 'uploadThroughput': 84375}
FAKE_ME = {'id': '0b0b0b0b-0000-4000-8000-00000000beef', 'secret': 'perf-probe-secret', 'nickname': 'פרוב'}
CONDS = {'desk': dict(viewport={'width': 1300, 'height': 820}, device_scale_factor=1),
         '3g': dict(viewport={'width': 1300, 'height': 820}, device_scale_factor=1),
         'phone': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True)}
TIMEOUT = 300000
def log(*a): print(*a, flush=True)

INIT = r"""
(() => {
  window.__m = { marks: {}, lt: [], gl: {}, draws: 0 };
  const mark = (k) => { if (!(k in __m.marks)) __m.marks[k] = Math.round(performance.now()); };
  const vis = (el) => el && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none';
  const mo = new MutationObserver(() => {
    const l = document.getElementById('loading');
    if (document.querySelector('.lb-home') && (!l || l.hidden || getComputedStyle(l).display === 'none')) mark('lobbyUsable');
    if (vis(document.querySelector('.wv-chars'))) mark('worldView');
    const r = document.getElementById('roll'); const inGame = document.getElementById('start') && document.getElementById('start').hidden;
    if (r && !r.disabled && inGame) { mark('rollEnabled'); mark('gameInput'); }
    // T5 verify D11: a new player's game opens on the tutorial's first card / coach with #roll still disabled — that card is the
    // first thing the player can act on, so it ends the "time to the first game input" just like an enabled roll does
    const cardBtn = document.querySelector('#evm:not([hidden]) #evCard button:not([disabled]), #gm:not([hidden]) .acts button:not([disabled]), #coach:not([hidden]) .bubble button');
    if (inGame && cardBtn && vis(cardBtn)) mark('gameInput');
  });
  mo.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'class', 'style'] });
  window.__markReset = (k) => { delete __m.marks[k]; };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) __m.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  for (const C of [self.WebGLRenderingContext, self.WebGL2RenderingContext]) {
    if (!C) continue; const P = C.prototype;
    for (const [mk, del, k] of [['createTexture', 'deleteTexture', 'tex'], ['createBuffer', 'deleteBuffer', 'buf'], ['createProgram', 'deleteProgram', 'prog'], ['createFramebuffer', 'deleteFramebuffer', 'fb'], ['createVertexArray', 'deleteVertexArray', 'vao']]) {
      const c = P[mk], d = P[del]; if (!c || !d) continue;
      P[mk] = function () { __m.gl[k] = (__m.gl[k] || 0) + 1; return c.apply(this, arguments); };
      P[del] = function (o) { if (o) __m.gl[k] = (__m.gl[k] || 0) - 1; return d.apply(this, arguments); };
    }
    for (const f of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const o = P[f]; if (!o) continue; P[f] = function () { __m.draws++; return o.apply(this, arguments); };
    }
  }
})();
"""
FPS = """(ms) => new Promise((res) => { let n = 0, drawn = 0, last = __m.draws; const t0 = performance.now();
  const f = (t) => { n++; if (__m.draws !== last) { drawn++; last = __m.draws; } if (t - t0 < ms) requestAnimationFrame(f); else res({ fps: +(n * 1000 / (t - t0)).toFixed(1), framesDrawn: drawn }); };
  requestAnimationFrame(f); })"""
DRAWS = "(ms) => new Promise((res) => { const a = __m.draws; setTimeout(() => res(__m.draws - a), ms); })"

def git_info():
    def g(*a):
        try: return subprocess.run(['git', '-C', HERE, *a], capture_output=True, text=True, timeout=20).stdout.strip()
        except Exception: return None  # noqa: BLE001
    return {'head': g('rev-parse', 'HEAD'), 'dirty': bool(g('status', '--porcelain', '--', '../js', '../css', '../index.html', '../assets'))}

async def wait_quiet(limit_s):
    t = time.time()
    while os.getloadavg()[0] > LOAD_MAX and time.time() - t < limit_s:
        log(f'  load {os.getloadavg()[0]:.2f} > {LOAD_MAX} — waiting (≤ {limit_s}s)'); await asyncio.sleep(30)
    return os.getloadavg()[0]

async def metrics(cdp, gc=False):
    if gc:
        await cdp.send('HeapProfiler.collectGarbage'); await asyncio.sleep(0.3); await cdp.send('HeapProfiler.collectGarbage')
    m = {x['name']: x['value'] for x in (await cdp.send('Performance.getMetrics'))['metrics']}
    return {'heapMB': round(m['JSHeapUsedSize'] / 1048576, 2), 'nodes': int(m['Nodes']), 'listeners': int(m['JSEventListeners'])}

async def new_page(b, cond, seeded):
    ctx = await b.new_context(**CONDS[cond], service_workers='block')
    init = "localStorage.setItem('rr2-onboarded','1');" + f"localStorage.setItem('rr-player', {json.dumps(json.dumps(FAKE_ME, ensure_ascii=False))});"
    if seeded: init += "localStorage.setItem('rr2-progress', JSON.stringify({stars:{w1:3,w2:2},best:{w1:14},tutorialDone:true,gamesPlayed:5,wins:2}));"
    await ctx.add_init_script("if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded','1');" + init + "}")
    await ctx.add_init_script(INIT)
    pg = await ctx.new_page(); pg.set_default_timeout(TIMEOUT)
    cdp = await ctx.new_cdp_session(pg)
    await cdp.send('Network.enable'); await cdp.send('Performance.enable'); await cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
    if cond == '3g': await cdp.send('Network.emulateNetworkConditions', NET3G)
    if cond == 'phone': await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    ext = []
    def on_resp(e):
        u = e['response'].get('url', '')
        if not u.startswith(('http://localhost', 'http://127.0.0.1', 'data:', 'blob:')): ext.append(u[:120])
    cdp.on('Network.responseReceived', on_resp)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    return ctx, pg, cdp, ext, errs

async def start_game(pg, world, nth=0, first_input=False):
    """Open `world`, click its nth character, wait for #roll enabled (first_input: or the first card / coach of a new player's
    tutorial, mark gameInput — T5 verify D11). → wall-clock ms from the character click."""
    await pg.click(f'.map-card[data-id="{world}"]'); await pg.wait_for_selector('.wv-chars')
    await pg.evaluate("window.__markReset('rollEnabled'); window.__markReset('gameInput')")
    t0 = time.time(); await pg.locator('.wv-char').nth(nth).click()
    ready = "document.querySelector('#start').hidden && __m.marks.gameInput != null" if first_input else "!document.querySelector('#roll').disabled && document.querySelector('#start').hidden"
    for i in range(2):   # a "replace the saved game?" confirm may appear
        try:
            await pg.wait_for_function(ready, timeout=8000 if i == 0 else TIMEOUT); break
        except Exception:  # noqa: BLE001
            if await pg.locator('#gm:not([hidden]) .acts button.primary').count(): await pg.click('#gm .acts button.primary')
            elif i: raise
    return round((time.time() - t0) * 1000)

def resources_summary(res, lobby_ms, roll_ms, world='w1'):
    before_l = [r for r in res if r['end'] <= (lobby_ms or 0)]
    before_r = [r for r in res if roll_ms is not None and r['start'] < roll_ms]
    glbs = [r for r in before_r if r['name'].split('?')[0].endswith('.glb')]
    def bad(u):
        return ('/assets/life/' in u) or ('/assets/history/' in u and world != 'h') or any(f'/assets/{w}/' in u for w in ('w1', 'w2', 'w3', 'w4') if w != world)
    return {'bytesBeforeLobbyKB': round(sum(r['size'] for r in before_l) / 1024), 'requestsBeforeLobby': len(before_l),
            'bytesBeforeRollMB': round(sum(r['size'] for r in before_r) / 1048576, 2) if roll_ms is not None else None,
            'requestsBeforeRoll': len(before_r) if roll_ms is not None else None,
            'glbBeforeRoll': [[r['name'], r['start']] for r in glbs], 'glbViolations': sum(1 for r in glbs if bad(r['name'])) if roll_ms is not None else None}

RES_JS = """() => { const n = performance.getEntriesByType('navigation')[0];
  const out = performance.getEntriesByType('resource').map(e => ({ name: e.name.replace(location.origin, ''), start: Math.round(e.startTime), end: Math.round(e.responseEnd), size: e.encodedBodySize || e.transferSize || 0 }));
  if (n) out.unshift({ name: n.name.replace(location.origin, ''), start: 0, end: Math.round(n.responseEnd), size: n.encodedBodySize || n.transferSize || 0 });
  return out; }"""

async def phase_a(b, base, cond, mode='full', twod=False):
    """mode 'full': nav → lobby → idle 10 s → w1 → first character → roll. 'input': click w1 at lobby + 2 s → world view (wall clock)."""
    ctx, pg, cdp, ext, errs = await new_page(b, cond, seeded=False)
    la0 = os.getloadavg()[0]; t = time.time()
    url = base + (('&' if '?' in base else '?') + 'ff=board2d:on' if twod else '')
    await pg.goto(url); await pg.wait_for_function("__m.marks.lobbyUsable != null", timeout=TIMEOUT)
    marks = await pg.evaluate('__m.marks'); lu = marks['lobbyUsable']; r = {'mode': mode, 'twod': twod}
    if mode == 'input':
        await pg.wait_for_function(f"performance.now() >= {lu + 2000}", timeout=TIMEOUT)
        t0 = time.time(); await pg.click('.map-card[data-id="w1"]'); await pg.wait_for_selector('.wv-chars', state='visible', timeout=TIMEOUT)
        r['inputClickToWorldMs'] = round((time.time() - t0) * 1000)
    else:
        await pg.wait_for_timeout(10000)
        lt = await pg.evaluate('__m.lt')
        idle = [d for s, d in lt if lu <= s < lu + 10000]
        r['lobbyIdleLongTaskMaxMs'] = max(idle or [0]); r['lobbyIdleLongTasks'] = len(idle)
        r['clickToRollMs'] = await start_game(pg, 'w1', first_input=True)
        await pg.wait_for_timeout(1000)
    marks = await pg.evaluate('__m.marks'); lt = await pg.evaluate('__m.lt')
    res = await pg.evaluate(RES_JS)
    r.update({'loadavgStart': round(la0, 2), 'loadavgEnd': round(os.getloadavg()[0], 2), 'wallS': round(time.time() - t, 1),
              'lobbyUsableMs': lu, 'navToRollMs': marks.get('gameInput') if mode == 'full' else None, 'rollEnabledMs': marks.get('rollEnabled'),
              'rrMarks': await pg.evaluate("performance.getEntriesByType('mark').filter(m => m.name.startsWith('rr:')).map(m => [m.name, Math.round(m.startTime)])"),
              'longTasks': {'n': len(lt), 'maxMs': max([d for _, d in lt] or [0]), 'totalMs': sum(d for _, d in lt)},
              **resources_summary(res, lu, marks.get('gameInput') if mode == 'full' else None),
              'liveGL': await pg.evaluate('__m.gl'), 'externalResponses': ext[:10], 'pageErrors': errs[:5]})
    r['noisy'] = la0 > LOAD_MAX
    await ctx.close(); return r

# Phase B drives the page WITHOUT Playwright element handles (T7 F-3 / PF-10): every ElementHandle that wait_for_selector() returns, and
# the handles behind locator / selector clicks, stay registered with DevTools ("DevTools console" global handles in a heap snapshot)
# until the context closes — they kept each replaced lobby home and world-view tree alive, ≈ +790 DOM nodes per re-entry on the
# branch (≈ +600 on base), all of it harness. Here clicks are real mouse events at the element's centre (rect read by evaluate, which
# returns plain values) and waits are wait_for_function predicates that return booleans.
VIS_JS = "(a) => { const e = document.querySelectorAll(a[0])[a[1] || 0]; return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; }"
RECT_JS = "(a) => { const e = document.querySelectorAll(a[0])[a[1] || 0]; if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'center' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }"
async def wait_vis(pg, sel, nth=0, timeout=TIMEOUT): await pg.wait_for_function(VIS_JS, arg=[sel, nth], timeout=timeout)
async def tap(pg, sel, nth=0, timeout=TIMEOUT):
    await wait_vis(pg, sel, nth, timeout); xy = await pg.evaluate(RECT_JS, [sel, nth])
    if not xy: raise Exception(f'tap: {sel}[{nth}] is gone')
    await pg.mouse.click(*xy)

async def start_game_nh(pg, world, nth=0):
    """start_game() without element handles (phase B). → wall-clock ms from the character click to #roll enabled."""
    await tap(pg, f'.map-card[data-id="{world}"]'); await wait_vis(pg, '.wv-chars')
    await pg.evaluate("window.__markReset('rollEnabled'); window.__markReset('gameInput')")
    t0 = time.time(); await tap(pg, '.wv-char', nth)
    ready = "!document.querySelector('#roll').disabled && document.querySelector('#start').hidden"
    for i in range(2):   # a "replace the saved game?" confirm may appear
        try:
            await pg.wait_for_function(ready, timeout=8000 if i == 0 else TIMEOUT); break
        except Exception:  # noqa: BLE001
            if await pg.evaluate("!!document.querySelector('#gm:not([hidden]) .acts button.primary')"): await tap(pg, '#gm:not([hidden]) .acts button.primary')
            elif i: raise
    return round((time.time() - t0) * 1000)

async def home_nh(pg): await tap(pg, '#homeBtn'); await wait_vis(pg, '.lb-home')

async def snap_of(pg, cdp, step):
    return {'step': step, **(await metrics(cdp, gc=True)), 'gl': dict(await pg.evaluate('__m.gl')), 'attached': await pg.evaluate("document.getElementsByTagName('*').length")}

async def phase_b(b, base, cond):
    ctx, pg, cdp, ext, errs = await new_page(b, cond, seeded=True)
    la0 = os.getloadavg()[0]
    await pg.goto(base); await wait_vis(pg, '.lb-home')
    out = {'loadavgStart': round(la0, 2), 'firstClickToRollMs': await start_game_nh(pg, 'w1')}
    await pg.wait_for_timeout(2500)
    idle = await pg.evaluate(FPS, 4000); out['idleFps'] = idle['fps']
    await pg.wait_for_timeout(3000); out['framesQuiet5s'] = (await pg.evaluate(FPS, 5000))['framesDrawn']
    # every DOM snapshot is taken in the same state: in a game, roll enabled, no card open (the re-entries: 2 s after their start).
    # The first one used to be taken in the lobby, so PF-10b compared a lobby-home DOM with in-game DOMs (which keep the world view
    # under the hidden lobby). Taken after the FPS samples (its forced GC must not disturb them), before the dice roll.
    snap0 = await snap_of(pg, cdp, 'game1 (w1)')
    dice = await pg.evaluate("(ms) => { document.querySelector('#roll').click(); return (%s)(ms); }" % FPS, 3000); out['diceFps'] = dice['fps']
    await pg.wait_for_timeout(4000)
    t0 = time.time(); await home_nh(pg); out['homeToLobbyMs'] = round((time.time() - t0) * 1000)
    await pg.wait_for_timeout(1500); out['drawsLobbyOverGame'] = await pg.evaluate(DRAWS, 3000)
    out['resumeToRollMs'] = None
    if await pg.evaluate("!!document.querySelector('.lb-resume')"):
        await pg.evaluate("window.__markReset('rollEnabled')"); t0 = time.time(); await tap(pg, '.lb-resume')
        # back in the game = lobby gone and the game interactive (roll enabled, or the card left open by the dice roll above)
        await pg.wait_for_function("document.querySelector('#start').hidden && (!document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden)", timeout=TIMEOUT)
        out['resumeToRollMs'] = round((time.time() - t0) * 1000)
        await home_nh(pg)
    # GL baseline of w1 for PF-13: after the first game settled (as before), in the lobby
    first = {'w1': {'gl': dict(await pg.evaluate('__m.gl'))}}
    snaps = [snap0]
    switch = []; repeat = {}
    for i, w in enumerate(['w2', 'w1', 'w2', 'w1', 'w2']):
        if i: await home_nh(pg); await pg.wait_for_timeout(800)
        ms = await start_game_nh(pg, w, nth=(i + 1) % 3); switch.append(ms); await pg.wait_for_timeout(2000)
        m = await metrics(cdp, gc=True); gl = dict(await pg.evaluate('__m.gl'))
        snaps.append({'step': f're-entry {i + 1} ({w})', 'clickToRollMs': ms, **m, 'gl': gl, 'attached': await pg.evaluate("document.getElementsByTagName('*').length")})
        if w not in first: first[w] = {'gl': gl}
        else:
            for k in ('buf', 'vao', 'tex', 'prog'): repeat[k] = max(repeat.get(k, -10 ** 9), gl.get(k, 0) - first[w]['gl'].get(k, 0))
    # PF-10 / 10b / 11 / 12 are defined over the 5 re-entries (T7 §2: "max − min over 5 re-entries"): every one of them starts from the
    # lobby with a paused game, like a player switching worlds. The first game (started from a lobby with no game behind it, before
    # any dice roll / resume) is kept in snaps and reported apart (*All = all 6 snapshots, *FirstToRe1 = first game → re-entry 1).
    re = snaps[1:]
    rng = lambda xs, k: max(x[k] for x in xs) - min(x[k] for x in xs)
    out.update({'snaps': snaps, 'nodesRange': rng(re, 'nodes'), 'attachedRange': rng(re, 'attached'), 'listenersRange': rng(re, 'listeners'),
                'heapGrowthMB': round(re[-1]['heapMB'] - re[0]['heapMB'], 2),
                'nodesRangeAll': rng(snaps, 'nodes'), 'attachedRangeAll': rng(snaps, 'attached'), 'heapGrowthAllMB': round(snaps[-1]['heapMB'] - snaps[0]['heapMB'], 2),
                'nodesFirstToRe1': re[0]['nodes'] - snaps[0]['nodes'], 'attachedFirstToRe1': re[0]['attached'] - snaps[0]['attached'], 'glRepeat': repeat,
                'worldSwitchToRollMs': statistics.median(switch), 'drawsHidden': None,
                'loadavgEnd': round(os.getloadavg()[0], 2), 'externalResponses': ext[:10], 'pageErrors': errs[:5], 'noisy': la0 > LOAD_MAX})
    await ctx.close(); return out

def med(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return statistics.median(xs) if xs else None
def worst(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return max(xs) if xs else None

def summarize(res):
    A = [r for r in res['A'] if r['mode'] == 'full']; I = [r for r in res['A'] if r['mode'] == 'input']; T = res.get('T') or []
    s = {'A': {}, 'B': {}, 'T': {}, 'L': {}}
    for k in ('lobbyUsableMs', 'lobbyIdleLongTaskMaxMs', 'navToRollMs', 'clickToRollMs'): s['A'][k] = med([r.get(k) for r in A])
    s['A']['inputClickToWorldMs'] = med([r.get('inputClickToWorldMs') for r in I])
    for k in ('bytesBeforeRollMB', 'bytesBeforeLobbyKB', 'requestsBeforeLobby', 'requestsBeforeRoll', 'glbViolations'): s['A'][k] = worst([r.get(k) for r in A])
    for k in ('lobbyUsableMs', 'navToRollMs', 'clickToRollMs'): s['T'][k] = med([r.get(k) for r in T])
    if res.get('B'):
        B = res['B']; s['B'] = {k: B.get(k) for k in ('nodesRange', 'attachedRange', 'listenersRange', 'heapGrowthMB', 'nodesRangeAll', 'attachedRangeAll', 'heapGrowthAllMB', 'nodesFirstToRe1', 'attachedFirstToRe1', 'drawsLobbyOverGame', 'drawsHidden', 'framesQuiet5s',
                                                      'homeToLobbyMs', 'resumeToRollMs', 'worldSwitchToRollMs', 'diceFps', 'idleFps')}
        s['B']['glRepeat'] = B.get('glRepeat') or {}
    runs = res['A'] + T + ([res['B']] if res.get('B') else [])
    s['pageErrors'] = sum(len(r.get('pageErrors') or []) for r in runs)
    s['externalResponses'] = sum(len(r.get('externalResponses') or []) for r in runs)
    s['noisy'] = any((r.get('loadavgStart') or 0) > LOAD_MAX for r in runs)   # recomputed at gate time (RR_PERF_LOAD_MAX, PF-E)
    return s

def get(summary, path):
    cur = summary
    for p in path.split('.'):
        if not isinstance(cur, dict) or p not in cur: return None
        cur = cur[p]
    return cur

def gate(summaries, out=print):
    """summaries: {cond: summary}. Prints one verdict per budget id. → (lines, any gated FAIL)."""
    lines, failed = [], False
    for bd in BUDGETS['budgets']:
        conds = list(summaries) if bd['cond'] == '*' else [bd['cond']]
        if not any(c in summaries for c in conds):
            lines.append((bd['id'], 'NOT RUN', f"cond={bd['cond']} not measured", bd)); continue
        sm = summaries[next(c for c in conds if c in summaries)]
        mets = bd['metric'] if isinstance(bd['metric'], list) else [bd['metric']]
        buds = bd['budget'] if isinstance(bd['budget'], list) else [bd['budget']]
        vals = [get(sm, m) for m in mets]
        if bd['id'] == 'PF-23': vals = [sum(s['pageErrors'] for s in summaries.values())]
        if bd.get('note', '').startswith('P1') and all(v is None for v in vals):
            lines.append((bd['id'], 'NOT RUN', bd['note'], bd)); continue
        if any(v is None for v in vals):
            lines.append((bd['id'], 'N/A(missing)', f'{mets} = {vals}', bd)); continue
        if bd['type'] == 'R' or any(x is None for x in buds):
            lines.append((bd['id'], 'REPORT', f'{mets} = {vals}', bd)); continue
        ok = all(v <= x for v, x in zip(vals, buds))
        if bd['type'] == 'T' and sm.get('noisy'): verdict = 'INCONCLUSIVE(noisy)' if ok else 'FAIL'
        else: verdict = 'PASS' if ok else 'FAIL'
        if verdict == 'FAIL': failed = True
        lines.append((bd['id'], verdict, f"{mets} = {vals} (budget {buds})" + ('' if ok else f" → {bd['owner_cr']}"), bd))
    for i, v, msg, bd in lines: out(f'{i:6} {v:20} {msg}')
    return lines, failed

async def run_one(base, cond, label, twod=False, leak=False, runs=1, wait=600):
    from playwright.async_api import async_playwright
    res = {'label': label, 'base': base, 'cond': cond, 'date': time.strftime('%Y-%m-%d %H:%M:%S'), 'nproc': os.cpu_count(), 'git': git_info(),
           'loadMax': LOAD_MAX, 'A': [], 'T': [], 'B': None, 'renderer': 'swiftshader'}
    for i in range(runs):
        await wait_quiet(wait)
        async with async_playwright() as p:   # one browser process per run
            b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS); res['chrome'] = b.version
            for mode in ('full', 'input'):
                r = await phase_a(b, base, cond, mode); res['A'].append(r)
                log(f'  [{label} {cond} run {i + 1} {mode}] load {r["loadavgStart"]} lobby {r["lobbyUsableMs"]} idleLT {r.get("lobbyIdleLongTaskMaxMs")} '
                    f'click→roll {r.get("clickToRollMs")} nav→roll {r.get("navToRollMs")} input {r.get("inputClickToWorldMs")} MB {r.get("bytesBeforeRollMB")} glbBad {r.get("glbViolations")} err {len(r["pageErrors"])}')
            if twod:
                r = await phase_a(b, base, '3g' if cond == '3g' else cond, 'full', twod=True); res['T'].append(r)
                log(f'  [{label} {cond} run {i + 1} 2D] click→roll {r.get("clickToRollMs")} nav→roll {r.get("navToRollMs")} glb {len(r["glbBeforeRoll"])}')
            if leak and i == runs - 1:
                try: res['B'] = await phase_b(b, base, cond)
                except Exception as e:  # noqa: BLE001 — record, never hide: the leak budgets then print N/A(missing)
                    res['B'] = None; res['leakError'] = repr(e)[:400]; log(f'  [{label} leak] ERROR {e!r}'[:300])
            if res['B']:
                B = res['B']; log(f'  [{label} leak] nodesRange {B["nodesRange"]} attached {B["attachedRange"]} listeners {B["listenersRange"]} heap +{B["heapGrowthMB"]}MB glRepeat {B["glRepeat"]} drawsLobby {B["drawsLobbyOverGame"]}'
                                  f' · all 6 snapshots: nodes {B.get("nodesRangeAll")} attached {B.get("attachedRangeAll")} heap +{B.get("heapGrowthAllMB")}MB · first game → re-entry 1: nodes {B.get("nodesFirstToRe1"):+} attached {B.get("attachedFirstToRe1"):+}')
            await b.close()
    res['summary'] = summarize(res)
    return res

def compare_md(a, b):
    sa, sb = a['summary'], b['summary']
    rows = ['| id | cond | metric | base (%s) | branch (%s) | Δ | budget | verdict | CR |' % (a['git'].get('head', '?')[:7], b['git'].get('head', '?')[:7]), '|---|---|---|---|---|---|---|---|---|']
    lines, _ = gate({b['cond']: sb}, out=lambda *_: None)
    for i, v, msg, bd in lines:
        if bd['cond'] not in (b['cond'], '*'): continue
        mets = bd['metric'] if isinstance(bd['metric'], list) else [bd['metric']]
        for m in mets:
            x, y = (get(sa, m), get(sb, m)) if bd['id'] != 'PF-23' else (sa['pageErrors'], sb['pageErrors'])
            d = round(y - x, 2) if isinstance(x, (int, float)) and isinstance(y, (int, float)) else '—'
            rows.append(f"| {i} | {bd['cond']} | {m} | {x} | {y} | {d} | {bd['budget']} | {v} | {bd['owner_cr']} |")
    meta = (f"base: {a['base']} @ {a['git']}, load at run starts {[r['loadavgStart'] for r in a['A']]}\n"
            f"branch: {b['base']} @ {b['git']}, load at run starts {[r['loadavgStart'] for r in b['A']]}\n"
            f"chrome {b.get('chrome')}, nproc {b['nproc']}, renderer swiftshader (software GL: compile/draw are CPU-bound), load_max {LOAD_MAX}\n")
    return meta + '\n' + '\n'.join(rows) + '\n'

async def main():
    for k in ('long', 'trace', 'heap'):
        if k in OPT: log(f'--{k} is not implemented in T7 part A (see the header).'); sys.exit(2)
    if 'compare' in OPT:
        a, b = (json.load(open(f)) for f in POS[:2]); md = compare_md(a, b); print(md)
        if OPT.get('md'): open(OPT['md'], 'w').write(md)
        return
    if 'gate-file' in OPT:
        sums = {}
        for f in POS: d = json.load(open(f)); sums[d['cond']] = summarize(d)
        _, failed = gate(sums); sys.exit(1 if failed else 0)
    cond = OPT.get('cond', 'desk'); runs = int(OPT.get('runs', 3)); wait = int(OPT.get('wait-quiet', 600))
    if 'ab' in OPT:
        ua, ub = OPT['ab'].split(',')
        outdir = OPT.get('outdir', f'/tmp/t7perf/{time.strftime("%Y%m%d-%H%M%S")}'); os.makedirs(outdir, exist_ok=True)
        A = {'A': [], 'T': [], 'B': None}; B = {'A': [], 'T': [], 'B': None}; ra = rb = None
        for i in range(runs):   # ABAB: one run of each copy per round
            last = i == runs - 1
            x = await run_one(ua, cond, 'base', 'twod' in OPT, 'leak' in OPT and last, 1, wait)
            y = await run_one(ub, cond, 'branch', 'twod' in OPT, 'leak' in OPT and last, 1, wait)
            for acc, r in ((A, x), (B, y)):
                acc['A'] += r['A']; acc['T'] += r['T']; acc['B'] = r['B'] or acc['B']
            ra, rb = x, y
        for acc, r, c in ((A, ra, OPT.get('base-commit')), (B, rb, OPT.get('branch-commit'))):
            r.update(A=acc['A'], T=acc['T'], B=acc['B']); r['summary'] = summarize(r)
            if c: r['git'] = {'head': c, 'served_copy': True}
        json.dump(ra, open(f'{outdir}/base-{cond}.json', 'w'), ensure_ascii=False, indent=1)
        json.dump(rb, open(f'{outdir}/branch-{cond}.json', 'w'), ensure_ascii=False, indent=1)
        md = compare_md(ra, rb); open(f'{outdir}/compare-{cond}.md', 'w').write(md); print(md); log('saved', outdir)
        return
    base = OPT.get('base', POS[0] if POS else 'http://localhost:8772/'); label = OPT.get('label', 'branch')
    res = await run_one(base, cond, label, 'twod' in OPT, 'leak' in OPT, runs, wait)
    if res['git'].get('dirty') and label == 'branch': log('NOTE: app files in the working tree are dirty — not labelled as "after".'); res['label'] = 'dirty'
    out = OPT.get('out', f'/tmp/t7perf/{label}-{cond}-{int(time.time())}.json'); os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(res, open(out, 'w'), ensure_ascii=False, indent=1); log('saved', out)
    if res['summary']['externalResponses']: log('FAIL: responses from non-local hosts', [r.get('externalResponses') for r in res['A']]); sys.exit(1)
    if 'gate' in OPT:
        _, failed = gate({cond: res['summary']}); sys.exit(1 if failed else 0)

if __name__ == '__main__':
    asyncio.run(main())
