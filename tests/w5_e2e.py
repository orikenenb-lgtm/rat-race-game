# Worlds wave 1 — w5 עיר התיירות end to end in the real page (lobby + game), offline fake backend + guard:
#   map   the 12-world map from P.worldMap(): w1–w5 cards (buttons), w6–w12 "בקרוב" pins (no play button), unlock text, learn /
#         difficulty lines; unlock w5 through progress (★ in w1–w4) — and P.setUnlockAll for the owner override
#   pick  w5 card → its rules load (ensureWorldRules) → the character picker (3 characters, pros / cons) → a game starts in w5
#         (body[data-world=w5], the season chip, no 404 / page error: the w5 models are procedural stand-ins)
#   play  a fixed-seed hotelier game: rolls through a payday and an 'N' (מפעיל תיירות) tile, the allotment card; the world panel
#         (gauges, 12-month strip, ring, rows, actions) from the HUD chip and from 💼; a price-plan action through E.worldAction;
#         save → reload → resume: the city equals cityModels and the occupancy levels equal the engine's (3D), then the 2D board
# Copies: SRC=<export> COPY_DIR=/tmp/ui5 PORT_BASE=10400 bash tests/serve_copies.sh
# Usage: python3 tests/w5_e2e.py [--real=http://localhost:10402/] [--shots=DIR] [--only=map,pick,play]
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
PB = int(os.environ.get('PORT_BASE', '10400'))
REAL = OPT.get('real') or f'http://localhost:{PB + 2}/'
SHOTS = OPT.get('shots'); ONLY = set(OPT['only'].split(',')) if OPT.get('only') else None
want = lambda s: ONLY is None or s in ONLY
VP = {'desk': {'width': 1300, 'height': 820}, 'phone': {'width': 390, 'height': 844}, 'small': {'width': 360, 'height': 740}}
ARGS = FB.chrome_args(MODE, ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
STARS = json.dumps({'w1': 1, 'w2': 1, 'w3': 1, 'w4': 1})
SEED = ("localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-tips-off','1'); localStorage.setItem('rr2-reveal', 'all');"
        "localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true,w5:true}));")
UNLOCK = ("(() => { if (localStorage.getItem('rr2-progress')) return; localStorage.setItem('rr2-progress', JSON.stringify({ v: 1, stars: %s, best: {}, achievements: [], pawn: 'classic',"
          " seenWorlds: ['w1','w2','w3','w4'], onboarded: true, tutorialDone: true, gamesPlayed: 4, wins: 4 })); })();" % STARS)
RESULTS = []; ERRS = []; SINKS = []; BAD = []
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def check(sc, name, cond, detail=''):
    RESULTS.append((sc, name, bool(cond))); log(('PASS' if cond else 'FAIL'), f'[{sc}]', name, '' if cond else str(detail)[:500]); return bool(cond)

STATE = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden, gm: !document.querySelector('#gm').hidden,
  gmCls: document.querySelector('#gmCard').className, start: !document.querySelector('#start').hidden, type: (document.querySelector('#evCard').className.match(/ev-(\\w+)/)||[])[1]||null,
  month: (document.querySelector('#hMonth')||{}).textContent || '' })"""

async def page(b, vp, flags='', unlock=True):
    ctx = await b.new_context(viewport=VP[vp], device_scale_factor=1, has_touch=vp != 'desk', is_mobile=vp != 'desk', **FB.new_context_kwargs())
    SINKS.append(await FB.install_mode(ctx, FB.FakeBackend() if MODE == 'offline' else None, MODE))
    await ctx.add_init_script(SEED + (UNLOCK if unlock else ''))
    pg = await ctx.new_page(); pg.set_default_timeout(120000)
    pg.on('pageerror', lambda e: (ERRS.append(f'{vp} pageerror: {e}'), log('PAGEERR', e)))
    # never a missing file: every same-origin response must be < 400 (the w5 models are procedural, the card art generated)
    pg.on('response', lambda r: BAD.append(f'{r.status} {r.url}') if r.status >= 400 and r.url.startswith(REAL) else None)
    await pg.goto(REAL + 'index.html' + flags)
    await pg.wait_for_selector('.lb-home, .lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
    return ctx, pg

async def shot(pg, name):
    if not SHOTS: return
    await pg.wait_for_timeout(400)
    await pg.screenshot(path=f'{SHOTS}/{name}.jpg', type='jpeg', quality=80)

async def quiet(pg):
    for _ in range(6):
        if await pg.locator('#coach:not([hidden]) button').count():
            await pg.locator('#coach:not([hidden]) button').first.click(); await pg.wait_for_timeout(250)
        else: break

async def idle(pg, timeout=150, stop_on=None):
    """answer cards / dialogs with a neutral choice until the roll button is back (or a card of type `stop_on` is open)"""
    t0 = time.time()
    while time.time() - t0 < timeout:
        await quiet(pg)
        s = await pg.evaluate(STATE)
        if stop_on and s['card'] and s['type'] == stop_on: return s
        if s['gm']:
            b = pg.locator('#gm .acts button.primary:not([disabled])')
            if await b.count(): await b.first.click(); await pg.wait_for_timeout(300); continue
        if s['card']:
            # the mentor's highlighted option first (the same path as the engine's `primary`), else a neutral one
            ok = pg.locator('#evCard .acts button.primary[data-o]:not([disabled]), #evCard button.primary[data-o]:not([disabled])')
            if not await ok.count(): ok = pg.locator('#evCard button[data-o="ok"]:not([disabled]), #evCard button[data-o="pass"]:not([disabled]), #evCard button[data-o="skip"]:not([disabled]), #evCard button[data-o="decline"]:not([disabled])')
            btn = ok.first if await ok.count() else pg.locator('#evCard button[data-o]:not([disabled])').first
            try: await btn.click(timeout=5000)
            except Exception: await pg.evaluate("() => document.querySelector('#evCard button[data-o]:not([disabled])')?.click()")
            await pg.wait_for_timeout(500)
            d = pg.locator('#evCard button[data-o="done"]')
            if await d.count() and await d.first.is_visible(): await d.first.click()
            continue
        if s['roll'] or s['start']: return s
        if await pg.evaluate("() => { const x = document.querySelector('#story'); return !!x && !x.hidden && !!document.querySelector('#stGo'); }"):
            await pg.click('#stGo'); await pg.wait_for_timeout(300); continue
        await pg.wait_for_timeout(250)
    raise Exception('stuck: ' + json.dumps(await pg.evaluate(STATE)))

MAP = """() => { const cards = [...document.querySelectorAll('.map-grid .map-card')];
  return cards.map((c) => ({ id: c.dataset.id, tag: c.tagName, act: c.dataset.act || null, soon: c.classList.contains('is-soon'), locked: c.classList.contains('is-locked'),
    name: (c.querySelector('.map-name') || {}).textContent || '', learn: (c.querySelector('.map-learn') || {}).textContent || '', diff: !!c.querySelector('.map-diff'),
    line: (c.querySelector('.map-line') || {}).textContent || '', img: !!c.querySelector('img'), gen: !!c.querySelector('.gen-art'),
    buttons: c.querySelectorAll('button').length + (c.tagName === 'BUTTON' ? 1 : 0) })); }"""

async def run_map(b):
    for vp in ('desk', 'phone', 'small'):
        sc = f'map-{vp}'; ctx, pg = await page(b, vp)
        cards = await pg.evaluate(MAP)
        ids = [c['id'] for c in cards]
        meta = await pg.evaluate("import('./js/progress.js').then((P) => P.worldMap().map((m) => ({ id: m.id, playable: m.playable, unlocked: m.unlocked, lockText: m.lockText })))")
        check(sc, f'the map renders every P.worldMap() entry in order ({len(meta)})', ids == [m['id'] for m in meta] and len(ids) == len(meta) >= 12, ids)
        play = [c for c in cards if not c['soon']]; soon = [c for c in cards if c['soon']]
        pm = [m['id'] for m in meta if m['playable']]
        check(sc, 'playable worlds are buttons (data-act=world), planned ones are "בקרוב" pins', [c['id'] for c in play] == pm and all(c['tag'] == 'BUTTON' and c['act'] == 'world' for c in play), play)
        check(sc, 'no fake play button on a planned world (no button, no data-act)', all(c['tag'] != 'BUTTON' and not c['act'] and c['buttons'] == 0 for c in soon) and len(soon) == len(meta) - len(pm), soon)
        w5 = next((c for c in cards if c['id'] == 'w5'), None)
        check(sc, 'w5 is unlocked through progress (★ in w1–w4) and shows what it teaches + difficulty', w5 and not w5['locked'] and 'עסק עונתי' in w5['learn'] and w5['diff'], w5)
        check(sc, 'later worlds use generated card art (no missing image), w1–w4 their painted cards', all(c['gen'] and not c['img'] for c in cards if c['id'] not in ('w1', 'w2', 'w3', 'w4')) and all(c['img'] for c in cards if c['id'] in ('w1', 'w2', 'w3', 'w4')), cards)
        lk = [c for c in soon if 'ייפתח' in c['line']]
        check(sc, 'planned worlds show their unlock rule ("ייפתח: ★ …", forks "★ באחד מ: …")', len(lk) == len(soon) and (any('באחד מ' in c['line'] for c in soon) or not any('·' in c['line'] for c in soon)), [c['line'] for c in soon])   # a fork is named whenever a planned world has one (w12 alone needs w11 since b8ab166)
        tr = await pg.evaluate("() => ({ n: document.querySelectorAll('.map-trail li').length, soon: (document.querySelector('.map-trail li.soon') || {}).textContent || '' })")
        check(sc, 'the trail: the playable worlds + one "🔜 N" item', tr['n'] == len(pm) + 1 and str(len(meta) - len(pm)) in tr['soon'], tr)
        ov = await pg.evaluate("() => document.documentElement.scrollWidth <= innerWidth + 1")
        check(sc, 'no horizontal overflow', ov)
        await shot(pg, f'map_{vp}')
        if vp == 'desk':
            await pg.evaluate("() => document.querySelector('.map-card[data-id=\"w9\"]').scrollIntoView({ block: 'center' })"); await shot(pg, 'map_desk_later')
            # the owner override: no stars at all, setUnlockAll(true) opens every playable world (P.isUnlocked / worldMap)
            r = await pg.evaluate("""async () => { const P = await import('./js/progress.js'); P._reset && P._reset({ ...P.getProgress(), stars: { w1: 0, w2: 0, w3: 0, w4: 0 } });
              const before = P.worldMap().find((m) => m.id === 'w5').unlocked; P.setUnlockAll(true); const after = P.worldMap().filter((m) => m.playable).every((m) => m.unlocked);
              const soon = P.worldMap().filter((m) => !m.playable).every((m) => !m.unlocked); P.setUnlockAll(false); return { before, after, soon, back: P.worldMap().find((m) => m.id === 'w5').unlocked }; }""")
            check(sc, 'admin unlock-all (P.setUnlockAll) opens every playable world, never a planned one, and turns off again', r['before'] is False and r['after'] and r['soon'] and r['back'] is False, r)
        await ctx.close()

async def run_pick(b):
    sc = 'pick-desk'; ctx, pg = await page(b, 'desk')
    pre = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w5'))")
    check(sc, 'w5 rules are not loaded at boot (lazy)', pre is False, pre)
    await pg.click('.map-card[data-id="w5"]')
    await pg.wait_for_selector('.wv-char[data-w="w5"]', timeout=60000)
    info = await pg.evaluate("""() => ({ chars: [...document.querySelectorAll('.wv-char')].map((c) => c.dataset.c), h1: document.querySelector('.wv-hero h1').textContent,
      learn: !!document.querySelector('.wv-learn'), diff: !!document.querySelector('.wv-diff5'), pros: document.querySelectorAll('.wv-char .wv-str').length,
      loaded: null })""")
    info['loaded'] = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w5'))")
    check(sc, 'the picker waits for the rules, then lists the 3 w5 characters', info['loaded'] and info['chars'] == ['hotelier', 'restaurateur', 'promoter'] and info['h1'] == 'עיר התיירות', info)
    check(sc, 'world view: what you learn, difficulty, pros / cons per character', info['learn'] and info['diff'] and info['pros'] >= 3, info)
    await shot(pg, 'picker_desk')
    await pg.click('.wv-go[data-c="hotelier"]')
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500); await quiet(pg)
    s = await idle(pg)
    g = await pg.evaluate("""() => ({ world: document.body.dataset.world, chip: (document.querySelector('#worldPanelBtn') || {}).textContent || '',
      tiles: document.querySelectorAll('#tileList, .b2d-tile').length, cfg: null })""")
    g['cfg'] = await pg.evaluate("import('./js/game.js').then((G) => G.activeConfig())")
    check(sc, 'a w5 game started from the picker (hotelier, free)', g['world'] == 'w5' and g['cfg'] and g['cfg']['worldId'] == 'w5' and g['cfg']['charId'] == 'hotelier', g)
    check(sc, 'the HUD shows the season chip (month · band · demand)', 'ביקוש' in g['chip'], g['chip'])
    fails = await pg.evaluate("import('./js/scene.js').then((S) => S.failedModels ? S.failedModels() : [])")
    check(sc, 'no model failed (w5 stand-ins are procedural: nothing was fetched for them)', not fails, fails)
    await pg.evaluate("document.querySelector('#homeBtn').click()"); await pg.wait_for_selector('.lb-home', state='visible', timeout=30000); await pg.wait_for_timeout(800)
    tag = await pg.evaluate("() => (document.querySelector('.map-card[data-id=\"w5\"] .map-tag-save') || {}).textContent || ''")
    check(sc, 'back on the map: the w5 card shows the saved game', 'שמור' in tag, tag)
    await ctx.close()

START = """async ({ seed }) => { const E = await import('./js/engine.js'); await E.ensureWorld('w5'); const G = await import('./js/game.js'); await G.initGame();
  G.startGame({ worldId: 'w5', charId: 'hotelier', mode: 'free', seed, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true, resume: false }); return true; }"""
SAVED = "() => { const r = JSON.parse(localStorage.getItem('rr2-save-free-w5') || 'null'); return r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); }"

async def run_play(b):
    sc = 'play-desk'; ctx, pg = await page(b, 'desk')
    await pg.evaluate(START, {'seed': 7})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    s = await idle(pg)
    st0 = await pg.evaluate(SAVED)
    m0 = st0['month'] if st0 else 1
    await shot(pg, 'board3d_desk')
    saw_n = None; paid = False
    for i in range(30):
        await pg.click('#roll'); await pg.wait_for_timeout(600)
        s = await idle(pg, stop_on='mech')
        st = await pg.evaluate(SAVED)
        if st and st['month'] > m0: paid = True
        if s['card'] and s['type'] == 'mech':
            saw_n = await pg.evaluate("""() => { const c = document.querySelector('#evCard'); return { title: (c.querySelector('h2') || {}).textContent || '', opts: [...c.querySelectorAll('button[data-o]')].map((b) => b.dataset.o), text: c.textContent.slice(0, 300) }; }""")
            await shot(pg, 'allot_card_desk')
            await pg.locator('#evCard button[data-o="accept"]').click(); await pg.wait_for_timeout(800)
            s = await idle(pg)
            break
    check(sc, 'rolled through a payday', paid)
    check(sc, "landed on an 'N' tile: the allotment card (accept / counter / decline)", saw_n and 'מפעיל' in saw_n['title'] and {'accept', 'counter', 'decline'} <= set(saw_n['opts']), saw_n)
    st = await pg.evaluate(SAVED)
    hotel = next((a for a in (st or {}).get('assets', []) if a.get('op')), None)
    check(sc, 'accepting the allotment reached the engine (op.allot on the hotel)', hotel and hotel['op'].get('allot'), hotel and hotel.get('op'))
    # the world panel from the HUD chip
    await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
    P = await pg.evaluate("""() => { const c = document.querySelector('#gmCard'); return { gauges: c.querySelectorAll('.wp-g').length, strip: c.querySelectorAll('.wp-strip li').length,
      ring: c.querySelectorAll('.wp-ring path').length, rows: c.querySelectorAll('.wp-row').length, acts: c.querySelectorAll('button[data-wact]').length,
      sug: c.querySelectorAll('button[data-wact].sug').length, title: (c.querySelector('h2') || {}).textContent || '' }; }""")
    check(sc, 'panel: 2 gauges, a 12-month strip, a 12-segment ring, the hotel row, actions', P['gauges'] == 2 and P['strip'] == 12 and P['ring'] == 12 and P['rows'] >= 1 and P['acts'] >= 4 and 'עונות' in P['title'], P)
    await shot(pg, 'panel_desk')
    hid = hotel['id'] if hotel else 1
    sel = f'#gmCard button[data-wact]'
    idx = await pg.evaluate("""(hid) => { const b = [...document.querySelectorAll('#gmCard button[data-wact]')]; return b.findIndex((x) => /עונה יוקרה · שפל זול/.test(x.textContent) && !x.disabled); }""", hid)
    check(sc, 'the price plan "עונה יוקרה · שפל זול" is offered', idx >= 0, idx)
    if idx >= 0:
        await pg.locator(sel).nth(idx).click(); await pg.wait_for_timeout(900)
        msg = await pg.evaluate("() => { const m = document.querySelector('#gmCard .wp-msg'); return { t: m.textContent, c: m.className, cur: [...document.querySelectorAll('#gmCard button[data-wact].cur')].map((b) => b.textContent) }; }")
        st = await pg.evaluate(SAVED); h = next((a for a in st['assets'] if a.get('op')), {})
        check(sc, 'the action went through E.worldAction (engine op.peak premium / op.off budget, logged Z, panel redrawn)', h.get('op', {}).get('peak') == 'premium' and h['op'].get('off') == 'budget' and any(a[0] == 'Z' for a in st.get('actions', [])) and 'pos' in msg['c'] and any('יוקרה' in x for x in msg['cur']), (msg, h.get('op')))
    await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    # the same panel from the 💼 money hub
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=5000)
    row = await pg.evaluate("() => !!document.querySelector('#gmCard .mh-row[data-row=\"world\"] button[data-hub=\"world\"]')")
    check(sc, '💼 has the "עונות ותפוסה" row', row)
    if row:
        await pg.click('#gmCard .mh-row[data-row="world"] button[data-hub="world"]'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
        check(sc, '💼 → the world panel opens', await pg.locator('#gmCard.wpanel').count() == 1)
        await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    # the goal panel (passive12)
    await pg.click('#hGoalBtn'); await pg.wait_for_selector('#goalPanel:not([hidden])', timeout=5000)
    gp = await pg.evaluate("() => document.querySelector('#goalPanel').textContent")
    check(sc, 'goal panel: the 12-month rule, the gap per month and the ladder', '12' in gp and 'בממוצע' in gp and 'הדרך ליעד' in gp, gp[:300])
    await pg.click('#hGoalBtn'); await pg.wait_for_timeout(300)
    a0 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    check(sc, '3D: the city equals cityModels and every op-asset piece carries its occupancy level', a0['want'] == a0['scene'] and all(a0['levels'].get(k, {}).get('kind') == 'occ' and a0['levels'][k]['n'] == v['decile'] for k, v in a0['occ'].items()) and a0['occ'], a0)
    lv3 = await pg.evaluate("(k) => import('./js/scene.js').then((S) => S.levelOf ? S.levelOf(k) : null)", next(iter(a0['occ']), 'a1'))
    check(sc, '3D: the scene drew the occupancy level on the hotel', lv3 and lv3.get('kind') == 'occ', lv3)
    # save → reload → resume
    await pg.reload(); await pg.wait_for_selector('.lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
    await pg.click('.map-card[data-id="w5"]'); await pg.wait_for_selector('[data-act="continue-free"][data-id="w5"]', timeout=60000)
    await pg.click('[data-act="continue-free"][data-id="w5"]'); await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    a1 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    check(sc, 'after reload + resume: the same city and the same occupancy (engine = scene)', a1['want'] == a0['want'] and a1['want'] == a1['scene'] and a1['occ'] == a0['occ'] and all(a1['levels'].get(k, {}).get('n') == v['decile'] for k, v in a1['occ'].items()), (a0, a1))
    await ctx.close()

async def run_2d(b):
    """a fresh fixed-seed game on the 2D board (desk) + the panel on 390 / 360"""
    for vp in ('desk', 'phone', 'small'):
        sc = f'2d-{vp}'; ctx, pg = await page(b, vp, flags='?ff=board2d:on')
        await pg.evaluate(START, {'seed': 12})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(1500)
        await idle(pg)
        for _ in range(3): await pg.click('#roll'); await pg.wait_for_timeout(500); await idle(pg)
        a = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        card = await pg.evaluate("""() => { const c = [...document.querySelectorAll('.b2d-card')].find((x) => x.dataset.kind === 'occ'); return c ? { label: c.getAttribute('aria-label'), pips: (c.querySelector('.b2d-pips') || {}).textContent || '', lvl: c.dataset.level } : null; }""")
        k = next(iter(a['occ']), None)
        check(sc, '2D: the hotel card shows occupancy (window pips + "תפוסה N%" in its name) = the engine decile', card and k and 'תפוסה' in card['label'] and card['lvl'] == str(a['occ'][k]['decile']) and ('▮' in card['pips'] or '▯' in card['pips']), (card, a['occ']))
        mo = await pg.evaluate("() => getComputedStyle(document.body).getPropertyValue('--sky1')")
        check(sc, '2D: the w5 theme is on (body data-world=w5, golden-hour sky)', await pg.evaluate("() => document.body.dataset.world") == 'w5' and '#ffd6a5' in mo.lower(), mo)
        await shot(pg, f'board2d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)   # after the pop-in scale
        fit = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const r = c.getBoundingClientRect(); return { w: r.width, vw: innerWidth, over: document.documentElement.scrollWidth > innerWidth + 1, acts: [...c.querySelectorAll('button[data-wact]')].every((b) => b.getBoundingClientRect().height >= 43.5) }; }")
        check(sc, 'panel fits the width, every action button ≥ 44 px', fit['w'] <= fit['vw'] and not fit['over'] and fit['acts'], fit)
        if vp != 'desk': await shot(pg, f'panel_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_3dphone(b):
    """the 3D board on 390 / 360 (golden hour, palms, the procedural hotel) and the season chip fitting the HUD"""
    for vp in ('phone', 'small'):
        sc = f'3d-{vp}'; ctx, pg = await page(b, vp)
        await pg.evaluate(START, {'seed': 7})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        k = await pg.evaluate("import('./js/scene.js').then((S) => S.kind)")
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const r = b.getBoundingClientRect(), h = document.querySelector('#hWorld').getBoundingClientRect(); return { inside: r.left >= h.left - 1 && r.right <= h.right + 1, h: r.height }; }")
        check(sc, '3D board on a phone; the season chip stays inside its HUD card', k == '3d' and chip and chip['inside'], (k, chip))
        await shot(pg, f'board3d_{vp}')
        await ctx.close()

async def main():
    FB.banner(MODE)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        if want('map'): await run_map(b)
        if want('pick'): await run_pick(b)
        if want('play'): await run_play(b)
        if want('2d'): await run_2d(b)
        if want('3d'): await run_3dphone(b)
        await b.close()
    for s in SINKS: FB.assert_clean(s)
    check('all', 'no same-origin request failed (no 404)', not BAD, BAD[:10])
    fails = [r for r in RESULTS if not r[2]]
    log(f'{len(RESULTS) - len(fails)} passed, {len(fails)} failed, {len(ERRS)} page errors')
    for e in ERRS: log('ERR', e)
    sys.exit(1 if fails or ERRS else 0)

asyncio.run(main())
