# Worlds wave 3 — w7 רשתות המסחר end to end in the real page (lobby + game), offline fake backend + guard:
#   map   the 12-world map from P.worldMap(): after a w5 escape w7 (and w8) are playable cards; without it w7 is locked and says how to open
#         it ("לצאת מהמירוץ בעיר התיירות" — any escape, also a practice one); what w7 teaches
#   pick  w7 card → its rules load (ensureWorldRules) → the character picker (shopFounder / cfo / franchisor, pros / cons, 🏪 📊 🤝) → a game
#         starts in w7 (body[data-world=w7], the 🛍️ chip, no 404 / page error / failed model: every w7 model is a procedural stand-in)
#   play  a fixed-seed shopFounder game: rolls through a payday to an 'R' (מיקום לסניף) tile — the site card (location odds, mature month
#         per location, capex / down / rent, fit-out, ramp losses, first stock, cash needed, runway after, span left, franchise, survey fee);
#         the survey keeps the card open and redraws it with 2 locations; the chain panel (4 gauges, a row per branch, the cover row) from
#         the HUD chip and from 💼; a cover action and a manager hire through E.worldAction (the regional office appears with its light
#         lines); the two-tap close; the two-part goal panel (₪120M + 4 months); 3D city = cityModels with every branch's level; save →
#         reload → resume: the same city and the same branch levels
#   2d    the 2D board on desk / 390 / 360: w7 colours (WORLD_STYLE), branch cards with pips + corner + the accessible name; the site card and
#         the panel fit the phone width, every panel button ≥ 44 px
#   3d    the 3D board on 390 / 360; the chip stays inside its HUD card
#   motion an over-span sign flickers with normal motion and never with reduced motion
# Copies: SRC=<export> COPY_DIR=/tmp/ui78 PORT_BASE=10800 bash tests/serve_copies.sh
# Usage: python3 tests/w7_e2e.py [--real=http://localhost:10802/] [--shots=DIR] [--only=map,pick,play,2d,3d,motion]
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
  en: [...c.querySelectorAll('button[data-o]:not([disabled])')].map((b) => b.dataset.o), text: c.textContent, mt: c.querySelectorAll('.mt > div').length, warn: !!c.querySelector('.warn'), site: !!c.querySelector('.sitemini') }; }"""

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
    # never a missing file: every same-origin response must be < 400 (the w7 models are procedural, the card art generated)
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
       seen: a dict — the first deal card that carries the chain block is recorded there (seen['deal'])"""
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
                if 'חודשי שיפוץ' in c['text'] or 'מרכז הפצה' in c['text'] or 'אתר מכירות' in c['text']: seen['deal'] = c
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
    line: (c.querySelector('.map-line') || {}).textContent || '', gen: !!c.querySelector('.gen-art'), motif: (c.querySelector('.gen-motif') || {}).textContent || '', buttons: c.querySelectorAll('button').length + (c.tagName === 'BUTTON' ? 1 : 0) })); }"""

async def run_map(b):
    for vp in ('desk', 'small'):
        sc = f'map-{vp}'; ctx, pg = await page(b, vp)
        cards = await pg.evaluate(MAP)
        meta = await pg.evaluate("import('./js/progress.js').then((P) => P.worldMap().map((m) => ({ id: m.id, playable: m.playable, unlocked: m.unlocked })))")
        pm = [m['id'] for m in meta if m['playable']]
        check(sc, 'meta: w1–w8 playable (the map and the UI agree)', pm[:8] == ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'], pm)
        check(sc, f'the map renders every P.worldMap() entry in order ({len(meta)})', [c['id'] for c in cards] == [m['id'] for m in meta] and len(cards) == len(meta) >= 12, [c['id'] for c in cards])
        for wid, learn, motif in (('w7', 'צמיחה אוכלת מזומן', '🛍️'), ('w8', 'מימון בשלבים', '🏗️')):
            c = next((x for x in cards if x['id'] == wid), None)
            check(sc, f'{wid} is a playable card after the w5 escape (button, data-act=world), says what it teaches, difficulty, generated art {motif}',
                  c and c['tag'] == 'BUTTON' and c['act'] == 'world' and not c['soon'] and not c['locked'] and learn in c['learn'] and c['diff'] and c['gen'] and c['motif'] == motif, c)
        soon = [c for c in cards if c['soon']]; planned = [m['id'] for m in meta if not m['playable']]
        check(sc, 'planned worlds stay "בקרוב" pins (no button)', [c['id'] for c in soon] == planned and 'w7' not in planned and 'w8' not in planned and all(c['buttons'] == 0 for c in soon), soon)
        if vp == 'desk':
            await shot(pg, 'map_desk')
            # without a w5 escape, w7 and w8 are locked and say how to open them (the rule is "finish the world": escape at any speed or in practice)
            r = await pg.evaluate("""async () => { const P = await import('./js/progress.js'); P._reset && P._reset({ ...P.getProgress(), stars: { w1: 1, w2: 1, w3: 1, w4: 1, w5: 0 } });
              const m = P.worldMap().filter((x) => x.id === 'w7' || x.id === 'w8').map((x) => ({ id: x.id, unlocked: x.unlocked, lock: x.lockText })); P._reset && P._reset({ ...P.getProgress(), stars: %s }); return m; }""" % STARS)
            check(sc, 'w7 / w8 need a w5 escape: locked without it, "לצאת … עיר התיירות"', all(x['unlocked'] is False and 'לצאת' in (x['lock'] or '') and 'עיר התיירות' in (x['lock'] or '') for x in r) and len(r) == 2, r)
        await ctx.close()

async def run_pick(b):
    sc = 'pick-desk'; ctx, pg = await page(b, 'desk')
    pre = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w7'))")
    check(sc, 'w7 rules are not loaded at boot (lazy)', pre is False, pre)
    await pg.click('.map-card[data-id="w7"]')
    await pg.wait_for_selector('.wv-char[data-w="w7"]', timeout=60000)
    info = await pg.evaluate("""() => ({ chars: [...document.querySelectorAll('.wv-char')].map((c) => c.dataset.c), h1: document.querySelector('.wv-hero h1').textContent,
      icons: [...document.querySelectorAll('.wv-char .wv-ic')].map((x) => x.textContent), learn: !!document.querySelector('.wv-learn'), goal: (document.querySelector('.wv-goal') || {}).textContent || '',
      pros: document.querySelectorAll('.wv-char .wv-str').length, cons: document.querySelectorAll('.wv-char .wv-weak').length })""")
    info['loaded'] = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w7'))")
    check(sc, 'the picker waits for the rules, then lists the 3 w7 characters', info['loaded'] and info['chars'] == ['shopFounder', 'cfo', 'franchisor'] and info['h1'] == 'רשתות המסחר', info)
    check(sc, 'character icons 🏪 / 📊 / 🤝 (never the 🙂 fallback); pros / cons; the ₪120M + liquidity goal', info['icons'] == ['🏪', '📊', '🤝'] and info['pros'] >= 3 and info['cons'] >= 3 and '120' in info['goal'], info)
    await shot(pg, 'picker_desk')
    await pg.click('.wv-go[data-c="shopFounder"]')
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500); await quiet(pg)
    await idle(pg)
    g = await pg.evaluate("""() => ({ world: document.body.dataset.world, chip: (document.querySelector('#worldPanelBtn') || {}).textContent || '', sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(),
      ink: getComputedStyle(document.body).getPropertyValue('--accent-ink').trim(), accent: getComputedStyle(document.body).getPropertyValue('--accent').trim() })""")
    g['cfg'] = await pg.evaluate("import('./js/game.js').then((G) => G.activeConfig())")
    check(sc, 'a w7 game started from the picker (shopFounder, free), the dusk sky, the w7 accent', g['world'] == 'w7' and g['cfg'] and g['cfg']['worldId'] == 'w7' and g['cfg']['charId'] == 'shopFounder' and g['sky'].lower() == '#2b2d42' and g['accent'].lower() == '#ec5562', g)
    check(sc, 'the HUD shows the 🛍️ chain chip (branches / span)', '🛍️' in g['chip'] and '3/3' in g['chip'], g['chip'])
    fails = await pg.evaluate("import('./js/scene.js').then((S) => S.failedModels ? S.failedModels() : [])")
    check(sc, 'no model failed (w7 stand-ins are procedural: nothing was fetched for them)', not fails, fails)
    glb = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().glb)")
    check(sc, 'no w7 .glb was ever requested', not any('/w7/' in u for u in glb), glb)
    await ctx.close()

START = """async ({ seed, ch }) => { const E = await import('./js/engine.js'); await E.ensureWorld('w7'); const G = await import('./js/game.js'); await G.initGame();
  G.startGame({ worldId: 'w7', charId: ch || 'shopFounder', mode: 'free', seed, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true, resume: false }); return true; }"""
SAVED = "() => { const r = JSON.parse(localStorage.getItem('rr2-save-free-w7') || 'null'); return r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); }"
PANEL = """() => { const c = document.querySelector('#gmCard'); return { gauges: [...c.querySelectorAll('.wp-g')].map((g) => g.dataset.g), rows: c.querySelectorAll('.wp-row').length,
  acts: c.querySelectorAll('button[data-wact]').length, segs: [...c.querySelectorAll('.wp-seg')].map((x) => x.getAttribute('aria-label')), title: (c.querySelector('h2') || {}).textContent || '',
  now: (c.querySelector('.wp-now') || {}).textContent || '', pips: [...c.querySelectorAll('.wp-row .wp-cond')].map((x) => x.getAttribute('aria-label')) }; }"""

def branches_of(st):
    return [a for a in (st or {}).get('assets', []) if a.get('op') and a['op'].get('ck') == 'branch']

async def roll_to(pg, kind, n=45, seen=None):
    """roll until a card of type `kind` is open (returns its CARD) — answering everything else; paid = a payday passed"""
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
    await pg.evaluate(START, {'seed': 7, 'ch': 'shopFounder'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    await shot(pg, 'board3d_desk')
    seen = {}
    site, paid = await roll_to(pg, 'mech', seen=seen)
    check(sc, 'rolled through a payday', paid)
    check(sc, "landed on an 'R' tile: the site card (location odds, mature month per location, capex / down / rent, fit-out, ramp, first stock, cash needed, runway, span, franchise, survey fee)",
          site and 'מיקום לסניף' in site['text'] and site['site'] and {'own', 'pass'} <= set(site['opts']) and 'רווח בחודש בוגר' in site['text'] and 'מקדמה' in site['text'] and 'שכירות' in site['text']
          and 'חודשי שיפוץ' in site['text'] and 'הפסדי חצי השנה' in site['text'] and 'המלאי הראשון' in site['text'] and 'מזומן שהפתיחה בולעת' in site['text'] and 'קופה אחרי הפתיחה' in site['text']
          and 'יכולת ניהול' in site['text'] and ('זכיין' in site['text'] or 'זכיינות' in site['text']), site and (site['title'], site['opts'], site['text'][:500]))
    if site and 'survey' in site['opts']:
        check(sc, 'unsurveyed: 3 locations with their odds, the survey fee', site['mt'] == 3 and 'סקר מיקום' in site['text'] and '%' in site['text'], site['mt'])
        bad = await axe_bad(pg, '#evm'); check(sc, 'axe: the site card has no critical / serious violation', not bad, bad)
        if SHOTS: await pg.evaluate("() => document.querySelector('#evCard .sitemini')?.scrollIntoView({ block: 'center' })"); await pg.wait_for_timeout(1500)
        await shot(pg, 'site_card_desk')
        if 'survey' in site['en']:
            await pg.locator('#evCard button[data-o="survey"]').click(); await pg.wait_for_timeout(1200)
            s2 = await pg.evaluate(STATE); c2 = await pg.evaluate(CARD)
            check(sc, 'the survey keeps the card open and redraws it: 2 locations, no survey option, the location named', s2['card'] and s2['type'] == 'mech' and c2['mt'] == 2 and 'survey' not in c2['opts'] and ' או ' in c2['text'], (s2, c2['mt'], c2['opts']))
            site = c2
    else: await shot(pg, 'site_card_desk')
    n0 = len(branches_of(await pg.evaluate(SAVED)))
    pick = 'own' if site and 'own' in site['en'] else 'pass'
    if site:
        await pg.locator(f'#evCard button[data-o="{pick}"]').click(); await pg.wait_for_timeout(900)
        await idle(pg)
        n1 = len(branches_of(await pg.evaluate(SAVED)))
        check(sc, f'the site card decided "{pick}" through the engine ({n0} → {n1} branches)', n1 == n0 + (1 if pick == 'own' else 0), (n0, n1))
    d = seen.get('deal')
    if d: check(sc, 'a chain deal card shows its block (fit-out / DC / e-commerce)', 'חודשי שיפוץ' in d['text'] or 'מרכז הפצה' in d['text'] or 'אתר מכירות' in d['text'], d['text'][:300])
    if SHOTS:
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('overview'))"); await pg.wait_for_timeout(1800); await shot(pg, 'board3d_desk_overview')
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('follow'))"); await pg.wait_for_timeout(800)
    # the chain panel from the HUD chip
    st = await pg.evaluate(SAVED)
    await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
    P = await pg.evaluate(PANEL); nb = len(branches_of(st))
    check(sc, 'panel: 4 gauges (liquidity / span / stock cover / brand), one row per branch with its ramp stage, the cover row, actions',
          P['gauges'] == ['liq', 'span', 'cover', 'brand'] and P['rows'] == nb and nb >= 3 and len(P['pips']) == nb and all('שלב הרצה' in x for x in P['pips']) and 'מלאי: חודשי כיסוי' in P['segs'] and P['acts'] >= 8 and 'הרשת' in P['title'], (nb, P))
    bad = await axe_bad(pg, '#gm'); check(sc, 'axe: the chain panel has no critical / serious violation', not bad, bad)
    if SHOTS: await pg.wait_for_timeout(1500); await pg.add_style_tag(content='#toast{visibility:hidden !important}')
    await shot(pg, 'panel_desk')
    # a cover action through E.worldAction
    c0 = ((st.get('world') or {}).get('chain') or {}).get('cover')
    tgt = '2' if c0 != 2 else '1'
    idx = await pg.evaluate("(t) => { const b = [...document.querySelectorAll('#gmCard button[data-aid=\"cover\"]')].find((x) => x.textContent.includes(t + ' חודשי') && !x.disabled); return b ? +b.dataset.wact : -1; }", tgt)
    check(sc, f'the cover rule "{tgt} months" is offered', idx >= 0, idx)
    if idx >= 0:
        await pg.locator(f'#gmCard button[data-wact="{idx}"]').click(); await pg.wait_for_timeout(900)
        msg = await pg.evaluate("() => { const m = document.querySelector('#gmCard .wp-msg'); return { t: m.textContent, c: m.className }; }")
        st = await pg.evaluate(SAVED)
        check(sc, 'the action went through E.worldAction (engine chain.cover changed, logged Z, panel redrawn)', str((st['world']['chain'] or {}).get('cover')) == tgt and any(a[0] == 'Z' for a in st.get('actions', [])) and 'pos' in msg['c'], (msg, st['world']['chain'].get('cover')))
    # hire a regional manager → its office joins the city with light lines to its branches
    hi = await pg.evaluate("() => { const b = document.querySelector('#gmCard button[data-aid=\"hire\"]:not([disabled])'); return b ? +b.dataset.wact : -1; }")
    if hi >= 0:
        await pg.locator(f'#gmCard button[data-wact="{hi}"]').click(); await pg.wait_for_timeout(1500)
        st = await pg.evaluate(SAVED)
        check(sc, 'hiring a regional manager reached the engine (chain.managers = 1)', (st['world']['chain'] or {}).get('managers') == 1, st['world']['chain'].get('managers'))
    # the two-tap close: the first tap only arms the button
    cl = await pg.evaluate("() => { const b = document.querySelector('#gmCard button[data-aid=\"close\"]:not([disabled])'); return b ? +b.dataset.wact : -1; }")
    if cl >= 0:
        n0 = len(branches_of(await pg.evaluate(SAVED)))
        await pg.locator(f'#gmCard button[data-wact="{cl}"]').click(); await pg.wait_for_timeout(500)
        r = await pg.evaluate("() => ({ arm: !!document.querySelector('#gmCard button[data-arm=\"1\"]'), msg: document.querySelector('#gmCard .wp-msg').textContent })")
        n1 = len(branches_of(await pg.evaluate(SAVED)))
        check(sc, 'closing a branch needs a second tap (the first one arms the button and closes nothing)', r['arm'] and 'אי אפשר לבטל' in r['msg'] and n1 == n0, (r, n0, n1))
    await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(600)
    if hi >= 0:
        await pg.wait_for_timeout(800)
        lk = await pg.evaluate("import('./js/scene.js').then((S) => S.levelOf ? S.levelOf('chain:mgr:0') : null)")
        a0 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        own = [k for k, v in a0['chain'].items() if v['own']]
        if SHOTS:
            await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('overview'))"); await pg.wait_for_timeout(1800); await shot(pg, 'board3d_desk_manager')
            await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('follow'))"); await pg.wait_for_timeout(600)
        check(sc, "3D: the regional office stands in the city with light lines to its own branches (≤ 6)", a0['managers'] == ['chain:mgr:0'] and 'chain:mgr:0' in a0['scene'] and lk and lk.get('kind') == 'mgr' and 0 < len(lk.get('links') or []) <= 6 and set(lk['links']) <= set(own), (a0['managers'], lk))
    # 💼 → the same panel
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=5000)
    row = await pg.evaluate("() => { const r = document.querySelector('#gmCard .mh-row[data-row=\"world\"]'); return r ? r.textContent : null; }")
    check(sc, '💼 has the "הרשת" row (branches, span, liquidity)', row and 'הרשת' in row and 'סניפים' in row and 'קופה' in row, row)
    if row:
        await pg.click('#gmCard .mh-row[data-row="world"] button[data-hub="world"]'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
        check(sc, '💼 → the chain panel opens', await pg.locator('#gmCard.wpanel').count() == 1)
        await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    # the two-part goal (₪120M and 4 months of fixed costs)
    await pg.click('#hGoalBtn'); await pg.wait_for_selector('#goalPanel:not([hidden])', timeout=5000)
    gp = await pg.evaluate("() => document.querySelector('#goalPanel').textContent")
    hud = await pg.evaluate("() => ({ bars: document.querySelectorAll('#hGoal .gbar').length, sub: document.querySelector('#hGoal .gsub').textContent, label: document.querySelector('#hGoal .gl span').textContent })")
    check(sc, 'goal panel: two parts — net worth ₪120 מיליון AND liquidity in months (never ₪), the rule, the ladder', '120 מיליון' in gp and 'שני יעדים יחד' in gp and 'חודשים' in gp and 'קופה' in gp and 'הדרך ליעד' in gp, gp[:400])
    check(sc, 'HUD goal meter: two bars (שווי / קופה), the liquidity in months', hud['bars'] == 2 and '🛟' in hud['sub'] and 'ח׳' in hud['sub'] and hud['label'] == 'שווי וקופה', hud)
    await pg.click('#hGoalBtn'); await pg.wait_for_timeout(300)
    a0 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    lv_ok = all(a0['levels'].get(k, {}).get('kind') == 'branch' and a0['levels'][k]['n'] == v['stage'] and bool(a0['levels'][k].get('fitout')) == v['fitout'] and bool(a0['levels'][k].get('own')) == v['own'] for k, v in a0['chain'].items())
    check(sc, '3D: the city equals cityModels and every branch carries its level (stage, fit-out, own)', a0['want'] == a0['scene'] and a0['chain'] and lv_ok, a0)
    models = {k: await pg.evaluate("(k) => import('./js/scene.js').then((S) => S.levelOf ? S.levelOf(k) : null)", k) for k in a0['chain']}
    mo_ok = all(models[k] and models[k].get('model') and models[k]['model']['lit'] == (0 if v['fitout'] else v['stage']) and models[k]['model']['fitout'] == v['fitout'] and models[k]['model']['franchise'] == (not v['own']) for k, v in a0['chain'].items())
    check(sc, '3D: each storefront drew its lit windows (= stage), fit-out boards and awning from the engine (scene.levelOf model)', mo_ok, {k: (models[k] or {}).get('model') for k in models})
    st_lv = a0['levels'].get('a1')
    check(sc, '3D: the stock pool shows its pallets (level kind stock)', st_lv and st_lv.get('kind') == 'stock', st_lv)
    # save → reload → resume
    await pg.reload(); await pg.wait_for_selector('.lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
    await pg.click('.map-card[data-id="w7"]'); await pg.wait_for_selector('[data-act="continue-free"][data-id="w7"]', timeout=60000)
    await pg.click('[data-act="continue-free"][data-id="w7"]'); await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    a1 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    check(sc, 'after reload + resume: the same city, the same branch levels and managers (engine = scene)', a1['want'] == a0['want'] and a1['want'] == a1['scene'] and a1['chain'] == a0['chain'] and a1['managers'] == a0['managers']
          and all(a1['levels'].get(k, {}).get('n') == v['stage'] for k, v in a1['chain'].items()), (a0, a1))
    await ctx.close()

async def run_2d(b):
    """a fixed-seed game on the 2D board: branch cards, the site card on phones, the panel fitting 390 / 360"""
    for vp in ('desk', 'phone', 'small'):
        sc = f'2d-{vp}'; ctx, pg = await page(b, vp, flags='?ff=board2d:on')
        await pg.evaluate(START, {'seed': 7, 'ch': 'shopFounder'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(1500)
        await idle(pg)
        if vp != 'desk':
            site, _ = await roll_to(pg, 'mech')
            check(sc, "reached an 'R' tile on the 2D board", site is not None)
            if site:
                await pg.wait_for_timeout(900)   # after the card's pop-in scale
                fit = await pg.evaluate("() => { const c = document.querySelector('#evCard').getBoundingClientRect(); return c.width <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#evCard .grid .row')].every((r) => r.scrollWidth <= r.clientWidth + 1); }")
                over = await pg.evaluate("() => [...document.querySelectorAll('#evCard .grid .row')].filter((r) => r.scrollWidth > r.clientWidth + 1).map((r) => [r.textContent, r.scrollWidth, r.clientWidth])")
                check(sc, 'the site card fits the phone width, no row overflows', fit and site['site'], over)
                if SHOTS: await pg.evaluate("() => document.querySelector('#evCard .sitemini')?.scrollIntoView({ block: 'center' })"); await pg.wait_for_timeout(1200)
                await shot(pg, f'site_card_{vp}')
                await pg.locator('#evCard button[data-o="pass"]').click(); await pg.wait_for_timeout(600)
                await idle(pg)
        else:
            for _ in range(3): await pg.click('#roll'); await pg.wait_for_timeout(400); await idle(pg)
        a = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        cards = await pg.evaluate("""() => [...document.querySelectorAll('.b2d-card')].filter((x) => x.dataset.kind === 'branch').map((c) => ({ key: c.dataset.key, label: c.getAttribute('aria-label'),
          pips: (c.querySelector('.b2d-pips') || {}).textContent || '', corner: (c.querySelector('.b2d-corner-b') || {}).textContent || '', lvl: c.dataset.level, light: c.dataset.light, run: c.dataset.run }))""")
        good = cards and len(cards) == len(a['chain']) and all((a['chain'].get(c['key']) or {}).get('stage') == int(c['lvl']) and ('שלב' in c['label'] or 'בשיפוץ' in c['label']) and c['corner'] and (c['pips'] == '🚧' or '●' in c['pips'] or '○' in c['pips']) for c in cards)
        check(sc, '2D: every branch card shows its ramp stage (pips + corner + "שלב n מתוך 4" in its name) = the engine', good, (cards, a['chain']))
        th = await pg.evaluate("() => ({ world: document.body.dataset.world, sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(), board: ((document.querySelector('[class*=b2d-m-]') || {}).style || { getPropertyValue: () => '' }).getPropertyValue('--b2d-board').trim(), motif: [...(document.querySelector('[class*=b2d-m-]') || { classList: [] }).classList].find((x) => x.startsWith('b2d-m-')) || '' })")
        check(sc, '2D: the w7 look (data-world=w7, dusk sky, blush paving from WORLD_STYLE, the bags motif)', th['world'] == 'w7' and th['sky'].lower() == '#2b2d42' and th['board'].lower() == '#f1d5d0' and th['motif'] == 'b2d-m-bags', th)
        await shot(pg, f'board2d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        fit = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const r = c.getBoundingClientRect(); return { w: r.width, vw: innerWidth, over: document.documentElement.scrollWidth > innerWidth + 1, acts: [...c.querySelectorAll('button[data-wact]')].every((b) => b.getBoundingClientRect().height >= 43.5), touch: [...c.querySelectorAll('button[data-wact]')].every((b) => getComputedStyle(b).touchAction === 'manipulation') }; }")
        check(sc, 'panel fits the width, every action button ≥ 44 px with touch-action manipulation', fit['w'] <= fit['vw'] and not fit['over'] and fit['acts'] and fit['touch'], fit)
        if vp != 'desk':
            if SHOTS: await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await shot(pg, f'panel_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_3dphone(b):
    for vp in ('phone', 'small'):
        sc = f'3d-{vp}'; ctx, pg = await page(b, vp)
        await pg.evaluate(START, {'seed': 7, 'ch': 'franchisor'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        k = await pg.evaluate("import('./js/scene.js').then((S) => S.kind)")
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const r = b.getBoundingClientRect(), h = document.querySelector('#hWorld').getBoundingClientRect(); return { inside: r.left >= h.left - 1 && r.right <= h.right + 1, h: r.height, t: b.textContent }; }")
        check(sc, '3D board on a phone; the 🛍️ chip stays inside its HUD card', k == '3d' and chip and chip['inside'] and '🛍️' in chip['t'], (k, chip))
        a = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        fr = [k for k, v in a['chain'].items() if not v['own']]
        check(sc, 'the franchisor: 8 franchise storefronts (blue awnings), the city = cityModels', len(fr) == 8 and a['want'] == a['scene'], (len(fr), a['want'] == a['scene']))
        await shot(pg, f'board3d_{vp}')
        await ctx.close()

async def run_motion(b):
    """an over-span branch's sign flickers with normal motion and never with reduced motion (the renderer's own state)"""
    for red in (False, True):
        sc = 'motion-' + ('reduced' if red else 'normal'); ctx, pg = await page(b, 'desk', reduced=red)
        await pg.evaluate(START, {'seed': 7, 'ch': 'shopFounder'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        await pg.evaluate("import('./js/scene.js').then((S) => S.setQuality('mid'))"); await pg.wait_for_timeout(800)
        # the renderer is asked to draw an over-span level on one storefront (the engine's flicker flag) — then the scene animates a roll
        await pg.evaluate("import('./js/scene.js').then((S) => S.setLevel('a2', { kind: 'branch', n: 4, own: true, flicker: true }))")
        for _ in range(2): await pg.click('#roll'); await pg.wait_for_timeout(500); await idle(pg)
        await pg.evaluate("import('./js/scene.js').then((S) => S.setLevel('a2', { kind: 'branch', n: 4, own: true, flicker: true }))")
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode && S.setCameraMode('overview'))"); await pg.wait_for_timeout(1500)
        lv = await pg.evaluate("import('./js/scene.js').then((S) => ({ red: S.perfStats().reduced, a2: S.levelOf('a2') }))")
        m = (lv['a2'] or {}).get('model') or {}
        if red: check(sc, 'reduced motion: the over-span sign is drawn dimmed and never blinks (no flicker step ran)', lv['red'] and m.get('flicker') and m.get('sign') == '#7c6a3a' and 'blink' not in m, lv)
        else: check(sc, 'normal motion: the over-span sign flickered while the scene animated', not lv['red'] and m.get('flicker') and 'blink' in m, lv)
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
