# w11 התאגיד הבינלאומי end to end in the real page (lobby + game), offline fake backend + guard:
#   map   P.worldMap(): after ★ in w6–w8 and one of w9 / w10 / w13, w11 is a playable card (button, what it teaches, generated art 🌍); locked otherwise
#   pick  w11 card → its rules load lazily → the picker (ceo / oldExporter / pe, 💼 🚢 📊) → a game in w11 (body[data-world=w11], the night sky,
#         the 🌍 chip, the globe decor with five districts and the supply arcs; no 404 / page error / failed model: the w11 models are procedural)
#   play  a fixed-seed pe game: rolls to a 'Z' (הצעת רכישה) tile — the acquisition card (the country in words + its fictional band, the profit
#         range, the price, 35 % down + the acquisition loan, the fair range vs the price, the manager's competence / integrity ranges); due
#         diligence keeps the SAME card open and redraws it in place (narrower ranges, its fee charged), a tap right after the update is ignored,
#         then the purchase adds the subsidiary; paydays; the map panel from the chip and from 💼 (4 gauges, the accessible country table, a row
#         per subsidiary with the manager token); an audit through E.worldAction; the goal (₪800M); the 3D city = cityModels (country, trust,
#         audited, disrupted), the arcs; save → reload → resume: the same city; selling a subsidiary needs a second tap
#   2d    the 2D board on desk / 390 / 360: w11 colours + the globe motif, the subsidiary cards (band, who runs it, ⚠️); phones: the card and
#         the panel fit the width, every panel button ≥ 44 px
#   3d    the 3D board on 390 / 360: the chip stays inside the HUD, the table / rows fit; motion: the decor is the same under reduced motion
# Copies: SRC=<export> COPY_DIR=/tmp/ui1115 PORT_BASE=11400 bash tests/serve_copies.sh
# Usage: python3 tests/w11_e2e.py [--real=http://localhost:11402/] [--shots=DIR] [--only=map,pick,play,2d,3d,motion]
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
STARS = json.dumps({'w1': 1, 'w2': 1, 'w3': 1, 'w4': 1, 'w5': 1, 'w6': 1, 'w7': 1, 'w8': 1, 'w9': 1})
SEED = ("localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-tips-off','1'); localStorage.setItem('rr2-reveal', 'all');"
        "localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true,w5:true,w6:true,w7:true,w8:true,w9:true,w10:true,w11:true,w13:true,w15:true}));")
UNLOCK = ("(() => { if (localStorage.getItem('rr2-progress')) return; localStorage.setItem('rr2-progress', JSON.stringify({ v: 1, stars: %s, best: {}, achievements: [], pawn: 'classic',"
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
    # never a missing file: every same-origin response must be < 400 (the w11 models are procedural, the card art generated)
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
            if s['type'] == 'mech' and await pg.locator('#evCard button[data-o="pass"]:not([disabled])').count():
                await pg.locator('#evCard button[data-o="pass"]').click(); await pg.wait_for_timeout(500); continue
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
W = 'w11'

async def run_map(b):
    sc = 'map-desk'; ctx, pg = await page(b, 'desk')
    cards = await pg.evaluate(MAP)
    c = next((x for x in cards if x['id'] == W), None)
    check(sc, 'after ★ in w6–w8 and w9, w11 is a playable map card (button, what it teaches, difficulty, generated art 🌍)',
          c and c['tag'] == 'BUTTON' and c['act'] == 'world' and not c['soon'] and not c['locked'] and 'לסמוך' in c['learn'] and c['diff'] and c['gen'] and c['motif'] == '🌍', c)
    r = await pg.evaluate("""async () => { const P = await import('./js/progress.js'); P._reset && P._reset({ ...P.getProgress(), stars: { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1 } });
      const m = P.worldMap().filter((x) => x.id === 'w11').map((x) => ({ id: x.id, unlocked: x.unlocked, lock: x.lockText })); P._reset && P._reset({ ...P.getProgress(), stars: %s }); return m; }""" % STARS)
    check(sc, 'w11 stays locked with one ★ in w6–w8 and none in w9 / w10 / w13, and says how to open it', r and r[0]['unlocked'] is False and (r[0]['lock'] or '').strip(), r)
    await shot(pg, 'map_desk')
    await ctx.close()

async def run_pick(b):
    sc = 'pick-desk'; ctx, pg = await page(b, 'desk')
    pre = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w11'))")
    check(sc, 'w11 rules are not loaded at boot (lazy)', pre is False, pre)
    await pg.click('.map-card[data-id="w11"]')
    await pg.wait_for_selector('.wv-char[data-w="w11"]', timeout=60000)
    info = await pg.evaluate("""() => ({ chars: [...document.querySelectorAll('.wv-char')].map((c) => c.dataset.c), h1: document.querySelector('.wv-hero h1').textContent,
      icons: [...document.querySelectorAll('.wv-char .wv-ic')].map((x) => x.textContent), goal: (document.querySelector('.wv-goal') || {}).textContent || '',
      pros: document.querySelectorAll('.wv-char .wv-str').length, cons: document.querySelectorAll('.wv-char .wv-weak').length })""")
    info['loaded'] = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w11'))")
    check(sc, 'the picker waits for the rules, then lists the 3 w11 characters', info['loaded'] and info['chars'] == ['ceo', 'oldExporter', 'pe'] and info['h1'] == 'התאגיד הבינלאומי', info)
    check(sc, 'character icons 💼 / 🚢 / 📊 (never the 🙂 fallback); pros / cons; the ₪800M goal', info['icons'] == ['💼', '🚢', '📊'] and info['pros'] >= 3 and info['cons'] >= 3 and '800' in info['goal'], info)
    await shot(pg, 'picker_desk')
    await pg.click('.wv-go[data-c="ceo"]')
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500); await quiet(pg)
    await idle(pg)
    g = await pg.evaluate("""() => ({ world: document.body.dataset.world, chip: (document.querySelector('#worldPanelBtn') || {}).textContent || '', sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(),
      label: (document.querySelector('#worldPanelBtn') || { getAttribute: () => '' }).getAttribute('aria-label') })""")
    g['cfg'] = await pg.evaluate("import('./js/game.js').then((G) => G.activeConfig())")
    check(sc, 'a w11 game started from the picker (ceo, free), the night sky', g['world'] == 'w11' and g['cfg'] and g['cfg']['worldId'] == 'w11' and g['cfg']['charId'] == 'ceo' and g['sky'].lower() == '#020617', g)
    check(sc, 'the HUD shows the 🌍 chip (attention used / slots; the CEO runs all three herself — "no managers", never a 100 % trust) with a full accessible name', '🌍' in g['chip'] and '3/3' in g['chip'] and 'בלי מנהלים' in g['chip'] and 'אין עדיין מנהלים' in (g['label'] or '') and 'בניהול שלך' in (g['label'] or ''), g)
    fails = await pg.evaluate("import('./js/scene.js').then((S) => S.failedModels ? S.failedModels() : [])")
    check(sc, 'no model failed (the w11 stand-ins are procedural)', not fails, fails)
    glb = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().glb)")
    check(sc, 'no w11 .glb was ever requested', not any('/w11/' in u for u in glb), glb)
    gl = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().decor.globe)")
    check(sc, 'the world-map decor: five districts and one supply arc per subsidiary (the CEO\'s 3), her districts lit', gl and gl['districts'] == 5 and gl['arcs'] == 3 and len(gl['self']) >= 2, gl)
    await ctx.close()

START = """async ({ seed, ch }) => { const E = await import('./js/engine.js'); await E.ensureWorld('w11'); const G = await import('./js/game.js'); await G.initGame();
  G.startGame({ worldId: 'w11', charId: ch || 'pe', mode: 'free', seed, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true, resume: false }); return true; }"""
SAVED = "() => { const r = JSON.parse(localStorage.getItem('rr2-save-free-w11') || 'null'); return r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); }"
PANEL = """() => { const c = document.querySelector('#gmCard'); return { gauges: [...c.querySelectorAll('.wp-g')].map((g) => g.dataset.g), gtext: [...c.querySelectorAll('.wp-g')].map((g) => g.textContent),
  table: [...c.querySelectorAll('.mntbl tbody tr')].map((r) => ({ c: r.dataset.c, dis: r.classList.contains('dis'), t: r.textContent, band: !!r.querySelector('.cband') })), caption: !!c.querySelector('.mntbl caption'),
  subs: c.querySelectorAll('.subs .srow').length, mtoks: [...c.querySelectorAll('.subs .mtok')].map((t) => t.getAttribute('aria-label')),
  acts: c.querySelectorAll('button[data-wact]').length, aids: [...c.querySelectorAll('button[data-wact]')].map((b) => b.dataset.aid),
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

ACQ_WORDS = ['הצעת רכישה', 'רווח בחודש', 'המחיר', 'עכשיו מהקופה', 'הלוואת רכישה', 'שווי הוגן', 'המחיר מול השווי', 'מס במקור', 'המנהל שמגיע', 'יכולת', 'יושרה', 'לא נבדק']

async def run_play(b):
    sc = 'play-desk'; ctx, pg = await page(b, 'desk')
    await pg.evaluate(START, {'seed': 7, 'ch': 'pe'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    await shot(pg, 'board3d_desk')
    card, paid = await roll_to(pg, 'mech', title='הצעת רכישה')
    check(sc, "landed on a 'Z' tile: the acquisition card (the country in words + band, the profit range, the price, 35 % down + the loan, the fair range vs the price, the manager's ranges)",
          card and all(w in card['text'] for w in ACQ_WORDS) and {'buy', 'dd', 'pass'} <= set(card['opts']) and card['acq'] and card['chip'] and card['mtok'], card and ([w for w in ACQ_WORDS if w not in card['text']], card['opts'], card['text'][:500]))
    if card:
        bad = await axe_bad(pg, '#evm'); check(sc, 'axe: the acquisition card has no critical / serious violation', not bad, bad)
        await shot(pg, 'acq_card_desk')
        st0 = await pg.evaluate(SAVED); c0 = st0['cash']; it0 = st0['pending']['item']; w0 = it0['hi'] - it0['lo']
        # due diligence: the card stays open, re-described in place (narrower ranges, "נבדק"); a tap right after the update is ignored
        r = await pg.evaluate("""async () => { const c = document.querySelector('#evCard'); const t0 = c.querySelector('h2').textContent; const b = c.querySelector('button[data-o="dd"]');
          if (!b || b.disabled) return { skip: true }; b.click();
          for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 25)); if (document.querySelector('#evm').hidden || /הבדיקה צמצמה/.test(c.textContent)) break; }
          const open = !document.querySelector('#evm').hidden; const upd = open && /הבדיקה צמצמה/.test(c.textContent);
          let ghost = null; if (upd) { const w = c.querySelector('button[data-o="pass"]'); w.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); await new Promise((r) => setTimeout(r, 60)); ghost = !document.querySelector('#evm').hidden; }
          return { open, upd, ghost, same: open && c.querySelector('h2').textContent === t0, dd: !!c.querySelector('.acq-h .b.ok'), dis: c.querySelector('button[data-o="dd"]')?.disabled, text: c.textContent }; }""")
        st1 = await pg.evaluate(SAVED); it1 = (st1.get('pending') or {}).get('item') or {}
        check(sc, 'due diligence keeps the SAME card open and redraws it in place: "🔍 נבדק", the narrower range, the check button spent', r.get('same') and r.get('upd') and r.get('dd') and r.get('dis') is not False and it1.get('dd') and (it1['hi'] - it1['lo']) < w0, ({k: v for k, v in r.items() if k != 'text'}, it0, it1))
        check(sc, 'the check cost exactly its fee (engine cash − fee)', abs((c0 - st1['cash']) - card_fee(st0)) < 2, (c0, st1['cash']))
        check(sc, 'a tap right after the card changed is ignored (the ghost-tap guard): the card is still open', r.get('ghost') is True, r)
        await shot(pg, 'acq_card_dd_desk')
        await pg.wait_for_timeout(400)
        n0 = len(st1['world']['mn']['subs'])
        buy = pg.locator('#evCard button[data-o="buy"]:not([disabled])')
        if await buy.count(): await buy.click()
        else: await pg.locator('#evCard button[data-o="pass"]').click()
        await pg.wait_for_timeout(900); await idle(pg)
        st2 = await pg.evaluate(SAVED)
        check(sc, 'buying adds the subsidiary (engine subs + 1, the down payment out of the cash)', len(st2['world']['mn']['subs']) == n0 + 1, (n0, len(st2['world']['mn']['subs'])))
    for _ in range(4):   # a payday after the purchase: the sub has its first month (cf, eff) and the month's manager candidate
        await pg.click('#roll'); await pg.wait_for_timeout(500); await idle(pg)
    check(sc, 'rolled through a payday', paid or (await pg.evaluate(SAVED))['month'] > 1)
    await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
    P = await pg.evaluate(PANEL); st = await pg.evaluate(SAVED); M = st['world']['mn']
    check(sc, 'panel: 4 gauges (attention used / slots, trust in %, hedged share in %, frauds — fewer is better) and the group line',
          P['gauges'] == ['attention', 'trust', 'hedged', 'frauds'] and 'מתוך' in P['gtext'][0] and '%' in P['gtext'][1] and 'המפה' in P['title'] and 'חברות־בנות' in P['now'], (P['gauges'], P['gtext'], P['now'][:300]))
    tbl_ok = len(P['table']) == 5 and all(x['band'] for x in P['table']) and all(('משובש' in x['t']) == x['dis'] for x in P['table']) and [x['c'] for x in P['table']] == ['eu', 'us', 'in', 'br', 'vn']
    check(sc, 'the country table: 5 countries with a caption, each named in words beside its band, a disrupted port in words (never colour alone)', tbl_ok and P['caption'], P['table'])
    check(sc, 'a row per subsidiary (= the engine subs), each managed one with the manager token (its ranges in the accessible name)', P['subs'] == len(M['subs']) and all('יכולת' in t and 'יושרה' in t for t in P['mtoks']) and len(P['mtoks']) == sum(1 for s in M['subs'] if s.get('mgr') and not s.get('self')), (P['subs'], len(M['subs']), P['mtoks']))
    bad = await axe_bad(pg, '#gm'); check(sc, 'axe: the map panel has no critical / serious violation', not bad, bad)
    if SHOTS: await pg.wait_for_timeout(1500); await pg.add_style_tag(content='#toast{visibility:hidden !important}')
    await shot(pg, 'panel_desk')
    if SHOTS:
        await pg.evaluate("() => document.querySelector('#gmCard .subs')?.scrollIntoView({ block: 'start' })"); await pg.wait_for_timeout(500); await shot(pg, 'panel_subs_desk')
    # an audit through E.worldAction (the fund pays half: ₪250k)
    idx = await pg.evaluate("() => { const b = [...document.querySelectorAll('#gmCard button[data-aid=\"audit\"]')].find((x) => !x.disabled); return b ? +b.dataset.wact : -1; }")
    check(sc, 'an audit is offered for the managed subsidiary', idx >= 0, idx)
    if idx >= 0:
        a0 = M['audits']; z0 = sum(1 for a in st.get('actions', []) if a[0] == 'Z'); c0 = st['cash']
        await pg.locator(f'#gmCard button[data-wact="{idx}"]').click(); await pg.wait_for_timeout(900)
        msg = await pg.evaluate("() => { const m = document.querySelector('#gmCard .wp-msg'); return { t: m.textContent, c: m.className }; }")
        st = await pg.evaluate(SAVED)
        check(sc, 'the audit went through E.worldAction (engine audits + 1, ₪250k paid, one more Z action, the panel redrawn with its toast)', st['world']['mn']['audits'] == a0 + 1 and abs(c0 - st['cash'] - 250000) < 2 and sum(1 for a in st.get('actions', []) if a[0] == 'Z') == z0 + 1 and 'pos' in msg['c'] and 'ביקורת' in msg['t'], (msg, st['world']['mn']['audits'], c0 - st['cash']))
        P = await pg.evaluate(PANEL)
        check(sc, 'after the audit the manager token says "נבדק"', any('נבדק' in t and 'לא נבדק' not in t for t in P['mtoks']), P['mtoks'])
    await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=5000)
    row = await pg.evaluate("() => { const r = document.querySelector('#gmCard .mh-row[data-row=\"world\"]'); return r ? r.textContent : null; }")
    check(sc, '💼 has the "המפה והחברות־הבנות" row (subs, attention, trust)', row and 'המפה' in row and 'קשב' in row and 'אמון' in row, row)
    if row:
        await pg.click('#gmCard .mh-row[data-row="world"] button[data-hub="world"]'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
        check(sc, '💼 → the map panel opens', await pg.locator('#gmCard.wpanel').count() == 1)
        await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await close_gm(pg)
    await pg.click('#hGoalBtn'); await pg.wait_for_selector('#goalPanel:not([hidden])', timeout=5000)
    gp = await pg.evaluate("() => document.querySelector('#goalPanel').textContent")
    check(sc, 'goal panel: consolidated net worth ₪800 מיליון, the rule and the ladder', '800 מיליון' in gp and 'הדרך ליעד' in gp, gp[:300])
    await pg.click('#hGoalBtn'); await pg.wait_for_timeout(300)
    a0 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    lv_ok = a0['subs'] and all(a0['levels'].get(k, {}).get('kind') == 'sub' and a0['levels'][k].get('country') == v['country'] and a0['levels'][k].get('audited') == v['audited'] and a0['levels'][k].get('disrupted') == v['disrupted'] for k, v in a0['subs'].items())
    check(sc, '3D: the city equals cityModels and every subsidiary carries its sub level (country, who runs it, trust, audited, disrupted)', a0['want'] == a0['scene'] and lv_ok, a0)
    models = {k: await pg.evaluate("(k) => import('./js/scene.js').then((S) => S.levelOf ? S.levelOf(k) : null)", k) for k in a0['subs']}
    def mo_ok(k):
        v = a0['subs'][k]; m = (models[k] or {}).get('model') or {}
        t = v['trust'] if v['managed'] else 0
        return m and m.get('country') == v['country'] and m.get('manager') == v['managed'] and m.get('glow') == v['self'] and m.get('trustSegs') == (round(t * 10) if v['managed'] else 0) and m.get('audited') == (v['managed'] and v['audited']) and m.get('disrupted') == v['disrupted']
    check(sc, '3D: each subsidiary drew its country band, the manager token with the trust ring, the seal once audited (scene.levelOf model)', models and all(mo_ok(k) for k in models), {k: (models[k] or {}).get('model') for k in models})
    gl = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().decor.globe)")
    check(sc, 'the supply arcs follow the subsidiaries (one each, red = disrupted)', gl and gl['arcs'] == len([v for v in a0['subs'].values() if v['supplier'] and v['supplier'] != v['country']]) and gl['red'] == sum(1 for v in a0['subs'].values() if v['disrupted']), (gl, a0['subs']))
    await pg.reload(); await pg.wait_for_selector('.lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
    await pg.click('.map-card[data-id="w11"]'); await pg.wait_for_selector('[data-act="continue-free"][data-id="w11"]', timeout=60000)
    await pg.click('[data-act="continue-free"][data-id="w11"]'); await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    a1 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    check(sc, 'after reload + resume: the same city and the same subsidiary levels (engine = scene)', a1['want'] == a0['want'] and a1['want'] == a1['scene'] and a1['subs'] == a0['subs'], (a0['subs'], a1['subs']))
    # a sale needs a second tap
    await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
    sell = await pg.evaluate("() => { const b = [...document.querySelectorAll('#gmCard button[data-aid=\"sell\"]:not([disabled])')].pop(); return b ? +b.dataset.wact : -1; }")
    check(sc, 'selling a subsidiary is offered', sell >= 0, sell)
    if sell >= 0:
        st0 = await pg.evaluate(SAVED); n0 = len(st0['world']['mn']['subs']); c0 = st0['cash']
        await pg.locator(f'#gmCard button[data-wact="{sell}"]').click(); await pg.wait_for_timeout(500)
        r = await pg.evaluate("() => ({ arm: !!document.querySelector('#gmCard button[data-arm=\"1\"]'), msg: document.querySelector('#gmCard .wp-msg').textContent })")
        n1 = len((await pg.evaluate(SAVED))['world']['mn']['subs'])
        check(sc, 'selling needs a second tap (the first one arms the button and sells nothing)', r['arm'] and 'אי אפשר לבטל' in r['msg'] and n1 == n0, (r, n0, n1))
        await pg.locator(f'#gmCard button[data-wact="{sell}"]').click(); await pg.wait_for_timeout(1000)
        st1 = await pg.evaluate(SAVED); P2 = await pg.evaluate(PANEL)
        check(sc, 'the second tap sells it: engine subs − 1, the panel redrawn (one row less), the city drops it', len(st1['world']['mn']['subs']) == n0 - 1 and P2['subs'] == n0 - 1, (len(st1['world']['mn']['subs']), n0, P2['subs']))
        await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(1200)
        a2 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        check(sc, 'after the sale the city equals cityModels again', a2['want'] == a2['scene'] and len(a2['subs']) == n0 - 1, a2)
    await ctx.close()

def card_fee(st):
    return 250000   # the fund (pe) pays half of the ₪500k due diligence

async def run_2d(b):
    for vp in ('desk', 'phone', 'small'):
        sc = f'2d-{vp}'; ctx, pg = await page(b, vp, flags='?ff=board2d:on')
        await pg.evaluate(START, {'seed': 7, 'ch': 'ceo' if vp == 'desk' else 'oldExporter'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(1500)
        await idle(pg)
        if vp != 'desk':
            card, _ = await roll_to(pg, 'mech', title='הצעת רכישה')
            check(sc, "reached a 'Z' tile on the 2D board", card is not None)
            if card:
                await pg.wait_for_timeout(900)
                over = await pg.evaluate("() => [...document.querySelectorAll('#evCard .grid .row, #evCard .acq-m, #evCard .acq-h')].filter((r) => r.scrollWidth > r.clientWidth + 1).map((r) => [r.textContent, r.scrollWidth, r.clientWidth])")
                fit = await pg.evaluate("() => { const c = document.querySelector('#evCard').getBoundingClientRect(); return c.width <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#evCard button[data-o]')].every((x) => x.getBoundingClientRect().height >= 43.5); }")
                check(sc, 'the acquisition card fits the phone width (no row overflows, every button ≥ 44 px)', fit and not over and card['acq'], over)
                await shot(pg, f'acq_card_{vp}')
                await pg.locator('#evCard button[data-o="pass"]').click(); await pg.wait_for_timeout(600)
                await idle(pg)
        else:
            for _ in range(3): await pg.click('#roll'); await pg.wait_for_timeout(400); await idle(pg)
        a = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        cards = await pg.evaluate("""() => [...document.querySelectorAll('.b2d-card')].filter((x) => x.dataset.kind === 'sub').map((c) => ({ key: c.dataset.key, label: c.getAttribute('aria-label'),
          corner: (c.querySelector('.b2d-corner-b') || {}).textContent || '', light: c.dataset.light, country: c.dataset.country }))""")
        HE = {'eu': 'אירופה', 'us': 'ארה״ב', 'in': 'הודו', 'br': 'ברזיל', 'vn': 'וייטנאם'}
        def card_ok(c):
            v = a['subs'].get(c['key']) or {}
            return v and c['country'] == v['country'] and HE[v['country']] in c['label'] and (('בניהול שלך' in c['label']) == v['self']) and c['corner'] == ('⚠️' if v['disrupted'] else '★' if v['self'] else '🔍' if v['managed'] and v['audited'] else '❔' if v['managed'] else '∅')
        check(sc, '2D: every subsidiary card shows its country (band + name), who runs it and a disrupted supplier = the engine', cards and len(cards) == len(a['subs']) and all(card_ok(c) for c in cards), (cards, a['subs']))
        th = await pg.evaluate("() => ({ world: document.body.dataset.world, sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(), board: ((document.querySelector('[class*=b2d-m-]') || {}).style || { getPropertyValue: () => '' }).getPropertyValue('--b2d-board').trim(), motif: [...(document.querySelector('[class*=b2d-m-]') || { classList: [] }).classList].find((x) => x.startsWith('b2d-m-')) || '' })")
        check(sc, '2D: the w11 look (data-world=w11, night sky, the dark-teal board, the globe motif)', th['world'] == 'w11' and th['sky'].lower() == '#020617' and th['board'].lower() == '#134e4a' and th['motif'] == 'b2d-m-globe', th)
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const h = document.querySelector('#hWorld').getBoundingClientRect(); const r = b.getBoundingClientRect(); return { chip: r.left >= h.left - 1 && r.right <= h.right + 1, over: document.documentElement.scrollWidth > innerWidth + 1, t: b.textContent }; }")
        check(sc, 'the 🌍 chip stays inside the HUD card', chip and chip['chip'] and not chip['over'] and '🌍' in chip['t'], chip)
        await shot(pg, f'board2d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        fit = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const r = c.getBoundingClientRect(); const tw = c.querySelector('.tblwrap'); return { w: r.width, vw: innerWidth, over: document.documentElement.scrollWidth > innerWidth + 1, acts: [...c.querySelectorAll('button[data-wact]')].every((b) => b.getBoundingClientRect().height >= 43.5), touch: [...c.querySelectorAll('button[data-wact]')].every((b) => getComputedStyle(b).touchAction === 'manipulation'), rows: [...c.querySelectorAll('.wp-row, .wp-g')].every((x) => x.scrollWidth <= x.clientWidth + 1), table: !!tw && tw.getBoundingClientRect().right <= innerWidth + 1 && tw.getBoundingClientRect().left >= -1 }; }")
        check(sc, 'panel fits the width (the country table in its own scroll box, rows, gauges), every action button ≥ 44 px with touch-action manipulation', fit['w'] <= fit['vw'] and not fit['over'] and fit['acts'] and fit['touch'] and fit['rows'] and fit['table'], fit)
        if vp != 'desk':
            if SHOTS: await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await shot(pg, f'panel_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_3dphone(b):
    for vp in ('phone', 'small'):
        sc = f'3d-{vp}'; ctx, pg = await page(b, vp)
        await pg.evaluate(START, {'seed': 7, 'ch': 'ceo'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        k = await pg.evaluate("import('./js/scene.js').then((S) => S.kind)")
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const h = document.querySelector('#hWorld').getBoundingClientRect(); const r = b.getBoundingClientRect(); return { chip: r.left >= h.left - 1 && r.right <= h.right + 1, t: b.textContent }; }")
        check(sc, '3D board on a phone; the 🌍 chip stays inside the HUD card', k == '3d' and chip and chip['chip'] and '🌍' in chip['t'], (k, chip))
        await shot(pg, f'board3d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        g = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const t = c.querySelector('.tblwrap'); const r = t.getBoundingClientRect(); return { over: document.documentElement.scrollWidth > innerWidth + 1, table: r.left >= -1 && r.right <= innerWidth + 1, rows: [...c.querySelectorAll('.wp-row')].every((x) => x.scrollWidth <= x.clientWidth + 1), gauges: [...c.querySelectorAll('.wp-g')].every((x) => x.scrollWidth <= x.clientWidth + 1) }; }")
        check(sc, 'the country table, the subsidiary rows and the gauges fit the phone width', g['table'] and not g['over'] and g['rows'] and g['gauges'], g)
        if SHOTS:
            await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await pg.evaluate("() => document.querySelector('#gmCard .mntbl')?.scrollIntoView({ block: 'start' })"); await pg.wait_for_timeout(500)
        await shot(pg, f'panel_table_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_motion(b):
    """the world-map decor is still: the same arcs and districts with reduced motion"""
    sc = 'motion-reduced'; ctx, pg = await page(b, 'desk', reduced=True)
    await pg.evaluate(START, {'seed': 7, 'ch': 'oldExporter'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    st = await pg.evaluate("import('./js/scene.js').then((S) => ({ red: S.perfStats().reduced, gl: S.perfStats().decor.globe }))")
    check(sc, 'reduced motion: the globe decor is drawn (5 districts, an arc per subsidiary — the exporter\'s two from וייטנאם)', st['red'] and st['gl'] and st['gl']['districts'] == 5 and st['gl']['arcs'] == 2, st)
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
