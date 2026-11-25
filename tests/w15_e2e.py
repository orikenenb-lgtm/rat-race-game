# w15 מגדלי הענן end to end in the real page (lobby + game), offline fake backend + guard:
#   map   P.worldMap(): once the map before it in the order of the worlds is finished (2026-11-25, linear), w15 is a playable card (button, what it teaches, generated art ☁️); locked otherwise
#   pick  w15 card → its rules load lazily → the picker (soloFounder / bigTechExec / bootstrapper, 🚀 💼 🌱) → a game in w15 (body[data-world=w15],
#         the violet sky, the ☁️ chip, the server-room decor with its user cloud; no 404 / page error / failed model)
#   play  a fixed-seed soloFounder game: rolls through paydays to 'H' (פגישה עם משקיעים) tiles — the term sheet (the money, the %, the
#         pre-money vs the market, the runway, the dilution bar BEFORE the tap) and / or the giant's buyout (your share in cash); decline = the
#         safe choice; the app panel from the chip and from 💼 (4 gauges: runway in months, LTV ÷ CAC, stake %, users; the channels table + a
#         spend group per channel; the last 12 cohorts as a retention chart + a table; each round's dilution on its button); a spend change
#         through E.worldAction; a round needs a second tap (the first shows the dilution); the goal (stake ₪800M AND 12 months of cash);
#         the 3D city = cityModels (the app: users, runway, stake — the fuse, the user dots); save → reload → resume: the same city.
#         (Tile H has no due diligence: its two options decide at once — the card's ghost-tap guard is p1_touch's T4.)
#   2d    the 2D board on desk / 390 / 360: w15 colours + the cloud motif, the app card (the runway fuse bar); phones: the card and the
#         panel fit the width, every panel button ≥ 44 px
#   3d    the 3D board on 390 / 360; motion: the user cloud is still under reduced motion
# Copies: SRC=<export> COPY_DIR=/tmp/ui1115 PORT_BASE=11400 bash tests/serve_copies.sh
# Usage: python3 tests/w15_e2e.py [--real=http://localhost:11402/] [--shots=DIR] [--only=map,pick,play,2d,3d,motion]
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
PB = int(os.environ.get('PORT_BASE', '11400'))
REAL = OPT.get('real') or f'http://localhost:{PB + 2}/'
SHOTS = OPT.get('shots'); ONLY = set(OPT['only'].split(',')) if OPT.get('only') else None
want = lambda s: ONLY is None or s in ONLY
VP = {'desk': {'width': 1300, 'height': 820}, 'phone': {'width': 390, 'height': 844}, 'small': {'width': 360, 'height': 740}}
ARGS = FB.chrome_args(MODE, ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
STARS = json.dumps({'w1': 1, 'w2': 1, 'w3': 1, 'w4': 1, 'w5': 1, 'w6': 1, 'w7': 1, 'w8': 1, 'w9': 1, 'w10': 1})   # 2026-11-25 worlds / maps: every map before w15 in the order of the game finished (linear unlocks, groupsV 1)
SEED = ("localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-tips-off','1'); localStorage.setItem('rr2-reveal', 'all');"
        "localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true,w5:true,w6:true,w7:true,w8:true,w9:true,w10:true,w11:true,w13:true,w15:true}));")
UNLOCK = ("(() => { if (localStorage.getItem('rr2-progress')) return; localStorage.setItem('rr2-progress', JSON.stringify({ v: 1, groupsV: 1, stars: %s, best: {}, achievements: [], pawn: 'classic',"
          " seenWorlds: ['w1','w2','w3','w4','w5','w6','w7','w8','w9','w10'], onboarded: true, tutorialDone: true, gamesPlayed: 6, wins: 6 })); })();" % STARS)
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
  acq: !!c.querySelector('.acqmini'), chip: !!c.querySelector('.cchip'), mtok: !!c.querySelector('.mtok'), dil: !!c.querySelector('.pfmini .dil'), lg: false }; }"""

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
    # never a missing file: every same-origin response must be < 400 (the w15 models are procedural, the card art generated)
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
            if s['type'] == 'mech' and await pg.locator('#evCard button[data-o="decline"]:not([disabled])').count():
                await pg.locator('#evCard button[data-o="decline"]').click(); await pg.wait_for_timeout(500); continue
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
    c = next((x for x in cards if x['id'] == 'w15'), None)
    check(sc, 'after every map before it (w1–w10), w15 is a playable map card (button, what it teaches, difficulty, generated art ☁️)',
          c and c['tag'] == 'BUTTON' and c['act'] == 'world' and not c['soon'] and not c['locked'] and 'מגייסים' in c['learn'] and c['diff'] and c['gen'] and c['motif'] == '☁️', c)
    r = await pg.evaluate("""async () => { const P = await import('./js/progress.js'); P._reset && P._reset({ ...P.getProgress(), stars: { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w7: 1, w8: 1, w9: 1 } });
      const m = P.worldMap().filter((x) => x.id === 'w15').map((x) => ({ id: x.id, unlocked: x.unlocked, lock: x.lockText })); P._reset && P._reset({ ...P.getProgress(), stars: %s }); return m; }""" % STARS)
    check(sc, 'w15 stays locked without a w10 escape (the map before it), and says how to open it', r and r[0]['unlocked'] is False and 'מרכז הפיננסים' in (r[0]['lock'] or ''), r)
    await shot(pg, 'map_desk')
    await ctx.close()

async def run_pick(b):
    sc = 'pick-desk'; ctx, pg = await page(b, 'desk')
    pre = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w15'))")
    check(sc, 'w15 rules are not loaded at boot (lazy)', pre is False, pre)
    await pg.click('.map-card[data-id="w15"]')
    await pg.wait_for_selector('.wv-char[data-w="w15"]', timeout=60000)
    info = await pg.evaluate("""() => ({ chars: [...document.querySelectorAll('.wv-char')].map((c) => c.dataset.c), h1: document.querySelector('.wv-hero h1').textContent,
      icons: [...document.querySelectorAll('.wv-char .wv-ic')].map((x) => x.textContent), goal: (document.querySelector('.wv-goal') || {}).textContent || '',
      pros: document.querySelectorAll('.wv-char .wv-str').length, cons: document.querySelectorAll('.wv-char .wv-weak').length })""")
    info['loaded'] = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w15'))")
    check(sc, 'the picker waits for the rules, then lists the 3 w15 characters', info['loaded'] and info['chars'] == ['soloFounder', 'bigTechExec', 'bootstrapper'] and info['h1'] == 'מגדלי הענן', info)
    check(sc, 'character icons 🚀 / 💼 / 🌱 (never the 🙂 fallback); pros / cons; the ₪800M goal', info['icons'] == ['🚀', '💼', '🌱'] and info['pros'] >= 3 and info['cons'] >= 3 and '800' in info['goal'], info)
    await shot(pg, 'picker_desk')
    await pg.click('.wv-go[data-c="soloFounder"]')
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500); await quiet(pg)
    await idle(pg)
    g = await pg.evaluate("""() => ({ world: document.body.dataset.world, chip: (document.querySelector('#worldPanelBtn') || {}).textContent || '', sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(),
      label: (document.querySelector('#worldPanelBtn') || { getAttribute: () => '' }).getAttribute('aria-label') })""")
    g['cfg'] = await pg.evaluate("import('./js/game.js').then((G) => G.activeConfig())")
    check(sc, 'a w15 game started from the picker (soloFounder, free), the violet sky', g['world'] == 'w15' and g['cfg'] and g['cfg']['worldId'] == 'w15' and g['cfg']['charId'] == 'soloFounder' and g['sky'].lower() == '#1e1b4b', g)
    check(sc, 'the HUD shows the ☁️ chip (months of cash, your stake) with a full accessible name, never ₪ for the runway', '☁️' in g['chip'] and 'חלק' in g['chip'] and 'חודשים' in (g['label'] or '') and 'החלק שלך' in (g['label'] or ''), g)
    fails = await pg.evaluate("import('./js/scene.js').then((S) => S.failedModels ? S.failedModels() : [])")
    check(sc, 'no model failed (the w15 stand-ins are procedural)', not fails, fails)
    glb = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().glb)")
    check(sc, 'no w15 .glb was ever requested', not any('/w15/' in u for u in glb), glb)
    sv = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().decor.servers)")
    check(sc, 'the server-room decor: a cloud of user dots over the board', sv and sv['dots'] > 0, sv)
    await ctx.close()

START = """async ({ seed, ch }) => { const E = await import('./js/engine.js'); await E.ensureWorld('w15'); const G = await import('./js/game.js'); await G.initGame();
  G.startGame({ worldId: 'w15', charId: ch || 'soloFounder', mode: 'free', seed, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true, resume: false }); return true; }"""
SAVED = "() => { const r = JSON.parse(localStorage.getItem('rr2-save-free-w15') || 'null'); return r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); }"
PANEL = """() => { const c = document.querySelector('#gmCard'); return { gauges: [...c.querySelectorAll('.wp-g')].map((g) => g.dataset.g), gtext: [...c.querySelectorAll('.wp-g')].map((g) => g.textContent),
  ch: [...c.querySelectorAll('.pftbl')[0]?.querySelectorAll('tbody tr') || []].map((r) => r.textContent), caption: !!c.querySelector('.pftbl caption'),
  chart: (c.querySelector('.cohort svg') || { getAttribute: () => null }).getAttribute('aria-label'), bars: c.querySelectorAll('.cohort .cb').length, coh: c.querySelectorAll('.cohort-t tbody tr').length,
  segs: [...c.querySelectorAll('.wp-seg')].map((s) => s.getAttribute('aria-label')), raises: [...c.querySelectorAll('button[data-aid="raise"]')].map((b) => b.textContent),
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

H_WORDS = {'term': ['פגישה עם משקיעים', 'נכנס לחברה', 'תמורת', 'שווי לפני הכסף', 'חודשי מזומן עכשיו', 'מכפיל', 'הדילול — לפני שמחליטים', 'החלק שלך'],
           'buyout': ['פגישה עם משקיעים', 'המחיר לכל החברה', 'השווי לפי השוק היום', 'נכנס לך במזומן', 'החלק שלך שווה היום', 'מצב השוק']}

async def run_play(b):
    sc = 'play-desk'; ctx, pg = await page(b, 'desk')
    await pg.evaluate(START, {'seed': 7, 'ch': 'soloFounder'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    await shot(pg, 'board3d_desk')
    kinds = {}; paid_any = False
    for attempt in range(5):
        card, paid = await roll_to(pg, 'mech', title='פגישה עם משקיעים'); paid_any = paid_any or paid
        if not card: break
        st = await pg.evaluate(SAVED); it = st['pending']['item']; k = it['kind']
        if k not in kinds:
            kinds[k] = card
            check(sc, f"an 'H' tile: the investor card ({k}) with its own numbers" + (' and the dilution BEFORE the tap (your stake now → after)' if k == 'term' else ' and your share in cash'),
                  all(w in card['text'] for w in H_WORDS[k]) and {'accept', 'decline'} <= set(card['opts']) and (card['dil'] if k == 'term' else True), ([w for w in H_WORDS[k] if w not in card['text']], card['opts'], card['text'][:400]))
            bad = await axe_bad(pg, '#evm'); check(sc, f'axe: the investor card ({k}) has no critical / serious violation', not bad, bad)
            await shot(pg, f'investors_{k}_desk')
        c0 = st['cash']; s0 = st['world']['pf']['stake']
        await pg.locator('#evCard button[data-o="decline"]').click(); await pg.wait_for_timeout(700)
        st1 = await pg.evaluate(SAVED)
        check(sc, f'decline ({k}) = the safe choice: nothing sold, the stake unchanged', st1['world']['pf']['stake'] == s0 and not st1['world']['pf'].get('sold'), (s0, st1['world']['pf']['stake']))
        await idle(pg)
        if 'term' in kinds and len(kinds) >= 1 and attempt >= 1: break
    check(sc, 'rolled through a payday', paid_any or (await pg.evaluate(SAVED))['month'] > 1)
    check(sc, 'met the investor card at least once', bool(kinds), list(kinds))
    await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
    P = await pg.evaluate(PANEL); st = await pg.evaluate(SAVED); F = st['world']['pf']
    check(sc, 'panel: 4 gauges (runway in months — never ₪, LTV ÷ CAC as ×, your stake in %, users vs the network threshold) and the app line',
          P['gauges'] == ['runway', 'ltvCac', 'stake', 'users'] and ('חודשים' in P['gtext'][0] or 'רווחית' in P['gtext'][0]) and '₪' not in P['gtext'][0].split('היעד')[0] and '×' in P['gtext'][1] and '%' in P['gtext'][2] and 'משתמשים' in P['now'] and 'מכפיל' in P['now'], (P['gauges'], P['gtext'], P['now'][:300]))
    check(sc, 'the channels table: 3 channels with a caption (level, spend, cost per user) and a spend group per channel', len(P['ch']) == 3 and P['caption'] and sum(1 for x in P['segs'] if 'תקציב' in (x or '')) == 3, (P['ch'], P['segs']))
    check(sc, 'the cohorts: a retention chart (a bar per cohort, its accessible name lists each) + the same as a table', P['bars'] == min(12, len(F['coh'])) and P['coh'] == P['bars'] and P['chart'] and 'שימור' in P['chart'], (P['bars'], P['coh'], len(F['coh'])))
    check(sc, 'each round shows its money and your stake now → after on the button (before any tap)', len(P['raises']) == 3 and all('החלק שלך' in x and '←' in x for x in P['raises']), P['raises'])
    bad = await axe_bad(pg, '#gm'); check(sc, 'axe: the app panel has no critical / serious violation', not bad, bad)
    if SHOTS: await pg.wait_for_timeout(1500); await pg.add_style_tag(content='#toast{visibility:hidden !important}')
    await shot(pg, 'panel_desk')
    if SHOTS:
        await pg.evaluate("() => document.querySelector('#gmCard .cohort')?.scrollIntoView({ block: 'start' })"); await pg.wait_for_timeout(500); await shot(pg, 'panel_cohorts_desk')
    # a spend change through E.worldAction (stop the social channel)
    idx = await pg.evaluate("() => { const b = [...document.querySelectorAll('#gmCard button[data-aid=\"spend\"]')].find((x) => !x.disabled && x.closest('.wp-seg') && /רשתות/.test(x.closest('.wp-seg').getAttribute('aria-label')) && /לעצור/.test(x.textContent)); return b ? +b.dataset.wact : -1; }")
    check(sc, 'a channel can be stopped', idx >= 0, idx)
    if idx >= 0:
        z0 = sum(1 for a in st.get('actions', []) if a[0] == 'Z')
        await pg.locator(f'#gmCard button[data-wact="{idx}"]').click(); await pg.wait_for_timeout(900)
        msg = await pg.evaluate("() => { const m = document.querySelector('#gmCard .wp-msg'); return { t: m.textContent, c: m.className }; }")
        st = await pg.evaluate(SAVED)
        check(sc, 'the spend change went through E.worldAction (engine social level 0, one more Z action, the panel redrawn with its toast)', st['world']['pf']['lvl']['social'] == 0 and sum(1 for a in st.get('actions', []) if a[0] == 'Z') == z0 + 1 and 'pos' in msg['c'] and 'רשתות' in msg['t'], (msg, st['world']['pf']['lvl']))
    # a round: the first tap shows the dilution and sells nothing; the second sells
    r_i = await pg.evaluate("() => { const b = [...document.querySelectorAll('#gmCard button[data-aid=\"raise\"]:not([disabled])')][0]; return b ? +b.dataset.wact : -1; }")
    check(sc, 'a funding round is offered', r_i >= 0, r_i)
    if r_i >= 0:
        st0 = await pg.evaluate(SAVED); s0 = st0['world']['pf']['stake']; c0 = st0['cash']
        await pg.locator(f'#gmCard button[data-wact="{r_i}"]').click(); await pg.wait_for_timeout(500)
        r = await pg.evaluate("() => ({ arm: !!document.querySelector('#gmCard button[data-arm=\"1\"]'), msg: document.querySelector('#gmCard .wp-msg').textContent })")
        s1 = (await pg.evaluate(SAVED))['world']['pf']['stake']
        check(sc, 'a round needs a second tap: the first shows the money and the dilution ("החלק שלך יורד מ־a% ל־b%") and sells nothing', r['arm'] and 'החלק שלך יורד מ־' in r['msg'] and 'לחיצה נוספת מאשרת' in r['msg'] and s1 == s0, (r, s0, s1))
        await shot(pg, 'panel_raise_armed_desk')
        await pg.locator(f'#gmCard button[data-wact="{r_i}"]').click(); await pg.wait_for_timeout(1000)
        st1 = await pg.evaluate(SAVED)
        check(sc, 'the second tap raises: the engine stake goes down, the cash goes up', st1['world']['pf']['stake'] < s0 and st1['cash'] > c0, (s0, st1['world']['pf']['stake'], c0, st1['cash']))
    await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await close_gm(pg)
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=5000)
    row = await pg.evaluate("() => { const r = document.querySelector('#gmCard .mh-row[data-row=\"world\"]'); return r ? r.textContent : null; }")
    check(sc, '💼 has the "האפליקציה והגיוסים" row (runway, stake, users)', row and 'האפליקציה' in row and 'החלק שלך' in row and 'משתמשים' in row, row)
    if row:
        await pg.click('#gmCard .mh-row[data-row="world"] button[data-hub="world"]'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
        check(sc, '💼 → the app panel opens', await pg.locator('#gmCard.wpanel').count() == 1)
        await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await close_gm(pg)
    await pg.click('#hGoalBtn'); await pg.wait_for_selector('#goalPanel:not([hidden])', timeout=5000)
    gp = await pg.evaluate("() => document.querySelector('#goalPanel').textContent")
    check(sc, 'goal panel: your stake worth ₪800 מיליון AND 12 months of cash (or profit), never "fixed costs"', '800 מיליון' in gp and 'החלק שלך בחברה' in gp and 'מזומן' in gp and 'עלויות קבועות' not in gp and 'הדרך ליעד' in gp, gp[:400])
    await pg.click('#hGoalBtn'); await pg.wait_for_timeout(300)
    a0 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    lv_ok = a0['app'] and all(a0['levels'].get(k, {}).get('kind') == 'app' and a0['levels'][k].get('users') == v['users'] and a0['levels'][k].get('stake') == v['stake'] for k, v in a0['app'].items())
    check(sc, '3D: the city equals cityModels and the app carries its level (users, runway, stake, sold)', a0['want'] == a0['scene'] and lv_ok and len(a0['app']) == 1, a0)
    k = list(a0['app'])[0]; m = ((await pg.evaluate("(k) => import('./js/scene.js').then((S) => S.levelOf ? S.levelOf(k) : null)", k)) or {}).get('model') or {}
    v = a0['app'][k]; dots = await pg.evaluate("(u) => import('./js/render/standins1115.js').then((M) => M.cloudCount(u))", v['users'])
    fuse = 0 if v['sold'] else 1 if v['runway'] >= 99 else max(0.02, min(1, v['runway'] / 36))
    check(sc, '3D: the app drew its runway fuse (∝ months of cash) and its user dots (∝ users) (scene.levelOf model)', m and m.get('dots') == dots and abs(m.get('fuse', -1) - round(fuse * 100) / 100) < 0.011 and m.get('sold') == v['sold'], (m, v, dots))
    sv = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().decor.servers)")
    check(sc, 'the board\'s user cloud follows the app (3 × the tower\'s dots)', sv and sv['dots'] == min(sv['max'], dots * 3), (sv, dots))
    await pg.reload(); await pg.wait_for_selector('.lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
    await pg.click('.map-card[data-id="w15"]'); await pg.wait_for_selector('[data-act="continue-free"][data-id="w15"]', timeout=60000)
    await pg.click('[data-act="continue-free"][data-id="w15"]'); await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    a1 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    check(sc, 'after reload + resume: the same city and the same app level (engine = scene)', a1['want'] == a0['want'] and a1['want'] == a1['scene'] and a1['app'] == a0['app'], (a0['app'], a1['app']))
    await ctx.close()

async def run_2d(b):
    for vp in ('desk', 'phone', 'small'):
        sc = f'2d-{vp}'; ctx, pg = await page(b, vp, flags='?ff=board2d:on')
        await pg.evaluate(START, {'seed': 7, 'ch': 'bootstrapper' if vp == 'desk' else 'bigTechExec'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(1500)
        await idle(pg)
        if vp != 'desk':
            card, _ = await roll_to(pg, 'mech', title='פגישה עם משקיעים')
            check(sc, "reached an 'H' tile on the 2D board", card is not None)
            if card:
                await pg.wait_for_timeout(900)
                over = await pg.evaluate("() => [...document.querySelectorAll('#evCard .grid .row, #evCard .dil, #evCard .pf-h')].filter((r) => r.scrollWidth > r.clientWidth + 1).map((r) => [r.textContent, r.scrollWidth, r.clientWidth])")
                fit = await pg.evaluate("() => { const c = document.querySelector('#evCard').getBoundingClientRect(); return c.width <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#evCard button[data-o]')].every((x) => x.getBoundingClientRect().height >= 43.5); }")
                check(sc, 'the investor card fits the phone width (no row overflows, every button ≥ 44 px)', fit and not over, over)
                await shot(pg, f'investors_card_{vp}')
                await pg.locator('#evCard button[data-o="decline"]').click(); await pg.wait_for_timeout(600)
                await idle(pg)
        else:
            for _ in range(3): await pg.click('#roll'); await pg.wait_for_timeout(400); await idle(pg)
        a = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        cards = await pg.evaluate("""() => [...document.querySelectorAll('.b2d-card')].filter((x) => x.dataset.kind === 'app').map((c) => ({ key: c.dataset.key, label: c.getAttribute('aria-label'),
          corner: (c.querySelector('.b2d-corner-b') || {}).textContent || '', light: c.dataset.light, pct: c.style.getPropertyValue('--b2d-pct') }))""")
        def card_ok(c):
            v = a['app'].get(c['key']) or {}
            pct = 0 if v.get('sold') else 100 if v['runway'] >= 99 else round(min(36, v['runway']) / 36 * 100)
            return v and ('נמכרה' in c['label'] if v['sold'] else 'משתמשים' in c['label']) and c['pct'] == f'{pct}%' and c['corner'] in ('📱', '🔥', '🌐', '✔')
        check(sc, '2D: the app card shows its runway as the fuse bar and its users in its name = the engine', cards and len(cards) == len(a['app']) and all(card_ok(c) for c in cards), (cards, a['app']))
        th = await pg.evaluate("() => ({ world: document.body.dataset.world, sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(), board: ((document.querySelector('[class*=b2d-m-]') || {}).style || { getPropertyValue: () => '' }).getPropertyValue('--b2d-board').trim(), motif: [...(document.querySelector('[class*=b2d-m-]') || { classList: [] }).classList].find((x) => x.startsWith('b2d-m-')) || '' })")
        check(sc, '2D: the w15 look (data-world=w15, violet sky, the lavender board, the cloud motif)', th['world'] == 'w15' and th['sky'].lower() == '#1e1b4b' and th['board'].lower() == '#c7d2fe' and th['motif'] == 'b2d-m-cloud', th)
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const h = document.querySelector('#hWorld').getBoundingClientRect(); const r = b.getBoundingClientRect(); return { chip: r.left >= h.left - 1 && r.right <= h.right + 1, over: document.documentElement.scrollWidth > innerWidth + 1, t: b.textContent }; }")
        check(sc, 'the ☁️ chip stays inside the HUD card', chip and chip['chip'] and not chip['over'] and '☁️' in chip['t'], chip)
        await shot(pg, f'board2d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        fit = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const r = c.getBoundingClientRect(); const tw = c.querySelector('.tblwrap'); const sv = c.querySelector('.cohort svg'); return { w: r.width, vw: innerWidth, over: document.documentElement.scrollWidth > innerWidth + 1, acts: [...c.querySelectorAll('button[data-wact]')].every((b) => b.getBoundingClientRect().height >= 43.5), touch: [...c.querySelectorAll('button[data-wact]')].every((b) => getComputedStyle(b).touchAction === 'manipulation'), rows: [...c.querySelectorAll('.wp-g, .wp-now')].every((x) => x.scrollWidth <= x.clientWidth + 1), table: !!tw && tw.getBoundingClientRect().right <= innerWidth + 1 && tw.getBoundingClientRect().left >= -1, chart: !!sv && sv.getBoundingClientRect().right <= innerWidth + 1 }; }")
        check(sc, 'panel fits the width (channels table, the cohort chart, gauges), every action button ≥ 44 px with touch-action manipulation', fit['w'] <= fit['vw'] and not fit['over'] and fit['acts'] and fit['touch'] and fit['rows'] and fit['table'] and fit['chart'], fit)
        if vp != 'desk':
            if SHOTS: await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await shot(pg, f'panel_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_3dphone(b):
    for vp in ('phone', 'small'):
        sc = f'3d-{vp}'; ctx, pg = await page(b, vp)
        await pg.evaluate(START, {'seed': 7, 'ch': 'soloFounder'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        k = await pg.evaluate("import('./js/scene.js').then((S) => S.kind)")
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const h = document.querySelector('#hWorld').getBoundingClientRect(); const r = b.getBoundingClientRect(); return { chip: r.left >= h.left - 1 && r.right <= h.right + 1, t: b.textContent }; }")
        check(sc, '3D board on a phone; the ☁️ chip stays inside the HUD card', k == '3d' and chip and chip['chip'] and '☁️' in chip['t'], (k, chip))
        await shot(pg, f'board3d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        g = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const t = c.querySelector('.tblwrap'); const r = t.getBoundingClientRect(); return { over: document.documentElement.scrollWidth > innerWidth + 1, table: r.left >= -1 && r.right <= innerWidth + 1, gauges: [...c.querySelectorAll('.wp-g')].every((x) => x.scrollWidth <= x.clientWidth + 1) }; }")
        check(sc, 'the channels table and the gauges fit the phone width', g['table'] and not g['over'] and g['gauges'], g)
        if SHOTS:
            await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await pg.evaluate("() => document.querySelector('#gmCard .cohort')?.scrollIntoView({ block: 'start' })"); await pg.wait_for_timeout(500)
        await shot(pg, f'panel_cohorts_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_motion(b):
    """the user cloud is still under reduced motion (no updater runs): the dots are shown, the cloud never turns"""
    sc = 'motion-reduced'; ctx, pg = await page(b, 'desk', reduced=True)
    await pg.evaluate(START, {'seed': 7, 'ch': 'soloFounder'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    s0 = await pg.evaluate("import('./js/scene.js').then((S) => ({ red: S.perfStats().reduced, sv: S.perfStats().decor.servers }))")
    await pg.click('#roll'); await pg.wait_for_timeout(2500); await idle(pg)
    s1 = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().decor.servers)")
    check(sc, 'reduced motion: the user cloud is drawn and never turns (still)', s0['red'] and s0['sv'] and s0['sv']['dots'] > 0 and s0['sv']['rot'] == 0 and s1['rot'] == 0, (s0, s1))
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
