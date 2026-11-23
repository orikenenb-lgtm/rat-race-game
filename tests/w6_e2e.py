# Worlds wave 2 — w6 אזור התעשייה end to end in the real page (lobby + game), offline fake backend + guard:
#   map   the 12-world map from P.worldMap(): w6 is a playable card (button) once w5 has a ★, w7–w12 stay "בקרוב" pins; what w6 teaches
#   pick  w6 card → its rules load (ensureWorldRules) → the character picker (opseng / heir / trader, pros / cons, icons) → a game starts in
#         w6 (body[data-world=w6], the 🏭 chip, no 404 / page error / failed model: the w6 models are procedural stand-ins)
#   play  a fixed-seed opseng game: rolls through a payday, deal cards with the plant block, a 'C' (חוזה אספקה) tile with the contract card;
#         the plant panel (3 gauges, hazard bars, line rows, maintenance / shift rows) from the HUD chip and from 💼; a maintenance action
#         through E.worldAction; the two-tap sale (the first tap changes nothing); the goal panel (₪80M); 3D city = cityModels with every
#         line's level (pips, light, running / ordered); save → reload → resume: the same city and the same line levels
#   2d    the 2D board on desk / 390 / 360: w6 board colours (WORLD_STYLE), line cards with pips + light + the accessible name; the
#         contract card and the panel fit the phone width
#   3d    the 3D board on 390 / 360; the chip stays inside its HUD card
#   motion reduced motion: the conveyors never move (the belt phase stays 0) while normal motion moves them
# Copies: SRC=<export> COPY_DIR=/tmp/ui6 PORT_BASE=10500 bash tests/serve_copies.sh
# Usage: python3 tests/w6_e2e.py [--real=http://localhost:10502/] [--shots=DIR] [--only=map,pick,play,2d,3d,motion]
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
PB = int(os.environ.get('PORT_BASE', '10500'))
REAL = OPT.get('real') or f'http://localhost:{PB + 2}/'
SHOTS = OPT.get('shots'); ONLY = set(OPT['only'].split(',')) if OPT.get('only') else None
want = lambda s: ONLY is None or s in ONLY
VP = {'desk': {'width': 1300, 'height': 820}, 'phone': {'width': 390, 'height': 844}, 'small': {'width': 360, 'height': 740}}
ARGS = FB.chrome_args(MODE, ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
STARS = json.dumps({'w1': 1, 'w2': 1, 'w3': 1, 'w4': 1, 'w5': 1})
SEED = ("localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-tips-off','1'); localStorage.setItem('rr2-reveal', 'all');"
        "localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true,w5:true,w6:true}));")
UNLOCK = ("(() => { if (localStorage.getItem('rr2-progress')) return; localStorage.setItem('rr2-progress', JSON.stringify({ v: 1, stars: %s, best: {}, achievements: [], pawn: 'classic',"
          " seenWorlds: ['w1','w2','w3','w4','w5'], onboarded: true, tutorialDone: true, gamesPlayed: 5, wins: 5 })); })();" % STARS)
RESULTS = []; ERRS = []; SINKS = []; BAD = []
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def check(sc, name, cond, detail=''):
    RESULTS.append((sc, name, bool(cond))); log(('PASS' if cond else 'FAIL'), f'[{sc}]', name, '' if cond else str(detail)[:600]); return bool(cond)

STATE = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden, gm: !document.querySelector('#gm').hidden,
  gmCls: document.querySelector('#gmCard').className, start: !document.querySelector('#start').hidden, type: (document.querySelector('#evCard').className.match(/ev-(\\w+)/)||[])[1]||null,
  month: (document.querySelector('#hMonth')||{}).textContent || '' })"""
CARD = """() => { const c = document.querySelector('#evCard'); return { title: (c.querySelector('h2') || {}).textContent || '', opts: [...c.querySelectorAll('button[data-o]')].map((b) => b.dataset.o),
  text: c.textContent, mt: c.querySelectorAll('.mt > div').length, warn: !!c.querySelector('.warn') }; }"""

async def page(b, vp, flags='', unlock=True, reduced=False):
    kw = FB.new_context_kwargs()
    if reduced: kw['reduced_motion'] = 'reduce'
    ctx = await b.new_context(viewport=VP[vp], device_scale_factor=1, has_touch=vp != 'desk', is_mobile=vp != 'desk', **kw)
    SINKS.append(await FB.install_mode(ctx, FB.FakeBackend() if MODE == 'offline' else None, MODE))
    await ctx.add_init_script(SEED + (UNLOCK if unlock else ''))
    pg = await ctx.new_page(); pg.set_default_timeout(120000)
    pg.on('pageerror', lambda e: (ERRS.append(f'{vp} pageerror: {e}'), log('PAGEERR', e)))
    # never a missing file: every same-origin response must be < 400 (the w6 models are procedural, the card art generated)
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

async def idle(pg, timeout=150, stop_on=None, seen=None):
    """answer cards / dialogs with the mentor's highlighted choice until the roll button is back (or a card of type `stop_on` is open).
       seen: a dict — the first deal card that carries the plant block is recorded there (seen['deal'])"""
    t0 = time.time()
    while time.time() - t0 < timeout:
        await quiet(pg)
        s = await pg.evaluate(STATE)
        if stop_on and s['card'] and s['type'] == stop_on: return s
        if s['gm']:
            b = pg.locator('#gm .acts button.primary:not([disabled])')
            if await b.count(): await b.first.click(); await pg.wait_for_timeout(300); continue
        if s['card']:
            if seen is not None and s['type'] == 'deal' and 'deal' not in seen:
                c = await pg.evaluate(CARD)
                if 'מצב הקו' in c['text']:
                    seen['deal'] = c
                    if SHOTS: await pg.evaluate("() => document.querySelector('#evCard .plantmini')?.scrollIntoView({ block: 'center' })"); await pg.wait_for_timeout(2500)
                    await shot(pg, seen.get('dealName', 'deal_card_desk'))
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
    line: (c.querySelector('.map-line') || {}).textContent || '', gen: !!c.querySelector('.gen-art'), buttons: c.querySelectorAll('button').length + (c.tagName === 'BUTTON' ? 1 : 0) })); }"""

async def run_map(b):
    for vp in ('desk', 'small'):
        sc = f'map-{vp}'; ctx, pg = await page(b, vp)
        cards = await pg.evaluate(MAP)
        meta = await pg.evaluate("import('./js/progress.js').then((P) => P.worldMap().map((m) => ({ id: m.id, playable: m.playable, unlocked: m.unlocked })))")
        pm = [m['id'] for m in meta if m['playable']]
        check(sc, 'meta: w1–w6 playable (later worlds as their meta says; the map and the UI agree)', pm[:6] == ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'], pm)
        check(sc, 'the map renders every P.worldMap() entry in order (12)', [c['id'] for c in cards] == [m['id'] for m in meta] and len(cards) == 12, [c['id'] for c in cards])
        w6 = next((c for c in cards if c['id'] == 'w6'), None)
        check(sc, 'w6 is a playable card (button, data-act=world), unlocked by ★ in w5, shows what it teaches + difficulty + generated art',
              w6 and w6['tag'] == 'BUTTON' and w6['act'] == 'world' and not w6['soon'] and not w6['locked'] and 'מינוף תפעולי' in w6['learn'] and w6['diff'] and w6['gen'], w6)
        soon = [c for c in cards if c['soon']]
        planned = [m['id'] for m in meta if not m['playable']]
        check(sc, 'planned worlds stay "בקרוב" pins (no button, no data-act)', [c['id'] for c in soon] == planned and 'w6' not in planned and all(c['tag'] != 'BUTTON' and c['buttons'] == 0 for c in soon), soon)
        tr = await pg.evaluate("() => ({ n: document.querySelectorAll('.map-trail li').length, soon: (document.querySelector('.map-trail li.soon') || {}).textContent || '' })")
        check(sc, f'the trail: {len(pm)} playable worlds + "🔜 {len(planned)}"', tr['n'] == len(pm) + (1 if planned else 0) and (not planned or str(len(planned)) in tr['soon']), tr)
        if vp == 'desk':
            # without a ★ in w5, w6 is locked and says how to open it
            r = await pg.evaluate("""async () => { const P = await import('./js/progress.js'); P._reset && P._reset({ ...P.getProgress(), stars: { w1: 1, w2: 1, w3: 1, w4: 1, w5: 0 } });
              const m = P.worldMap().find((x) => x.id === 'w6'); const back = P._reset && P._reset({ ...P.getProgress(), stars: %s }); return { unlocked: m.unlocked, lock: m.lockText }; }""" % STARS)
            check(sc, 'w6 needs a ★ in w5 (locked without it, "★ בעיר התיירות")', r['unlocked'] is False and 'עיר התיירות' in (r['lock'] or ''), r)
        await ctx.close()

async def run_pick(b):
    sc = 'pick-desk'; ctx, pg = await page(b, 'desk')
    pre = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w6'))")
    check(sc, 'w6 rules are not loaded at boot (lazy)', pre is False, pre)
    await pg.click('.map-card[data-id="w6"]')
    await pg.wait_for_selector('.wv-char[data-w="w6"]', timeout=60000)
    info = await pg.evaluate("""() => ({ chars: [...document.querySelectorAll('.wv-char')].map((c) => c.dataset.c), h1: document.querySelector('.wv-hero h1').textContent,
      icons: [...document.querySelectorAll('.wv-char .wv-ic')].map((x) => x.textContent), learn: !!document.querySelector('.wv-learn'), goal: (document.querySelector('.wv-goal') || {}).textContent || '',
      pros: document.querySelectorAll('.wv-char .wv-str').length, cons: document.querySelectorAll('.wv-char .wv-weak').length })""")
    info['loaded'] = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w6'))")
    check(sc, 'the picker waits for the rules, then lists the 3 w6 characters', info['loaded'] and info['chars'] == ['opseng', 'heir', 'trader'] and info['h1'] == 'אזור התעשייה', info)
    check(sc, 'character icons: ⚙️ / 🏭 / 📦 (never the 🙂 fallback); pros / cons; the ₪80M goal', info['icons'] == ['⚙️', '🏭', '📦'] and info['pros'] >= 3 and info['cons'] >= 3 and '80' in info['goal'], info)
    await shot(pg, 'picker_desk')
    await pg.click('.wv-go[data-c="opseng"]')
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500); await quiet(pg)
    await idle(pg)
    g = await pg.evaluate("""() => ({ world: document.body.dataset.world, chip: (document.querySelector('#worldPanelBtn') || {}).textContent || '', sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim() })""")
    g['cfg'] = await pg.evaluate("import('./js/game.js').then((G) => G.activeConfig())")
    check(sc, 'a w6 game started from the picker (opseng, free), the haze sky', g['world'] == 'w6' and g['cfg'] and g['cfg']['worldId'] == 'w6' and g['cfg']['charId'] == 'opseng' and g['sky'].lower() == '#cfd8dc', g)
    check(sc, 'the HUD shows the 🏭 lines chip (lines / slots)', '🏭' in g['chip'] and '/6' in g['chip'], g['chip'])
    fails = await pg.evaluate("import('./js/scene.js').then((S) => S.failedModels ? S.failedModels() : [])")
    check(sc, 'no model failed (w6 stand-ins are procedural: nothing was fetched for them)', not fails, fails)
    glb = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().glb)")
    check(sc, 'no w6 .glb was ever requested', not any('/w6/' in u for u in glb), glb)
    await ctx.close()

START = """async ({ seed, ch }) => { const E = await import('./js/engine.js'); await E.ensureWorld('w6'); const G = await import('./js/game.js'); await G.initGame();
  G.startGame({ worldId: 'w6', charId: ch || 'opseng', mode: 'free', seed, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true, resume: false }); return true; }"""
SAVED = "() => { const r = JSON.parse(localStorage.getItem('rr2-save-free-w6') || 'null'); return r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); }"
PANEL = """() => { const c = document.querySelector('#gmCard'); return { gauges: [...c.querySelectorAll('.wp-g')].map((g) => g.dataset.g), bars: c.querySelectorAll('.wp-bars li').length,
  rows: c.querySelectorAll('.wp-row').length, acts: c.querySelectorAll('button[data-wact]').length, segs: [...c.querySelectorAll('.wp-seg')].map((x) => x.getAttribute('aria-label')),
  title: (c.querySelector('h2') || {}).textContent || '', now: (c.querySelector('.wp-now') || {}).textContent || '', exact: /\\d%/.test((c.querySelector('.wp-bars') || {}).textContent || '') }; }"""

def lines_of(st):
    return [a for a in (st or {}).get('assets', []) if a.get('op') and a['op'].get('lk')]

async def run_play(b):
    sc = 'play-desk'; ctx, pg = await page(b, 'desk')
    await pg.evaluate(START, {'seed': 7, 'ch': 'opseng'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    st0 = await pg.evaluate(SAVED); m0 = st0['month'] if st0 else 1
    await shot(pg, 'board3d_desk')
    seen = {}; saw_c = None; paid = False
    for i in range(45):
        await pg.click('#roll'); await pg.wait_for_timeout(600)
        s = await idle(pg, stop_on='mech', seen=seen)
        st = await pg.evaluate(SAVED)
        if st and st['month'] > m0: paid = True
        if s['card'] and s['type'] == 'mech':
            saw_c = await pg.evaluate(CARD)
            await shot(pg, 'contract_card_desk')
            if 'accept' in saw_c['opts']:
                await pg.locator('#evCard button[data-o="accept"]').click(); await pg.wait_for_timeout(800)
            s = await idle(pg)
            break
    check(sc, 'rolled through a payday', paid)
    d = seen.get('deal')
    check(sc, 'a production-line deal card shows the plant block (condition, breakdown risk, boom / normal / recession, fixed costs)',
          d and 'מצב הקו' in d['text'] and 'סיכ' in d['text'] and 'בגאות' in d['text'] and 'במיתון' in d['text'] and 'עלויות קבועות' in d['text'] and d['mt'] >= 3, d and d['text'][:400])
    check(sc, "landed on a 'C' tile: the contract card (share, months, price, the 3 market states, penalty; accept / counter / decline)",
          saw_c and 'חוזה' in saw_c['title'] and {'accept', 'decline'} <= set(saw_c['opts']) and 'מהקיבולת' in saw_c['text'] and 'קנס' in saw_c['text'] and 'במיתון' in saw_c['text'] and saw_c['mt'] == 3, saw_c and (saw_c['title'], saw_c['opts'], saw_c['text'][:400]))
    st = await pg.evaluate(SAVED)
    if saw_c and 'accept' in saw_c['opts']:
        check(sc, 'signing reached the engine (op.contract on a line)', any(a['op'].get('contract') for a in lines_of(st)), [a['op'].get('contract') for a in lines_of(st)])
    if SHOTS:   # the whole park from above (overview camera), then back to the follow camera
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('overview'))"); await pg.wait_for_timeout(1800); await shot(pg, 'board3d_desk_overview')
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('follow'))"); await pg.wait_for_timeout(800)
    # the plant panel from the HUD chip
    await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
    P = await pg.evaluate(PANEL)
    nl = len(lines_of(st))
    check(sc, 'panel: 3 gauges (util / coverage / runway), one hazard bar + one row per line, maintenance + shift rows, actions',
          P['gauges'] == ['util', 'coverage', 'runway'] and P['bars'] == nl and P['rows'] == nl and nl >= 1 and P['segs'].count('תחזוקה') == P['segs'].count('משמרות') >= 1 and P['acts'] >= 8 and 'קווי ייצור' in P['title'], (nl, P))
    check(sc, 'opseng sees the exact breakdown chance in the bars', P['exact'], P)
    if SHOTS: await pg.wait_for_timeout(3500)   # let a news toast pass before the picture
    await shot(pg, 'panel_desk')
    # a maintenance action through E.worldAction
    a1 = lines_of(st)[0]; tgt = 'run' if a1['op'].get('maint') != 'run' else 'basic'
    word = {'run': 'עד שזה נשבר', 'basic': 'בסיסית', 'preventive': 'מונעת'}[tgt]
    idx = await pg.evaluate("""(w) => { const b = [...document.querySelectorAll('#gmCard .wp-ag')][0]; const x = [...b.querySelectorAll('button[data-wact]')]; const k = x.findIndex((y) => y.dataset.aid === 'maint' && y.textContent.includes(w) && !y.disabled); return k < 0 ? -1 : +x[k].dataset.wact; }""", word)
    check(sc, f'the maintenance policy "{word}" is offered for the first line', idx >= 0, idx)
    if idx >= 0:
        await pg.locator(f'#gmCard button[data-wact="{idx}"]').click(); await pg.wait_for_timeout(900)
        msg = await pg.evaluate("() => { const m = document.querySelector('#gmCard .wp-msg'); return { t: m.textContent, c: m.className }; }")
        st = await pg.evaluate(SAVED); h = next((a for a in lines_of(st) if a['id'] == a1['id']), {})
        check(sc, 'the action went through E.worldAction (engine op.maint changed, logged Z, panel redrawn with a ✓)', h.get('op', {}).get('maint') == tgt and any(a[0] == 'Z' for a in st.get('actions', [])) and 'pos' in msg['c'], (msg, h.get('op', {}).get('maint')))
    # the two-tap sale: the first tap only arms the button
    sell = await pg.evaluate("() => { const b = document.querySelector('#gmCard button[data-aid=\"sellLine\"]:not([disabled])'); return b ? +b.dataset.wact : -1; }")
    if sell >= 0:
        n0 = len(lines_of(await pg.evaluate(SAVED)))
        await pg.locator(f'#gmCard button[data-wact="{sell}"]').click(); await pg.wait_for_timeout(500)
        r = await pg.evaluate("() => ({ arm: !!document.querySelector('#gmCard button[data-arm=\"1\"]'), msg: document.querySelector('#gmCard .wp-msg').textContent })")
        n1 = len(lines_of(await pg.evaluate(SAVED)))
        check(sc, 'selling a line needs a second tap (the first one arms the button and sells nothing)', r['arm'] and 'אי אפשר לבטל' in r['msg'] and n1 == n0, (r, n0, n1))
    await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    # 💼 → the same panel
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=5000)
    row = await pg.evaluate("() => { const r = document.querySelector('#gmCard .mh-row[data-row=\"world\"]'); return r ? r.textContent : null; }")
    check(sc, '💼 has the "קווי ייצור" row (lines / slots)', row and 'קווי ייצור' in row and 'מתוך 6 קווים' in row, row)
    if row:
        await pg.click('#gmCard .mh-row[data-row="world"] button[data-hub="world"]'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
        check(sc, '💼 → the plant panel opens', await pg.locator('#gmCard.wpanel').count() == 1)
        await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    # the goal panel (net worth ₪80M)
    await pg.click('#hGoalBtn'); await pg.wait_for_selector('#goalPanel:not([hidden])', timeout=5000)
    gp = await pg.evaluate("() => document.querySelector('#goalPanel').textContent")
    check(sc, 'goal panel: net worth ₪80 מיליון, the gap and the ladder', '80 מיליון' in gp and 'שווי נקי' in gp and 'הדרך ליעד' in gp, gp[:300])
    await pg.click('#hGoalBtn'); await pg.wait_for_timeout(300)
    a0 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    lv_ok = all(a0['levels'].get(k, {}).get('kind') == 'plant' and a0['levels'][k]['n'] == v['pips'] and a0['levels'][k]['light'] == v['light'] and bool(a0['levels'][k].get('pending')) == v['pending'] for k, v in a0['plant'].items())
    check(sc, '3D: the city equals cityModels and every line carries its level (pips, light, ordered)', a0['want'] == a0['scene'] and a0['plant'] and lv_ok, a0)
    models = {}
    for k in a0['plant']:
        models[k] = await pg.evaluate("(k) => import('./js/scene.js').then((S) => S.levelOf ? S.levelOf(k) : null)", k)
    mo_ok = all(models[k] and models[k].get('model') and models[k]['model']['pipsLit'] == (0 if v['pending'] else v['pips']) and models[k]['model']['ghost'] == v['pending']
                and models[k]['model']['light'] == ('off' if v['pending'] or v['mothball'] else 'red' if v['down'] else v['light']) for k, v in a0['plant'].items())
    check(sc, '3D: each stand-in drew its lamp, pips and ordered frame from the engine (scene.levelOf model)', mo_ok, {k: (models[k] or {}).get('model') for k in models})
    # save → reload → resume
    await pg.reload(); await pg.wait_for_selector('.lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
    await pg.click('.map-card[data-id="w6"]'); await pg.wait_for_selector('[data-act="continue-free"][data-id="w6"]', timeout=60000)
    await pg.click('[data-act="continue-free"][data-id="w6"]'); await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    a1 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    check(sc, 'after reload + resume: the same city and the same line levels (engine = scene)', a1['want'] == a0['want'] and a1['want'] == a1['scene'] and a1['plant'] == a0['plant'] and all(a1['levels'].get(k, {}).get('n') == v['pips'] for k, v in a1['plant'].items()), (a0, a1))
    await ctx.close()

async def run_2d(b):
    """a fixed-seed game on the 2D board: line cards, the contract card on phones, the panel fitting 390 / 360"""
    for vp in ('desk', 'phone', 'small'):
        sc = f'2d-{vp}'; ctx, pg = await page(b, vp, flags='?ff=board2d:on')
        await pg.evaluate(START, {'seed': 7, 'ch': 'opseng'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(1500)
        await idle(pg)
        saw_c = None
        for i in range(45 if vp != 'desk' else 4):
            await pg.click('#roll'); await pg.wait_for_timeout(400)
            s = await idle(pg, stop_on='mech' if vp != 'desk' else None)
            if s['card'] and s['type'] == 'mech':
                saw_c = await pg.evaluate(CARD)
                fit = await pg.evaluate("() => { const c = document.querySelector('#evCard').getBoundingClientRect(); return c.width <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#evCard .grid .row')].every((r) => r.scrollWidth <= r.clientWidth + 1); }")
                check(sc, 'the contract card fits the phone width, no row overflows (3 market states)', fit and saw_c['mt'] == 3, saw_c and saw_c['text'][:200])
                await shot(pg, f'contract_card_{vp}')
                await pg.locator('#evCard button[data-o="decline"]').click(); await pg.wait_for_timeout(600)
                await idle(pg); break
        if vp != 'desk': check(sc, "reached a 'C' tile on the 2D board", saw_c is not None)
        a = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        cards = await pg.evaluate("""() => [...document.querySelectorAll('.b2d-card')].filter((x) => x.dataset.kind === 'plant').map((c) => ({ key: c.dataset.key, label: c.getAttribute('aria-label'),
          pips: (c.querySelector('.b2d-pips') || {}).textContent || '', corner: (c.querySelector('.b2d-corner-b') || {}).textContent || '', lvl: c.dataset.level, light: c.dataset.light }))""")
        good = cards and all((a['plant'].get(c['key']) or {}).get('pips') == int(c['lvl']) and ('מצב' in c['label'] or 'בדרך' in c['label']) and (c['pips'] in ('⏳',) or '●' in c['pips'] or '○' in c['pips']) and c['corner'] for c in cards) and len(cards) == len(a['plant'])
        check(sc, '2D: every line card shows its condition (pips + light corner + "מצב …" in its name) = the engine', good, (cards, a['plant']))
        th = await pg.evaluate("() => ({ world: document.body.dataset.world, sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(), board: ((document.querySelector('[class*=b2d-m-]') || {}).style || { getPropertyValue: () => '' }).getPropertyValue('--b2d-board').trim() })")
        check(sc, '2D: the w6 look (data-world=w6, haze sky, concrete board from WORLD_STYLE)', th['world'] == 'w6' and th['sky'].lower() == '#cfd8dc' and th['board'].lower() == '#c9cbcc', th)
        await shot(pg, f'board2d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        fit = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const r = c.getBoundingClientRect(); return { w: r.width, vw: innerWidth, over: document.documentElement.scrollWidth > innerWidth + 1, acts: [...c.querySelectorAll('button[data-wact]')].every((b) => b.getBoundingClientRect().height >= 43.5) }; }")
        check(sc, 'panel fits the width, every action button ≥ 44 px', fit['w'] <= fit['vw'] and not fit['over'] and fit['acts'], fit)
        if vp != 'desk': await shot(pg, f'panel_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_3dphone(b):
    for vp in ('phone', 'small'):
        sc = f'3d-{vp}'; ctx, pg = await page(b, vp)
        await pg.evaluate(START, {'seed': 7, 'ch': 'heir'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        k = await pg.evaluate("import('./js/scene.js').then((S) => S.kind)")
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const r = b.getBoundingClientRect(), h = document.querySelector('#hWorld').getBoundingClientRect(); return { inside: r.left >= h.left - 1 && r.right <= h.right + 1, h: r.height, t: b.textContent }; }")
        check(sc, '3D board on a phone; the 🏭 chip stays inside its HUD card', k == '3d' and chip and chip['inside'] and '🏭' in chip['t'], (k, chip))
        await shot(pg, f'board3d_{vp}')
        await ctx.close()

async def run_motion(b):
    """the conveyors move with normal motion and never with reduced motion (the belt phase of a running line)"""
    for red in (False, True):
        sc = 'motion-' + ('reduced' if red else 'normal'); ctx, pg = await page(b, 'desk', reduced=red)
        await pg.evaluate(START, {'seed': 7, 'ch': 'opseng'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        # software GL resolves the 'low' tier (no updaters at all); 'mid' runs them — the only difference left between the two runs is motion
        await pg.evaluate("import('./js/scene.js').then((S) => S.setQuality('mid'))"); await pg.wait_for_timeout(800)
        for _ in range(2): await pg.click('#roll'); await pg.wait_for_timeout(500); await idle(pg)
        lv = await pg.evaluate("import('./js/scene.js').then((S) => ({ red: S.perfStats().reduced, tier: S.getQuality(), a1: S.levelOf('a1') }))")
        ph = ((lv['a1'] or {}).get('model') or {}).get('beltPhase')
        running = ((lv['a1'] or {}).get('model') or {}).get('conveyor')
        if red: check(sc, 'reduced motion: the running line\'s conveyor never moved (belt phase 0)', lv['red'] and running and ph == 0, lv)
        else: check(sc, 'normal motion: the running line\'s conveyor moved while the scene animated', not lv['red'] and running and ph and ph > 0, lv)
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
        if want('motion'): await run_motion(b)
        await b.close()
    for s in SINKS: FB.assert_clean(s)
    check('all', 'no same-origin request failed (no 404)', not BAD, BAD[:10])
    fails = [r for r in RESULTS if not r[2]]
    log(f'{len(RESULTS) - len(fails)} passed, {len(fails)} failed, {len(ERRS)} page errors')
    for e in ERRS: log('ERR', e)
    sys.exit(1 if fails or ERRS else 0)

asyncio.run(main())
