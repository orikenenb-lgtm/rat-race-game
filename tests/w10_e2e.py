# Worlds wave 4 — w10 מרכז הפיננסים end to end in the real page (lobby + game), offline fake backend + guard:
#   map   P.worldMap(): after a ★ in one of w6 / w7 / w8, w10 is a playable card (generated art 🏦); without it w10 is locked and says so
#   pick  w10 card → its rules load lazily → the character picker (allocator / blockHeir / floorTrader, pros / cons, 📊 🏭 ⚡) → a game starts in
#         w10 (body[data-world=w10], the blue-hour sky, the 📊 chip, no 404 / page error / failed model: every w10 model is procedural)
#   play  a fixed-seed allocator game: rolls through paydays to a 'W' (הבורסה) tile — the trading-floor card (regime, the index, your market
#         value, the focus company, the month's news, the simulation line) — and to a 'Y' (השקעה פרטית) tile — the private deal (type, size, the
#         multiple band, calls / lock, LTV 0, liquid vs unfunded; the due diligence keeps the card open and narrows the band). The market screen
#         (3 gauges, the liquidity ladder, the tabs; every company with name + symbol, sector, price, change ₪ and % with ▲ / ▼ words, holdings);
#         a company's detail: the candle chart (the engine's own candles), the month table with OHLC + volume, events / news; a tap on a candle
#         shows exactly the engine's OHLC + volume of that month; a BUY with its preview (spread, commission, total) BEFORE the confirm and the
#         engine charging exactly that; a SELL with tax in the preview and a second tap; "נסגרו" keeps a bankrupt company with its history and
#         claim status; the funds / private tab; a hedge through E.worldAction; the goal panel (₪400M, ★★★ without a forced sale); 3D city =
#         cityModels with every block's level; save → reload → resume: the same city
#   phone the market screen on 390 / 360: list, detail, chart and trade fit the width, every button ≥ 44 px; 2D board (glass / stone / vault)
#   motion the ticker band runs with normal motion, never with reduced motion; a margin call turns it red in both
# Copies: SRC=<export> COPY_DIR=/tmp/ui910 PORT_BASE=11200 bash tests/serve_copies.sh
# Usage: python3 tests/w10_e2e.py [--real=http://localhost:11202/] [--shots=DIR] [--only=map,pick,play,phone,motion]
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
PB = int(os.environ.get('PORT_BASE', '11200'))
REAL = OPT.get('real') or f'http://localhost:{PB + 2}/'
SHOTS = OPT.get('shots'); ONLY = set(OPT['only'].split(',')) if OPT.get('only') else None
want = lambda s: ONLY is None or s in ONLY
VP = {'desk': {'width': 1300, 'height': 820}, 'phone': {'width': 390, 'height': 844}, 'small': {'width': 360, 'height': 740}}
ARGS = FB.chrome_args(MODE, ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
STARS = json.dumps({'w1': 1, 'w2': 1, 'w3': 1, 'w4': 1, 'w5': 1, 'w7': 1})
SEED = ("localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-tips-off','1'); localStorage.setItem('rr2-reveal', 'all');"
        "localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true,w5:true,w6:true,w7:true,w8:true,w9:true,w10:true}));")
UNLOCK = ("(() => { if (localStorage.getItem('rr2-progress')) return; localStorage.setItem('rr2-progress', JSON.stringify({ v: 1, stars: %s, best: {}, achievements: [], pawn: 'classic',"
          " seenWorlds: ['w1','w2','w3','w4','w5','w7'], onboarded: true, tutorialDone: true, gamesPlayed: 6, wins: 6 })); })();" % STARS)
RESULTS = []; ERRS = []; SINKS = []; BAD = []
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def check(sc, name, cond, detail=''):
    RESULTS.append((sc, name, bool(cond))); log(('PASS' if cond else 'FAIL'), f'[{sc}]', name, '' if cond else str(detail)[:700]); return bool(cond)

STATE = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden, gm: !document.querySelector('#gm').hidden,
  gmCls: document.querySelector('#gmCard').className, start: !document.querySelector('#start').hidden, type: (document.querySelector('#evCard').className.match(/ev-(\\w+)/)||[])[1]||null,
  month: (document.querySelector('#hMonth')||{}).textContent || '' })"""
CARD = """() => { const c = document.querySelector('#evCard'); return { title: (c.querySelector('h2') || {}).textContent || '', opts: [...c.querySelectorAll('button[data-o]')].map((b) => b.dataset.o),
  en: [...c.querySelectorAll('button[data-o]:not([disabled])')].map((b) => b.dataset.o), text: c.textContent, mt: c.querySelectorAll('.mt > div').length, warn: !!c.querySelector('.warn'), pf: !!c.querySelector('.pfmini'), sim: !!c.querySelector('.mk-sim') }; }"""

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
    # never a missing file: every same-origin response must be < 400 (the w10 models are procedural, the card art generated)
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
       seen: a dict — the first fund deal card is recorded there (seen['deal'])"""
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
                if c['pf']: seen['deal'] = c
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
    c = next((x for x in cards if x['id'] == 'w10'), None)
    check(sc, 'after a ★ in w7, w10 is a playable map card (button, what it teaches, difficulty, generated art 🏦)',
          c and c['tag'] == 'BUTTON' and c['act'] == 'world' and not c['soon'] and not c['locked'] and 'פיזור' in c['learn'] and c['diff'] and c['gen'] and c['motif'] == '🏦', c)
    r = await pg.evaluate("""async () => { const P = await import('./js/progress.js'); P._reset && P._reset({ ...P.getProgress(), stars: { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1 } });
      const m = P.worldMap().filter((x) => x.id === 'w10').map((x) => ({ id: x.id, unlocked: x.unlocked, lock: x.lockText })); P._reset && P._reset({ ...P.getProgress(), stars: %s }); return m; }""" % STARS)
    check(sc, 'w10 needs an escape in one of w6 / w7 / w8: locked without it, and says so', r and r[0]['unlocked'] is False and 'רשתות המסחר' in (r[0]['lock'] or ''), r)
    await shot(pg, 'map_desk')
    await ctx.close()

async def run_pick(b):
    sc = 'pick-desk'; ctx, pg = await page(b, 'desk')
    pre = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w10'))")
    check(sc, 'w10 rules are not loaded at boot (lazy)', pre is False, pre)
    await pg.click('.map-card[data-id="w10"]')
    await pg.wait_for_selector('.wv-char[data-w="w10"]', timeout=60000)
    info = await pg.evaluate("""() => ({ chars: [...document.querySelectorAll('.wv-char')].map((c) => c.dataset.c), h1: document.querySelector('.wv-hero h1').textContent,
      icons: [...document.querySelectorAll('.wv-char .wv-ic')].map((x) => x.textContent), goal: (document.querySelector('.wv-goal') || {}).textContent || '',
      pros: document.querySelectorAll('.wv-char .wv-str').length, cons: document.querySelectorAll('.wv-char .wv-weak').length })""")
    info['loaded'] = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w10'))")
    check(sc, 'the picker waits for the rules, then lists the 3 w10 characters', info['loaded'] and info['chars'] == ['allocator', 'blockHeir', 'floorTrader'] and info['h1'] == 'מרכז הפיננסים', info)
    check(sc, 'character icons 📊 / 🏭 / ⚡ (never the 🙂 fallback); pros / cons; the ₪400M goal', info['icons'] == ['📊', '🏭', '⚡'] and info['pros'] >= 3 and info['cons'] >= 3 and '400' in info['goal'], info)
    await shot(pg, 'picker_desk')
    await pg.click('.wv-go[data-c="allocator"]')
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500); await quiet(pg)
    await idle(pg)
    g = await pg.evaluate("""() => ({ world: document.body.dataset.world, chip: (document.querySelector('#worldPanelBtn') || {}).textContent || '', sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim() })""")
    g['cfg'] = await pg.evaluate("import('./js/game.js').then((G) => G.activeConfig())")
    check(sc, 'a w10 game started from the picker (allocator, free), the blue-hour sky', g['world'] == 'w10' and g['cfg'] and g['cfg']['worldId'] == 'w10' and g['cfg']['charId'] == 'allocator' and g['sky'].lower() == '#0f172a', g)
    check(sc, 'the HUD shows the 📊 chip (the regime, the LTV)', '📊' in g['chip'] and 'מינוף' in g['chip'], g['chip'])
    fails = await pg.evaluate("import('./js/scene.js').then((S) => S.failedModels ? S.failedModels() : [])")
    check(sc, 'no model failed (every w10 model is a procedural stand-in)', not fails, fails)
    glb = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().glb)")
    check(sc, 'no w10 .glb was ever requested', not any('/w10/' in u for u in glb), glb)
    await ctx.close()

START = """async ({ seed, ch }) => { const E = await import('./js/engine.js'); await E.ensureWorld('w10'); const G = await import('./js/game.js'); await G.initGame();
  G.startGame({ worldId: 'w10', charId: ch || 'allocator', mode: 'free', seed, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true, resume: false }); return true; }"""
SAVED = "() => { const r = JSON.parse(localStorage.getItem('rr2-save-free-w10') || 'null'); return r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); }"
MKP = """() => { const c = document.querySelector('#gmCard'); return { cls: c.className, gauges: [...c.querySelectorAll('.wp-g')].map((g) => g.dataset.g), ladder: [...c.querySelectorAll('.mk-ladder li')].map((x) => x.dataset.rung),
  tabs: [...c.querySelectorAll('[data-mtab]')].map((x) => x.dataset.mtab), pressed: (c.querySelector('[data-mtab][aria-pressed="true"]') || {}).dataset?.mtab || null,
  rows: [...c.querySelectorAll('.mk-list > .mk-co')].map((x) => ({ id: x.dataset.co, label: (x.querySelector('.mk-row') || {}).textContent || '', text: x.textContent })),
  sim: !!c.querySelector('.mk-sim'), detail: !!c.querySelector('#mkDetail'), text: c.textContent }; }"""

async def roll_to(pg, kind, n=45, seen=None, title=None, until_month=None):
    st0 = await pg.evaluate(SAVED); m0 = st0['month'] if st0 else 1; paid = False
    for i in range(n):
        await pg.click('#roll'); await pg.wait_for_timeout(600)
        s = await idle(pg, stop_on=kind, seen=seen)
        st = await pg.evaluate(SAVED)
        if st and st['month'] > m0: paid = True
        if until_month and st and st['month'] >= until_month and kind is None: return None, paid
        if kind and s['card'] and s['type'] == kind:
            c = await pg.evaluate(CARD)
            if title is None or title in c['text']: return c, paid
            await idle(pg)
    return None, paid

async def open_market(pg):
    await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.mpanel', timeout=10000); await pg.wait_for_timeout(600)

async def run_play(b):
    sc = 'play-desk'; ctx, pg = await page(b, 'desk')
    await pg.evaluate(START, {'seed': 7, 'ch': 'allocator'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    await shot(pg, 'board3d_desk')
    seen = {}
    w, paid = await roll_to(pg, 'mech', seen=seen, title='חדר המסחר')
    check(sc, "landed on a 'W' tile: the trading-floor card (regime, the index ▲ / ▼, your market value, the focus company, the news, the simulation line)",
          w and 'חדר המסחר' in w['text'] and 'מצב השוק' in w['text'] and 'קרן מדד' in w['text'] and 'התיק שלך בבורסה' in w['text'] and w['sim'] and 'done' in w['opts'], w and (w['title'], w['opts'], w['text'][:400]))
    if w:
        bad = await axe_bad(pg, '#evm'); check(sc, 'axe: the trading-floor card has no critical / serious violation', not bad, bad)
        await shot(pg, 'exchange_card_desk')
        await pg.locator('#evCard button[data-o="peek" i], #evCard button[data-o="done"]').first.click(); await pg.wait_for_timeout(800); await idle(pg)
    y, paid2 = await roll_to(pg, 'mech', seen=seen, title='מכפיל צפוי')
    check(sc, 'rolled through a payday', paid or paid2)
    check(sc, "landed on a 'Y' tile: the private deal (type, size, the multiple band, LTV 0, liquid vs unfunded, cash after)", y and 'מכפיל צפוי' in y['text'] and 'אפשר ללוות כנגדה' in y['text'] and 'נזיל' in y['text'] and {'commit', 'half', 'pass'} <= set(y['opts']), y and (y['opts'], y['text'][:400]))
    if y and 'dd' in y['en']:
        await shot(pg, 'private_card_desk')
        await pg.locator('#evCard button[data-o="dd"]').click(); await pg.wait_for_timeout(1200)
        s2 = await pg.evaluate(STATE); c2 = await pg.evaluate(CARD)
        check(sc, 'the due diligence keeps the card open and redraws it: "(אחרי בדיקה)", no dd option', s2['card'] and s2['type'] == 'mech' and '(אחרי בדיקה)' in c2['text'] and 'dd' not in c2['opts'], (s2, c2['opts'], c2['text'][:300]))
    if y: await pg.locator('#evCard button[data-o="pass"]').click(); await pg.wait_for_timeout(700); await idle(pg)
    d = seen.get('deal')
    if d: check(sc, 'a fund deal card shows its block (liquidity, yield, sensitivities, how to redeem)', d['pf'] and 'נזילות חודשית' in d['text'] and 'רגישות' in d['text'], d['text'][:300])
    # past month 4: seed 7 has a bankruptcy in month 3 (the market draws never read the player's choices)
    st = await pg.evaluate(SAVED)
    if st['month'] < 5: await roll_to(pg, None, n=40, until_month=5)
    await idle(pg)
    st = await pg.evaluate(SAVED); M = st['mkt']
    await open_market(pg)
    P = await pg.evaluate(MKP)
    live = [c for c in M['cos'].values() if c['status'] in ('listed', 'halted') and c['id'] in M['slots']]
    check(sc, 'the market screen: 3 gauges (net worth vs target / LTV / liquid vs owed), the 4-rung liquidity ladder, 4 tabs, the simulation line',
          'mpanel' in P['cls'] and P['gauges'] == ['nw', 'ltv', 'liquid'] and P['ladder'] == ['cash', 'daily', 'monthly', 'locked'] and P['tabs'] == ['list', 'closed', 'funds', 'acts'] and P['pressed'] == 'list' and P['sim'] and 'סימולציה — גרף ותוצאה במשחק אינם מבטיחים תוצאה בעולם האמיתי' in P['text'], P['gauges'])
    ids = [r['id'] for r in P['rows']]
    check(sc, 'every live company is a row (+ the index fund first), each named with name + symbol + sector + price + ▲ / ▼ words + the change in ₪ and %',
          ids[0] == 'IDX' and set(ids[1:]) == {c['id'] for c in live} and all(r['label'] and ('עלה' in r['label'] or 'ירד' in r['label'] or 'לא זז' in r['label']) and '%' in r['label'] and '₪' in r['label'] and 'סימול' in r['label'] for r in P['rows']), (ids, [c['id'] for c in live], P['rows'][:2]))
    bad = await axe_bad(pg, '#gm'); check(sc, 'axe: the market screen has no critical / serious violation', not bad, bad)
    if SHOTS: await pg.add_style_tag(content='#toast{visibility:hidden !important}')
    await shot(pg, 'market_desk')
    # a held company → its detail
    held = [c for c in live if c['id'] in M['held'] and c['status'] == 'listed']
    co = held[0] if held else live[0]
    await pg.locator(f'#gmCard [data-mco="{co["id"]}"]').click(); await pg.wait_for_timeout(900)
    D = await pg.evaluate("""() => { const d = document.querySelector('#mkDetail'); return d && { chart: !!d.querySelector('.cdl-chart[role=slider]'), groups: d.querySelectorAll('.cdl-c').length, vols: d.querySelectorAll('.cdl-vol').length,
      rows: d.querySelectorAll('.cdl-tbl tbody tr').length, volHead: [...d.querySelectorAll('.cdl-tbl thead th')].some((x) => x.textContent.includes('מחזור')), hold: !!d.querySelector('.cdl-hold'), text: d.textContent,
      trade: !!d.querySelector('#mkTrade'), amt: !!d.querySelector('#mkAmt') }; }""")
    nC = len(co['cand']) + 1
    check(sc, f'{co["name"]}: the detail has the candle chart (one shape per month = the engine\'s {nC - 1} candles + the open one), the month table with OHLC + volume, your position, the trade form',
          D and D['chart'] and D['groups'] == min(nC, 36) and D['rows'] == nC and D['volHead'] and (D['hold'] or co['id'] not in M['held']) and D['trade'] and D['amt'] and co['tk'] in D['text'], D and {k: v for k, v in D.items() if k != 'text'})
    # a tap on a candle (the one before the last) → the readout = the engine's own OHLC + volume of that month
    tap = await pg.evaluate("""() => { const g = [...document.querySelectorAll('#mkDetail .cdl-c')]; const x = g[Math.max(0, g.length - 2)]; if (!x) return null; const r = x.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }""")
    if tap:
        await pg.mouse.click(tap['x'], tap['y']); await pg.wait_for_timeout(300)
        ro = await pg.evaluate("() => { const r = document.querySelector('#mkDetail .cdl-ro'); return { m: +r.dataset.m, ohlc: r.dataset.ohlc, v: r.dataset.v, text: r.textContent }; }")
        row = next((r for r in co['cand'] if r[0] == ro['m']), None)
        want_ohlc = ','.join(str(x / 100 if x % 100 else x // 100) for x in row[1:5]) if row else None
        def same(a, b):
            try: return all(abs(float(x) - float(y)) < 1e-9 for x, y in zip(a.split(','), b.split(',')))
            except Exception: return False
        check(sc, 'a tap on a candle shows that month: open / high / low / close and the volume = the engine\'s candle row (agorot / 100)', row and same(ro['ohlc'], want_ohlc) and int(ro['v']) == row[6] and 'פתיחה' in ro['text'] and 'מחזור' in ro['text'], (ro, row))
    await shot(pg, 'market_detail_desk')
    # BUY ₪1M: the preview (spread, commission, total) is on screen before the confirm; the engine charges exactly that
    st0 = await pg.evaluate(SAVED); q0 = (st0['mkt']['held'].get(co['id']) or {}).get('qty', 0); cash0 = st0['cash']
    await pg.locator('#gmCard [data-mq="1000000"]').click(); await pg.wait_for_timeout(400)
    pv = await pg.evaluate("() => { const g = document.querySelector('#mkPv .mk-pvg'); const go = document.querySelector('#mkPv [data-mgo]'); return g && { qty: +g.dataset.qty, total: +g.dataset.total, spread: +g.dataset.spread, comm: +g.dataset.comm, text: document.querySelector('#mkPv').textContent, go: go && go.dataset.mgo, dis: go && go.disabled }; }")
    check(sc, 'the buy preview shows the quantity, the fill price, the spread, the commission and the total BEFORE the confirm button', pv and pv['qty'] > 0 and pv['spread'] > 0 and pv['comm'] > 0 and 'מרווח' in pv['text'] and 'עמלה' in pv['text'] and 'יוצא מהמזומן' in pv['text'] and pv['go'] == f"{co['id']}:b:{pv['qty']}" and not pv['dis'], pv)
    if pv and not pv['dis']:
        await pg.locator('#mkPv [data-mgo]').click(); await pg.wait_for_timeout(900)
        st1 = await pg.evaluate(SAVED); q1 = (st1['mkt']['held'].get(co['id']) or {}).get('qty', 0)
        msg = await pg.evaluate("() => { const m = document.querySelector('#gmCard .wp-msg'); return { t: m.textContent, c: m.className }; }")
        z = [a for a in st1.get('actions', []) if a[0] == 'Z']
        check(sc, 'the buy went through E.worldAction for exactly the previewed quantity, and the cash fell by exactly the previewed total', q1 - q0 == pv['qty'] and cash0 - st1['cash'] == pv['total'] and z and 'pos' in msg['c'], (q0, q1, cash0, st1['cash'], pv['total'], msg, z[-1:] if z else None))
    # SELL a quarter: the preview names the tax; the confirm needs a second tap
    await pg.locator('#gmCard [data-mside="s"]').click(); await pg.wait_for_timeout(500)
    await pg.locator('#gmCard [data-mq]').first.click(); await pg.wait_for_timeout(400)
    sv = await pg.evaluate("() => { const g = document.querySelector('#mkPv .mk-pvg'); return g && { qty: +g.dataset.qty, tax: g.dataset.tax, text: document.querySelector('#mkPv').textContent }; }")
    check(sc, 'the sell preview shows the capital-gains tax and what enters the cash', sv and sv['qty'] > 0 and 'מס רווח הון' in sv['text'] and 'נכנס למזומן' in sv['text'], sv)
    if sv:
        q0 = ((await pg.evaluate(SAVED))['mkt']['held'].get(co['id']) or {}).get('qty', 0)
        await pg.locator('#mkPv [data-mgo]').click(); await pg.wait_for_timeout(500)
        q1 = ((await pg.evaluate(SAVED))['mkt']['held'].get(co['id']) or {}).get('qty', 0)
        armed = await pg.evaluate("() => !!document.querySelector('#mkPv [data-mgo][data-arm=\"1\"]')")
        check(sc, 'selling needs a second tap (the first one arms the button and sells nothing)', armed and q1 == q0, (armed, q0, q1))
        await pg.locator('#mkPv [data-mgo]').click(); await pg.wait_for_timeout(900)
        q2 = ((await pg.evaluate(SAVED))['mkt']['held'].get(co['id']) or {}).get('qty', 0)
        check(sc, 'the second tap sold exactly the previewed quantity', q0 - q2 == sv['qty'], (q0, q2, sv['qty']))
    # נסגרו: the bankrupt company (seed 7, month 3) with its history and the claim status
    await pg.locator('#gmCard [data-mtab="closed"]').click(); await pg.wait_for_timeout(600)
    st = await pg.evaluate(SAVED); M = st['mkt']
    dead = [c for c in M['cos'].values() if c['status'] in ('bankrupt', 'merged')] + M['grave']
    C = await pg.evaluate(MKP)
    check(sc, '"נסגרו" lists every bankrupt / bought company (still in the market or in the grave) with the end, the peak and the claim status',
          dead and len(C['rows']) == len(dead) and all(('פשטה רגל' in r['text'] or 'נרכשה' in r['text']) and ('תביעה' in r['text'] or 'קיבלת' in r['text']) for r in C['rows']), (len(dead), [r['text'][:120] for r in C['rows']]))
    if C['rows']:
        await pg.locator('#gmCard .mk-dead [data-mco]').first.click(); await pg.wait_for_timeout(800)
        g = await pg.evaluate("() => { const d = document.querySelector('#mkDetail'); return d && { groups: d.querySelectorAll('.cdl-c').length, trade: !!d.querySelector('#mkTrade'), text: d.textContent }; }")
        check(sc, 'a closed company keeps its history: its candles are drawn, and there is no trade form', g and g['groups'] >= 1 and not g['trade'] and ('פשטה רגל' in g['text'] or 'נרכשה' in g['text']), g and {k: v for k, v in g.items() if k != 'text'})
        await shot(pg, 'market_closed_desk')
    # the funds / private tab: the gov fund + the PE commitment, with their actions
    await pg.locator('#gmCard [data-mtab="funds"]').click(); await pg.wait_for_timeout(600)
    F = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); return { rows: c.querySelectorAll('.wp-row').length, acts: [...c.querySelectorAll('button[data-wact]')].map((b) => b.dataset.aid), text: c.textContent }; }")
    check(sc, 'the funds / private tab: a row per fund and private holding, with redeem / sell now / secondary', F['rows'] >= 2 and 'redeem' in F['acts'] and 'secondary' in F['acts'] and 'נזילות חודשית' in F['text'] and 'נעול' in F['text'], F['acts'])
    # the actions tab: the hedge through E.worldAction
    await pg.locator('#gmCard [data-mtab="acts"]').click(); await pg.wait_for_timeout(600)
    h0 = (await pg.evaluate(SAVED))['world']['pf'].get('hedge')
    hb = await pg.evaluate("() => { const b = document.querySelector('#gmCard button[data-aid=\"hedge\"]:not([disabled])'); return b ? +b.dataset.wact : -1; }")
    check(sc, 'the hedge is offered in "מינוף ופעולות" (with the margin actions)', hb >= 0 and await pg.locator('#gmCard button[data-aid="margin"]').count() >= 1, hb)
    if hb >= 0:
        await pg.locator(f'#gmCard button[data-wact="{hb}"]').click(); await pg.wait_for_timeout(900)
        h1 = (await pg.evaluate(SAVED))['world']['pf'].get('hedge')
        check(sc, 'the hedge went through E.worldAction (engine pf.hedge flipped)', bool(h1) != bool(h0), (h0, h1))
    await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=5000)
    row = await pg.evaluate("() => { const r = document.querySelector('#gmCard .mh-row[data-row=\"world\"]'); return r ? r.textContent : null; }")
    check(sc, '💼 has the "הבורסה והתיק" row (net worth, LTV)', row and 'הבורסה' in row and 'מינוף' in row, row)
    if row:
        await pg.click('#gmCard .mh-row[data-row="world"] button[data-hub="world"]'); await pg.wait_for_selector('#gmCard.mpanel', timeout=10000)
        check(sc, '💼 → the market screen opens', await pg.locator('#gmCard.mpanel').count() == 1)
        await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await pg.click('#hGoalBtn'); await pg.wait_for_selector('#goalPanel:not([hidden])', timeout=5000)
    gp = await pg.evaluate("() => document.querySelector('#goalPanel').textContent")
    check(sc, 'goal panel: net worth ₪400 מיליון, the ladder, and ★★★ only without a forced sale', '400 מיליון' in gp and 'שווי נקי' in gp and 'הדרך ליעד' in gp and 'בלי אף מכירה כפויה' in gp, gp[:400])
    await pg.click('#hGoalBtn'); await pg.wait_for_timeout(300)
    a0 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    lv_ok = all(a0['levels'].get(k, {}).get('kind') == 'hold' and a0['levels'][k].get('cls') == v['cls'] and bool(a0['levels'][k].get('call')) == v['call'] for k, v in a0['hold'].items())
    check(sc, '3D: the city equals cityModels and every block carries its class (glass / stone / vault) and value', a0['want'] == a0['scene'] and a0['hold'] and lv_ok, a0)
    models = {k: await pg.evaluate("(k) => import('./js/scene.js').then((S) => S.levelOf ? S.levelOf(k) : null)", k) for k in a0['hold']}
    check(sc, '3D: each block drew its class and floors from the engine (scene.levelOf model)', models and all(((models[k] or {}).get('model') or {}).get('cls') == a0['hold'][k]['cls'] and ((models[k] or {}).get('model') or {}).get('floors', 0) >= 1 for k in models), {k: (models[k] or {}).get('model') for k in models})
    await pg.reload(); await pg.wait_for_selector('.lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
    await pg.click('.map-card[data-id="w10"]'); await pg.wait_for_selector('[data-act="continue-free"][data-id="w10"]', timeout=60000)
    await pg.click('[data-act="continue-free"][data-id="w10"]'); await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    a1 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    check(sc, 'after reload + resume: the same city and the same blocks (engine = scene)', a1['want'] == a0['want'] and a1['want'] == a1['scene'] and a1['hold'] == a0['hold'], (a0['hold'], a1['hold']))
    await ctx.close()

async def run_phone(b):
    for vp in ('phone', 'small'):
        for d2 in (False, True):
            sc = f'{"2d" if d2 else "3d"}-{vp}'; ctx, pg = await page(b, vp, flags='?ff=board2d:on' if d2 else '')
            await pg.evaluate(START, {'seed': 7, 'ch': 'allocator'})
            await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
            await idle(pg)
            if d2:
                a = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
                cards = await pg.evaluate("""() => [...document.querySelectorAll('.b2d-card')].filter((x) => x.dataset.kind === 'hold').map((c) => ({ key: c.dataset.key, label: c.getAttribute('aria-label'), corner: (c.querySelector('.b2d-corner-b') || {}).textContent || '', run: c.dataset.run }))""")
                WORD = {'daily': 'נזיל תוך יומיים', 'monthly': 'נזילות חודשית', 'locked': 'נעול'}
                check(sc, '2D: every holding block shows its class (corner + border + the words in its name) = the engine', cards and len(cards) == len(a['hold']) and all(c['run'] == a['hold'][c['key']]['cls'] and WORD[c['run']] in c['label'] for c in cards), (cards, a['hold']))
                th = await pg.evaluate("() => ({ world: document.body.dataset.world, board: ((document.querySelector('[class*=b2d-m-]') || {}).style || { getPropertyValue: () => '' }).getPropertyValue('--b2d-board').trim(), motif: [...(document.querySelector('[class*=b2d-m-]') || { classList: [] }).classList].find((x) => x.startsWith('b2d-m-')) || '' })")
                check(sc, '2D: the w10 look (navy board from WORLD_STYLE, the ticker motif)', th['world'] == 'w10' and th['board'].lower() == '#1e293b' and th['motif'] == 'b2d-m-ticker', th)
                await shot(pg, f'board2d_{vp}')
                await ctx.close(); continue
            chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const r = b.getBoundingClientRect(), h = document.querySelector('#hWorld').getBoundingClientRect(); return { inside: r.left >= h.left - 1 && r.right <= h.right + 1, t: b.textContent }; }")
            check(sc, '3D board on a phone; the 📊 chip stays inside its HUD card', chip and chip['inside'] and '📊' in chip['t'], chip)
            await shot(pg, f'board3d_{vp}')
            await open_market(pg)
            FIT = "() => { const c = document.querySelector('#gmCard'); return { over: document.documentElement.scrollWidth > innerWidth + 1, w: c.getBoundingClientRect().width, vw: innerWidth, rows: [...c.querySelectorAll('.mk-row, .wp-row, .mk-ladder li, .wp-g')].every((r) => r.scrollWidth <= r.clientWidth + 1), btn: [...c.querySelectorAll('.mk-row, [data-mtab], [data-mq], [data-mside], [data-munit], [data-mgo], button[data-wact]')].filter((b) => b.offsetParent).every((b) => b.getBoundingClientRect().height >= 43.5), touch: [...c.querySelectorAll('[data-mtab], [data-mq], button[data-wact], .mk-row')].every((b) => ['manipulation', 'pan-y'].includes(getComputedStyle(b).touchAction) || getComputedStyle(b).touchAction === 'auto' && false) }; }"
            f1 = await pg.evaluate(FIT)
            check(sc, 'the market screen fits the phone width, every row fits, every button ≥ 44 px', not f1['over'] and f1['w'] <= f1['vw'] and f1['rows'] and f1['btn'], f1)
            if SHOTS: await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await shot(pg, f'market_{vp}')
            await pg.locator('#gmCard .mk-list [data-mco]').nth(1).click(); await pg.wait_for_timeout(900)
            await pg.locator('#gmCard [data-mq]').first.click(); await pg.wait_for_timeout(400)
            f2 = await pg.evaluate("() => { const d = document.querySelector('#mkDetail'); const ch = d.querySelector('.cdl-chart'); const r = ch.getBoundingClientRect(); return { over: document.documentElement.scrollWidth > innerWidth + 1, chart: r.left >= 0 && r.right <= innerWidth && r.width > 200, pv: !!d.querySelector('#mkPv .mk-pvg'), rows: [...d.querySelectorAll('.grid .row, .cdl-hold .row')].every((x) => x.scrollWidth <= x.clientWidth + 1), go: d.querySelector('[data-mgo]').getBoundingClientRect().height >= 43.5 }; }")
            check(sc, 'a company on the phone: the chart, the preview rows and the confirm fit the width (confirm ≥ 44 px)', not f2['over'] and f2['chart'] and f2['pv'] and f2['rows'] and f2['go'], f2)
            ch = pg.locator('#mkDetail .cdl-chart'); bb = await ch.bounding_box()
            await pg.touchscreen.tap(bb['x'] + bb['width'] * 0.5, bb['y'] + bb['height'] * 0.5); await pg.wait_for_timeout(300)
            ro = await pg.evaluate("() => { const r = document.querySelector('#mkDetail .cdl-ro'); return { m: r.dataset.m, ohlc: r.dataset.ohlc }; }")
            check(sc, 'a finger tap on the chart selects a candle and shows its numbers', ro['m'] and ro['ohlc'], ro)
            if SHOTS: await pg.evaluate("() => document.querySelector('#mkDetail')?.scrollIntoView({ block: 'start' })"); await pg.wait_for_timeout(400)
            await shot(pg, f'market_detail_{vp}')
            if SHOTS: await pg.evaluate("() => document.querySelector('#mkTrade')?.scrollIntoView({ block: 'start' })"); await pg.wait_for_timeout(400)
            await shot(pg, f'market_trade_{vp}')
            await pg.locator('#gmCard .acts button.primary').click()
            await ctx.close()

async def run_motion(b):
    """the player's glass tower: its ticker band runs with normal motion, never with reduced motion; a margin call turns it red in both (and the
       decor's ribbon too)"""
    for red in (False, True):
        sc = 'motion-' + ('reduced' if red else 'normal'); ctx, pg = await page(b, 'desk', reduced=red)
        await pg.evaluate(START, {'seed': 7, 'ch': 'allocator'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        await pg.evaluate("import('./js/scene.js').then((S) => S.setQuality('mid'))"); await pg.wait_for_timeout(800)
        lv0 = await pg.evaluate("import('./js/scene.js').then((S) => S.levelOf('mkt:daily'))")
        await pg.evaluate("import('./js/scene.js').then((S) => S.setLevel('mkt:daily', { kind: 'hold', cls: 'daily', value: 38000000, call: true }, { animate: false }))"); await pg.wait_for_timeout(300)
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode && S.setCameraMode('overview'))"); await pg.wait_for_timeout(2200)
        lv = await pg.evaluate("import('./js/scene.js').then((S) => ({ red: S.perfStats().reduced, d: S.levelOf('mkt:daily'), decor: S.perfStats().decor }))")
        m = (lv['d'] or {}).get('model') or {}
        check(sc, 'a margin call: the tower\'s band and the decor ribbon are red (call), also under reduced motion', m.get('call') and m.get('ribbonCall') and lv['decor']['ticker'] and lv['decor']['ticker']['call'], (lv0, lv))
        if red: check(sc, 'reduced motion: the ticker never ran (phase 0)', lv['red'] and (m.get('phase') or 0) == 0 and lv['decor']['ticker']['ph'] == 0, lv)
        else: check(sc, 'normal motion: the ticker ran (phase > 0)', not lv['red'] and (m.get('phase') or 0) > 0 and lv['decor']['ticker']['ph'] > 0, lv)
        await ctx.close()

async def main():
    FB.banner(MODE)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        if want('map'): await run_map(b)
        if want('pick'): await run_pick(b)
        if want('play'): await run_play(b)
        if want('phone'): await run_phone(b)
        if want('motion'): await run_motion(b)
        await b.close()
    for s in SINKS: FB.assert_clean(s)
    check('all', 'no same-origin request failed (no 404)', not BAD, BAD[:10])
    fails = [r for r in RESULTS if not r[2]]
    log(f'{len(RESULTS) - len(fails)} passed, {len(fails)} failed, {len(ERRS)} page errors')
    for e in ERRS: log('ERR', e)
    sys.exit(1 if fails or ERRS else 0)

asyncio.run(main())
