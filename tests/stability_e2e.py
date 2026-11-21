# T1 "stability, 3D fallback & saves" end-to-end scenarios (spec docs/next-level/specs/T1-stability-saves.md §6.2).
# Usage: bash tests/serve_copies.sh && python3 tests/stability_e2e.py [--only=S1,S7] [--slow] [--base=http://localhost:8772/index.html]
# S3 and S12 run only with --slow. Exit code ≠ 0 if any assert fails or an unexpected page/console error was seen.
# Every page routes *.supabase.co to a local 503 (no production backend) and Google Fonts to empty local answers.
import asyncio, json, re, sys, time, traceback
from playwright.async_api import async_playwright

import os
# --base= wins, then $STAB_BASE, then $PORT_BASE (serve_copies.sh: the real copy is PORT_BASE+2), else the shared 8772
BASE = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--base=')), None) or os.environ.get('STAB_BASE') or \
    f"http://localhost:{int(os.environ.get('PORT_BASE', '8770')) + 2}/index.html"
ONLY = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--only=')), None)
SLOW = '--slow' in sys.argv
SHOTS = '/tmp/rrshots'
GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
NOGL = ['--disable-gpu', '--disable-webgl', '--disable-3d-apis', '--autoplay-policy=no-user-gesture-required']
CHROME = '/usr/bin/google-chrome'
SAVE_KEY = 'rr2-save-free-w1'
RESULTS = []      # (scenario, check, ok, detail)
ERRS = []         # unexpected page / console errors, per scenario

def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)

S = {  # exact Hebrew strings from the spec
    'N1': 'הדפדפן הזה לא תומך בתלת־ממד, אז פתחנו את המשחק במצב קל. המשחק עצמו זהה.',
    'N2': 'לא הצלחנו לטעון את התלת־ממד, אז עברנו למצב קל. המשחק עצמו זהה.',
    'N4': 'מצב קל פועל: לוח שטוח ומהיר, אותו משחק בדיוק.',
    'N5': 'לא הצלחנו להציג את הלוח, אבל אפשר להמשיך לשחק: הקוביות, הכרטיסים והדוח עובדים כרגיל.',
    'N6': 'חלק מהציורים לא נטענו, ובמקומם מופיעים סימנים פשוטים. זה לא משפיע על המשחק.',
    'L6': 'התלת־ממד מתעכב, עוברים למצב קל…',
    'R1t': 'משהו נתקע באמצע התור', 'R1b': 'ההתקדמות שלך שמורה, ואפשר להמשיך בדיוק מאותה נקודה.',
    'R2b': 'זה קורה שוב. אפשר לנסות במצב קל, או לחזור ללובי.',
    'R2b2d': 'זה קורה שוב. אפשר להמשיך מהשמירה, או לחזור ללובי.',
    'R3t': 'התצוגה התלת־ממדית נעצרה',
    'R4': 'משהו השתבש. אפשר לחזור ללובי ולהמשיך מהשמירה.',
    'S1t': 'המשחק הזה נשמר בגרסה חדשה יותר',
    'S2': 'עדכנו את המשחק השמור לגרסה החדשה. עותק של המקור נשמר במכשיר.',
    'S4': 'משחק שמור אחד נפגם ולא ניתן לטעינה. שמרנו עותק שלו במכשיר.',
    'S5': 'לא הצלחנו לטעון את ההתקדמות שלך באתגר. המשחק לא התחיל מחדש. נסה שוב בעוד רגע.',
    'S7': 'אין מקום במכשיר לשמור את המשחק. אפשר להמשיך לשחק, אבל אם תסגור את הדף ההתקדמות תאבד. כדאי לפנות מקום בדפדפן או לצאת מגלישה בסתר.',
    'S8': 'נתוני ההתקדמות במכשיר נפגמו. שמרנו עותק שלהם. אם יש לך כינוי, הכוכבים וההישגים יחזרו מהשרת.',
    'S10': 'תוצאה של אתגר שעוד לא נשלחה לשרת נפגמה. שמרנו עותק שלה במכשיר.',
    'L7': 'הטעינה לוקחת יותר מהרגיל. אם זה נתקע, נסה לרענן את הדף.',
    'old_loading': 'המשחק עוד נטען',
}

def check(sc, name, cond, detail=''):
    RESULTS.append((sc, name, bool(cond), detail))
    log(('  PASS ' if cond else '  FAIL ') + f'[{sc}] {name}' + (f' — {detail}' if detail and not cond else ''))
    return bool(cond)

# in-page probes, installed before any page script: loading samples every 100 ms + every toast text
PROBE = r"""(() => {
  window.__ld = []; window.__toasts = [];
  const tick = () => {
    const l = document.getElementById('loading'); const b = document.getElementById('loadBar');
    if (l) window.__ld.push({ t: Date.now(), vis: !l.hidden, text: l.innerText || '', w: b ? (parseFloat(b.style.width) || 0) : 0 });
    if (window.__ld.length > 6000) window.__ld.splice(0, 1000);
  };
  setInterval(tick, 100);
  const hook = () => {
    const t = document.getElementById('toast'); if (!t) { setTimeout(hook, 50); return; }
    new MutationObserver(() => { const s = (t.firstChild && t.firstChild.nodeType === 3 ? t.firstChild.textContent : t.textContent) || '';
      if (t.className.includes('on') && s && window.__toasts[window.__toasts.length - 1] !== s) window.__toasts.push(s); })
      .observe(t, { childList: true, characterData: true, subtree: true, attributes: true });
  };
  hook();
})();"""

STATE_JS = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden,
  start: !document.querySelector('#start').hidden, coach: !document.querySelector('#coach').hidden, gm: !document.querySelector('#gm').hidden,
  rec: !document.querySelector('#recover').hidden, month: document.querySelector('#hMonth').textContent, cash: document.querySelector('#hCash').textContent,
  renderer: document.body.dataset.renderer || '' })"""

class Ctx:
    """one scenario page: routes, probes, request log, error capture"""
    def __init__(self, sc): self.sc = sc; self.reqs = []; self.supa = 0; self.supa_unrouted = 0; self.pageerrors = []; self.console = []

async def open_page(b, sc, *, vp=None, mobile=False, dpr=1, block_lobby=True, init=None, routes=None, onboarded=True):
    c = Ctx(sc)
    ctx = await b.new_context(viewport=vp or {'width': 1300, 'height': 820}, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile)
    await ctx.add_init_script(PROBE)
    if onboarded: await ctx.add_init_script("try{localStorage.setItem('rr2-onboarded','1')}catch(e){}")
    for s in (init or []): await ctx.add_init_script(s)
    pg = await ctx.new_page(); pg.set_default_timeout(90000)
    async def supa(route):
        c.supa += 1; await route.fulfill(status=503, content_type='application/json', body='{}')
    await pg.route(re.compile(r'https?://[^/]*\.supabase\.co/.*'), supa)
    await pg.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=''))
    await pg.route('**/fonts.gstatic.com/**', lambda r: r.fulfill(status=404, body=''))
    if block_lobby: await pg.route('**/js/lobby.js', lambda r: r.fulfill(status=404, body=''))
    for pat, fn in (routes or []): await pg.route(pat, fn)
    def on_req(r):
        c.reqs.append(r.url)
        if '.supabase.co' in r.url: c.supa_unrouted += 0  # counted by the route handler; unrouted ones show up as responses below
    pg.on('request', on_req)
    def on_resp(r):
        if '.supabase.co' in r.url and r.status != 503: c.supa_unrouted += 1
    pg.on('response', on_resp)
    def con(m):
        if m.type != 'error': return
        url = (m.location or {}).get('url', '')
        c.console.append(f'{m.text} @ {url}')
        if 'Failed to load resource' in m.text: return                   # intentionally routed URLs (404/503/abort)
        if block_lobby and ('lobby' in url or 'progress.js' in url or 'lobby.js' in m.text): return
        if 'supabase' in m.text or 'supabase' in url: return
        ERRS.append(f'{sc} console: {m.text} @ {url}'); log('CONSOLE-ERR', sc, m.text, url)
    pg.on('console', con)
    pg.on('pageerror', lambda e: (c.pageerrors.append(str(e)), log('PAGEERR', sc, e)))
    return ctx, pg, c

async def st(pg): return await pg.evaluate(STATE_JS)
async def save(pg, key=SAVE_KEY): return await pg.evaluate("(k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return 'CORRUPT'; } }", key)
async def raw(pg, key): return await pg.evaluate("(k) => localStorage.getItem(k)", key)
async def toasts(pg): return await pg.evaluate("() => window.__toasts.slice()")
async def saw_toast(pg, text, timeout=15):
    """toasts are queued (6 s each for the renderer notices): poll until `text` has been shown"""
    t0 = time.time()
    while time.time() - t0 < timeout:
        if text in await toasts(pg): return True
        await pg.wait_for_timeout(300)
    return False
async def samples(pg): return await pg.evaluate("() => window.__ld.slice()")

async def wait_playable(pg, timeout=150):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = await st(pg)
        if s['rec']: return s
        if s['coach']:
            try: await pg.click('#coach [data-c="next"]', timeout=3000)
            except Exception: pass
            await pg.wait_for_timeout(250); continue
        if s['gm']:
            try: await pg.click('#gm .acts button.primary', timeout=3000)
            except Exception: pass
            await pg.wait_for_timeout(300); continue
        if not s['start'] and (s['roll'] or s['card']): return s
        await pg.wait_for_timeout(250)
    raise Exception('not playable: ' + json.dumps(await st(pg), ensure_ascii=False))

async def answer_card(pg):
    card = pg.locator('#evCard')
    done = card.locator('button[data-o="done"]:not([disabled])')
    if await done.count(): await done.first.click(); return
    btns = card.locator('button[data-o]:not([disabled])')
    if await btns.count() == 0: raise Exception('card without enabled options')
    await btns.first.click()

async def play_turns(pg, k, sc, label='turn'):
    """k full turns: roll → hops → every card resolved. Returns the number of completed rolls."""
    done = 0
    for i in range(k):
        s = await wait_playable(pg)
        guard = 0
        while s['card'] and not s['rec']:
            await answer_card(pg); await pg.wait_for_timeout(300); s = await wait_playable(pg); guard += 1
            if guard > 15: raise Exception('card loop')
        if s['rec']: raise Exception('recover bar during play')
        if s['start']: log(sc, 'game ended'); return done
        await pg.click('#roll')
        await pg.wait_for_function("() => document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=20000)
        s = await wait_playable(pg)
        while s['card'] and not s['rec']:
            await answer_card(pg); await pg.wait_for_timeout(300); s = await wait_playable(pg)
        done += 1
        log(sc, f'{label} {i + 1}: month {s["month"]} cash {s["cash"]}')
    return done

async def picker_start_w1(pg, cont=False):
    await pg.wait_for_selector('.fbworld', timeout=150000)
    if cont:
        await pg.click('#fbCont'); return
    await pg.click('.fbworld[data-w=w1]'); await pg.wait_for_timeout(250)
    await pg.locator('.prof').first.click()
    await pg.click('#fbGo')

def no_percent_and_monotonic(sc, smp, hold=None):
    vis = [x for x in smp if x['vis']]
    check(sc, 'A-12 no % in #loading', not any('%' in x['text'] for x in vis), next((x['text'] for x in vis if '%' in x['text']), ''))
    bad = None; prev = None
    for x in smp:
        if not x['vis']: prev = None; continue
        if prev is not None and x['w'] < prev - 0.01 and x['w'] != 0: bad = (prev, x['w']); break
        prev = x['w'] if x['w'] else prev
    check(sc, 'A-12 #loadBar width never decreases within a start', bad is None, str(bad))

def errors_ok(sc, c, expected_pageerrors=0):
    check(sc, f'page errors = {expected_pageerrors}', len(c.pageerrors) == expected_pageerrors, json.dumps(c.pageerrors, ensure_ascii=False)[:400])
    check(sc, 'no unrouted supabase request', c.supa_unrouted == 0, str(c.supa_unrouted))

async def shot(pg, name): await pg.screenshot(path=f'{SHOTS}/t1_{name}.png'); log('  shot', f'{SHOTS}/t1_{name}.png')


def glb_reqs(c, start=0, name=None): return [u for u in c.reqs[start:] if u.endswith('.glb') and (name is None or name in u)]
async def wait_ready(pg, timeout=150):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if await pg.evaluate("async () => { try { return (await import('/js/game.js')).gameReady(); } catch (e) { return false; } }"): return True
        await pg.wait_for_timeout(500)
    return False
async def launch(p, args): return await p.chromium.launch(executable_path=CHROME, args=args)
NO_GL_INIT = "(()=>{const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(/^(webgl|experimental-webgl)/.test(String(t)))return null;return g.call(this,t,...a)}})()"
async def hold(route): pass  # never fulfilled: the request hangs
async def abort(route): await route.abort()
async def inject_stuck(pg):
    """S7 injection: #dieSr removed → ui.landDice throws after E.rollDice mutated the state"""
    await pg.evaluate("() => document.getElementById('dieSr')?.remove()")
    await pg.click('#roll')
async def readd_diesr(pg):
    await pg.evaluate("() => { if (!document.getElementById('dieSr')) { const p = document.createElement('p'); p.id = 'dieSr'; p.className = 'sr'; p.setAttribute('aria-live', 'polite'); document.querySelector('#bar .ctrls').insertBefore(p, document.getElementById('roll')); } }")
async def to_roll(pg):
    """resolve open cards until the roll button is enabled"""
    s = await wait_playable(pg)
    while s['card'] and not s['rec']:
        await answer_card(pg); await pg.wait_for_timeout(300); s = await wait_playable(pg)
    return s
async def click_text(pg, sel, text): await pg.locator(sel, has_text=text).first.click()

# ------------------------------------------------------------------ S0: main.js blocked → boot watchdog (A-14)
async def s0(p):
    sc = 'S0'; b = await launch(p, NOGL)
    ctx, pg, c = await open_page(b, sc, routes=[('**/js/main.js', lambda r: r.fulfill(status=404, body=''))])
    await pg.goto(BASE)
    await pg.wait_for_timeout(21500)
    txt = await pg.evaluate("() => (document.getElementById('bootSlow') || {}).innerText || ''")
    check(sc, 'A-14 S-L7 shown after BOOT_SLOW_MS', S['L7'] in txt, txt)
    check(sc, 'A-14 reload button', await pg.locator('#bootSlow button', has_text='רענון הדף').count() == 1)
    await shot(pg, 'boot_slow')
    await b.close()

# ------------------------------------------------------------------ S1: no WebGL → 2D board
async def s1(p):
    sc = 'S1'; b = await launch(p, NOGL)
    ctx, pg, c = await open_page(b, sc, init=[NO_GL_INIT])
    c.allcon = []; pg.on('console', lambda m: c.allcon.append(m.text))
    await pg.goto(BASE)
    await pg.wait_for_selector('.fbworld', timeout=150000)
    t_open = int(time.time() * 1000)
    await pg.wait_for_timeout(3000)
    smp = await samples(pg)
    after = [x for x in smp if x['t'] >= t_open]
    check(sc, 'A-13 #loading hidden while the picker is open', after and not any(x['vis'] for x in after), str(sum(1 for x in after if x['vis'])))
    check(sc, 'A-13 no error text at boot', not any('נכשל' in x['text'] or 'Error' in x['text'] for x in smp if x['vis']))
    await picker_start_w1(pg)
    s = await wait_playable(pg)
    check(sc, 'A-1 body[data-renderer=2d]', s['renderer'] == '2d', s['renderer'])
    check(sc, 'A-1 #board2d visible', await pg.is_visible('#board2d'))
    nt = await pg.locator('#board2d .b2d-tile').count(); check(sc, 'A-1 40 tiles', nt == 40, str(nt))
    pos0 = await pg.evaluate("""() => { const t = [...document.querySelectorAll('#board2d .b2d-tile')].map(e => [ +e.dataset.i, e.getBoundingClientRect() ]);
      const r0 = t.find(x => x[0] === 0)[1]; return t.every(([i, r]) => r.right <= r0.right + 1 && r.bottom <= r0.bottom + 1); }""")
    check(sc, 'tile 0 sits bottom-right (not mirrored by RTL)', pos0)
    await pg.wait_for_timeout(600)
    await shot(pg, 'nowebgl_2d_board')
    t0 = (await save(pg))['state']['turn']
    n = await play_turns(pg, 3, sc)
    sv = await save(pg)
    check(sc, 'A-1 3 full turns played', n == 3 and sv['state']['turn'] >= t0 + 3, f'{n} turns, turn {t0}→{sv["state"]["turn"]}')
    check(sc, 'A-1 S-N1 toast', await saw_toast(pg, S['N1']), json.dumps(await toasts(pg), ensure_ascii=False)[:300])
    rep = await pg.evaluate("""async () => { const E = await import('/js/engine.js'); const st = JSON.parse(localStorage.getItem('rr2-save-free-w1')).state;
      const r = E.replay(E.replayConfig(st), st.actions); return { a: [r.cash, r.month, r.pos, r.turn], b: [st.cash, st.month, st.pos, st.turn], n: st.actions.length }; }""")
    check(sc, 'A-9 replay of the 2D action log = saved state', rep['a'] == rep['b'], json.dumps(rep))
    bad = [u for u in c.reqs if '/three/' in u or u.endswith('.glb')]
    check(sc, 'A-2 no three / .glb request', not bad, str(bad[:3]))
    check(sc, 'A-2 no "Error creating WebGL context"', not any('Error creating WebGL context' in t for t in c.allcon))
    no_percent_and_monotonic(sc, await samples(pg))
    errors_ok(sc, c)
    await b.close()

# ------------------------------------------------------------------ S2: three CDN blocked, real lobby
async def s2(p):
    sc = 'S2'; b = await launch(p, GL)
    ctx, pg, c = await open_page(b, sc, block_lobby=False, routes=[('**/three/**', abort), ('**/cdn.jsdelivr.net/**', abort)])
    await pg.goto(BASE)
    await pg.wait_for_selector('.lb-home', timeout=150000)
    check(sc, 'A-3 lobby renders', await pg.locator('.map-card[data-id="w1"]').count() == 1)
    await pg.click('.map-card[data-id="w1"]'); await pg.wait_for_selector('.wv-char', timeout=30000); await pg.wait_for_timeout(500)
    await pg.locator('.wv-char').first.click()
    await pg.wait_for_selector('#start', state='hidden', timeout=60000)
    s = await wait_playable(pg)
    check(sc, 'A-3 2D board', s['renderer'] == '2d', s['renderer'])
    await play_turns(pg, 3, sc)
    tl = await toasts(pg)
    check(sc, 'A-3 S-N2 toast', S['N2'] in tl, json.dumps(tl, ensure_ascii=False)[:300])
    check(sc, 'A-3 no "המשחק עוד נטען…" toast', not any(S['old_loading'] in t for t in tl))
    no_percent_and_monotonic(sc, await samples(pg))
    errors_ok(sc, c)
    await b.close()

# ------------------------------------------------------------------ S3: three hangs (slow)
async def s3(p):
    sc = 'S3'; b = await launch(p, GL)
    ctx, pg, c = await open_page(b, sc, routes=[('**/three/build/**', hold)])
    await pg.goto(BASE)
    await picker_start_w1(pg); t0 = time.time()
    s = await wait_playable(pg, timeout=120)
    dt = time.time() - t0
    check(sc, 'A-4 playable in 2D within RENDERER_TIMEOUT_MS + 10 s', s['renderer'] == '2d' and dt <= 30, f'{s["renderer"]} after {dt:.1f}s')
    smp = await samples(pg)
    check(sc, 'A-4 S-L6 shown', any(S['L6'] in x['text'] for x in smp if x['vis']))
    no_percent_and_monotonic(sc, smp)
    await play_turns(pg, 1, sc)
    errors_ok(sc, c)
    await b.close()

# ------------------------------------------------------------------ S4: GLB 404 / hang
async def s4(p):
    sc = 'S4'; b = await launch(p, GL)
    async def late404(route): await asyncio.sleep(1.5); await route.fulfill(status=404, body='')
    ctx, pg, c = await open_page(b, sc, routes=[('**/assets/w1/apartment.glb', late404), ('**/assets/pawns/classic.glb', lambda r: r.fulfill(status=404, body=''))])
    await pg.goto(BASE)
    await pg.wait_for_selector('.fbworld', timeout=150000)
    check(sc, 'init finished behind the picker', await wait_ready(pg))
    n_apt0 = len(glb_reqs(c, 0, 'apartment')); i0 = len(c.reqs)
    await picker_start_w1(pg)
    s = await wait_playable(pg)
    stage_reqs = glb_reqs(c, i0)
    check(sc, 'A-5 3D game despite 404s', s['renderer'] == '3d', s['renderer'])
    smp = await samples(pg)
    cnt = [m for x in smp if x['vis'] for m in re.findall(r'(\d+) מתוך (\d+) דגמים', x['text'])]
    Ns = sorted({int(N) for _, N in cnt})
    check(sc, 'A-11 models step shows "n מתוך N דגמים"', bool(cnt), '')
    check(sc, 'A-11 N = GLB requests in that stage', Ns == [len(stage_reqs)], f'N={Ns} requests={stage_reqs}')
    check(sc, 'A-11 stage list shown', any('מסדרים את הלוח' in x['text'] for x in smp if x['vis']))
    n = await play_turns(pg, 3, sc)
    check(sc, 'A-5 3 turns', n == 3)
    tl = await toasts(pg); check(sc, 'A-5 S-N6 toast', S['N6'] in tl, json.dumps(tl, ensure_ascii=False)[:300])
    # A-6: the next start of the same world requests the failed GLB again
    n_apt1 = len(glb_reqs(c, 0, 'apartment'))
    await pg.click('#homeBtn'); await pg.wait_for_selector('#fbCont', timeout=30000)
    await pg.click('#fbCont'); await wait_playable(pg)
    n_apt2 = len(glb_reqs(c, 0, 'apartment'))
    check(sc, 'A-6 failed GLB requested again at the next start', n_apt2 > n_apt1 > n_apt0 >= 1, f'{n_apt0}/{n_apt1}/{n_apt2}')
    no_percent_and_monotonic(sc, await samples(pg))
    errors_ok(sc, c)
    await shot(pg, 'glb404_3d')
    await ctx.close()
    # variant: business.glb hangs; start while the init is still running
    ctx, pg, c = await open_page(b, sc + 'b', routes=[('**/assets/w1/business.glb', hold)])
    await pg.goto(BASE)
    await picker_start_w1(pg); t0 = time.time()
    s = await wait_playable(pg, timeout=150)
    dt = time.time() - t0
    check(sc, 'A-5 starts within GLB_TIMEOUT_MS + 10 s with a hanging GLB', dt <= 25, f'{dt:.1f}s ({s["renderer"]})')
    smp = await samples(pg)
    best = 0; run_start = None; prev = None
    for x in smp:
        if not x['vis']: run_start = None; prev = None; continue
        if prev is None or x['w'] != prev: run_start = x['t']; prev = x['w']
        best = max(best, x['t'] - run_start)
    check(sc, 'A-12 bar does not move while a GLB is held (≥ 2 s flat stretch)', best >= 2000, f'{best} ms')
    no_percent_and_monotonic(sc + 'b', smp)
    errors_ok(sc + 'b', c)
    await b.close()

# ------------------------------------------------------------------ S5: corrupt data (+ A-27 ranked corrupt checkpoint)
SEED_S5 = """(() => { if (sessionStorage.getItem('t1seed')) return; sessionStorage.setItem('t1seed', '1');
  localStorage.setItem('rr2-save-free-w1', %s); localStorage.setItem('rr2-progress', '{bad'); localStorage.setItem('rr2-pending-finish', %s); })()"""
async def s5(p):
    sc = 'S5'; b = await launch(p, NOGL)
    slot = '{"v":2,"cfg":{"worldId":"w1"'; pend = '[{"resultId":"r1","status":"won"},5,"x"]'
    ctx, pg, c = await open_page(b, sc, init=[NO_GL_INIT, SEED_S5 % (json.dumps(slot), json.dumps(pend))])
    await pg.goto(BASE)
    await pg.wait_for_selector('.fbworld', timeout=150000); await pg.wait_for_timeout(1500)
    check(sc, 'A-22 no continue for w1', await pg.locator('#fbCont').count() == 0)
    bak = json.loads(await raw(pg, 'rr2-bak:rr2-save-free-w1') or 'null')
    check(sc, 'A-22 backup raw byte-identical, reason corrupt', bak and bak['items'][0]['raw'] == slot and bak['items'][0]['reason'] == 'corrupt', str(bak)[:200])
    q = json.loads(await raw(pg, 'rr2-quarantine:rr2-progress') or 'null')
    check(sc, 'A-23 rr2-progress quarantined byte-identical', q and q.get('raw') == '{bad')
    check(sc, 'A-23 pending keeps exactly r1', json.loads(await raw(pg, 'rr2-pending-finish') or 'null') == [{'resultId': 'r1', 'status': 'won'}])
    qp = json.loads(await raw(pg, 'rr2-quarantine:rr2-pending-finish') or 'null')
    check(sc, 'A-23 quarantined pending items = [5,"x"]', qp and qp.get('items') == [5, 'x'], str(qp))
    await pg.wait_for_timeout(9000)  # the toast queue (4 messages)
    tl = await toasts(pg)
    check(sc, 'A-22 S-S4 shown once', tl.count(S['S4']) == 1, json.dumps(tl, ensure_ascii=False)[:400])
    check(sc, 'A-23 S-S8 shown', S['S8'] in tl); check(sc, 'A-23 S-S10 shown', S['S10'] in tl)
    # A-27: ranked resume with a corrupt server checkpoint and an empty local slot → false, nothing created, S-S5
    r = await pg.evaluate("""async () => { const E = await import('/js/engine.js'); const g = await import('/js/game.js');
      const ok = await g.startGame({ resultId: 'rT1', mode: 'daily', worldId: 'w1', seed: 5, state: { v: E.SAVE_VERSION, junk: 1 } });
      return { ok, active: g.hasActiveGame(), key: localStorage.getItem('rr2-save-rT1') }; }""")
    check(sc, 'A-27 startGame → false, no game created, no save', r['ok'] is False and not r['active'] and r['key'] is None, json.dumps(r))
    await pg.wait_for_timeout(800)
    check(sc, 'A-27 S-S5 toast', await saw_toast(pg, S['S5']))
    await picker_start_w1(pg)
    s = await wait_playable(pg)
    check(sc, 'A-22 a new w1 game starts', not s['start'] and (await save(pg))['state']['month'] == 1)
    errors_ok(sc, c)
    await ctx.close()
    ctx, pg, c = await open_page(b, sc + 'b', init=[NO_GL_INIT, SEED_S5 % (json.dumps('{"v":3,"cfg":{},"state":{"v":3}}'), json.dumps('[{bad'))])
    await pg.goto(BASE)
    await pg.wait_for_selector('.fbworld', timeout=150000); await pg.wait_for_timeout(4000)
    qp = json.loads(await raw(pg, 'rr2-quarantine:rr2-pending-finish') or 'null')
    check(sc, 'A-23b whole pending raw quarantined byte-identical', qp and qp.get('raw') == '[{bad', str(qp))
    check(sc, 'A-23b S-S10 shown', await saw_toast(pg, S['S10']))
    errors_ok(sc + 'b', c)
    await b.close()

# ------------------------------------------------------------------ S6 / S6b: future and old saves
async def fixtures(pg): return await pg.evaluate("async () => (await import('/tests/fixtures/make_saves.mjs')).makeSaves()")
async def s6(p):
    sc = 'S6'; b = await launch(p, NOGL)
    ctx, pg, c = await open_page(b, sc, init=[NO_GL_INIT])
    await pg.goto(BASE); await pg.wait_for_selector('.fbworld', timeout=150000)
    fx = await fixtures(pg)
    await pg.evaluate("(r) => localStorage.setItem('rr2-save-free-w1', r)", fx['future'])
    await pg.reload(); await pg.wait_for_selector('.fbworld', timeout=150000)
    check(sc, 'A-24 continue offered for the future save', await pg.locator('#fbCont').count() == 1)
    await pg.click('#fbCont')
    await pg.wait_for_selector('#gm:not([hidden])', timeout=30000)
    title = await pg.inner_text('#gmCard h2')
    check(sc, 'A-24 S-S1 shown', title == S['S1t'], title)
    await pg.wait_for_timeout(500); await shot(pg, 'future_save_message')
    check(sc, 'A-24 slot byte-identical', await raw(pg, SAVE_KEY) == fx['future'])
    keys = await pg.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('rr2-save-'))")
    check(sc, 'A-24 no new game state written', keys == [SAVE_KEY], str(keys))
    await click_text(pg, '#gm .acts button', 'חזרה ללובי')
    await pg.wait_for_selector('.fbworld', timeout=30000)
    await picker_start_w1(pg)
    await wait_playable(pg)
    bak = json.loads(await raw(pg, 'rr2-bak:rr2-save-free-w1') or 'null')
    check(sc, 'A-25 future raw moved to backup (reason future, identical)', bak and any(i['reason'] == 'future' and i['raw'] == fx['future'] for i in bak['items']), str(bak)[:200])
    sv = await save(pg)
    check(sc, 'A-25 new game in the slot', sv['state']['month'] == 1 and sv['state']['v'] == fx['saveVersion'])
    errors_ok(sc, c)
    await ctx.close()
    sc = 'S6b'
    ctx, pg, c = await open_page(b, sc, init=[NO_GL_INIT])
    await pg.goto(BASE); await pg.wait_for_selector('.fbworld', timeout=150000)
    await pg.evaluate("(r) => localStorage.setItem('rr2-save-free-w1', r)", fx['v1'])
    await pg.reload(); await pg.wait_for_selector('#fbCont', timeout=150000)
    await pg.click('#fbCont')
    s = await wait_playable(pg)
    check(sc, 'A-26 old save continues', not s['start'])
    check(sc, 'A-26 S-S2 toast', await saw_toast(pg, S['S2']), json.dumps(await toasts(pg), ensure_ascii=False)[:300])
    bak = json.loads(await raw(pg, 'rr2-bak:rr2-save-free-w1') or 'null')
    check(sc, 'A-26 backup reason migrate, raw identical', bak and bak['items'][0]['reason'] == 'migrate' and bak['items'][0]['raw'] == fx['v1'], str(bak)[:200])
    check(sc, 'A-26 slot state.v = SAVE_VERSION', (await save(pg))['state']['v'] == fx['saveVersion'])
    errors_ok(sc, c)
    await b.close()

# ------------------------------------------------------------------ S7: exception mid-turn → recover bar
async def energy(pg): return await pg.evaluate("async () => (await import('/js/energy.js')).get()")
async def s7(p):
    sc = 'S7'; b = await launch(p, GL)
    ctx, pg, c = await open_page(b, sc)
    await pg.goto(BASE); await picker_start_w1(pg)
    await to_roll(pg)
    e0 = await energy(pg); sv0 = (await save(pg))['state']
    await inject_stuck(pg)
    # in 3D the injected error fires after the scripted dice throw: time it from the error, not from the click
    dt = await pg.evaluate("""() => new Promise((res) => { const t0 = Date.now(); const f = () => {
      const r = document.getElementById('recover'); const e = (window.__rrErrors || []).slice(-1)[0];
      if (r && !r.hidden && e) return res((Date.now() - e.at) / 1000); if (Date.now() - t0 > 20000) return res(99); requestAnimationFrame(f); }; f(); })""")
    rt = await pg.inner_text('#recover')
    check(sc, 'A-15 S-R1 within STUCK_CHECK_MS + 1 s of the error', S['R1t'] in rt and S['R1b'] in rt and dt <= 2.5, f'{dt:.2f}s')
    await shot(pg, 'recover_bar')
    sv1 = (await save(pg))['state']
    check(sc, 'A-16 save already post-roll (turn+1, phase ≠ roll)', sv1['turn'] == sv0['turn'] + 1 and sv1['phase'] != 'roll', f'{sv0["turn"]}→{sv1["turn"]} {sv1["phase"]}')
    await pg.wait_for_timeout(500)
    check(sc, 'A-15 exactly 1 page error (the injected one)', len(c.pageerrors) == 1, json.dumps(c.pageerrors, ensure_ascii=False)[:300])
    await click_text(pg, '#recover button', 'להמשיך מהשמירה')
    s = await wait_playable(pg)
    check(sc, 'A-15 playable after recovery', not s['rec'] and (s['roll'] or s['card']))
    sv2 = (await save(pg))['state']
    check(sc, 'A-15 same dice (lastRoll unchanged)', sv2.get('lastRoll') == sv1.get('lastRoll'), f'{sv1.get("lastRoll")} vs {sv2.get("lastRoll")}')
    check(sc, 'A-15 turn advanced by exactly 1', sv2['turn'] == sv0['turn'] + 1, f'{sv0["turn"]}→{sv2["turn"]}')
    await to_roll(pg)
    check(sc, 'A-15 ⚡ spent exactly once', await energy(pg) == e0 - 1, f'{e0}→{await energy(pg)}')
    await readd_diesr(pg)
    n = await play_turns(pg, 2, sc); check(sc, 'A-15 2 more turns', n == 2)
    errors_ok_n = len(c.pageerrors)
    check(sc, 'A-15 page errors = 1 after 2 more turns', errors_ok_n == 1, str(errors_ok_n))
    await ctx.close()
    # A-17: three stucks within RECOVER_WINDOW_MS (back to back) → S-R2 with "להמשיך במצב קל" → 2D
    ctx, pg, c = await open_page(b, sc + '-17')
    await pg.goto(BASE); await picker_start_w1(pg)
    t_first = None
    for k in (1, 2, 3):
        await to_roll(pg); await readd_diesr(pg); await inject_stuck(pg)
        await pg.wait_for_selector('#recover:not([hidden])', timeout=90000)
        t_first = t_first or time.time()
        rt = await pg.inner_text('#recover')
        if k < 3:
            check(sc, f'A-17 stuck #{k} → S-R1', S['R1b'] in rt)
            await click_text(pg, '#recover button', 'להמשיך מהשמירה'); await wait_playable(pg)
        else:
            span = time.time() - t_first
            check(sc, 'A-17 3rd stuck within 2 min → S-R2', S['R2b'] in rt and span < 120, f'{span:.0f}s between 1st and 3rd; bar: {rt[:80]}')
            if S['R2b'] in rt:
                await click_text(pg, '#recover button', 'להמשיך במצב קל')
                s = await wait_playable(pg)
                check(sc, 'A-17 resumes in 2D', s['renderer'] == '2d' and not s['rec'], s['renderer'])
    await readd_diesr(pg)
    await play_turns(pg, 1, sc)
    check(sc, 'A-17 page errors = 3 (one per injection)', len(c.pageerrors) == 3, str(len(c.pageerrors)))
    await ctx.close(); await b.close()
    b = await launch(p, NOGL)
    # A-17 in 2D (review B-1): S-R2 without the lite button; its primary button resumes a playable game
    ctx, pg, c = await open_page(b, sc + '-17-2d', init=[NO_GL_INIT])
    await pg.goto(BASE); await picker_start_w1(pg)
    for k in (1, 2, 3):
        await to_roll(pg); await readd_diesr(pg); await inject_stuck(pg)
        await pg.wait_for_selector('#recover:not([hidden])', timeout=30000)
        rt = await pg.inner_text('#recover')
        if k < 3:
            await click_text(pg, '#recover button', 'להמשיך מהשמירה'); await wait_playable(pg); continue
        check(sc, 'A-17 2D: 3rd stuck → S-R2 (2D text, no lite button)', S['R2b2d'] in rt and 'להמשיך במצב קל' not in rt, rt[:160])
        await shot(pg, 'recover_r2_2d')
        await pg.locator('#recover button.primary').first.click()
        s = await wait_playable(pg)
        check(sc, 'A-17 2D: primary button → playable game', not s['rec'] and (s['roll'] or s['card']) and s['renderer'] == '2d', json.dumps(s, ensure_ascii=False))
        check(sc, 'A-17 2D: not stuck afterwards', await pg.evaluate("async () => !(await import('/js/game.js')).isStuck()"))
    await readd_diesr(pg)
    n = await play_turns(pg, 1, sc); check(sc, 'A-17 2D: a turn after recovery', n == 1)
    await ctx.close()
    # A-18: from the stuck state, lobby → "חזרה למשחק" (resume-active only hides #start) recovers without a reload
    ctx, pg, c = await open_page(b, sc + '-18', init=[NO_GL_INIT])
    await pg.goto(BASE); await picker_start_w1(pg); await to_roll(pg)
    await inject_stuck(pg); await pg.wait_for_selector('#recover:not([hidden])', timeout=20000)
    await click_text(pg, '#recover button', 'חזרה ללובי')
    await pg.wait_for_selector('#start:not([hidden])', timeout=10000)
    nav0 = await pg.evaluate("() => performance.getEntriesByType('navigation').length + ':' + performance.timeOrigin")
    await pg.evaluate("() => { document.getElementById('start').hidden = true; }")  # = lobby.js 'resume-active' → closeLobby()
    s = await wait_playable(pg)
    nav1 = await pg.evaluate("() => performance.getEntriesByType('navigation').length + ':' + performance.timeOrigin")
    check(sc, 'A-18 resume-active recovers without a reload', not s['rec'] and (s['roll'] or s['card']) and nav0 == nav1)
    await ctx.close()
    # A-20: ?ff=-recover → S-R4 toast, no #recover
    ctx, pg, c = await open_page(b, sc + '-20', init=[NO_GL_INIT])
    await pg.goto(BASE + '?ff=-recover'); await picker_start_w1(pg); await to_roll(pg)
    await inject_stuck(pg); await pg.wait_for_timeout(6000)
    check(sc, 'A-20 S-R4 toast', await saw_toast(pg, S['R4']), json.dumps(await toasts(pg), ensure_ascii=False)[:300])
    check(sc, 'A-20 no #recover', not (await st(pg))['rec'])
    await ctx.close()
    # A-19: an error from a non-game script while the game is idle does not show #recover
    ctx, pg, c = await open_page(b, sc + '-19', init=[NO_GL_INIT])
    await pg.goto(BASE); await picker_start_w1(pg); await to_roll(pg)
    for _ in range(12):  # the first-visit world coach marks open ~1 s after the start: the stuck rule stays quiet while they show
        await pg.wait_for_timeout(500)
        if await pg.is_visible('#coach .bubble'): await pg.click('#coach [data-c="next"]')
        elif _ >= 5: break
    await to_roll(pg)
    check(sc, 'A-19 setup: no card / modal / coach open', await pg.evaluate("() => document.querySelector('#coach').hidden && document.querySelector('#gm').hidden && document.querySelector('#evm').hidden"))
    await pg.evaluate("() => { document.querySelector('#roll').disabled = true; }")  # idle game with a dead roll button
    await pg.add_script_tag(content="setTimeout(() => { throw new Error('extension-origin test error'); }, 10)\n//# sourceURL=chrome-extension://abcdefgh/content.js")
    await pg.evaluate("() => { const s = document.createElement('script'); s.src = 'data:text/javascript,throw new Error(\"lobby-like\")'; document.body.appendChild(s); }")
    await pg.wait_for_timeout(4500)
    check(sc, 'A-19 foreign-origin errors (roll disabled) → no #recover', not (await st(pg))['rec'])
    # positive control: the same situation with an error from a /js/game.js frame → the recover bar comes
    origin = BASE.split('/index.html')[0]
    await pg.add_script_tag(content=f"setTimeout(() => {{ throw new Error('own-origin test error'); }}, 10)\n//# sourceURL={origin}/js/game.js")
    ok = True
    try: await pg.wait_for_selector('#recover:not([hidden])', timeout=8000)
    except Exception: ok = False
    check(sc, 'A-19 control: the same error from /js/game.js → #recover (so the filter decided)', ok)
    await b.close()

# ------------------------------------------------------------------ S8: low-end מצב קל + the lite switch
async def s8(p):
    sc = 'S8'; b = await launch(p, GL)
    ctx, pg, c = await open_page(b, sc, vp={'width': 360, 'height': 740}, mobile=True, dpr=2)
    cdp = await ctx.new_cdp_session(pg); await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    await pg.goto(BASE + '?ff=board2d:on'); await picker_start_w1(pg); t0 = time.time()
    s = await wait_playable(pg, timeout=180)
    log(sc, f'info: start → first playable {time.time() - t0:.1f}s (4× CPU throttle)')
    check(sc, 'A-7 ?ff=board2d:on → 2D', s['renderer'] == '2d')
    fit = await pg.evaluate("""async () => { const u = await import('/js/ui.js'); const r = u.freeRect(); const b = document.querySelector('#board2d .b2d-board').getBoundingClientRect();
      const ws = [...document.querySelectorAll('#board2d .b2d-tile')].map(e => e.getBoundingClientRect().width);
      return { r, b: [b.left, b.top, b.right, b.bottom], minW: Math.min(...ws), ok: b.left >= r.x0 - 1 && b.top >= r.y0 - 1 && b.right <= r.x1 + 1 && b.bottom <= r.y1 + 1 }; }""")
    check(sc, 'A-10 board inside ui.freeRect()', fit['ok'], json.dumps(fit))
    check(sc, 'A-10 tiles ≥ 26 px wide', fit['minW'] >= 26, str(fit['minW']))
    await shot(pg, 'lite_phone')
    n = await play_turns(pg, 3, sc); check(sc, 'A-10 3 turns on the phone', n == 3)
    check(sc, 'A-7 no three request', not any('/three/' in u for u in c.reqs))
    errors_ok(sc, c)
    await ctx.close()
    ctx, pg, c = await open_page(b, sc + 'b')
    await pg.goto(BASE); await picker_start_w1(pg)
    s = await to_roll(pg)
    check(sc, '3D before the switch', s['renderer'] == '3d', s['renderer'])
    hud0 = (s['month'], s['cash']); turn0 = (await save(pg))['state']['turn']
    await pg.click('#liteBtn')
    await pg.wait_for_function("() => document.body.dataset.renderer === '2d'", timeout=60000)
    s = await wait_playable(pg)
    check(sc, 'A-7 #liteBtn → 2D in place, same month/cash/turn', (s['month'], s['cash']) == hud0 and (await save(pg))['state']['turn'] == turn0, f'{hud0} → {(s["month"], s["cash"])}')
    await pg.wait_for_timeout(800)
    check(sc, 'A-7 S-N4 toast', await saw_toast(pg, S['N4']))
    check(sc, '#liteBtn pressed in 2D', await pg.get_attribute('#liteBtn', 'aria-pressed') == 'true')
    await play_turns(pg, 1, sc)
    errors_ok(sc + 'b', c)
    await b.close()

# ------------------------------------------------------------------ S9: no renderer at all
async def s9(p):
    sc = 'S9'; b = await launch(p, GL)
    ctx, pg, c = await open_page(b, sc, routes=[('**/js/render/board2d.js', lambda r: r.fulfill(status=404, body=''))])
    await pg.goto(BASE + '?ff=board2d:on'); await picker_start_w1(pg)
    s = await wait_playable(pg)
    check(sc, 'A-8 body[data-renderer=none]', s['renderer'] == 'none', s['renderer'])
    n = await play_turns(pg, 3, sc); check(sc, 'A-8 3 turns with DOM dice and cards', n == 3)
    check(sc, 'A-8 S-N5 toast', await saw_toast(pg, S['N5']))
    await shot(pg, 'no_renderer')
    errors_ok(sc, c)
    await b.close()

# ------------------------------------------------------------------ S10: quota
QUOTA = """(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) {
  if (String(k).startsWith('rr2-save-')) throw new DOMException('full', 'QuotaExceededError'); return set.call(this, k, v); }; })()"""
async def s10(p):
    sc = 'S10'; b = await launch(p, NOGL)
    ctx, pg, c = await open_page(b, sc, init=[NO_GL_INIT, QUOTA])
    await pg.goto(BASE); await picker_start_w1(pg)
    n = await play_turns(pg, 3, sc)
    check(sc, 'A-29 game continues (3 turns)', n == 3)
    await saw_toast(pg, S['S7'], 30); await pg.wait_for_timeout(1000)
    tl = await toasts(pg)
    check(sc, 'A-29 S-S7 exactly once', tl.count(S['S7']) == 1, json.dumps(tl, ensure_ascii=False)[:400])
    errors_ok(sc, c)
    await b.close()

# ------------------------------------------------------------------ S11: history save key (real lobby)
async def s11(p):
    sc = 'S11'; b = await launch(p, NOGL)
    prog = json.dumps({'v': 1, 'stars': {'w1': 1, 'w2': 0, 'w3': 0, 'w4': 0}, 'tutorialDone': True, 'gamesPlayed': 1})
    ctx, pg, c = await open_page(b, sc, block_lobby=False, init=[NO_GL_INIT, f"(()=>{{ if (!localStorage.getItem('rr2-progress')) localStorage.setItem('rr2-progress', {json.dumps(prog)}); }})()"])
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home', timeout=150000)
    await pg.click('[data-act="history"]')
    await pg.wait_for_selector('[data-act="history-go"]', timeout=90000)
    sid = await pg.get_attribute('[data-act="history-go"]', 'data-id')
    await pg.click(f'[data-act="history-go"][data-id="{sid}"]')
    await pg.wait_for_selector('#start', state='hidden', timeout=60000)
    await wait_playable(pg)
    await play_turns(pg, 1, sc)
    key = f'rr2-save-history-{sid}'
    check(sc, f'A-28 save under {key}', await raw(pg, key) is not None)
    await pg.click('#homeBtn'); await pg.wait_for_selector('.lb-home, .lb-shell', timeout=30000)
    await pg.click('[data-act="history"]')
    ok = True
    try: await pg.wait_for_selector(f'[data-act="history-continue"][data-id="{sid}"]', timeout=30000)
    except Exception: ok = False
    check(sc, 'A-28 scenario card shows "▶ להמשיך"', ok)
    await shot(pg, 'history_continue')
    # finishing the scenario: the lobby end path must clear that key
    await pg.evaluate("""async () => { const { bus } = await import('/js/bus.js'); const g = await import('/js/game.js'); const cfg = g.activeConfig();
      const st = JSON.parse(localStorage.getItem('rr2-save-history-' + cfg.scenarioId)).state;
      bus.emit('game:end', { status: 'lost', stars: 0, months: st.month, netWorth: 0, passive: 0, expenses: 0, progress: 0, worldId: 'h', charId: st.charId, mode: 'history',
        resultId: null, challengeId: null, groupId: null, title: '', end: { status: 'lost', reason: 'time', scenarioId: cfg.scenarioId }, stats: st.stats || {}, achievements: [],
        summary: null, bailoutUsed: false, lifeSummary: null, benchmark: null, scenarioId: cfg.scenarioId, seed: cfg.seed >>> 0 }); }""")
    gone = False
    for _ in range(20):
        await pg.wait_for_timeout(500)
        if await raw(pg, key) is None: gone = True; break
    check(sc, 'A-28 finishing clears the history key', gone)
    errors_ok(sc, c)
    await b.close()

# ------------------------------------------------------------------ S12: WebGL context loss (slow)
async def s12(p):
    sc = 'S12'; b = await launch(p, GL)
    ctx, pg, c = await open_page(b, sc)
    await pg.goto(BASE); await picker_start_w1(pg)
    s = await to_roll(pg); hud0 = (s['month'], s['cash']); turn0 = (await save(pg))['state']['turn']
    await pg.evaluate("() => { const c = document.querySelector('#c'); const gl = c.getContext('webgl2') || c.getContext('webgl'); window.__lose = gl.getExtension('WEBGL_lose_context'); window.__lose.loseContext(); }")
    await pg.wait_for_selector('#recover:not([hidden])', timeout=8000)
    check(sc, 'A-21 S-R3 after the restore wait', S['R3t'] in await pg.inner_text('#recover'))
    await click_text(pg, '#recover button', 'להמשיך במצב קל')
    s = await wait_playable(pg)
    check(sc, 'A-21 continues in 2D at the same month/turn', s['renderer'] == '2d' and (s['month'], s['cash']) == hud0 and (await save(pg))['state']['turn'] == turn0, f'{hud0} → {(s["month"], s["cash"])}')
    await b.close()

SCEN = [('S0', s0, False), ('S1', s1, False), ('S2', s2, False), ('S3', s3, True), ('S4', s4, False), ('S5', s5, False), ('S6', s6, False),
        ('S7', s7, False), ('S8', s8, False), ('S9', s9, False), ('S10', s10, False), ('S11', s11, False), ('S12', s12, True)]

async def main():
    import os; os.makedirs(SHOTS, exist_ok=True)
    async with async_playwright() as p:
        for name, fn, slow in SCEN:
            if ONLY and name not in ONLY: continue
            if slow and not SLOW and not (ONLY and name in ONLY): continue
            log('=====', name)
            t0 = time.time()
            try: await fn(p)
            except Exception as e:
                traceback.print_exc(); check(name, 'scenario ran to the end', False, f'{type(e).__name__}: {str(e)[:300]}')
            log(f'----- {name} {time.time() - t0:.0f}s')
    fails = [r for r in RESULTS if not r[2]]
    print(f'\n{len(RESULTS) - len(fails)} passed, {len(fails)} failed, {len(ERRS)} unexpected errors')
    for r in fails: print('FAIL', r[0], r[1], r[3][:300])
    for e in ERRS: print('ERR', e[:300])
    sys.exit(1 if fails or ERRS else 0)

if __name__ == '__main__':
    asyncio.run(main())
