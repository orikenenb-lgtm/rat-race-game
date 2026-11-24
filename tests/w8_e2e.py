# Worlds wave 3 — w8 מטרופולין הנדל"ן end to end in the real page (lobby + game), offline fake backend + guard:
#   pick  w8 card → its rules load → the character picker (developer / landowner / contractor, pros / cons, 🏗️ 🌾 👷) → a game starts in w8
#         (body[data-world=w8], the 🏗️ chip, no 404 / page error / failed model: the w8 models are procedural, the background cranes are
#         w3's crane.glb)
#   play  a fixed-seed developer game: rolls through a payday to a 'Q' (קרקע לפרויקט) tile — the land card (units, list price, land / down /
#         land loan, permit range, stages, equity, the presale gate, rate + demand, cash after vs equity still owed, both contractors' cost /
#         overrun / failure risk / margin, the check fee); the permit check keeps the card open and narrows the permit; the projects panel
#         (3 gauges, the timeline, the equity-call calendar, a row per project, the presale row) from the HUD chip and from 💼; a presale
#         target through E.worldAction; the two-tap sale to a rival; the goal panel (₪250M at cost); 3D city = cityModels with every site's
#         level (slabs, crane, tarp, permit board, presale banner); save → reload → resume: the same city and the same levels
#   2d    the 2D board on desk / 390 / 360 (landowner: plots + a project): w8 colours, site cards with % + corner + the accessible name; the
#         land card and the panel fit the phone width, every panel button ≥ 44 px
#   3d    the 3D board on 390 / 360; the chip stays inside its HUD card
#   motion a working site's crane turns with normal motion and never with reduced motion
# Copies: SRC=<export> COPY_DIR=/tmp/ui78 PORT_BASE=10800 bash tests/serve_copies.sh
# Usage: python3 tests/w8_e2e.py [--real=http://localhost:10802/] [--shots=DIR] [--only=pick,play,2d,3d,motion]
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
PB = int(os.environ.get('PORT_BASE', '10800'))
REAL = OPT.get('real') or f'http://localhost:{PB + 2}/'
SHOTS = OPT.get('shots'); ONLY = set(OPT['only'].split(',')) if OPT.get('only') else None
want = lambda s: ONLY is None or s in ONLY
VP = {'desk': {'width': 1300, 'height': 820}, 'phone': {'width': 390, 'height': 844}, 'small': {'width': 360, 'height': 740}}
ARGS = FB.chrome_args(MODE, ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
STARS = json.dumps({'w1': 1, 'w2': 1, 'w3': 1, 'w4': 1, 'w5': 1})
SEED = ("localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-tips-off','1'); localStorage.setItem('rr2-reveal', 'all');"
        "localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true,w5:true,w6:true,w7:true,w8:true}));")
UNLOCK = ("(() => { if (localStorage.getItem('rr2-progress')) return; localStorage.setItem('rr2-progress', JSON.stringify({ v: 1, stars: %s, best: {}, achievements: [], pawn: 'classic',"
          " seenWorlds: ['w1','w2','w3','w4','w5'], onboarded: true, tutorialDone: true, gamesPlayed: 5, wins: 5 })); })();" % STARS)
RESULTS = []; ERRS = []; SINKS = []; BAD = []
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def check(sc, name, cond, detail=''):
    RESULTS.append((sc, name, bool(cond))); log(('PASS' if cond else 'FAIL'), f'[{sc}]', name, '' if cond else str(detail)[:700]); return bool(cond)

STATE = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden, gm: !document.querySelector('#gm').hidden,
  gmCls: document.querySelector('#gmCard').className, start: !document.querySelector('#start').hidden, type: (document.querySelector('#evCard').className.match(/ev-(\\w+)/)||[])[1]||null,
  month: (document.querySelector('#hMonth')||{}).textContent || '' })"""
CARD = """() => { const c = document.querySelector('#evCard'); return { title: (c.querySelector('h2') || {}).textContent || '', opts: [...c.querySelectorAll('button[data-o]')].map((b) => b.dataset.o),
  en: [...c.querySelectorAll('button[data-o]:not([disabled])')].map((b) => b.dataset.o), text: c.textContent, mt: c.querySelectorAll('.mt > div').length, warn: !!c.querySelector('.warn'), land: !!c.querySelector('.landmini') }; }"""

AXE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vendor', 'axe-core', 'axe.min.js')
async def axe_bad(pg, sel):
    """axe-core (vendored, no network) on one element after its animations end: the critical / serious violations"""
    await pg.evaluate("() => Promise.race([Promise.all(document.getAnimations().filter((a) => { const t = a.effect && a.effect.getTiming(); return t && t.iterations !== Infinity && a.playState === 'running'; }).map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 3000))])")
    if not await pg.evaluate("typeof axe !== 'undefined'"): await pg.add_script_tag(path=AXE)
    v = await pg.evaluate("""async (sel) => { const r = await axe.run({ include: [sel] }, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'] }, resultTypes: ['violations'] });
      return r.violations.filter((x) => x.impact === 'critical' || x.impact === 'serious').map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.map((n) => n.target.join(' ')).slice(0, 4) })); }""", sel)
    return v

async def page(b, vp, flags='', unlock=True, reduced=False):
    kw = FB.new_context_kwargs()
    if reduced: kw['reduced_motion'] = 'reduce'
    ctx = await b.new_context(viewport=VP[vp], device_scale_factor=1, has_touch=vp != 'desk', is_mobile=vp != 'desk', **kw)
    SINKS.append(await FB.install_mode(ctx, FB.FakeBackend() if MODE == 'offline' else None, MODE))
    await ctx.add_init_script(SEED + (UNLOCK if unlock else ''))
    pg = await ctx.new_page(); pg.set_default_timeout(120000)
    pg.on('pageerror', lambda e: (ERRS.append(f'{vp} pageerror: {e}'), log('PAGEERR', e)))
    # never a missing file: every same-origin response must be < 400 (the w8 models are procedural (+ w3's crane.glb), the card art generated)
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
       seen: a dict — the first deal card that carries the project block is recorded there (seen['deal'])"""
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
                if 'שלבים' in c['text'] and 'יחידות' in c['text']: seen['deal'] = c
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


async def run_pick(b):
    sc = 'pick-desk'; ctx, pg = await page(b, 'desk')
    pre = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w8'))")
    check(sc, 'w8 rules are not loaded at boot (lazy)', pre is False, pre)
    await pg.click('.map-card[data-id="w8"]')
    await pg.wait_for_selector('.wv-char[data-w="w8"]', timeout=60000)
    info = await pg.evaluate("""() => ({ chars: [...document.querySelectorAll('.wv-char')].map((c) => c.dataset.c), h1: document.querySelector('.wv-hero h1').textContent,
      icons: [...document.querySelectorAll('.wv-char .wv-ic')].map((x) => x.textContent), goal: (document.querySelector('.wv-goal') || {}).textContent || '',
      pros: document.querySelectorAll('.wv-char .wv-str').length, cons: document.querySelectorAll('.wv-char .wv-weak').length })""")
    info['loaded'] = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w8'))")
    check(sc, 'the picker waits for the rules, then lists the 3 w8 characters', info['loaded'] and info['chars'] == ['developer', 'landowner', 'contractor'] and info['h1'] == 'מטרופולין הנדל"ן', info)
    check(sc, 'character icons 🏗️ / 🌾 / 👷 (never the 🙂 fallback); pros / cons; the ₪250M goal', info['icons'] == ['🏗️', '🌾', '👷'] and info['pros'] >= 3 and info['cons'] >= 3 and '250' in info['goal'], info)
    await shot(pg, 'picker_desk')
    await pg.click('.wv-go[data-c="developer"]')
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500); await quiet(pg)
    await idle(pg)
    g = await pg.evaluate("""() => ({ world: document.body.dataset.world, chip: (document.querySelector('#worldPanelBtn') || {}).textContent || '', sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(),
      ink: getComputedStyle(document.body).getPropertyValue('--accent-ink').trim() })""")
    g['cfg'] = await pg.evaluate("import('./js/game.js').then((G) => G.activeConfig())")
    check(sc, 'a w8 game started from the picker (developer, free), the clear-day sky', g['world'] == 'w8' and g['cfg'] and g['cfg']['worldId'] == 'w8' and g['cfg']['charId'] == 'developer' and g['sky'].lower() == '#fde68a', g)
    check(sc, 'the HUD shows the 🏗️ projects chip (open projects, the rate)', '🏗️' in g['chip'] and '4.5%' in g['chip'], g['chip'])
    fails = await pg.evaluate("import('./js/scene.js').then((S) => S.failedModels ? S.failedModels() : [])")
    check(sc, 'no model failed (w8 stand-ins are procedural; the background crane is w3/crane.glb)', not fails, fails)
    glb = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().glb)")
    check(sc, 'no w8 .glb was ever requested (only w3/crane for the background)', not any('/w8/' in u for u in glb) and all('w3/crane' in u for u in glb if '/w3/' in u), glb)
    await ctx.close()

START = """async ({ seed, ch }) => { const E = await import('./js/engine.js'); await E.ensureWorld('w8'); const G = await import('./js/game.js'); await G.initGame();
  G.startGame({ worldId: 'w8', charId: ch || 'developer', mode: 'free', seed, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true, resume: false }); return true; }"""
SAVED = "() => { const r = JSON.parse(localStorage.getItem('rr2-save-free-w8') || 'null'); return r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); }"
PANEL = """() => { const c = document.querySelector('#gmCard'); return { gauges: [...c.querySelectorAll('.wp-g')].map((g) => g.dataset.g), rows: c.querySelectorAll('.wp-row').length,
  gantt: [...c.querySelectorAll('.wp-gantt li')].map((x) => ({ a: x.dataset.asset, name: (x.querySelector('.gbarw') || {}).getAttribute ? x.querySelector('.gbarw').getAttribute('aria-label') : '', cells: x.querySelectorAll('.gs').length })),
  calls: c.querySelectorAll('.wp-calls li').length, acts: c.querySelectorAll('button[data-wact]').length, segs: [...c.querySelectorAll('.wp-seg')].map((x) => x.getAttribute('aria-label')),
  title: (c.querySelector('h2') || {}).textContent || '', now: (c.querySelector('.wp-now') || {}).textContent || '', text: c.textContent }; }"""

def ck_of(st, ck):
    return [a for a in (st or {}).get('assets', []) if a.get('op') and a['op'].get('ck') == ck]

async def roll_to(pg, kind, n=45, seen=None):
    st0 = await pg.evaluate(SAVED); m0 = st0['month'] if st0 else 1; paid = False
    for i in range(n):
        await pg.click('#roll'); await pg.wait_for_timeout(600)
        s = await idle(pg, stop_on=kind, seen=seen)
        st = await pg.evaluate(SAVED)
        if st and st['month'] > m0: paid = True
        if s['card'] and s['type'] == kind: return await pg.evaluate(CARD), paid
    return None, paid

async def run_play(b):
    sc = 'play-desk'; ctx, pg = await page(b, 'desk')
    await pg.evaluate(START, {'seed': 7, 'ch': 'developer'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    await shot(pg, 'board3d_desk')
    seen = {}
    land, paid = await roll_to(pg, 'mech', seen=seen)
    check(sc, 'rolled through a payday', paid)
    check(sc, "landed on a 'Q' tile: the land card (units + list, land / down / bank, permit, stages, equity, the presale gate, rate · demand, cash after vs equity owed, both contractors)",
          land and 'קרקע לפרויקט' in land['text'] and land['land'] and {'reliable', 'cheap', 'pass'} <= set(land['opts']) and 'יחידות' in land['text'] and 'מחירון' in land['text'] and 'מקדמה' in land['text']
          and 'היתר בנייה' in land['text'] and 'שלבים' in land['text'] and 'הון עצמי' in land['text'] and 'הלוואת הבנייה' in land['text'] and 'ריבית במשק' in land['text'] and 'מזומן אחרי המקדמה' in land['text']
          and 'קבלן אמין' in land['text'] and 'קבלן זול' in land['text'] and 'סיכון לקריסה' in land['text'] and land['mt'] == 2, land and (land['title'], land['opts'], land['text'][:500]))
    if land and 'check' in land['opts']:
        check(sc, 'unchecked: the permit range says so, the check fee is named', '(לא נבדק)' in land['text'] and 'בדיקת תב"ע' in land['text'], land['text'][:300])
        bad = await axe_bad(pg, '#evm'); check(sc, 'axe: the land card has no critical / serious violation', not bad, bad)
        if SHOTS: await pg.evaluate("() => document.querySelector('#evCard .landmini')?.scrollIntoView({ block: 'center' })"); await pg.wait_for_timeout(1500)
        await shot(pg, 'land_card_desk')
        if 'check' in land['en']:
            await pg.locator('#evCard button[data-o="check"]').click(); await pg.wait_for_timeout(1200)
            s2 = await pg.evaluate(STATE); c2 = await pg.evaluate(CARD)
            check(sc, 'the permit check keeps the card open and redraws it: "(אחרי בדיקה)", no check option', s2['card'] and s2['type'] == 'mech' and '(אחרי בדיקה)' in c2['text'] and 'check' not in c2['opts'], (s2, c2['opts'], c2['text'][:300]))
            land = c2
    else: await shot(pg, 'land_card_desk')
    n0 = len(ck_of(await pg.evaluate(SAVED), 'proj'))
    pick = 'reliable' if land and 'reliable' in land['en'] else 'pass'
    if land:
        await pg.locator(f'#evCard button[data-o="{pick}"]').click(); await pg.wait_for_timeout(900)
        await idle(pg)
        n1 = len(ck_of(await pg.evaluate(SAVED), 'proj'))
        check(sc, f'the land card decided "{pick}" through the engine ({n0} → {n1} projects)', n1 == n0 + (1 if pick == 'reliable' else 0), (n0, n1))
    d = seen.get('deal')
    if d: check(sc, 'a project deal card shows its block (units, stages, cost, equity)', 'יחידות' in d['text'] and 'שלבים' in d['text'], d['text'][:300])
    if SHOTS:
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('overview'))"); await pg.wait_for_timeout(1800); await shot(pg, 'board3d_desk_overview')
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('follow'))"); await pg.wait_for_timeout(800)
    st = await pg.evaluate(SAVED); pj = [a for a in ck_of(st, 'proj')]
    await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
    P = await pg.evaluate(PANEL)
    gaps = [a for a in pj if (a['op'].get('sb') or {}).get('phase') != 'done']
    check(sc, 'panel: 3 gauges (cash vs equity owed / rate / demand), the timeline (one bar per project, a cell per stage, an accessible name), a row per project, the presale row, actions',
          P['gauges'] == ['runway', 'rate', 'demand'] and len(P['gantt']) == len(pj) and len(pj) >= 1 and all(g['cells'] >= 4 and g['name'] for g in P['gantt']) and P['rows'] >= len(pj)
          and 'יעד מכירות מוקדמות' in P['segs'] and P['acts'] >= 8 and 'הפרויקטים' in P['title'] and 'לוח זמנים' in P['text'], (len(pj), P['gauges'], P['gantt'], P['rows'], P['segs'], P['acts']))
    if P['calls']: check(sc, 'the equity-call calendar lists the projects that still owe equity + a total', P['calls'] >= 2 and 'קריאות להון עצמי' in P['text'], P['calls'])
    bad = await axe_bad(pg, '#gm'); check(sc, 'axe: the projects panel (gantt, calls) has no critical / serious violation', not bad, bad)
    if SHOTS: await pg.wait_for_timeout(1500); await pg.add_style_tag(content='#toast{visibility:hidden !important}')
    await shot(pg, 'panel_desk')
    # a presale target through E.worldAction
    a1 = pj[0]; t0 = a1['op'].get('target'); tgt = '60' if round((t0 or 0) * 100) != 60 else '40'
    idx = await pg.evaluate("(t) => { const b = [...document.querySelectorAll('#gmCard button[data-aid=\"presale\"]')].find((x) => x.textContent.includes(t + '%') && !x.disabled); return b ? +b.dataset.wact : -1; }", tgt)
    check(sc, f'the presale target {tgt}% is offered for the first project', idx >= 0, idx)
    if idx >= 0:
        await pg.locator(f'#gmCard button[data-wact="{idx}"]').click(); await pg.wait_for_timeout(900)
        msg = await pg.evaluate("() => { const m = document.querySelector('#gmCard .wp-msg'); return { t: m.textContent, c: m.className }; }")
        st = await pg.evaluate(SAVED); h = next((a for a in ck_of(st, 'proj') if a['id'] == a1['id']), {})
        check(sc, 'the action went through E.worldAction (engine op.target changed, logged Z, panel redrawn)', round((h.get('op', {}).get('target') or 0) * 100) == int(tgt) and any(a[0] == 'Z' for a in st.get('actions', [])) and 'pos' in msg['c'], (msg, h.get('op', {}).get('target')))
    # the two-tap sale to a rival: the first tap only arms the button
    sell = await pg.evaluate("() => { const b = document.querySelector('#gmCard button[data-aid=\"sellProj\"]:not([disabled])'); return b ? +b.dataset.wact : -1; }")
    if sell >= 0:
        n0 = len(ck_of(await pg.evaluate(SAVED), 'proj'))
        await pg.locator(f'#gmCard button[data-wact="{sell}"]').click(); await pg.wait_for_timeout(500)
        r = await pg.evaluate("() => ({ arm: !!document.querySelector('#gmCard button[data-arm=\"1\"]'), msg: document.querySelector('#gmCard .wp-msg').textContent })")
        n1 = len(ck_of(await pg.evaluate(SAVED), 'proj'))
        check(sc, 'selling a project needs a second tap (the first one arms the button and sells nothing)', r['arm'] and 'אי אפשר לבטל' in r['msg'] and n1 == n0, (r, n0, n1))
    await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=5000)
    row = await pg.evaluate("() => { const r = document.querySelector('#gmCard .mh-row[data-row=\"world\"]'); return r ? r.textContent : null; }")
    check(sc, '💼 has the "הפרויקטים" row (open projects, the rate)', row and 'הפרויקטים' in row and 'ריבית' in row, row)
    if row:
        await pg.click('#gmCard .mh-row[data-row="world"] button[data-hub="world"]'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
        check(sc, '💼 → the projects panel opens', await pg.locator('#gmCard.wpanel').count() == 1)
        await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await pg.click('#hGoalBtn'); await pg.wait_for_selector('#goalPanel:not([hidden])', timeout=5000)
    gp = await pg.evaluate("() => document.querySelector('#goalPanel').textContent")
    check(sc, 'goal panel: net worth ₪250 מיליון, the gap and the ladder', '250 מיליון' in gp and 'שווי נקי' in gp and 'הדרך ליעד' in gp, gp[:300])
    await pg.click('#hGoalBtn'); await pg.wait_for_timeout(300)
    a0 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    lv_ok = all(a0['levels'].get(k, {}).get('kind') == 'build' and bool(a0['levels'][k].get('plot')) == v['plot'] and bool(a0['levels'][k].get('rental')) == v['rental'] and bool(a0['levels'][k].get('permit')) == v['permit']
                and (v['plot'] or v['rental'] or v['permit'] or a0['levels'][k]['n'] == v['stage']) for k, v in a0['proj'].items())
    check(sc, '3D: the city equals cityModels and every site carries its level (stage, permit, plot, rental)', a0['want'] == a0['scene'] and a0['proj'] and lv_ok, a0)
    models = {k: await pg.evaluate("(k) => import('./js/scene.js').then((S) => S.levelOf ? S.levelOf(k) : null)", k) for k, v in a0['proj'].items() if not v['plot'] and not v['rental']}
    def mo_ok(k):
        v = a0['proj'][k]; m = (models[k] or {}).get('model') or {}
        return m and m.get('permit') == v['permit'] and m.get('tarp') == (v['stalled'] and m.get('slabs', 0) > 0) and abs((m.get('presold') or 0) - (v['presold'] or 0)) < 0.011 and (v['permit'] or m.get('slabs', 0) >= 1)
    check(sc, '3D: each site drew its slabs, permit board, tarp and presale banner from the engine (scene.levelOf model)', models and all(mo_ok(k) for k in models), {k: (models[k] or {}).get('model') for k in models})
    await pg.reload(); await pg.wait_for_selector('.lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
    await pg.click('.map-card[data-id="w8"]'); await pg.wait_for_selector('[data-act="continue-free"][data-id="w8"]', timeout=60000)
    await pg.click('[data-act="continue-free"][data-id="w8"]'); await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    a1 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    check(sc, 'after reload + resume: the same city and the same site levels (engine = scene)', a1['want'] == a0['want'] and a1['want'] == a1['scene'] and a1['proj'] == a0['proj'], (a0, a1))
    await ctx.close()

async def run_2d(b):
    for vp in ('desk', 'phone', 'small'):
        sc = f'2d-{vp}'; ctx, pg = await page(b, vp, flags='?ff=board2d:on')
        await pg.evaluate(START, {'seed': 7, 'ch': 'landowner'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(1500)
        await idle(pg)
        if vp != 'desk':
            land, _ = await roll_to(pg, 'mech')
            check(sc, "reached a 'Q' tile on the 2D board", land is not None)
            if land:
                await pg.wait_for_timeout(900)
                fit = await pg.evaluate("() => { const c = document.querySelector('#evCard').getBoundingClientRect(); return c.width <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#evCard .grid .row')].every((r) => r.scrollWidth <= r.clientWidth + 1); }")
                over = await pg.evaluate("() => [...document.querySelectorAll('#evCard .grid .row')].filter((r) => r.scrollWidth > r.clientWidth + 1).map((r) => [r.textContent, r.scrollWidth, r.clientWidth])")
                check(sc, 'the land card fits the phone width, no row overflows', fit and land['land'], over)
                if SHOTS: await pg.evaluate("() => document.querySelector('#evCard .landmini')?.scrollIntoView({ block: 'center' })"); await pg.wait_for_timeout(1200)
                await shot(pg, f'land_card_{vp}')
                await pg.locator('#evCard button[data-o="pass"]').click(); await pg.wait_for_timeout(600)
                await idle(pg)
        else:
            for _ in range(3): await pg.click('#roll'); await pg.wait_for_timeout(400); await idle(pg)
        a = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        cards = await pg.evaluate("""() => [...document.querySelectorAll('.b2d-card')].filter((x) => x.dataset.kind === 'build').map((c) => ({ key: c.dataset.key, label: c.getAttribute('aria-label'),
          corner: (c.querySelector('.b2d-corner-b') || {}).textContent || '', pips: (c.querySelector('.b2d-pips') || {}).textContent || '', lvl: c.dataset.level, light: c.dataset.light, pct: c.style.getPropertyValue('--b2d-pct') }))""")
        def card_ok(c):
            v = a['proj'].get(c['key']) or {}
            if v.get('plot'): return 'מגרש' in c['label'] and c['corner'] == '🚧'
            if v.get('permit'): return 'היתר' in c['label'] and c['corner'] == '📋'
            if v.get('rental'): return 'מושכר' in c['label'] and c['corner'] == '🔑'
            return 'בבנייה' in c['label'] and c['pct'] == f"{round((v.get('pct') or 0) * 100)}%" and int(c['lvl']) == v.get('stage')
        check(sc, '2D: every site card shows its state (corner + % bar + "בבנייה / היתר / מגרש" in its name) = the engine', cards and len(cards) == len(a['proj']) and all(card_ok(c) for c in cards), (cards, a['proj']))
        th = await pg.evaluate("() => ({ world: document.body.dataset.world, sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(), board: ((document.querySelector('[class*=b2d-m-]') || {}).style || { getPropertyValue: () => '' }).getPropertyValue('--b2d-board').trim(), motif: [...(document.querySelector('[class*=b2d-m-]') || { classList: [] }).classList].find((x) => x.startsWith('b2d-m-')) || '' })")
        check(sc, '2D: the w8 look (data-world=w8, clear-day sky, cool concrete board from WORLD_STYLE, the cranes motif)', th['world'] == 'w8' and th['sky'].lower() == '#fde68a' and th['board'].lower() == '#d6d1e6' and th['motif'] == 'b2d-m-cranes', th)
        await shot(pg, f'board2d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        fit = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const r = c.getBoundingClientRect(); return { w: r.width, vw: innerWidth, over: document.documentElement.scrollWidth > innerWidth + 1, acts: [...c.querySelectorAll('button[data-wact]')].every((b) => b.getBoundingClientRect().height >= 43.5), touch: [...c.querySelectorAll('button[data-wact]')].every((b) => getComputedStyle(b).touchAction === 'manipulation'), plots: c.textContent.includes('מושכר ומגרשים'), dev: !!c.querySelector('.wp-seg[aria-label=\"להתחיל פרויקט\"]') }; }")
        check(sc, 'panel fits the width, every action button ≥ 44 px with touch-action manipulation; the landowner\'s plots (rows + the "start a project" row)', fit['w'] <= fit['vw'] and not fit['over'] and fit['acts'] and fit['touch'] and fit['plots'] and fit['dev'], fit)
        if vp != 'desk':
            if SHOTS: await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await shot(pg, f'panel_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_3dphone(b):
    for vp in ('phone', 'small'):
        sc = f'3d-{vp}'; ctx, pg = await page(b, vp)
        await pg.evaluate(START, {'seed': 7, 'ch': 'developer'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        k = await pg.evaluate("import('./js/scene.js').then((S) => S.kind)")
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const r = b.getBoundingClientRect(), h = document.querySelector('#hWorld').getBoundingClientRect(); return { inside: r.left >= h.left - 1 && r.right <= h.right + 1, h: r.height, t: b.textContent, sw: b.scrollWidth, cw: b.clientWidth }; }")
        check(sc, '3D board on a phone; the 🏗️ chip stays inside its HUD card', k == '3d' and chip and chip['inside'] and '🏗️' in chip['t'], (k, chip))
        await shot(pg, f'board3d_{vp}')
        await ctx.close()

async def run_motion(b):
    """the developer's working site: its crane turns with normal motion and never with reduced motion"""
    for red in (False, True):
        sc = 'motion-' + ('reduced' if red else 'normal'); ctx, pg = await page(b, 'desk', reduced=red)
        await pg.evaluate(START, {'seed': 7, 'ch': 'developer'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        await pg.evaluate("import('./js/scene.js').then((S) => S.setQuality('mid'))"); await pg.wait_for_timeout(800)
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode && S.setCameraMode('overview'))"); await pg.wait_for_timeout(1800)
        lv = await pg.evaluate("import('./js/scene.js').then((S) => ({ red: S.perfStats().reduced, a1: S.levelOf('a1') }))")
        m = (lv['a1'] or {}).get('model') or {}
        if red: check(sc, 'reduced motion: the working crane never turned (jib 0)', lv['red'] and m.get('craneOn') and m.get('jib') == 0, lv)
        else: check(sc, 'normal motion: the working crane turned while the scene animated', not lv['red'] and m.get('craneOn') and (m.get('jib') or 0) > 0, lv)
        await ctx.close()

async def main():
    FB.banner(MODE)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
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
