# Team ב — one browser probe per 3D failure cause (BRIEF §8): which renderer comes up and which message the player sees.
# Usage: python3 tests/fallback_probe.py [--base=http://localhost:8770/index.html] [--only=nogl,webgl1] [--phones] [--shots=DIR] [--out=FILE]
#   base = a game-only test copy (tests/serve_copies.sh PORT_BASE+0: built-in world picker, no lobby.js).
# Causes: nogl (no WebGL at all), webgl1 (WebGL1 only), threefail (three.js request aborted), threeslow (three.js never answers →
#   RENDERER_TIMEOUT_MS), glbfail (every .glb aborted), ctxgame (context lost mid-game, with a card open), ctxlobby (context lost
#   while the picker / lobby covers the board, then a game starts), lite (מצב קל chosen by the player).
# Offline: --no-proxy-server + *.supabase.co unresolvable + the tests/fakebackend.py guard (assert_clean at the end).
# Screenshots: JPEG q80 into --shots (default docs/3d-upgrade/shots/fallback), desktop 1300×820 and, with --phones, 390×844 @2x.
import asyncio, json, os, re, sys, time
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); import fakebackend as FB
MODE = FB.mode_from_argv()
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
BASE = OPT.get('base', 'http://localhost:8770/index.html')
ONLY = OPT['only'].split(',') if 'only' in OPT else None
SHOTS = OPT.get('shots', os.path.join(HERE, '..', 'docs', '3d-upgrade', 'shots', 'fallback'))
OUT = OPT.get('out', '/tmp/tb/fallback_probe.json')
GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
NOGL = ['--disable-gpu', '--disable-webgl', '--disable-3d-apis', '--autoplay-policy=no-user-gesture-required']
WEBGL1_ONLY = "(()=>{const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(String(t)==='webgl2')return null;return g.call(this,t,...a)}})()"
VIEW = {'desk': dict(viewport={'width': 1300, 'height': 820}, device_scale_factor=1),
        'phone': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)}
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)

# every toast: main line, technical line, action label (bidi isolates removed)
PROBE = r"""(() => {
  window.__toasts = [];
  const clean = (s) => String(s || '').replace(/[⁦-⁩⁠]/g, '').trim();
  const hook = () => {
    const t = document.getElementById('toast'); if (!t) { setTimeout(hook, 50); return; }
    new MutationObserver(() => {
      if (!t.className.includes('on')) return;
      const m = t.querySelector('.tmain'), s = t.querySelector('.tsub'), b = t.querySelector('.tbtn');
      const main = clean(m ? m.textContent : (t.firstChild && t.firstChild.nodeType === 3 ? t.firstChild.textContent : t.textContent));
      const last = window.__toasts[window.__toasts.length - 1];
      if (main && (!last || last.main !== main)) window.__toasts.push({ main, sub: clean(s && s.textContent), act: clean(b && b.textContent), at: Date.now() });
    }).observe(t, { childList: true, characterData: true, subtree: true, attributes: true });
  };
  hook();
})();"""
STATE = """() => ({ renderer: document.body.dataset.renderer || '', roll: !document.querySelector('#roll').disabled,
  card: !document.querySelector('#evm').hidden, start: !document.querySelector('#start').hidden, gm: !document.querySelector('#gm').hidden,
  coach: !document.querySelector('#coach').hidden, rec: !document.querySelector('#recover').hidden })"""
LOSE = "() => { const c = document.querySelector('#c'); const gl = c.getContext('webgl2') || c.getContext('webgl'); window.__lose = gl && gl.getExtension('WEBGL_lose_context'); if (window.__lose) window.__lose.loseContext(); return !!window.__lose; }"

async def hold(route): pass            # never answered
async def abort(route): await route.abort()

async def picker_start(pg):
    await pg.wait_for_selector('.fbworld', timeout=180000)
    await pg.click('.fbworld[data-w=w1]'); await pg.wait_for_timeout(250)
    await pg.locator('.prof').first.click(); await pg.click('#fbGo')

async def playable(pg, timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = await pg.evaluate(STATE)
        if s['rec']: return s
        if s['coach']:
            try: await pg.click('#coach [data-c="next"]', timeout=3000)
            except Exception: pass
        elif s['gm']:
            try: await pg.click('#gm .acts button.primary', timeout=3000)
            except Exception: pass
        elif not s['start'] and (s['roll'] or s['card']): return s
        await pg.wait_for_timeout(300)
    raise RuntimeError('not playable: ' + json.dumps(await pg.evaluate(STATE)))

async def game_ready(pg, timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if await pg.evaluate("async () => { try { return (await import('/js/game.js')).gameReady(); } catch (e) { return false; } }"): return True
        await pg.wait_for_timeout(500)
    return False

async def wait_toast(pg, pred, timeout=40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        for t in await pg.evaluate('() => window.__toasts'):
            if pred(t): return t
        await pg.wait_for_timeout(250)
    return None

async def open_card(pg, turns=8):
    """roll until an event card is open (the R3 bar must not cover its buttons)"""
    for _ in range(turns):
        s = await pg.evaluate(STATE)
        if s['card']: return True
        if s['roll']:
            await pg.click('#roll')
        await pg.wait_for_timeout(600)
        t0 = time.time()
        while time.time() - t0 < 90:
            s = await pg.evaluate(STATE)
            if s['card'] or s['roll']: break
            if s['gm']:
                try: await pg.click('#gm .acts button.primary', timeout=3000)
                except Exception: pass
            await pg.wait_for_timeout(300)
        if s['card']: return True
    return False

NOTICE_RE = re.compile(r'תלת־ממד|מצב קל|הציורים|להציג את הלוח')
async def run(p, cause, view):
    args = NOGL if cause == 'nogl' else GL
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, args))
    ctx = await b.new_context(**VIEW[view], **FB.new_context_kwargs())
    sink = await FB.install(ctx, None)
    await ctx.add_init_script(PROBE)
    await ctx.add_init_script("try{localStorage.setItem('rr2-onboarded','1')}catch(e){}")
    if cause == 'webgl1': await ctx.add_init_script(WEBGL1_ONLY)
    if cause == 'lite': await ctx.add_init_script("try{localStorage.setItem('rr2-settings',JSON.stringify({lite:true}))}catch(e){}")
    reqs, errs = [], []
    pg = await ctx.new_page(); pg.set_default_timeout(120000)
    pg.on('request', lambda r: reqs.append(r.url))
    pg.on('pageerror', lambda e: errs.append(str(e)))
    if cause == 'threefail': await pg.route('**/three/build/**', abort)
    if cause == 'threeslow': await pg.route('**/three/build/**', hold)
    if cause == 'glbfail': await pg.route('**/*.glb', abort)
    rec = {'cause': cause, 'view': view}
    t0 = time.time()
    await pg.goto(BASE)
    if cause == 'ctxlobby':
        rec['readyBehindPicker'] = await game_ready(pg)
        rec['pickerUp'] = (await pg.evaluate(STATE))['start']
        rec['lost'] = await pg.evaluate(LOSE)
        await pg.wait_for_timeout(3800)          # > CONTEXT_RESTORE_WAIT_MS
    await picker_start(pg)
    s = await playable(pg)
    rec['secondsToPlayable'] = round(time.time() - t0, 1)
    if cause == 'ctxgame':
        rec['cardOpen'] = await open_card(pg)
        rec['lost'] = await pg.evaluate(LOSE)
        await pg.wait_for_selector('#recover:not([hidden])', timeout=15000)
        await pg.wait_for_timeout(400)
        rec['recover'] = await pg.evaluate("() => ({ title: document.querySelector('#recoverT')?.textContent, body: document.querySelector('#recoverD')?.textContent, tech: document.querySelector('#recover .rtech')?.textContent || '', acts: [...document.querySelectorAll('#recover button')].map((b) => b.textContent) })")
        rec['recoverCoversCardButtons'] = await pg.evaluate("""() => { const r = document.querySelector('#recover').getBoundingClientRect();
          const hit = (b) => { const q = b.getBoundingClientRect(); return q.height > 0 && !(q.right <= r.left || q.left >= r.right || q.bottom <= r.top || q.top >= r.bottom); };
          const all = [...document.querySelectorAll('#evm:not([hidden]) #evCard button')].filter((b) => b.offsetParent);
          const decide = all.filter((b) => b.closest('.acts, .opt, .choice') || b.matches('.choice, .insp, [data-o]'));   // the decision / action buttons
          return { buttons: all.length, decisionButtons: decide.length, coveredDecision: decide.filter(hit).map((b) => b.textContent.trim().slice(0, 30)),
                   coveredOther: all.filter((b) => !decide.includes(b) && hit(b)).map((b) => b.textContent.trim().slice(0, 30)),
                   bar: [Math.round(r.top), Math.round(r.bottom)], card: (() => { const c = document.querySelector('#evCard').getBoundingClientRect(); return [Math.round(c.top), Math.round(c.bottom)]; })() }; }""")
        notice = None
    elif cause == 'lite':
        await pg.wait_for_timeout(8000)
        notice = None
    else:
        notice = await wait_toast(pg, lambda t: bool(NOTICE_RE.search(t['main'])), timeout=60)
    s = await pg.evaluate(STATE)
    rec['renderer'] = s['renderer']
    rec['notice'] = notice
    rec['allToasts'] = [t['main'] for t in await pg.evaluate('() => window.__toasts')][:8]
    rec['gl'] = await pg.evaluate("async () => { try { const m = await import('/js/render/select.js'); return m.glInfo ? m.glInfo() : { old: m.webglAvailable() }; } catch (e) { return String(e); } }")
    rec['threeRequested'] = any('/three/' in u for u in reqs)
    rec['glbRequested'] = sum(1 for u in reqs if u.endswith('.glb'))
    rec['external'] = sorted({FB._host(u) for u in reqs if FB._host(u) not in ('localhost', '127.0.0.1', '')})
    rec['pageErrors'] = errs[:5]
    os.makedirs(SHOTS, exist_ok=True)
    if notice: await pg.wait_for_timeout(450)       # the toast's fade-in (≤ 250 ms) has finished
    path = os.path.join(SHOTS, f'{cause}_{view}.jpg')
    await pg.screenshot(path=path, type='jpeg', quality=80)
    rec['shot'] = os.path.relpath(path, os.path.join(HERE, '..'))
    FB.assert_clean(sink); rec['guard'] = 'clean'
    await b.close()
    return rec

CAUSES = ['nogl', 'webgl1', 'threefail', 'threeslow', 'glbfail', 'ctxgame', 'ctxlobby', 'lite']
async def main():
    FB.banner(MODE)
    out = []
    views = ['desk', 'phone'] if 'phones' in OPT else ['desk']
    async with async_playwright() as p:
        for cause in CAUSES:
            if ONLY and cause not in ONLY: continue
            for view in views:
                log('=====', cause, view, 'load', os.getloadavg()[0])
                try: r = await run(p, cause, view)
                except Exception as e: r = {'cause': cause, 'view': view, 'error': f'{type(e).__name__}: {str(e)[:300]}'}
                log(json.dumps(r, ensure_ascii=False))
                out.append(r)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
    bad = [r for r in out if r.get('error') or r.get('pageErrors')]
    print(f'\n{len(out) - len(bad)}/{len(out)} runs completed without errors → {OUT}')
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    asyncio.run(main())
