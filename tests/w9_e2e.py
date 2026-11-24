# Worlds wave 4 — w9 מדבר האנרגיה end to end in the real page (lobby + game), offline fake backend + guard:
#   map   P.worldMap(): after a ★ in one of w6 / w7 / w8, w9 is a playable card (button, what it teaches, generated art ☀️); without it w9 is
#         locked and says how to open it
#   pick  w9 card → its rules load lazily → the character picker (gridEng / infraFund / kibbutz, pros / cons, ⚡ 💼 ☀️) → a game starts in w9
#         (body[data-world=w9], the desert sky, the ☀️ chip, no 404 / page error / failed model: the w9 models are procedural, the ridge
#         turbines are w4's turbine.glb)
#   play  a fixed-seed gridEng game: rolls through a payday to a 'V' (אתר אנרגיה) tile — the power-site card (tech + MW, capex + stages, the
#         development now, equity before the bank, permits, the site's output range, grid slots, rate + power price, cash after vs equity owed,
#         the plant's month / DCF / PPA, the 49 % partner); the resource study keeps the card open and narrows the range; the panel (4 gauges,
#         the timeline, the equity calls, the projects, the plants, the offtake row) from the HUD chip and from 💼; an offtake change through
#         E.worldAction; the two-tap sale; the goal panel (₪3.5M / month operating income); 3D city = cityModels with every piece's level
#         (rows, loose cable = no grid slot, crane, barrier); save → reload → resume: the same city and the same levels
#   2d    the 2D board on desk / 390 / 360 (kibbutz: two plots): w9 colours + the solar motif, energy cards with corner + bar + name; the V card
#         and the panel fit the phone width, every panel button ≥ 44 px
#   3d    the 3D board on 390 / 360; the chip stays inside its HUD card; the timeline fits
#   motion an operating plant's current pulses run (∝ output) with normal motion and never with reduced motion
# Copies: SRC=<export> COPY_DIR=/tmp/ui910 PORT_BASE=11200 bash tests/serve_copies.sh
# Usage: python3 tests/w9_e2e.py [--real=http://localhost:11202/] [--shots=DIR] [--only=map,pick,play,2d,3d,motion]
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
STARS = json.dumps({'w1': 1, 'w2': 1, 'w3': 1, 'w4': 1, 'w5': 1, 'w6': 1})
SEED = ("localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-tips-off','1'); localStorage.setItem('rr2-reveal', 'all');"
        "localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true,w5:true,w6:true,w7:true,w8:true,w9:true,w10:true}));")
UNLOCK = ("(() => { if (localStorage.getItem('rr2-progress')) return; localStorage.setItem('rr2-progress', JSON.stringify({ v: 1, stars: %s, best: {}, achievements: [], pawn: 'classic',"
          " seenWorlds: ['w1','w2','w3','w4','w5','w6'], onboarded: true, tutorialDone: true, gamesPlayed: 6, wins: 6 })); })();" % STARS)
RESULTS = []; ERRS = []; SINKS = []; BAD = []
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def check(sc, name, cond, detail=''):
    RESULTS.append((sc, name, bool(cond))); log(('PASS' if cond else 'FAIL'), f'[{sc}]', name, '' if cond else str(detail)[:700]); return bool(cond)

STATE = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden, gm: !document.querySelector('#gm').hidden,
  gmCls: document.querySelector('#gmCard').className, start: !document.querySelector('#start').hidden, type: (document.querySelector('#evCard').className.match(/ev-(\\w+)/)||[])[1]||null,
  month: (document.querySelector('#hMonth')||{}).textContent || '' })"""
CARD = """() => { const c = document.querySelector('#evCard'); return { title: (c.querySelector('h2') || {}).textContent || '', opts: [...c.querySelectorAll('button[data-o]')].map((b) => b.dataset.o),
  en: [...c.querySelectorAll('button[data-o]:not([disabled])')].map((b) => b.dataset.o), text: c.textContent, mt: c.querySelectorAll('.mt > div').length, warn: !!c.querySelector('.warn'), en9: !!c.querySelector('.enmini') }; }"""

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
    # never a missing file: every same-origin response must be < 400 (the w9 models are procedural (+ w4's turbine.glb), the card art generated)
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
       seen: a dict — the first deal card with an energy block is recorded there (seen['deal'])"""
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
                if c['en9']: seen['deal'] = c
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
    c = next((x for x in cards if x['id'] == 'w9'), None)
    check(sc, 'after a ★ in w6, w9 is a playable map card (button, what it teaches, difficulty, generated art ☀️)',
          c and c['tag'] == 'BUTTON' and c['act'] == 'world' and not c['soon'] and not c['locked'] and 'תשתית' in c['learn'] and c['diff'] and c['gen'] and c['motif'] == '☀️', c)
    r = await pg.evaluate("""async () => { const P = await import('./js/progress.js'); P._reset && P._reset({ ...P.getProgress(), stars: { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1 } });
      const m = P.worldMap().filter((x) => x.id === 'w9').map((x) => ({ id: x.id, unlocked: x.unlocked, lock: x.lockText })); P._reset && P._reset({ ...P.getProgress(), stars: %s }); return m; }""" % STARS)
    check(sc, 'w9 needs an escape in one of w6 / w7 / w8: locked without it, and says so', r and r[0]['unlocked'] is False and 'אזור התעשייה' in (r[0]['lock'] or ''), r)
    await shot(pg, 'map_desk')
    await ctx.close()

async def run_pick(b):
    sc = 'pick-desk'; ctx, pg = await page(b, 'desk')
    pre = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w9'))")
    check(sc, 'w9 rules are not loaded at boot (lazy)', pre is False, pre)
    await pg.click('.map-card[data-id="w9"]')
    await pg.wait_for_selector('.wv-char[data-w="w9"]', timeout=60000)
    info = await pg.evaluate("""() => ({ chars: [...document.querySelectorAll('.wv-char')].map((c) => c.dataset.c), h1: document.querySelector('.wv-hero h1').textContent,
      icons: [...document.querySelectorAll('.wv-char .wv-ic')].map((x) => x.textContent), goal: (document.querySelector('.wv-goal') || {}).textContent || '',
      pros: document.querySelectorAll('.wv-char .wv-str').length, cons: document.querySelectorAll('.wv-char .wv-weak').length })""")
    info['loaded'] = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w9'))")
    check(sc, 'the picker waits for the rules, then lists the 3 w9 characters', info['loaded'] and info['chars'] == ['gridEng', 'infraFund', 'kibbutz'] and info['h1'] == 'מדבר האנרגיה', info)
    check(sc, 'character icons ⚡ / 💼 / ☀️ (never the 🙂 fallback); pros / cons; the ₪3.5M a month goal', info['icons'] == ['⚡', '💼', '☀️'] and info['pros'] >= 3 and info['cons'] >= 3 and '3.5' in info['goal'], info)
    await shot(pg, 'picker_desk')
    await pg.click('.wv-go[data-c="gridEng"]')
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500); await quiet(pg)
    await idle(pg)
    g = await pg.evaluate("""() => ({ world: document.body.dataset.world, chip: (document.querySelector('#worldPanelBtn') || {}).textContent || '', sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(),
      ink: getComputedStyle(document.body).getPropertyValue('--accent-ink').trim() })""")
    g['cfg'] = await pg.evaluate("import('./js/game.js').then((G) => G.activeConfig())")
    check(sc, 'a w9 game started from the picker (gridEng, free), the desert sky', g['world'] == 'w9' and g['cfg'] and g['cfg']['worldId'] == 'w9' and g['cfg']['charId'] == 'gridEng' and g['sky'].lower() == '#fef3c7', g)
    check(sc, 'the HUD shows the ☀️ stations chip (operating income a month, the rate)', '☀️' in g['chip'] and 'ריבית' in g['chip'] and '4.5%' in g['chip'], g['chip'])
    fails = await pg.evaluate("import('./js/scene.js').then((S) => S.failedModels ? S.failedModels() : [])")
    check(sc, 'no model failed (w9 stand-ins are procedural; the ridge turbines are w4/turbine.glb)', not fails, fails)
    glb = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().glb)")
    check(sc, 'no w9 .glb was ever requested (only w4/turbine for the ridge)', not any('/w9/' in u for u in glb) and any('w4/turbine' in u for u in glb), glb)
    await ctx.close()

START = """async ({ seed, ch }) => { const E = await import('./js/engine.js'); await E.ensureWorld('w9'); const G = await import('./js/game.js'); await G.initGame();
  G.startGame({ worldId: 'w9', charId: ch || 'gridEng', mode: 'free', seed, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true, resume: false }); return true; }"""
SAVED = "() => { const r = JSON.parse(localStorage.getItem('rr2-save-free-w9') || 'null'); return r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); }"
PANEL = """() => { const c = document.querySelector('#gmCard'); return { gauges: [...c.querySelectorAll('.wp-g')].map((g) => g.dataset.g), rows: c.querySelectorAll('.wp-row').length,
  gantt: [...c.querySelectorAll('.wp-gantt li')].map((x) => ({ a: x.dataset.asset, name: x.querySelector('.gbarw') ? x.querySelector('.gbarw').getAttribute('aria-label') : '', cells: x.querySelectorAll('.gs').length })),
  calls: c.querySelectorAll('.wp-calls li').length, acts: c.querySelectorAll('button[data-wact]').length, segs: [...c.querySelectorAll('.wp-seg')].map((x) => x.getAttribute('aria-label')),
  title: (c.querySelector('h2') || {}).textContent || '', now: (c.querySelector('.wp-now') || {}).textContent || '', text: c.textContent }; }"""

def ck_of(st, *cks):
    return [a for a in (st or {}).get('assets', []) if a.get('op') and a['op'].get('ck') in cks]

async def roll_to(pg, kind, n=45, seen=None, title=None):
    st0 = await pg.evaluate(SAVED); m0 = st0['month'] if st0 else 1; paid = False
    for i in range(n):
        await pg.click('#roll'); await pg.wait_for_timeout(600)
        s = await idle(pg, stop_on=kind, seen=seen)
        st = await pg.evaluate(SAVED)
        if st and st['month'] > m0: paid = True
        if s['card'] and s['type'] == kind:
            c = await pg.evaluate(CARD)
            if title is None or title in c['text']: return c, paid
            await idle(pg)
    return None, paid

SITE_WORDS = ['אתר לפרויקט אנרגיה', 'מגה־ואט', 'עלות הקמה', 'ייזום עכשיו', 'הון עצמי', 'היתרים', 'תפוקת האתר', 'חיבור לרשת', 'ריבית במשק', 'מזומן אחרי הייזום', 'שווי היוון', 'עם שותף']

async def run_play(b):
    sc = 'play-desk'; ctx, pg = await page(b, 'desk')
    await pg.evaluate(START, {'seed': 7, 'ch': 'gridEng'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    await shot(pg, 'board3d_desk')
    seen = {}
    site, paid = await roll_to(pg, 'mech', seen=seen, title='אתר לפרויקט')
    check(sc, 'rolled through a payday', paid)
    check(sc, "landed on a 'V' tile: the power-site card (tech + MW, capex + stages, development, equity, permits, output range, grid slots, rate + price, cash after vs equity owed, the plant's month / DCF / PPA, the partner)",
          site and all(w in site['text'] for w in SITE_WORDS) and {'build', 'partner', 'pass'} <= set(site['opts']) and site['en9'] and site['mt'] == 3,
          site and (site['title'], site['opts'], [w for w in SITE_WORDS if w not in site['text']], site['text'][:400]))
    if site and 'check' in site['opts']:
        check(sc, 'unstudied: the output range says so, the study fee is named', '(לא נבדק)' in site['text'] and 'סקר משאבים' in site['text'], site['text'][:300])
        bad = await axe_bad(pg, '#evm'); check(sc, 'axe: the power-site card has no critical / serious violation', not bad, bad)
        if SHOTS: await pg.evaluate("() => document.querySelector('#evCard .enmini')?.scrollIntoView({ block: 'center' })"); await pg.wait_for_timeout(1500)
        await shot(pg, 'site_card_desk')
        if 'check' in site['en']:
            await pg.locator('#evCard button[data-o="check"]').click(); await pg.wait_for_timeout(1200)
            s2 = await pg.evaluate(STATE); c2 = await pg.evaluate(CARD)
            check(sc, 'the resource study keeps the card open and redraws it: "(אחרי סקר)", no study option', s2['card'] and s2['type'] == 'mech' and '(אחרי סקר)' in c2['text'] and 'check' not in c2['opts'], (s2, c2['opts'], c2['text'][:300]))
            site = c2
    else: await shot(pg, 'site_card_desk')
    n0 = len(ck_of(await pg.evaluate(SAVED), 'proj'))
    pick = 'build' if site and 'build' in site['en'] else 'partner' if site and 'partner' in site['en'] else 'pass'
    if site:
        await pg.locator(f'#evCard button[data-o="{pick}"]').click(); await pg.wait_for_timeout(900)
        await idle(pg)
        n1 = len(ck_of(await pg.evaluate(SAVED), 'proj'))
        check(sc, f'the site card decided "{pick}" through the engine ({n0} → {n1} projects)', n1 == n0 + (0 if pick == 'pass' else 1), (n0, n1))
    d = seen.get('deal')
    if d: check(sc, 'an energy deal card shows its block (a slot / an operating plant / the pilot)', d['en9'] and ('חיבור לרשת' in d['text'] or 'נשאר לך בחודש' in d['text'] or 'שורף' in d['text']), d['text'][:300])
    if SHOTS:
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('overview'))"); await pg.wait_for_timeout(1800); await shot(pg, 'board3d_desk_overview')
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('follow'))"); await pg.wait_for_timeout(800)
    st = await pg.evaluate(SAVED); pj = ck_of(st, 'proj'); pl = ck_of(st, 'plant', 'line')
    await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
    P = await pg.evaluate(PANEL)
    check(sc, 'panel: 4 gauges (income vs target / rate / power price / solar capture), the timeline (one bar per project, a cell per stage, an accessible name), a row per project, the offtake row, actions',
          P['gauges'] == ['income', 'rate', 'spot', 'capture'] and len(P['gantt']) == len(pj) and len(pj) >= 1 and all(g['cells'] >= 3 and g['name'] for g in P['gantt']) and P['rows'] >= len(pj) + len(pl)
          and 'בסיום: איך התחנה תמכור' in P['segs'] and P['acts'] >= 4 and 'התחנות' in P['title'] and 'לוח זמנים' in P['text'] and 'התחנות שלך' in P['text'], (len(pj), P['gauges'], P['gantt'], P['rows'], P['segs'], P['acts']))
    nos = [a for a in pj if not a['op'].get('slot')]
    if nos: check(sc, 'a project without a grid slot says so in the timeline and its row ("בלי חיבור לרשת")', '🔌 בלי חיבור לרשת' in P['text'], P['text'][:400])
    check(sc, 'the top line: operating income vs the target, the rate, the power price, free slots', 'הכנסה תפעולית' in P['now'] and 'ריבית' in P['now'] and 'חיבורים פנויים' in P['now'], P['now'])
    bad = await axe_bad(pg, '#gm'); check(sc, 'axe: the stations panel has no critical / serious violation', not bad, bad)
    if SHOTS: await pg.wait_for_timeout(1500); await pg.add_style_tag(content='#toast{visibility:hidden !important}')
    await shot(pg, 'panel_desk')
    # an offtake change through E.worldAction (PPA ↔ merchant at completion)
    a1 = pj[0]; cur = a1['op'].get('offtake'); tgt = 'merchant' if cur == 'ppa' else 'ppa'
    idx = await pg.evaluate("(p) => { const b = [...document.querySelectorAll('#gmCard button[data-aid=\"offtake\"]')].find((x) => !x.disabled && x.getAttribute('aria-pressed') !== 'true' && x.textContent.includes(p)); return b ? +b.dataset.wact : -1; }", 'PPA' if tgt == 'ppa' else 'שוק')
    check(sc, f'the offtake "{tgt}" is offered for the first project', idx >= 0, idx)
    if idx >= 0:
        await pg.locator(f'#gmCard button[data-wact="{idx}"]').click(); await pg.wait_for_timeout(900)
        msg = await pg.evaluate("() => { const m = document.querySelector('#gmCard .wp-msg'); return { t: m.textContent, c: m.className }; }")
        st = await pg.evaluate(SAVED); h = next((a for a in ck_of(st, 'proj') if a['id'] == a1['id']), {})
        check(sc, 'the action went through E.worldAction (engine op.offtake changed, logged Z, panel redrawn)', h.get('op', {}).get('offtake') == tgt and any(a[0] == 'Z' for a in st.get('actions', [])) and 'pos' in msg['c'], (msg, h.get('op', {}).get('offtake')))
    sell = await pg.evaluate("() => { const b = document.querySelector('#gmCard button[data-aid=\"sellPlant\"]:not([disabled])'); return b ? +b.dataset.wact : -1; }")
    check(sc, 'selling a project to a rival is offered', sell >= 0, sell)
    if sell >= 0:
        n0 = len(ck_of(await pg.evaluate(SAVED), 'proj'))
        await pg.locator(f'#gmCard button[data-wact="{sell}"]').click(); await pg.wait_for_timeout(500)
        r = await pg.evaluate("() => ({ arm: !!document.querySelector('#gmCard button[data-arm=\"1\"]'), msg: document.querySelector('#gmCard .wp-msg').textContent })")
        n1 = len(ck_of(await pg.evaluate(SAVED), 'proj'))
        check(sc, 'selling needs a second tap (the first one arms the button and sells nothing)', r['arm'] and 'אי אפשר לבטל' in r['msg'] and n1 == n0, (r, n0, n1))
    await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=5000)
    row = await pg.evaluate("() => { const r = document.querySelector('#gmCard .mh-row[data-row=\"world\"]'); return r ? r.textContent : null; }")
    check(sc, '💼 has the "התחנות והפרויקטים" row (operating income vs target, the rate)', row and 'התחנות' in row and 'הכנסה תפעולית' in row and 'ריבית' in row, row)
    if row:
        await pg.click('#gmCard .mh-row[data-row="world"] button[data-hub="world"]'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
        check(sc, '💼 → the stations panel opens', await pg.locator('#gmCard.wpanel').count() == 1)
        await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await pg.click('#hGoalBtn'); await pg.wait_for_selector('#goalPanel:not([hidden])', timeout=5000)
    gp = await pg.evaluate("() => document.querySelector('#goalPanel').textContent")
    check(sc, 'goal panel: ₪3.5 מיליון a month of operating income after debt service, the rule and the ladder', '3.5 מיליון' in gp and 'הכנסה תפעולית' in gp and 'החזר' in gp and 'הדרך ליעד' in gp, gp[:300])
    await pg.click('#hGoalBtn'); await pg.wait_for_timeout(300)
    a0 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    lv_ok = all(a0['levels'].get(k, {}).get('kind') == 'energy' and a0['levels'][k].get('n') == v['stage'] and bool(a0['levels'][k].get('unconnected')) == v['unconnected'] and a0['levels'][k].get('tech') == v['tech'] for k, v in a0['energy'].items())
    check(sc, '3D: the city equals cityModels and every piece carries its energy level (tech, stage, grid slot)', a0['want'] == a0['scene'] and a0['energy'] and lv_ok, a0)
    models = {k: await pg.evaluate("(k) => import('./js/scene.js').then((S) => S.levelOf ? S.levelOf(k) : null)", k) for k in a0['energy']}
    def mo_ok(k):
        v = a0['energy'][k]; m = (models[k] or {}).get('model') or {}
        if v['slot'] or v['plot'] or v['tech'] in ('slot', 'site'): return m.get('op') is False
        op = v['stage'] == 4
        return m and m.get('op') == op and (op or m.get('cable') == v['unconnected']) and m.get('barrier') == (v['stalled'] and not op) and (m.get('rows') is None or op or m['rows'] == round((v['pct'] or 0) * 8))
    check(sc, '3D: each piece drew its rows, the loose cable (no slot) / wire, crane and barrier from the engine (scene.levelOf model)', models and all(mo_ok(k) for k in models), {k: (models[k] or {}).get('model') for k in models})
    await pg.reload(); await pg.wait_for_selector('.lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
    await pg.click('.map-card[data-id="w9"]'); await pg.wait_for_selector('[data-act="continue-free"][data-id="w9"]', timeout=60000)
    await pg.click('[data-act="continue-free"][data-id="w9"]'); await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    a1 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    check(sc, 'after reload + resume: the same city and the same energy levels (engine = scene)', a1['want'] == a0['want'] and a1['want'] == a1['scene'] and a1['energy'] == a0['energy'], (a0['energy'], a1['energy']))
    await ctx.close()

async def run_2d(b):
    for vp in ('desk', 'phone', 'small'):
        sc = f'2d-{vp}'; ctx, pg = await page(b, vp, flags='?ff=board2d:on')
        await pg.evaluate(START, {'seed': 7, 'ch': 'kibbutz'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(1500)
        await idle(pg)
        if vp != 'desk':
            site, _ = await roll_to(pg, 'mech', title='אתר לפרויקט')
            check(sc, "reached a 'V' tile on the 2D board", site is not None)
            if site:
                await pg.wait_for_timeout(900)
                fit = await pg.evaluate("() => { const c = document.querySelector('#evCard').getBoundingClientRect(); return c.width <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#evCard .grid .row')].every((r) => r.scrollWidth <= r.clientWidth + 1); }")
                over = await pg.evaluate("() => [...document.querySelectorAll('#evCard .grid .row')].filter((r) => r.scrollWidth > r.clientWidth + 1).map((r) => [r.textContent, r.scrollWidth, r.clientWidth])")
                check(sc, 'the power-site card fits the phone width, no row overflows', fit and site['en9'], over)
                if SHOTS: await pg.evaluate("() => document.querySelector('#evCard .enmini')?.scrollIntoView({ block: 'center' })"); await pg.wait_for_timeout(1200)
                await shot(pg, f'site_card_{vp}')
                await pg.locator('#evCard button[data-o="pass"]').click(); await pg.wait_for_timeout(600)
                await idle(pg)
        else:
            for _ in range(3): await pg.click('#roll'); await pg.wait_for_timeout(400); await idle(pg)
        a = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        cards = await pg.evaluate("""() => [...document.querySelectorAll('.b2d-card')].filter((x) => x.dataset.kind === 'energy').map((c) => ({ key: c.dataset.key, label: c.getAttribute('aria-label'),
          corner: (c.querySelector('.b2d-corner-b') || {}).textContent || '', lvl: c.dataset.level, light: c.dataset.light, pct: c.style.getPropertyValue('--b2d-pct') }))""")
        def card_ok(c):
            v = a['energy'].get(c['key']) or {}
            if v.get('plot') or v.get('tech') == 'site': return 'קרקע לפרויקט' in c['label'] and c['corner'] == '🏜️'
            if v.get('slot') or v.get('tech') == 'slot': return 'חיבור פנוי' in c['label'] and c['corner'] == '🔌'
            if v.get('stage') == 4: return 'מחוברת' in c['label']
            if v.get('stage') == 0: return 'בהיתרים' in c['label'] and c['corner'] in ('📋', '🔌')
            return 'בבנייה' in c['label'] and c['pct'] == f"{round((v.get('pct') or 0) * 100)}%" and int(c['lvl']) == v.get('stage')
        check(sc, '2D: every energy card shows its state (corner + bar + "קרקע / בהיתרים / בבנייה / מחוברת" in its name) = the engine', cards and len(cards) == len(a['energy']) and all(card_ok(c) for c in cards), (cards, a['energy']))
        th = await pg.evaluate("() => ({ world: document.body.dataset.world, sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(), board: ((document.querySelector('[class*=b2d-m-]') || {}).style || { getPropertyValue: () => '' }).getPropertyValue('--b2d-board').trim(), motif: [...(document.querySelector('[class*=b2d-m-]') || { classList: [] }).classList].find((x) => x.startsWith('b2d-m-')) || '' })")
        check(sc, '2D: the w9 look (data-world=w9, desert sky, ochre board from WORLD_STYLE, the solar motif)', th['world'] == 'w9' and th['sky'].lower() == '#fef3c7' and th['board'].lower() == '#e9c46a' and th['motif'] == 'b2d-m-solar', th)
        await shot(pg, f'board2d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        fit = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const r = c.getBoundingClientRect(); return { w: r.width, vw: innerWidth, over: document.documentElement.scrollWidth > innerWidth + 1, acts: [...c.querySelectorAll('button[data-wact]')].every((b) => b.getBoundingClientRect().height >= 43.5), touch: [...c.querySelectorAll('button[data-wact]')].every((b) => getComputedStyle(b).touchAction === 'manipulation'), plots: (c.textContent.match(/קרקע לפרויקט/g) || []).length, dev: !!c.querySelector('.wp-seg[aria-label=\"להתחיל פרויקט\"]') || c.querySelectorAll('button[data-aid=\"develop\"]').length >= 2 }; }")
        check(sc, 'panel fits the width, every action button ≥ 44 px with touch-action manipulation; the kibbutz\'s plots (rows + "start a project")', fit['w'] <= fit['vw'] and not fit['over'] and fit['acts'] and fit['touch'] and fit['plots'] >= 2 and fit['dev'], fit)
        if vp != 'desk':
            if SHOTS: await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await shot(pg, f'panel_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_3dphone(b):
    for vp in ('phone', 'small'):
        sc = f'3d-{vp}'; ctx, pg = await page(b, vp)
        await pg.evaluate(START, {'seed': 7, 'ch': 'gridEng'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        k = await pg.evaluate("import('./js/scene.js').then((S) => S.kind)")
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const r = b.getBoundingClientRect(), h = document.querySelector('#hWorld').getBoundingClientRect(); return { inside: r.left >= h.left - 1 && r.right <= h.right + 1, h: r.height, t: b.textContent }; }")
        check(sc, '3D board on a phone; the ☀️ chip stays inside its HUD card', k == '3d' and chip and chip['inside'] and '☀️' in chip['t'], (k, chip))
        await shot(pg, f'board3d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        g = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const bars = [...c.querySelectorAll('.wp-gantt .gbarw')]; return { n: bars.length, vw: innerWidth, over: document.documentElement.scrollWidth > innerWidth + 1, inside: bars.every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.width > 60; }), rows: [...c.querySelectorAll('.wp-row')].every((r) => r.scrollWidth <= r.clientWidth + 1), gauges: [...c.querySelectorAll('.wp-g')].every((x) => x.scrollWidth <= x.clientWidth + 1) }; }")
        check(sc, 'the timeline, the project rows and the gauges fit the phone width', g['n'] >= 1 and g['inside'] and not g['over'] and g['rows'] and g['gauges'], g)
        if SHOTS:
            await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await pg.evaluate("() => document.querySelector('#gmCard .wp-gantt')?.scrollIntoView({ block: 'start' })"); await pg.wait_for_timeout(500)
        await shot(pg, f'panel_gantt_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

OPLEVEL = "{ kind: 'energy', tech: 'solar', n: 4, of: 4, pct: 1, units: 3, output: 1, offtake: 'ppa', stake: 1 }"
async def run_motion(b):
    """an operating plant (the city piece set to an operating level through scene.setLevel): its current pulses run along its wire ∝ output with
       normal motion and never with reduced motion; the w9 decor's pulse ring follows the plants' output"""
    for red in (False, True):
        sc = 'motion-' + ('reduced' if red else 'normal'); ctx, pg = await page(b, 'desk', reduced=red)
        await pg.evaluate(START, {'seed': 7, 'ch': 'gridEng'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        await pg.evaluate("import('./js/scene.js').then((S) => S.setQuality('mid'))"); await pg.wait_for_timeout(800)
        await pg.evaluate(f"import('./js/scene.js').then((S) => S.setLevel('a1', {OPLEVEL}, {{ animate: false }}))"); await pg.wait_for_timeout(300)
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode && S.setCameraMode('overview'))"); await pg.wait_for_timeout(2200)   # the camera move keeps the scene animating
        lv = await pg.evaluate("import('./js/scene.js').then((S) => ({ red: S.perfStats().reduced, a1: S.levelOf('a1'), flow: S.perfStats().decor }))")
        m = (lv['a1'] or {}).get('model') or {}
        if red: check(sc, 'reduced motion: the operating plant\'s pulses never moved (phase 0), the wire and 3 pulses are drawn still', lv['red'] and m.get('op') and m.get('wire') and m.get('pulses') == 3 and m.get('phase') == 0, lv)
        else: check(sc, 'normal motion: the current pulses ran along the wire (phase > 0) and the decor ring carries the plants\' output', not lv['red'] and m.get('op') and m.get('pulses') == 3 and (m.get('phase') or 0) > 0 and (lv['flow']['energyFlow']['v'] or 0) > 0, lv)
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
