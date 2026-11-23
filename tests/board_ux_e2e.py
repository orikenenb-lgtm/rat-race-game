# Board UX e2e (3D upgrade wave 1, team ג): tiles (short names, tap → sheet, tile list), current / destination markers,
# landing announcement, empty-city state, owned vs decoration, city reconcile, animation watchdog (hidden tab / stalled loop),
# "מבט ראשי" camera reset + orbit kept across resizes, no camera gestures under a dialog, the turn-state chip — 3D and 2D.
# Test copy (no lobby, built-in picker) on PORT_BASE+0, offline fake-backend guard, chrome --no-proxy-server.
# Usage: SRC=<export> COPY_DIR=/tmp/tg PORT_BASE=9500 bash tests/serve_copies.sh
#        python3 tests/board_ux_e2e.py [--base=http://localhost:9500/index.html] [--shots=DIR --tag=after] [--shots-only]
#          [--only=d3,d2,phone] [--sizes=desk,phone,small]
import asyncio, json, os, random, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
BASE = OPT.get('base') or f"http://localhost:{int(os.environ.get('PORT_BASE', '9500'))}/index.html"
SHOTS = OPT.get('shots'); TAG = OPT.get('tag', 'after'); SHOTS_ONLY = 'shots-only' in OPT
ONLY = set(OPT['only'].split(',')) if OPT.get('only') else None
SIZES = OPT.get('sizes', 'desk,phone,small').split(',')
VP = {'desk': {'width': 1300, 'height': 820}, 'phone': {'width': 390, 'height': 844}, 'small': {'width': 360, 'height': 740}, 'land': {'width': 844, 'height': 390}}
ARGS = FB.chrome_args(MODE, ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
SEED = "localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true}));"
RESULTS = []; ERRS = []; SINKS = []
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def check(sc, name, cond, detail=''):
    RESULTS.append((sc, name, bool(cond), str(detail)[:300])); log(('PASS' if cond else 'FAIL'), f'[{sc}]', name, '' if cond else str(detail)[:300])
    return bool(cond)
want = lambda s: ONLY is None or s in ONLY

async def page(b, tag, vp, q='', mobile=False):
    ctx = await b.new_context(viewport=vp, device_scale_factor=1, has_touch=mobile, is_mobile=mobile, **FB.new_context_kwargs())
    SINKS.append(await FB.install_mode(ctx, FB.FakeBackend() if MODE == 'offline' else None, MODE))
    await ctx.add_init_script(SEED)
    pg = await ctx.new_page(); pg.set_default_timeout(120000)
    def con(m):
        if m.type != 'error': return
        url = (m.location or {}).get('url', '')
        if 'lobby' in url or 'progress.js' in url or ('Failed to load resource' in m.text and (url == '' or 'lobby' in url or 'rr_' in url)): return
        ERRS.append(f'{tag} console: {m.text} @ {url}'); log('CONSOLE-ERR', tag, m.text, url)
    pg.on('console', con); pg.on('pageerror', lambda e: (ERRS.append(f'{tag} pageerror: {e}'), log('PAGEERR', tag, e)))
    await pg.goto(BASE + q)
    return ctx, pg

async def start(pg, world='w1'):
    await pg.wait_for_selector('.fbworld', timeout=120000)
    await pg.click(f'.fbworld[data-w={world}]'); await pg.wait_for_timeout(300)
    await pg.locator('.prof').nth(0).click(); await pg.click('#fbGo')
    await pg.wait_for_selector('#start', state='hidden', timeout=60000)
    await pg.wait_for_function("() => !document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=180000)
    await hide_coach(pg)

async def hide_coach(pg):
    for _ in range(4):
        if await pg.locator('#coach:not([hidden]) [data-c="next"]').count():
            await pg.click('#coach [data-c="next"]'); await pg.wait_for_timeout(300)
        else: break

async def shot(pg, name):
    if not SHOTS: return
    await pg.evaluate("() => { try { getSelection().removeAllRanges(); } catch (e) {} }")   # a drag test may have selected page text
    await pg.wait_for_timeout(250)
    await pg.screenshot(path=f'{SHOTS}/{TAG}_{name}.png')

STATE = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden, gm: !document.querySelector('#gm').hidden,
  start: !document.querySelector('#start').hidden, type: (document.querySelector('#evCard').className.match(/ev-(\\w+)/)||[])[1]||null })"""

async def idle(pg, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = await pg.evaluate(STATE)
        if s['gm']:
            b = pg.locator('#gm .acts button.primary')
            if await b.count(): await b.first.click(); await pg.wait_for_timeout(300); continue
        if s['card'] or s['roll'] or s['start']: return s
        if await pg.evaluate("() => { const x = document.querySelector('#story'); return !!x && !x.hidden && !!document.querySelector('#stGo'); }"):
            await pg.click('#stGo'); await pg.wait_for_timeout(300); continue
        await hide_coach(pg)
        await pg.wait_for_timeout(250)
    raise Exception('stuck: ' + json.dumps(await pg.evaluate(STATE)))

async def answer(pg, s, prefer_buy=True):
    card = pg.locator('#evCard')
    if s['type'] == 'trade':
        await card.locator('[data-o="done"]').click(); return
    btns = card.locator('button[data-o]:not([disabled])')
    n = await btns.count()
    ids = [await btns.nth(i).get_attribute('data-o') for i in range(n)]
    pick = next((i for i, x in enumerate(ids) if prefer_buy and x in ('buy', 'buyLoan')), 0)
    await btns.nth(pick).click()
    await pg.wait_for_timeout(300)
    d = card.locator('button[data-o="done"]')
    if await pg.is_visible('#evm') and await d.count() and await d.first.is_visible(): await d.first.click()

OWNED = """() => document.body.dataset.renderer === '2d' || document.querySelector('#board2d:not([hidden]) .b2d-board')
  ? !![...document.querySelectorAll('#board2d .b2d-card')].find(c => !String(c.dataset.key).startsWith('L:'))
  : import('/js/scene.js').then(s => s.perfStats().city > 0)"""
CITY_AUDIT = "import('/js/game.js').then(g => g.cityAudit ? g.cityAudit() : null)"

async def play_until_city(pg, sc, turns=26, audit=True):
    """roll / answer until the city has an owned item; after every decision the scene keys must equal cityModels (+L:*)."""
    bad = []
    for k in range(turns):
        s = await idle(pg)
        if s['start']: break
        if s['card']:
            await answer(pg, s); await pg.wait_for_timeout(500)
            if audit and not SHOTS_ONLY:
                a = await pg.evaluate(CITY_AUDIT)
                if a and a['want'] != a['scene']: bad.append(a)
            continue
        a = await pg.evaluate(CITY_AUDIT) if not SHOTS_ONLY else None
        if a and [x for x in a['want'] if not x.startswith('L:')]: return bad, True
        if SHOTS_ONLY and await pg.evaluate(OWNED): return bad, True
        if not SHOTS_ONLY and audit and a and a['want'] != a['scene']: bad.append(a)
        await pg.click('#roll')
    return bad, False

async def tile_point(pg):
    return await pg.evaluate("""import('/js/scene.js').then(s => { for (const i of [5, 4, 6, 3, 7, 2, 8, 1, 39, 38, 37, 36, 9, 15, 25, 35]) { const p = s.projectTile(i);
      const e = document.elementFromPoint(p.x, p.y); if (e && e.id === 'c') return { ...p, i }; } return null; })""")

async def run_3d(b, size):
    sc = f'3d-{size}'; mobile = size != 'desk'
    ctx, pg = await page(b, sc, VP[size], mobile=mobile)
    await start(pg, 'w1')
    await pg.wait_for_timeout(4000)
    await shot(pg, f'{size}_3d_start')
    if not SHOTS_ONLY:
        info = await pg.evaluate("import('/js/scene.js').then(s => s.boardUx ? s.boardUx() : null)")
        check(sc, 'empty city state is shown (plots + caption) and nothing is owned', info and info['empty'] and info['city'] == 0, info)
        check(sc, 'current-tile marker on the start tile', info and info['current'] == 0, info)
        check(sc, 'landmarks stand on stone pedestals (not owned plinths)', info and info['landmarks'] >= 1 and info['pedestals'] == info['landmarks'], info)
        chip = await pg.evaluate("() => { const c = document.querySelector('#turnChip'); return c ? { live: c.getAttribute('aria-live'), role: c.getAttribute('role') } : null; }")
        check(sc, 'turn chip exists, aria-live polite', chip and chip['live'] == 'polite', chip)
        tb = await pg.evaluate("""() => [...document.querySelectorAll('#boardTools button')].map(b => ({ id: b.id, name: b.getAttribute('aria-label'), vis: !!b.getClientRects().length,
          w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height }))""")
        check(sc, 'board tools: "מבט ראשי" + tile list buttons, named, ≥ 40 px', len([x for x in tb if x['vis']]) == 2 and all(x['name'] and x['w'] >= 40 and x['h'] >= 40 for x in tb if x['vis']), tb)
    # --- tile tap → sheet
    t = await tile_point(pg)
    if t:
        await pg.mouse.click(t['x'], t['y']); await pg.wait_for_timeout(700)
        await shot(pg, f'{size}_3d_tilesheet')
        if not SHOTS_ONLY:
            sh = await pg.evaluate("() => { const c = document.querySelector('#gmCard.tinfo'); return c && !document.querySelector('#gm').hidden ? { title: c.querySelector('h2')?.textContent, text: c.innerText } : null; }")
            check(sc, 'tap on a board tile opens the tile sheet', sh and sh['title'], sh)
            check(sc, 'tile sheet says how far it is ("עוד N צעדים" / "אתה כאן")', sh and ('צעד' in sh['text'] or 'אתה כאן' in sh['text']), sh)
            # no camera gestures while a dialog is open: a drag across the board does not move the camera
            c0 = await pg.evaluate("import('/js/scene.js').then(s => s.cameraState().pos)")
            await pg.mouse.move(t['x'] - 120, t['y'] - 200); await pg.mouse.down(); await pg.mouse.move(t['x'] + 120, t['y'] - 150, steps=8); await pg.mouse.up()
            await pg.wait_for_timeout(500)
            c1 = await pg.evaluate("import('/js/scene.js').then(s => s.cameraState().pos)")
            check(sc, 'no camera gesture while a dialog is open', c0 == c1, (c0, c1))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        if await pg.is_visible('#gm'): await pg.click('#gm .acts button.primary')
    elif not SHOTS_ONLY: check(sc, 'an uncovered tile exists', False)
    if not SHOTS_ONLY:
        # tile list (accessible alternative to the canvas)
        await pg.click('#tilesBtn'); await pg.wait_for_timeout(500)
        n = await pg.evaluate("() => document.querySelectorAll('#gmCard .tlist button[data-tile]').length")
        check(sc, 'tile list lists all 40 tiles as buttons', n == 40, n)
        await pg.locator('#gmCard .tlist button[data-tile="12"]').click(); await pg.wait_for_timeout(400)
        sh = await pg.evaluate("() => { const c = document.querySelector('#gmCard.tinfo'); return c ? c.innerText : null; }")
        check(sc, 'a tile in the list opens its sheet', sh and 'עוד 12 צעדים' in sh, sh)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        # camera: orbit, resize keeps it, "מבט ראשי" resets it
        if not mobile:
            await pg.evaluate("import('/js/scene.js').then(s => s.debugOrbit && s.debugOrbit(0.6))"); await pg.wait_for_timeout(600)
            az0 = await pg.evaluate("import('/js/scene.js').then(s => s.cameraState().az)")
            await pg.set_viewport_size({'width': 1280, 'height': 800}); await pg.wait_for_timeout(900)
            az1 = await pg.evaluate("import('/js/scene.js').then(s => s.cameraState().az)")
            check(sc, 'a resize keeps the user\'s orbit (azimuth)', az0 is not None and abs(az1 - az0) < 0.08, (az0, az1))
            await pg.click('#homeViewBtn')
            for _ in range(40):   # swiftshader on a shared box: a few frames per second
                await pg.wait_for_timeout(250)
                az2 = await pg.evaluate("import('/js/scene.js').then(s => s.cameraState())")
                if abs(az2['az'] - az2['az0']) < 0.06 and not az2.get('moving'): break
            check(sc, '"מבט ראשי" returns to the default angle + follow mode', abs(az2['az'] - az2['az0']) < 0.06 and az2['mode'] == 'follow', az2)
            await pg.set_viewport_size(VP[size]); await pg.wait_for_timeout(600)
    # --- mid-move destination marker (slow animation so the screenshot catches the hop)
    s = await idle(pg)
    if s['roll']:
        await pg.evaluate("import('/js/scene.js').then(s => { s.setSpeed(7); if (s.boardUx && s.boardUx().dest === null && !s.boardUx().stalled) s.setCameraMode('overview'); })")   # the whole board: pawn + destination
        await pg.click('#roll')
        if not SHOTS_ONLY:
            for _ in range(240):
                mk = await pg.evaluate("import('/js/scene.js').then(s => s.boardUx())")
                if mk['dest'] is not None: break
                await pg.wait_for_timeout(125)
            chip = await pg.evaluate("() => document.querySelector('#turnChip')?.textContent || ''")
            check(sc, 'destination marked before the pawn arrives', mk['dest'] is not None and mk['current'] is None, mk)
            check(sc, 'turn chip says "זזים N צעדים" during the move', 'זזים' in chip or 'זורקים' in chip, chip)
            await mid_move_tools(pg, sc)
        else: await pg.wait_for_timeout(5200)
        await pg.wait_for_timeout(900)
        await shot(pg, f'{size}_3d_move')
        await pg.evaluate("import('/js/scene.js').then(s => { s.setSpeed(1); s.setCameraMode('follow'); })")
        s = await idle(pg)
        if not SHOTS_ONLY:
            mk = await pg.evaluate("import('/js/scene.js').then(s => s.boardUx())")
            pos = await pg.evaluate("import('/js/game.js').then(g => g.cityAudit().pos)")
            check(sc, 'after landing: destination cleared, current marker on the pawn tile', mk['dest'] is None and mk['current'] == pos, (mk, pos))
            live = await pg.evaluate("() => (window.__live || []).join(' | ')")
            check(sc, 'landing announced "נחתת על …" in the live region', 'נחתת על' in live, live)
            await card_tools(pg, sc)
            await esc_list(pg, sc)
    # --- city after buying an asset
    bad, got = await play_until_city(pg, sc)
    if not SHOTS_ONLY:
        check(sc, 'after every decision the scene city keys == cityModels keys (+L:*)', not bad, bad[:2])
        check(sc, 'an asset was bought during the run', got)
        if got:
            info = await pg.evaluate("import('/js/scene.js').then(s => s.boardUx())")
            check(sc, 'empty-city state is gone once something is owned', not info['empty'], info)
    if got or SHOTS_ONLY:
        await pg.evaluate("import('/js/scene.js').then(s => s.setCameraMode('overview'))"); await pg.wait_for_timeout(1500)
        await shot(pg, f'{size}_3d_city')
        await pg.evaluate("import('/js/scene.js').then(s => s.setCameraMode('follow'))")
    if not SHOTS_ONLY and size == 'desk':
        await watchdog(pg, sc)
    await ctx.close()

TOOLS = """() => { const q = (id) => document.getElementById(id); const l = q('tilesBtn'), h = q('homeViewBtn'), lite = q('liteBtn');
  const shown = (e) => !!e && !e.hidden && !!e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  return { list: shown(l), listDis: !!(l && l.disabled), home: shown(h), liteDis: !!(lite && lite.disabled), gm: !q('gm').hidden, card: !q('evm').hidden }; }"""

async def mid_move_tools(pg, sc):
    """wave 3a (review MAJOR-1 / MINOR-4): during a move the tile list cannot open (disabled + guarded) and 🪶 waits."""
    t = await pg.evaluate(TOOLS)
    check(sc, 'mid-move: the tile list button is disabled', t['listDis'], t)
    check(sc, 'mid-move: 🪶 (מצב קל) is disabled until the pawn stops', t['liteDis'], t)
    await pg.evaluate("() => { const b = document.getElementById('tilesBtn'); b.disabled = false; b.click(); }")   # even a forced click is refused (busy guard)
    await pg.wait_for_timeout(400)
    t = await pg.evaluate(TOOLS)
    check(sc, 'mid-move: a forced tap on 📋 opens nothing (no list under the coming card)', not t['gm'], t)
    await pg.evaluate("() => { const b = document.getElementById('liteBtn'); b.disabled = false; b.click(); }")
    await pg.wait_for_timeout(300)
    r = await pg.evaluate("() => document.body.dataset.renderer || (document.querySelector('#board2d:not([hidden])') ? '2d' : '3d')")
    check(sc, 'mid-move: a forced tap on 🪶 does not switch the renderer', r != '2d', r)

async def card_tools(pg, sc):
    s = await pg.evaluate(STATE)
    t = await pg.evaluate(TOOLS)
    if s['card']: check(sc, 'a card is open: the board tools are hidden (no list over / under it)', not t['list'] and not t['home'], t)
    else: check(sc, 'at rest: the tile list button is enabled again', t['list'] and not t['listDis'] and not t['liteDis'], t)

async def esc_list(pg, sc):
    s = await idle(pg)
    if s['card']: await answer(pg, s); s = await idle(pg)
    if not s['roll']: return
    await pg.click('#tilesBtn'); await pg.wait_for_selector('#gmCard.tlistc', timeout=5000)
    await pg.evaluate("() => { document.activeElement && document.activeElement.blur(); document.body.focus(); }")
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    check(sc, 'Esc closes the tile list even when focus left it', await pg.is_hidden('#gm'))

async def run_land(b, kind):
    """wave 3a (review MINOR-1): a landscape phone (844×390) — every board tool is tappable (nothing of the HUD / bar on top)."""
    sc = f'land-{kind}'
    ctx, pg = await page(b, sc, VP['land'], q='?ff=board2d:on' if kind == '2d' else '', mobile=True)
    await start(pg, 'w1'); await pg.wait_for_timeout(2500)
    s = await idle(pg)
    if s['card']: await answer(pg, s); s = await idle(pg)
    await pg.wait_for_timeout(800)
    hit = await pg.evaluate("""() => [...document.querySelectorAll('#boardTools .ibtn')].filter(b => !b.hidden && b.getClientRects().length).map(b => { const r = b.getBoundingClientRect();
      const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 4, r.top + 4], [r.right - 4, r.bottom - 4]];
      return { id: b.id, r: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], ok: pts.every(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && b.contains(e); }) }; })""")
    check(sc, 'landscape phone: every board tool is on top where it is drawn (tappable)', hit and all(x['ok'] for x in hit), hit)
    check(sc, 'landscape phone: the tools are inside the viewport', hit and all(x['r'][0] >= 0 and x['r'][1] >= 0 and x['r'][2] <= 844 and x['r'][3] <= 390 for x in hit), hit)
    if hit:
        await pg.click('#tilesBtn'); await pg.wait_for_timeout(500)
        check(sc, 'landscape phone: a tap on 📋 opens the tile list', await pg.is_visible('#gmCard.tlistc'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    await shot(pg, f'land_{kind}')
    await ctx.close()

async def watchdog(pg, sc):
    """G10: background / foreground mid-hop and a stalled render loop never stick the turn."""
    s = await idle(pg)
    if s['card']: await answer(pg, s); s = await idle(pg)
    if not s['roll']: return
    m0 = await pg.evaluate("import('/js/game.js').then(g => g.cityAudit().turn)")
    await pg.evaluate("import('/js/scene.js').then(s => s.setSpeed(4))")
    await pg.click('#roll'); await pg.wait_for_timeout(1500)
    await pg.evaluate("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))")
    await pg.wait_for_timeout(2500)
    await pg.evaluate("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'))")
    t0 = time.time(); s = await idle(pg, 60)
    m1 = await pg.evaluate("import('/js/game.js').then(g => g.cityAudit().turn)")
    check(sc, 'hidden tab mid-hop, then visible: the turn finishes', m1 == m0 + 1 and (s['roll'] or s['card']), (m0, m1, round(time.time() - t0, 1)))
    if s['card']: await answer(pg, s); s = await idle(pg)
    if not s['roll']: return
    # a stalled loop (frames stop, the page stays visible): the awaited tweens resolve by wall clock
    await pg.click('#roll'); await pg.wait_for_timeout(600)
    await pg.evaluate("import('/js/scene.js').then(s => s.debugStall(true))")
    t0 = time.time(); s = await idle(pg, 60); dt = time.time() - t0
    await pg.evaluate("import('/js/scene.js').then(s => { s.debugStall(false); s.setSpeed(1); })")
    m2 = await pg.evaluate("import('/js/game.js').then(g => g.cityAudit().turn)")
    check(sc, 'stalled render loop mid-turn: the watchdog finishes the animation (turn not stuck)', m2 == m1 + 1, (m1, m2, round(dt, 1)))
    st = await pg.evaluate("import('/js/game.js').then(g => g.cityAudit())")
    check(sc, 'pawn shown on the engine position after the watchdog', st['pawnTile'] == st['pos'], st)

async def run_2d(b, size):
    sc = f'2d-{size}'; mobile = size != 'desk'
    ctx, pg = await page(b, sc, VP[size], q='?ff=board2d:on', mobile=mobile)
    await start(pg, 'w1'); await pg.wait_for_timeout(800)
    await shot(pg, f'{size}_2d_start')
    if not SHOTS_ONLY:
        t = await pg.evaluate("""() => [...document.querySelectorAll('#board2d .b2d-tile')].map(e => { const n = e.querySelector('.b2d-tn');
          return { tag: e.tagName, name: e.getAttribute('aria-label'), clip: n ? (n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1 || getComputedStyle(n).textOverflow === 'ellipsis' && n.scrollWidth > n.clientWidth) : null,
            vis: n ? getComputedStyle(n).display !== 'none' : false, short: n ? n.textContent : '' }; })""")
        check(sc, '2D: 40 tiles, each a <button> with a name', len(t) == 40 and all(x['tag'] == 'BUTTON' and x['name'] for x in t), t[:2])
        vis = [x for x in t if x['vis']]
        sm = await pg.evaluate("() => !!document.querySelector('#board2d .b2d-board.b2d-sm')")
        if sm: check(sc, '2D small cells (phone): icon-only tiles, full name as the accessible name, tap for the sheet', not vis and all(x['name'] for x in t))
        else: check(sc, '2D: short tile names are visible and not clipped', vis and not [x for x in vis if x['clip']], [x['short'] for x in vis if x['clip']][:8])
        check(sc, '2D: no ellipsis in tile names', all('…' not in x['short'] for x in t))
        cur = await pg.evaluate("() => [...document.querySelectorAll('#board2d .b2d-cur')].map(e => e.dataset.i)")
        check(sc, '2D: current tile marked', cur == ['0'], cur)
        emp = await pg.evaluate("() => { const e = document.querySelector('#board2d .b2d-empty'); return e && e.getClientRects().length ? e.innerText : null; }")
        check(sc, '2D: empty-city state shown', emp and 'כאן יקומו הנכסים שלך' in emp, emp)
        # keyboard: focus a tile, Enter opens the sheet
        await pg.focus('#board2d .b2d-tile[tabindex="0"]'); await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500)
        sh = await pg.evaluate("() => { const c = document.querySelector('#gmCard.tinfo'); return c && !document.querySelector('#gm').hidden ? c.innerText : null; }")
        check(sc, '2D: arrow + Enter on a tile opens its sheet (next tile = עוד צעד אחד)', sh and 'עוד צעד אחד' in sh, sh)
    else:
        await pg.evaluate("document.querySelector('#board2d .b2d-tile[data-i=\"5\"]').click()"); await pg.wait_for_timeout(500)
    await shot(pg, f'{size}_2d_tilesheet')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    if await pg.is_visible('#gm'):
        b2 = pg.locator('#gm .acts button.primary')
        if await b2.count(): await b2.first.click()
    s = await idle(pg)
    if s['roll']:
        await pg.click('#roll')
        if not SHOTS_ONLY:
            await pg.wait_for_function("() => document.querySelector('#board2d .b2d-dest')", timeout=20000)
            check(sc, '2D: destination tile marked during the move', True)
            dl = await pg.evaluate("() => document.querySelector('#board2d .b2d-dest')?.getAttribute('aria-label') || ''")
            check(sc, '2D: the destination tile says "לכאן זזים" in its name', 'לכאן זזים' in dl, dl)
        await shot(pg, f'{size}_2d_move')
        s = await idle(pg)
        if not SHOTS_ONLY:
            d = await pg.evaluate("() => ({ dest: document.querySelectorAll('#board2d .b2d-dest').length, cur: [...document.querySelectorAll('#board2d .b2d-cur')].map(e => +e.dataset.i) })")
            pos = await pg.evaluate("import('/js/game.js').then(g => g.cityAudit().pos)")
            check(sc, '2D: after landing the destination mark is cleared and the current tile follows', d['dest'] == 0 and d['cur'] == [pos], (d, pos))
            a = await pg.evaluate("() => ({ cur: [...document.querySelectorAll('#board2d [aria-current=location]')].map(e => [+e.dataset.i, e.getAttribute('aria-label')]), lbl: [...document.querySelectorAll('#board2d .b2d-tile')].filter(e => /אתה כאן|לכאן זזים/.test(e.getAttribute('aria-label'))).length })")
            check(sc, '2D: the current tile has aria-current=location and "אתה כאן" (only it)', len(a['cur']) == 1 and a['cur'][0][0] == pos and 'אתה כאן' in a['cur'][0][1] and a['lbl'] == 1, a)
    bad, got = await play_until_city(pg, sc)
    if not SHOTS_ONLY:
        check(sc, '2D: scene keys == cityModels keys after every decision', not bad, bad[:2])
        if got:
            emp = await pg.evaluate("() => { const e = document.querySelector('#board2d .b2d-empty'); return !!(e && e.getClientRects().length); }")
            check(sc, '2D: empty-city state hidden once something is owned', not emp)
    await shot(pg, f'{size}_2d_city')
    await ctx.close()

LIVE_PROBE = "window.__live = []; new MutationObserver(() => { const e = document.querySelector('#a11yLive'); if (e && e.textContent) window.__live.push(e.textContent); }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });"

async def main():
    FB.banner(MODE)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        global SEED
        SEED = SEED + "document.addEventListener('DOMContentLoaded', () => {" + LIVE_PROBE + "});"
        for size in SIZES:
            if want('d3') or (want('phone') and size != 'desk'): await run_3d(b, size)
            if want('d2'): await run_2d(b, size)
        if want('land'):
            for kind in ('3d', '2d'): await run_land(b, kind)
        await b.close()
    for s in SINKS: FB.assert_clean(s)
    fails = [r for r in RESULTS if not r[2]]
    log(f'{len(RESULTS) - len(fails)} passed, {len(fails)} failed, {len(ERRS)} page errors')
    for e in ERRS: log('ERR', e)
    sys.exit(1 if fails or ERRS else 0)

asyncio.run(main())
