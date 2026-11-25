# w16 ארץ השדות end to end in the real page (lobby + game), offline fake backend + guard:
#   map   P.worldMap(): after a ★ in w9 or w10, w16 is a playable card (button, what it teaches, generated art 🌾); locked otherwise
#   pick  w16 card → its rules load lazily → the picker (agronomist / moshavFarmer / agriFund, 🌱 🏡 💼) → a game in w16 (body[data-world=w16],
#         the golden-hour sky, the 🌾 chip, the silos decor; no 404 / page error / failed model / w16 .glb)
#   play  a fixed-seed agronomist game: rolls through paydays to 'H' (בורסת התוצרת) — an export contract (the yield range, what is locked,
#         the quantity risk in words) or water rights; decline = the safe choice; the farm panel from the chip and from 💼 (income vs ₪5M,
#         cash vs the margin, the drought quota, the silo; the price table; a row per field slot with the yield range narrowing to harvest);
#         the silo switch through E.worldAction; a hedge that adds tonnes needs a second tap (the first shows the deposit and the call
#         rule, locks nothing); the range narrows from one payday to the next; the goal (₪5M farm income + 12 months without a forced
#         close — months, never "fixed costs"); the 3D farm = cityModels (each field's crop / phase / hedge / pipe, the silo); save → reload
#         → resume: the same farm.
#   2d    the 2D board on desk / 390 / 360: the w16 colours + the fields motif, the farm card; phones: the produce card and the panel fit the
#         width, every panel button ≥ 44 px
#   3d    the 3D board on 390 / 360; motion: the silos decor is still under reduced motion
# Copies: SRC=<export> COPY_DIR=/tmp/ui1216 PORT_BASE=11500 bash tests/serve_copies.sh
# Usage: python3 tests/w16_e2e.py [--real=http://localhost:11502/] [--shots=DIR] [--only=map,pick,play,2d,3d,motion]
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
PB = int(os.environ.get('PORT_BASE', '11500'))
REAL = OPT.get('real') or f'http://localhost:{PB + 2}/'
SHOTS = OPT.get('shots'); ONLY = set(OPT['only'].split(',')) if OPT.get('only') else None
want = lambda s: ONLY is None or s in ONLY
VP = {'desk': {'width': 1300, 'height': 820}, 'phone': {'width': 390, 'height': 844}, 'small': {'width': 360, 'height': 740}}
ARGS = FB.chrome_args(MODE, ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
STARS = json.dumps({'w1': 1, 'w2': 1, 'w3': 1, 'w4': 1, 'w5': 1, 'w6': 1, 'w7': 1, 'w8': 1, 'w9': 1})
SEED = ("localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-tips-off','1'); localStorage.setItem('rr2-reveal', 'all');"
        "localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true,w5:true,w6:true,w7:true,w8:true,w9:true,w10:true,w11:true,w12:true,w13:true,w15:true,w16:true}));")
UNLOCK = ("(() => { if (localStorage.getItem('rr2-progress')) return; localStorage.setItem('rr2-progress', JSON.stringify({ v: 1, stars: %s, best: {}, achievements: [], pawn: 'classic',"
          " seenWorlds: ['w1','w2','w3','w4','w5','w6','w7','w8','w9'], onboarded: true, tutorialDone: true, gamesPlayed: 6, wins: 6 })); })();" % STARS)
RESULTS = []; ERRS = []; SINKS = []; BAD = []
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def check(sc, name, cond, detail=''):
    RESULTS.append((sc, name, bool(cond))); log(('PASS' if cond else 'FAIL'), f'[{sc}]', name, '' if cond else str(detail)[:700]); return bool(cond)

STATE = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden, gm: !document.querySelector('#gm').hidden,
  gmCls: document.querySelector('#gmCard').className, start: !document.querySelector('#start').hidden, type: (document.querySelector('#evCard').className.match(/ev-(\\w+)/)||[])[1]||null,
  month: (document.querySelector('#hMonth')||{}).textContent || '' })"""
CARD = """() => { const c = document.querySelector('#evCard'); return { title: (c.querySelector('h2') || {}).textContent || '', opts: [...c.querySelectorAll('button[data-o]')].map((b) => b.dataset.o),
  en: [...c.querySelectorAll('button[data-o]:not([disabled])')].map((b) => b.dataset.o), text: c.textContent, auc: !!c.querySelector('.aucmini'), tok: !!c.querySelector('.lot .ptok'),
  div: !!c.querySelector('.div-h'), rng: !!c.querySelector('.acq-r .rbar'), risks: [...c.querySelectorAll('button[data-o]')].map((b) => [b.dataset.o, b.dataset.risk || '', [...b.querySelectorAll('small.sub')].map((x) => x.textContent).join(' · ')]), lg: false }; }"""

AXE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vendor', 'axe-core', 'axe.min.js')
async def axe_bad(pg, sel):
    """axe-core (vendored, no network) on one element after its animations end: the critical / serious violations"""
    await pg.evaluate("() => Promise.race([Promise.all(document.getAnimations().filter((a) => { const t = a.effect && a.effect.getTiming(); return t && t.iterations !== Infinity && a.playState === 'running'; }).map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 3000))])")
    # a passing banner (a toast, the newspaper, a tier hint) may sit over the card's top for a few seconds: wait until every button is hit-testable
    await pg.evaluate("""async (sel) => { for (let i = 0; i < 40; i++) { const bs = [...document.querySelectorAll(sel + ' button')].filter((b) => b.offsetParent);
      if (bs.every((b) => { const r = b.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return true; const e = document.elementFromPoint(r.left + r.width / 2, Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))); return !e || b.contains(e) || e.closest(sel); })) return; await new Promise((r) => setTimeout(r, 200)); } }""", sel)
    if not await pg.evaluate("typeof axe !== 'undefined'"): await pg.add_script_tag(path=AXE)
    v = await pg.evaluate("""async (sel) => { const tr = [...document.querySelectorAll('#toast, #paper')]; tr.forEach((e) => { e.dataset.vis = e.style.visibility; e.style.visibility = 'hidden'; });   // passing toasts / the newspaper overlap the card's top for a moment
      const r = await axe.run({ include: [sel] }, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'] }, resultTypes: ['violations'] });
      tr.forEach((e) => { e.style.visibility = e.dataset.vis || ''; }); return r.violations.filter((x) => x.impact === 'critical' || x.impact === 'serious').map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.map((n) => n.target.join(' ')).slice(0, 4) })); }""", sel)
    return v

async def page(b, vp, flags='', unlock=True, reduced=False):
    kw = FB.new_context_kwargs()
    if reduced: kw['reduced_motion'] = 'reduce'
    ctx = await b.new_context(viewport=VP[vp], device_scale_factor=1, has_touch=vp != 'desk', is_mobile=vp != 'desk', **kw)
    SINKS.append(await FB.install_mode(ctx, FB.FakeBackend() if MODE == 'offline' else None, MODE))
    await ctx.add_init_script(SEED + (UNLOCK if unlock else ''))
    pg = await ctx.new_page(); pg.set_default_timeout(120000)
    pg.on('pageerror', lambda e: (ERRS.append(f'{vp} pageerror: {e}'), log('PAGEERR', e)))
    # never a missing file: every same-origin response must be < 400 (the w16 models are stand-ins, the card art generated)
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
       A module card that is not stopped on is declined (never a buy by accident)."""
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
                if c['lg']: seen['deal'] = c
            if s['type'] == 'mech' and await pg.locator('#evCard button[data-o="pass"]:not([disabled]), #evCard button[data-o="decline"]:not([disabled])').count():
                await pg.locator('#evCard button[data-o="pass"]:not([disabled]), #evCard button[data-o="decline"]:not([disabled])').first.click(); await pg.wait_for_timeout(500); continue
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
    learn: (c.querySelector('.map-learn') || {}).textContent || '', diff: !!c.querySelector('.map-diff'), gen: !!c.querySelector('.gen-art'), motif: (c.querySelector('.gen-motif') || {}).textContent || '' })); }"""

async def run_map(b):
    sc = 'map-desk'; ctx, pg = await page(b, 'desk')
    cards = await pg.evaluate(MAP)
    c = next((x for x in cards if x['id'] == 'w16'), None)
    check(sc, 'after a ★ in w9, w16 is a playable map card (button, what it teaches, difficulty, generated art 🌾)',
          c and c['tag'] == 'BUTTON' and c['act'] == 'world' and not c['soon'] and not c['locked'] and 'מגדרים' in c['learn'] and c['diff'] and c['gen'] and c['motif'] == '🌾', c)
    r = await pg.evaluate("""async () => { const P = await import('./js/progress.js'); P._reset && P._reset({ ...P.getProgress(), stars: { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w7: 1, w8: 1 } });
      const m = P.worldMap().filter((x) => x.id === 'w16').map((x) => ({ id: x.id, unlocked: x.unlocked, lock: x.lockText })); P._reset && P._reset({ ...P.getProgress(), stars: %s }); return m; }""" % STARS)
    check(sc, 'w16 stays locked without a ★ in w9 / w10, and says how to open it', r and r[0]['unlocked'] is False and (r[0]['lock'] or '').strip(), r)
    await shot(pg, 'map_desk')
    await ctx.close()

async def run_pick(b):
    sc = 'pick-desk'; ctx, pg = await page(b, 'desk')
    pre = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w16'))")
    check(sc, 'w16 rules are not loaded at boot (lazy)', pre is False, pre)
    await pg.click('.map-card[data-id="w16"]')
    await pg.wait_for_selector('.wv-char[data-w="w16"]', timeout=60000)
    info = await pg.evaluate("""() => ({ chars: [...document.querySelectorAll('.wv-char')].map((c) => c.dataset.c), h1: document.querySelector('.wv-hero h1').textContent,
      icons: [...document.querySelectorAll('.wv-char .wv-ic')].map((x) => x.textContent), goal: (document.querySelector('.wv-goal') || {}).textContent || '',
      pros: document.querySelectorAll('.wv-char .wv-str').length, cons: document.querySelectorAll('.wv-char .wv-weak').length })""")
    info['loaded'] = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w16'))")
    check(sc, 'the picker waits for the rules, then lists the 3 w16 characters', info['loaded'] and info['chars'] == ['agronomist', 'moshavFarmer', 'agriFund'] and info['h1'] == 'ארץ השדות', info)
    check(sc, 'character icons 🌱 / 🏡 / 💼 (never the 🙂 fallback); pros / cons; the ₪5M goal', info['icons'] == ['🌱', '🏡', '💼'] and info['pros'] >= 3 and info['cons'] >= 3 and '5 מיליון' in info['goal'], info)
    await shot(pg, 'picker_desk')
    await pg.click('.wv-go[data-c="agronomist"]')
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500); await quiet(pg)
    await idle(pg)
    g = await pg.evaluate("""() => ({ world: document.body.dataset.world, chip: (document.querySelector('#worldPanelBtn') || {}).textContent || '', sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(),
      label: (document.querySelector('#worldPanelBtn') || { getAttribute: () => '' }).getAttribute('aria-label') })""")
    g['cfg'] = await pg.evaluate("import('./js/game.js').then((G) => G.activeConfig())")
    check(sc, 'a w16 game started from the picker (agronomist, free), the golden-hour sky', g['world'] == 'w16' and g['cfg'] and g['cfg']['worldId'] == 'w16' and g['cfg']['charId'] == 'agronomist' and g['sky'].lower() == '#fde68a', g)
    check(sc, 'the HUD shows the 🌾 chip (the regime, the farm\'s month) with a full accessible name', '🌾' in g['chip'] and 'הכנסת המשק' in (g['label'] or '') and 'שדות בגידול' in (g['label'] or ''), g)
    fails = await pg.evaluate("import('./js/scene.js').then((S) => S.failedModels ? S.failedModels() : [])")
    check(sc, 'no model failed (the farm is a stand-in)', not fails, fails)
    glb = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().glb)")
    check(sc, 'no w16 .glb was ever requested', not any('/w16/' in u for u in glb), glb)
    sl = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().decor.silos)")
    check(sc, 'the fields decor: silos, field strips, the regime from the farm', sl and sl['silos'] == 4 and sl['strips'] >= 60 and sl['regime'] in ('normal', 'bumper', 'drought', 'glut'), sl)
    await ctx.close()

START = """async ({ seed, ch }) => { const E = await import('./js/engine.js'); await E.ensureWorld('w16'); const G = await import('./js/game.js'); await G.initGame();
  G.startGame({ worldId: 'w16', charId: ch || 'agronomist', mode: 'free', seed, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true, resume: false }); return true; }"""
SAVED = "() => { const r = JSON.parse(localStorage.getItem('rr2-save-free-w16') || 'null'); return r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); }"
HV = "async () => { const E = await import('./js/engine.js'); const r = JSON.parse(localStorage.getItem('rr2-save-free-w16') || 'null'); const st = r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); return st ? E.metrics(st).worldIndicators.harvest : null; }"
PANEL = """() => { const c = document.querySelector('#gmCard'); return { gauges: [...c.querySelectorAll('.wp-g')].map((g) => g.dataset.g), gtext: [...c.querySelectorAll('.wp-g')].map((g) => g.textContent),
  px: [...c.querySelectorAll('.hvtbl tbody tr')].map((r) => r.dataset.crop), caption: !!c.querySelector('.hvtbl caption'),
  rows: [...c.querySelectorAll('.fields .frow')].map((r) => ({ slot: +r.dataset.slot, crop: r.dataset.crop || null, ph: r.dataset.phase || null, empty: r.classList.contains('empty'), rng: (r.querySelector('.frng') || {}).textContent || '', bar: !!r.querySelector('.frng .rbar'), acts: [...r.querySelectorAll('button[data-wact]')].map((b) => b.dataset.aid) })),
  segs: [...c.querySelectorAll('.wp-seg')].map((s) => s.getAttribute('aria-label')), aids: [...c.querySelectorAll('button[data-wact]')].map((b) => b.dataset.aid),
  title: (c.querySelector('h2') || {}).textContent || '', now: (c.querySelector('.wp-now') || {}).textContent || '', text: c.textContent }; }"""
async def close_gm(pg, n=8):
    for _ in range(n):
        if await pg.evaluate("() => document.querySelector('#gm').hidden"): return
        b = pg.locator('#gm .acts button.primary:not([disabled])')
        if await b.count(): await b.first.click()
        else: await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(400)

async def roll_to(pg, kind, n=60, title=None):
    st0 = await pg.evaluate(SAVED); m0 = st0['month'] if st0 else 1; paid = False
    for i in range(n):
        await pg.click('#roll'); await pg.wait_for_timeout(600)
        s = await idle(pg, stop_on=kind)
        st = await pg.evaluate(SAVED)
        if st and st['month'] > m0: paid = True
        if s['card'] and s['type'] == kind:
            c = await pg.evaluate(CARD)
            if title is None or title in c['text']: return c, paid
            await idle(pg)
    return None, paid

H_WORDS = {'export': ['בורסת התוצרת', 'חוזה ייצוא', 'הכמות בחוזה', 'המחיר', 'טווח היבול', 'כבר נעול', 'הקצה הנמוך', 'ביטחונות'], 'water': ['בורסת התוצרת', 'זכויות מים', 'המחיר', 'מכסת המים']}

async def run_play(b):
    sc = 'play-desk'; ctx, pg = await page(b, 'desk')
    await pg.evaluate(START, {'seed': 7, 'ch': 'agronomist'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    await shot(pg, 'board3d_desk')
    kinds = {}; paid_any = False
    for attempt in range(4):
        card, paid = await roll_to(pg, 'mech', title='בורסת התוצרת'); paid_any = paid_any or paid
        if not card: break
        st = await pg.evaluate(SAVED); it = st['pending']['item']; k = it['kind']
        if k not in kinds:
            kinds[k] = card
            rk = {o: (r, t) for o, r, t in card['risks']}
            check(sc, f"an 'H' tile: the produce card ({k}) with its own numbers" + (' — the yield range, what is locked, the quantity risk in words' if k == 'export' else ''),
                  all(w in card['text'] for w in H_WORDS[k]) and {'accept', 'decline'} <= set(card['opts']) and (card['rng'] and rk['accept'][0] == 'quantity' and 'קונים את החסר' in rk['accept'][1] if k == 'export' else True) and rk['decline'][1] == 'בלי לשלם כלום', ([w for w in H_WORDS[k] if w not in card['text']], card['opts'], rk, card['text'][:400]))
            bad = await axe_bad(pg, '#evm'); check(sc, f'axe: the produce card ({k}) has no critical / serious violation', not bad, bad)
            await shot(pg, f'produce_{k}_desk')
        c0 = st['cash']; q0 = st['world']['harvest']['quota']; ex0 = [bool(s and s.get('exp')) for s in st['world']['harvest']['slots']]
        await pg.locator('#evCard button[data-o="decline"]').click(); await pg.wait_for_timeout(700)
        st1 = await pg.evaluate(SAVED); H1 = st1['world']['harvest']
        check(sc, f'decline ({k}) = the safe choice: no cash out, the quota and the contracts unchanged', st1['cash'] >= c0 - 1 and H1['quota'] == q0 and [bool(s and s.get('exp')) for s in H1['slots']] == ex0, (c0, st1['cash'], q0, H1['quota']))
        await idle(pg)
        if attempt >= 1: break
    check(sc, 'rolled through a payday', paid_any or (await pg.evaluate(SAVED))['month'] > 1)
    check(sc, 'met the produce card at least once', bool(kinds), list(kinds))
    # a growing field's range before the next payday (the engine's own range)
    X0 = await pg.evaluate(HV); m0 = (await pg.evaluate(SAVED))['month']
    if SHOTS:   # the whole board: the HQ tower and its cables / the silos and the field strips
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('overview'))"); await pg.wait_for_timeout(2500); await shot(pg, 'board3d_overview_desk')
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('follow'))"); await pg.wait_for_timeout(1500)
    await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
    P = await pg.evaluate(PANEL); st = await pg.evaluate(SAVED); F = st['world']['harvest']
    check(sc, 'panel: 4 gauges (the farm\'s month vs ₪5M, cash vs the margin a call needs — or "no open hedge", the drought quota in %, the silo in tonnes) and the farm line',
          P['gauges'] == ['income', 'margin', 'quota', 'silo'] and '₪' in P['gtext'][0] and ('אין גידור פתוח' in P['gtext'][1] or '×' in P['gtext'][1]) and '%' in P['gtext'][2] and 'טון' in P['gtext'][3] and 'השדות' in P['title'] and 'מכסת מים' in P['now'], (P['gauges'], P['gtext'], P['now'][:300]))
    check(sc, 'the price table: 3 crops with a caption (fair, local, long-run)', P['px'] == ['wheat', 'cotton', 'avo'] and P['caption'], P['px'])
    eng = [(i, s) for i, s in enumerate(F['slots'])]
    check(sc, 'a row per field slot = the engine (crop, phase; an empty slot says so); a growing field shows its yield range with a bar',
          len(P['rows']) == len(eng) and all((r['empty'] if s is None else (r['crop'] == s['crop'] and r['ph'] == s['ph'])) for r, (i, s) in zip(P['rows'], eng)) and all(('טווח היבול' in r['rng'] and r['bar']) for r in P['rows'] if r['ph'] == 'grow'), (P['rows'], F['slots']))
    bad = await axe_bad(pg, '#gm'); check(sc, 'axe: the farm panel has no critical / serious violation', not bad, bad)
    if SHOTS: await pg.wait_for_timeout(1500); await pg.add_style_tag(content='#toast{visibility:hidden !important}')
    await shot(pg, 'panel_desk')
    if SHOTS:
        await pg.evaluate("() => document.querySelector('#gmCard .fields')?.scrollIntoView({ block: 'start' })"); await pg.wait_for_timeout(500); await shot(pg, 'panel_fields_desk')
    # the silo switch through E.worldAction (one tap)
    idx = await pg.evaluate("() => { const b = document.querySelector('#gmCard button[data-aid=\"store\"]:not([disabled])'); return b ? +b.dataset.wact : -1; }")
    check(sc, 'a field\'s silo switch is offered', idx >= 0, idx)
    if idx >= 0:
        slot = await pg.evaluate(f"() => {{ const b = document.querySelector('#gmCard button[data-wact=\"{idx}\"]'); return +b.closest('.frow').dataset.slot; }}")
        z0 = sum(1 for a in st.get('actions', []) if a[0] == 'Z'); s0 = F['slots'][slot]['store']
        await pg.locator(f'#gmCard button[data-wact="{idx}"]').click(); await pg.wait_for_timeout(900)
        msg = await pg.evaluate("() => { const m = document.querySelector('#gmCard .wp-msg'); return { t: m.textContent, c: m.className }; }")
        st = await pg.evaluate(SAVED)
        check(sc, 'the silo switch went through E.worldAction (engine store flipped, one more Z action, the panel redrawn with its toast)', bool(st['world']['harvest']['slots'][slot]['store']) != bool(s0) and sum(1 for a in st.get('actions', []) if a[0] == 'Z') == z0 + 1 and 'pos' in msg['c'] and 'יבול' in msg['t'], (msg, s0, st['world']['harvest']['slots'][slot]['store']))
    # a hedge that adds tonnes: the first tap shows the deposit + the call rule and locks nothing; the second locks
    h_i = await pg.evaluate("() => { const b = [...document.querySelectorAll('#gmCard button[data-aid=\"hedge\"]:not([disabled])')].find((x) => /ביטחונות/.test(x.textContent)); return b ? +b.dataset.wact : -1; }")
    check(sc, 'a hedge level with its deposit is offered on a growing field', h_i >= 0, h_i)
    if h_i >= 0:
        slot = await pg.evaluate(f"() => +document.querySelector('#gmCard button[data-wact=\"{h_i}\"]').closest('.frow').dataset.slot")
        st0 = await pg.evaluate(SAVED); h0 = (st0['world']['harvest']['slots'][slot].get('h') or {}).get('q', 0); c0 = st0['cash']
        await pg.locator(f'#gmCard button[data-wact="{h_i}"]').click(); await pg.wait_for_timeout(500)
        r = await pg.evaluate("() => ({ arm: !!document.querySelector('#gmCard button[data-arm=\"1\"]'), msg: document.querySelector('#gmCard .wp-msg').textContent })")
        h1 = ((await pg.evaluate(SAVED))['world']['harvest']['slots'][slot].get('h') or {}).get('q', 0)
        check(sc, 'a hedge needs a second tap: the first shows the deposit and the margin-call rule BEFORE confirming, locks nothing', r['arm'] and 'מפקידים' in r['msg'] and 'ביטחונות' in r['msg'] and 'בכוח' in r['msg'] and 'לחיצה נוספת מאשרת' in r['msg'] and h1 == h0, (r, h0, h1))
        await shot(pg, 'panel_hedge_armed_desk')
        await pg.locator(f'#gmCard button[data-wact="{h_i}"]').click(); await pg.wait_for_timeout(1000)
        st1 = await pg.evaluate(SAVED); h2 = (st1['world']['harvest']['slots'][slot].get('h') or {}).get('q', 0)
        check(sc, 'the second tap locks: the engine hedge grows, the deposit leaves the cash', h2 > h0 and st1['cash'] < c0, (h0, h2, c0, st1['cash']))
    await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await close_gm(pg)
    # the range narrows to harvest: the same growing field one payday later
    grow0 = {s['slot']: s for s in (X0 or {}).get('slots', []) if not s.get('empty') and s['phase'] == 'grow' and (s.get('harvestIn') or 0) >= 2}
    for _ in range(8):
        await pg.click('#roll'); await pg.wait_for_timeout(500); await idle(pg)
        if (await pg.evaluate(SAVED))['month'] > m0: break
    X1 = await pg.evaluate(HV)
    pairs = [(grow0[s['slot']], s) for s in (X1 or {}).get('slots', []) if s['slot'] in grow0 and not s.get('empty') and s['phase'] == 'grow']
    check(sc, 'a growing field\'s yield range narrows from one payday to the next (the engine\'s range, shown in the panel row)', pairs and all((b1['range']['hi'] - b1['range']['lo']) < (a1['range']['hi'] - a1['range']['lo']) for a1, b1 in pairs), [(a1['range'], b1['range']) for a1, b1 in pairs] or (X0, X1))
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=5000)
    row = await pg.evaluate("() => { const r = document.querySelector('#gmCard .mh-row[data-row=\"world\"]'); return r ? r.textContent : null; }")
    check(sc, '💼 has the "השדות והגידור" row (the regime, the farm\'s month, fields growing)', row and 'השדות והגידור' in row and 'הכנסת המשק' in row and 'בגידול' in row, row)
    if row:
        await pg.click('#gmCard .mh-row[data-row="world"] button[data-hub="world"]'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
        check(sc, '💼 → the farm panel opens', await pg.locator('#gmCard.wpanel').count() == 1)
        await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await close_gm(pg)
    await pg.click('#hGoalBtn'); await pg.wait_for_selector('#goalPanel:not([hidden])', timeout=5000)
    gp = await pg.evaluate("() => document.querySelector('#goalPanel').textContent")
    hud = await pg.evaluate("() => ({ sub: document.querySelector('#hGoal .gsub').textContent, tags: [...document.querySelectorAll('#hGoal .gbar em')].map((e) => e.textContent), label: document.querySelector('#hGoal .gl span').textContent })")
    check(sc, 'goal: ₪5 מיליון of farm income AND 12 months without a forced close — never "fixed costs"; the HUD: הכנסה / רצף',
          '5 מיליון' in gp and 'הכנסת המשק' in gp and 'בכוח' in gp and 'עלויות קבועות' not in gp and 'הדרך ליעד' in gp and hud['tags'] == ['הכנסה', 'רצף'] and hud['label'] == 'הכנסה ורצף' and '🛡️' in hud['sub'], (gp[:400], hud))
    await pg.click('#hGoalBtn'); await pg.wait_for_timeout(300)
    a0 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    lv_ok = len(a0['farm']) == 1 and all(a0['levels'].get(k, {}).get('kind') == 'farm' and [(f or {}).get('crop') for f in a0['levels'][k]['fields']] == [(f or {}).get('crop') for f in v['fields']] for k, v in a0['farm'].items())
    check(sc, '3D: the city equals cityModels and the farm carries its level (fields, silo, regime)', a0['want'] == a0['scene'] and lv_ok, a0)
    k = list(a0['farm'])[0]; v = a0['farm'][k]; m = ((await pg.evaluate("(k) => import('./js/scene.js').then((S) => S.levelOf ? S.levelOf(k) : null)", k)) or {}).get('model') or {}
    fok = m and len(m.get('fields') or []) == 6 and all((x is None) == (f is None) and (f is None or (x['crop'] == f['crop'] and x['ph'] == f['ph'] and x['irr'] == bool(f['irr']) and (x['hedged'] > 0) == (f['ph'] == 'grow' and f['hedged'] > 0))) for x, f in zip(m['fields'], v['fields'])) and m.get('silo') == v['silo']
    check(sc, '3D: the farm drew each field (crop / phase, its hedge band, its pipe) and the silo (scene.levelOf model)', fok, (m, v))
    await pg.reload(); await pg.wait_for_selector('.lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
    await pg.click('.map-card[data-id="w16"]'); await pg.wait_for_selector('[data-act="continue-free"][data-id="w16"]', timeout=60000)
    await pg.click('[data-act="continue-free"][data-id="w16"]'); await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    a1 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    check(sc, 'after reload + resume: the same city and the same farm level (engine = scene)', a1['want'] == a0['want'] and a1['want'] == a1['scene'] and a1['farm'] == a0['farm'], (a0['farm'], a1['farm']))
    await ctx.close()

async def run_2d(b):
    for vp in ('desk', 'phone', 'small'):
        sc = f'2d-{vp}'; ctx, pg = await page(b, vp, flags='?ff=board2d:on')
        await pg.evaluate(START, {'seed': 7, 'ch': 'moshavFarmer' if vp == 'desk' else 'agriFund'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(1500)
        await idle(pg)
        if vp != 'desk':
            card, _ = await roll_to(pg, 'mech', title='בורסת התוצרת')
            check(sc, "reached an 'H' tile on the 2D board", card is not None)
            if card:
                await pg.wait_for_timeout(900)
                over = await pg.evaluate("() => [...document.querySelectorAll('#evCard .grid .row, #evCard .div-h')].filter((r) => r.scrollWidth > r.clientWidth + 1).map((r) => [r.textContent, r.scrollWidth, r.clientWidth])")
                fit = await pg.evaluate("() => { const c = document.querySelector('#evCard').getBoundingClientRect(); return c.width <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#evCard button[data-o]')].every((x) => x.getBoundingClientRect().height >= 43.5); }")
                check(sc, 'the produce card fits the phone width (no row overflows, every button ≥ 44 px)', fit and not over, over)
                await shot(pg, f'produce_card_{vp}')
                await pg.locator('#evCard button[data-o="decline"]').click(); await pg.wait_for_timeout(600)
                await idle(pg)
        else:
            for _ in range(3): await pg.click('#roll'); await pg.wait_for_timeout(400); await idle(pg)
        a = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        cards = await pg.evaluate("""() => [...document.querySelectorAll('.b2d-card')].filter((x) => x.dataset.kind === 'farm').map((c) => ({ key: c.dataset.key, label: c.getAttribute('aria-label'),
          corner: (c.querySelector('.b2d-corner-b') || {}).textContent || '', run: c.dataset.run, pct: c.style.getPropertyValue('--b2d-pct') }))""")
        def card_ok(c):
            v = a['farm'].get(c['key']) or {}; fs = [f for f in v.get('fields', []) if f]; g = sum(1 for f in fs if f['ph'] == 'grow')
            return v and c['run'] == v['regime'] and c['pct'] == f"{round(g / len(fs) * 100) if fs else 0}%" and f'{len(fs)} שדות' in c['label'] and c['corner'] in ('🌾', '🔒', '🏜️')
        check(sc, '2D: the farm card shows its fields growing as the bar, the regime, its fields in its name = the engine', cards and len(cards) == len(a['farm']) and all(card_ok(c) for c in cards), (cards, a['farm']))
        th = await pg.evaluate("() => ({ world: document.body.dataset.world, sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(), board: ((document.querySelector('[class*=b2d-m-]') || {}).style || { getPropertyValue: () => '' }).getPropertyValue('--b2d-board').trim(), motif: [...(document.querySelector('[class*=b2d-m-]') || { classList: [] }).classList].find((x) => x.startsWith('b2d-m-')) || '' })")
        check(sc, '2D: the w16 look (data-world=w16, the golden-hour sky, the wheat-olive board, the fields motif)', th['world'] == 'w16' and th['sky'].lower() == '#fde68a' and th['board'].lower() == '#c9c46b' and th['motif'] == 'b2d-m-fields', th)
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const h = document.querySelector('#hWorld').getBoundingClientRect(); const r = b.getBoundingClientRect(); return { chip: r.left >= h.left - 1 && r.right <= h.right + 1, over: document.documentElement.scrollWidth > innerWidth + 1, t: b.textContent }; }")
        check(sc, 'the 🌾 chip stays inside the HUD card', chip and chip['chip'] and not chip['over'] and '🌾' in chip['t'], chip)
        await shot(pg, f'board2d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        fit = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const r = c.getBoundingClientRect(); const tw = c.querySelector('.tblwrap'); return { w: r.width, vw: innerWidth, over: document.documentElement.scrollWidth > innerWidth + 1, acts: [...c.querySelectorAll('button[data-wact]')].every((b) => b.getBoundingClientRect().height >= 43.5), touch: [...c.querySelectorAll('button[data-wact]')].every((b) => getComputedStyle(b).touchAction === 'manipulation'), rows: [...c.querySelectorAll('.wp-g, .wp-now, .frow')].every((x) => x.scrollWidth <= x.clientWidth + 1), table: !!tw && tw.getBoundingClientRect().right <= innerWidth + 1 && tw.getBoundingClientRect().left >= -1 }; }")
        check(sc, 'panel fits the width (gauges, the price table, the field rows), every action button ≥ 44 px with touch-action manipulation', fit['w'] <= fit['vw'] and not fit['over'] and fit['acts'] and fit['touch'] and fit['rows'] and fit['table'], fit)
        if vp != 'desk':
            if SHOTS: await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await shot(pg, f'panel_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_3dphone(b):
    for vp in ('phone', 'small'):
        sc = f'3d-{vp}'; ctx, pg = await page(b, vp)
        await pg.evaluate(START, {'seed': 7, 'ch': 'agronomist'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        k = await pg.evaluate("import('./js/scene.js').then((S) => S.kind)")
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const h = document.querySelector('#hWorld').getBoundingClientRect(); const r = b.getBoundingClientRect(); return { chip: r.left >= h.left - 1 && r.right <= h.right + 1, t: b.textContent }; }")
        check(sc, '3D board on a phone; the 🌾 chip stays inside the HUD card', k == '3d' and chip and chip['chip'] and '🌾' in chip['t'], (k, chip))
        await shot(pg, f'board3d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        g = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const t = c.querySelector('.tblwrap'); const r = t.getBoundingClientRect(); return { over: document.documentElement.scrollWidth > innerWidth + 1, table: r.left >= -1 && r.right <= innerWidth + 1, rows: [...c.querySelectorAll('.frow')].every((x) => x.getBoundingClientRect().right <= innerWidth + 1), gauges: [...c.querySelectorAll('.wp-g')].every((x) => x.scrollWidth <= x.clientWidth + 1) }; }")
        check(sc, 'the price table, the field rows and the gauges fit the phone width', g['table'] and g['rows'] and not g['over'] and g['gauges'], g)
        if SHOTS:
            await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await pg.evaluate("() => document.querySelector('#gmCard .fields')?.scrollIntoView({ block: 'start' })"); await pg.wait_for_timeout(500)
        await shot(pg, f'panel_fields_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_motion(b):
    """the silos decor is still under reduced motion (no updater): the idle scene renders no new frames"""
    sc = 'motion-reduced'; ctx, pg = await page(b, 'desk', reduced=True)
    await pg.evaluate(START, {'seed': 7, 'ch': 'agronomist'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    s0 = await pg.evaluate("import('./js/scene.js').then((S) => ({ red: S.perfStats().reduced, sl: S.perfStats().decor.silos, fps: S.perfStats().framesRendered }))")
    await pg.wait_for_timeout(2500)
    s1 = await pg.evaluate("import('./js/scene.js').then((S) => ({ sl: S.perfStats().decor.silos, fps: S.perfStats().framesRendered }))")
    check(sc, 'reduced motion: the silos decor is drawn and the idle scene renders no new frames (still)', s0['red'] and s0['sl'] and s0['sl']['silos'] == 4 and s1['sl'] == s0['sl'] and s1['fps'] - s0['fps'] <= 2, (s0, s1))
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
