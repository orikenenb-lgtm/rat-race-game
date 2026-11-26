# w12 האימפריה end to end in the real page (lobby + game), offline fake backend + guard:
#   map   P.worldMap(): once the map before it in the order of the worlds is finished (2026-11-25, linear), w12 is a playable card (button, what it teaches, generated art 👑); locked otherwise
#   pick  w12 card → its rules load lazily → the picker (chair / activist / thirdGen, 👑 📊 🌱) → a game in w12 (body[data-world=w12], the
#         marble sky, the 👑 chip with the coverage in × and months, the HQ tower with a guarantee cable to every guaranteed division;
#         no 404 / page error / failed model / w12 .glb)
#   play  a fixed-seed chair game: rolls through paydays to 'Z' (חטיבה למכירה) — the division card (the profit RANGE, the price vs the
#         fair range, 40 % from HQ + the division's debt, the rates guaranteed vs ring-fenced, the storm betas in words, the options with
#         their risk in WORDS); due diligence keeps the SAME card open and redraws it in place (narrower range, its fee, the ghost-tap
#         guard), then a purchase (or pass = safe); the group panel from the chip and from 💼 (coverage × + months — never ₪, the rating in
#         letters + words, months without a default, guarantees; the storm line; a row per division = the engine, 🔗 / 🚧 in words; the
#         group's actions); insurance through E.worldAction; a division's sale needs a second tap (the first says the money, sells
#         nothing); the restructuring's first tap says "at most ★"; the goal (₪2B, 24 months, coverage ×1 — months, never ₪); the 3D
#         city = cityModels (anchor / fence, health, the cables = the guaranteed divisions); save → reload → resume: the same city.
#   2d    the 2D board on desk / 390 / 360: the w12 colours + the crown motif, the division cards (🔗 / 🚧, health bar); phones: the
#         division card and the panel fit the width, every panel button ≥ 44 px
#   3d    the 3D board on 390 / 360; motion: the HQ tower and its cables are still under reduced motion
# Copies: SRC=<export> COPY_DIR=/tmp/ui1216 PORT_BASE=11500 bash tests/serve_copies.sh
# Usage: python3 tests/w12_e2e.py [--real=http://localhost:11502/] [--shots=DIR] [--only=map,pick,play,2d,3d,motion]
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
STARS = json.dumps({'w1': 1, 'w2': 1, 'w3': 1, 'w4': 1, 'w5': 1, 'w6': 1, 'w7': 1, 'w8': 1, 'w9': 1, 'w10': 1, 'w11': 1, 'w13': 1, 'w14': 1, 'w15': 1, 'w16': 1, 'w17': 1})   # 2026-11-25 worlds / maps: every map before w12 in the order of the game finished (linear unlocks, groupsV 1)
SEED = ("localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-tips-off','1'); localStorage.setItem('rr2-reveal', 'all');"
        "localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true,w5:true,w6:true,w7:true,w8:true,w9:true,w10:true,w11:true,w12:true,w13:true,w15:true,w16:true}));")
UNLOCK = ("(() => { if (localStorage.getItem('rr2-progress')) return; localStorage.setItem('rr2-progress', JSON.stringify({ v: 1, groupsV: 1, stars: %s, best: {}, achievements: [], pawn: 'classic',"
          " seenWorlds: ['w1','w2','w3','w4','w5','w6','w7','w8','w9','w10','w11'], onboarded: true, tutorialDone: true, gamesPlayed: 6, wins: 6 })); })();" % STARS)
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
  div: !!c.querySelector('.div-h'), risks: [...c.querySelectorAll('button[data-o]')].map((b) => [b.dataset.o, b.dataset.risk || '', [...b.querySelectorAll('small.sub')].map((x) => x.textContent).join(' · ')]), lg: false }; }"""

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
    # never a missing file: every same-origin response must be < 400 (the w12 models are stand-ins, the card art generated)
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
    c = next((x for x in cards if x['id'] == 'w12'), None)
    check(sc, 'after every map before it (up to w14), w12 is a playable map card (button, what it teaches, difficulty, generated art 👑)',
          c and c['tag'] == 'BUTTON' and c['act'] == 'world' and not c['soon'] and not c['locked'] and 'ערבות' in c['learn'] and c['diff'] and c['gen'] and c['motif'] == '👑', c)
    r = await pg.evaluate("""async () => { const P = await import('./js/progress.js'); P._reset && P._reset({ ...P.getProgress(), stars: { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w7: 1, w8: 1, w9: 1, w10: 1, w11: 1, w13: 1, w15: 1, w16: 1, w17: 1 } });
      const m = P.worldMap().filter((x) => x.id === 'w12').map((x) => ({ id: x.id, unlocked: x.unlocked, lock: x.lockText })); P._reset && P._reset({ ...P.getProgress(), stars: %s }); return m; }""" % STARS)
    check(sc, 'w12 stays locked without a w14 escape (the map before it), and says how to open it', r and r[0]['unlocked'] is False and 'רובע הבנקים' in (r[0]['lock'] or ''), r)
    await shot(pg, 'map_desk')
    await ctx.close()

async def run_pick(b):
    sc = 'pick-desk'; ctx, pg = await page(b, 'desk')
    pre = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w12'))")
    check(sc, 'w12 rules are not loaded at boot (lazy)', pre is False, pre)
    await pg.click('.map-card[data-id="w12"]')
    await pg.wait_for_selector('.wv-char[data-w="w12"]', timeout=60000)
    info = await pg.evaluate("""() => ({ chars: [...document.querySelectorAll('.wv-char')].map((c) => c.dataset.c), h1: document.querySelector('.wv-hero h1').textContent,
      icons: [...document.querySelectorAll('.wv-char .wv-ic')].map((x) => x.textContent), goal: (document.querySelector('.wv-goal') || {}).textContent || '',
      pros: document.querySelectorAll('.wv-char .wv-str').length, cons: document.querySelectorAll('.wv-char .wv-weak').length })""")
    info['loaded'] = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w12'))")
    check(sc, 'the picker waits for the rules, then lists the 3 w12 characters', info['loaded'] and info['chars'] == ['chair', 'activist', 'thirdGen'] and info['h1'] == 'האימפריה', info)
    check(sc, 'character icons 👑 / 📊 / 🌱 (never the 🙂 fallback); pros / cons; the ₪2B goal', info['icons'] == ['👑', '📊', '🌱'] and info['pros'] >= 3 and info['cons'] >= 3 and '2 מיליארד' in info['goal'], info)
    await shot(pg, 'picker_desk')
    await pg.click('.wv-go[data-c="chair"]')
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500); await quiet(pg)
    await idle(pg)
    g = await pg.evaluate("""() => ({ world: document.body.dataset.world, chip: (document.querySelector('#worldPanelBtn') || {}).textContent || '', sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(),
      label: (document.querySelector('#worldPanelBtn') || { getAttribute: () => '' }).getAttribute('aria-label') })""")
    g['cfg'] = await pg.evaluate("import('./js/game.js').then((G) => G.activeConfig())")
    check(sc, 'a w12 game started from the picker (chair, free), the marble sky', g['world'] == 'w12' and g['cfg'] and g['cfg']['worldId'] == 'w12' and g['cfg']['charId'] == 'chair' and g['sky'].lower() == '#f5f5f4', g)
    check(sc, 'the HUD shows the 👑 chip (coverage ×, the rating) with a full accessible name (months), never ₪ for the coverage', '👑' in g['chip'] and '×' in g['chip'] and 'כיסוי נזילות' in (g['label'] or '') and 'חודשים' in (g['label'] or '') and '₪' not in g['chip'], g)
    fails = await pg.evaluate("import('./js/scene.js').then((S) => S.failedModels ? S.failedModels() : [])")
    check(sc, 'no model failed (the w12 models are stand-ins)', not fails, fails)
    glb = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().glb)")
    check(sc, 'no w12 .glb was ever requested', not any('/w12/' in u for u in glb), glb)
    tw = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().decor.tower)")
    check(sc, 'the HQ tower decor: one guarantee cable per guaranteed division (chair: 3)', tw and tw['cables'] == 3 and tw['fenced'] == 3, tw)
    await ctx.close()

START = """async ({ seed, ch }) => { const E = await import('./js/engine.js'); await E.ensureWorld('w12'); const G = await import('./js/game.js'); await G.initGame();
  G.startGame({ worldId: 'w12', charId: ch || 'chair', mode: 'free', seed, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true, resume: false }); return true; }"""
SAVED = "() => { const r = JSON.parse(localStorage.getItem('rr2-save-free-w12') || 'null'); return r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); }"
PANEL = """() => { const c = document.querySelector('#gmCard'); return { gauges: [...c.querySelectorAll('.wp-g')].map((g) => g.dataset.g), gtext: [...c.querySelectorAll('.wp-g')].map((g) => g.textContent),
  rows: [...c.querySelectorAll('.divs .drow')].map((r) => ({ did: r.dataset.did, struct: r.dataset.struct, t: r.textContent, acts: [...r.querySelectorAll('button[data-wact]')].map((b) => b.dataset.aid) })),
  storm: (c.querySelector('.storm-on, .storm-none') || {}).textContent || '', segs: [...c.querySelectorAll('.wp-seg')].map((s) => s.getAttribute('aria-label')),
  aids: [...c.querySelectorAll('button[data-wact]')].map((b) => b.dataset.aid), title: (c.querySelector('h2') || {}).textContent || '', now: (c.querySelector('.wp-now') || {}).textContent || '', text: c.textContent }; }"""
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

DIV_WORDS = ['חטיבה למכירה', 'רווח תפעולי בחודש', 'המחיר', 'עכשיו מקופת המטה', 'חוב על החטיבה', 'ריבית על החוב', 'בערבות המטה', 'מגודרת', 'שווי הוגן', 'המחיר מול השווי', 'בריאות', 'חשיפה לסערות', 'לא נבדק']
def dd_fee(price): return max(1000000, int(price * 0.004 / 100000 + 0.5) * 100000)

async def run_play(b):
    sc = 'play-desk'; ctx, pg = await page(b, 'desk')
    await pg.evaluate(START, {'seed': 7, 'ch': 'chair'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    await shot(pg, 'board3d_desk')
    card, paid = await roll_to(pg, 'mech', title='חטיבה למכירה')
    check(sc, "landed on a 'Z' tile: the division card (the profit range, the price, 40 % from HQ + the division's debt, the two rates, the fair range vs the price, the storm betas)",
          card and all(w in card['text'] for w in DIV_WORDS) and {'buy', 'buyRf', 'dd', 'pass'} <= set(card['opts']) and card['div'], card and ([w for w in DIV_WORDS if w not in card['text']], card['opts'], card['text'][:500]))
    if card:
        rk = {o: (r, t) for o, r, t in card['risks']}
        check(sc, 'every option says its cash / month and its risk in words (before dd: "the true profit is not checked yet"; pass = nothing)',
              rk['buy'][0] == 'unknown' and 'עוד לא נבדק' in rk['buy'][1] and 'עכשיו' in rk['buy'][1] and 'בחודש' in rk['buy'][1] and rk['pass'][1] == 'בלי לשלם כלום', rk)
        bad = await axe_bad(pg, '#evm'); check(sc, 'axe: the division card has no critical / serious violation', not bad, bad)
        await shot(pg, 'division_card_desk')
        st0 = await pg.evaluate(SAVED); c0 = st0['cash']; it0 = st0['pending']['item']; w0 = it0['hi'] - it0['lo']
        r = await pg.evaluate("""async () => { const c = document.querySelector('#evCard'); const t0 = c.querySelector('h2').textContent; const b = c.querySelector('button[data-o="dd"]');
          if (!b || b.disabled) return { skip: true }; b.click();
          for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 25)); if (document.querySelector('#evm').hidden || /הבדיקה צמצמה/.test(c.textContent)) break; }
          const open = !document.querySelector('#evm').hidden; const upd = open && /הבדיקה צמצמה/.test(c.textContent);
          let ghost = null; if (upd) { const w = c.querySelector('button[data-o="pass"]'); w.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); await new Promise((r) => setTimeout(r, 60)); ghost = !document.querySelector('#evm').hidden; }
          return { open, upd, ghost, same: open && c.querySelector('h2').textContent === t0, dd: !!c.querySelector('.div-h .b.ok'), dis: !c.querySelector('button[data-o="dd"]:not([disabled])'),
            risks: [...c.querySelectorAll('button[data-o]')].map((b) => [b.dataset.o, b.dataset.risk || '', [...b.querySelectorAll('small.sub')].map((x) => x.textContent).join(' · ')]), text: c.textContent }; }""")
        st1 = await pg.evaluate(SAVED); it1 = (st1.get('pending') or {}).get('item') or {}
        check(sc, 'due diligence keeps the SAME card open and redraws it in place: "🔍 נבדק", the narrower range, the check button spent', r.get('same') and r.get('upd') and r.get('dd') and r.get('dis') and it1.get('dd') and (it1['hi'] - it1['lo']) < w0, ({k: v for k, v in r.items() if k != 'text'}, it0, it1))
        check(sc, 'the check cost exactly its fee (engine cash − fee)', abs((c0 - st1['cash']) - dd_fee(it0['price'])) < 2, (c0, st1['cash'], dd_fee(it0['price'])))
        check(sc, 'a tap right after the card changed is ignored (the ghost-tap guard): the card is still open', r.get('ghost') is True, r.get('ghost'))
        rk = {o: (x, t) for o, x, t in (r.get('risks') or [])}
        check(sc, 'after the check, buying with HQ\'s guarantee says the contagion risk in words; ring-fenced has none', rk.get('buy', ('', ''))[0] == 'contagion' and 'סיכון הדבקה' in rk['buy'][1] and rk.get('buyRf', ('x', ''))[0] == '', rk)
        await shot(pg, 'division_card_dd_desk')
        await pg.wait_for_timeout(400)
        n0 = len(st1['world']['hd']['divs'])
        buy = pg.locator('#evCard button[data-o="buyRf"]:not([disabled]), #evCard button[data-o="buy"]:not([disabled])')
        bought = await buy.count() > 0
        if bought: await buy.first.click()
        else: await pg.locator('#evCard button[data-o="pass"]').click()
        await pg.wait_for_timeout(900); await idle(pg)
        st2 = await pg.evaluate(SAVED)
        check(sc, 'buying adds the division (engine divisions + 1) — or pass, the safe choice, changes nothing', len(st2['world']['hd']['divs']) == n0 + (1 if bought else 0), (bought, n0, len(st2['world']['hd']['divs'])))
    for _ in range(4):
        await pg.click('#roll'); await pg.wait_for_timeout(500); await idle(pg)
    check(sc, 'rolled through a payday', paid or (await pg.evaluate(SAVED))['month'] > 1)
    if SHOTS:   # the whole board: the HQ tower and its cables / the silos and the field strips
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('overview'))"); await pg.wait_for_timeout(2500); await shot(pg, 'board3d_overview_desk')
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('follow'))"); await pg.wait_for_timeout(1500)
    await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
    P = await pg.evaluate(PANEL); st = await pg.evaluate(SAVED); M = st['world']['hd']
    check(sc, 'panel: 4 gauges (coverage × + months — never ₪, the rating in letters + words, months without a default, guarantees) and the group line',
          P['gauges'] == ['coverage', 'rating', 'noDefault', 'guaranteed'] and '×' in P['gtext'][0] and ('חודשים' in P['gtext'][0]) and '₪' not in P['gtext'][0] and '—' in P['gtext'][1] and 'מתוך 24' in P['gtext'][2] and 'מפת הקבוצה' in P['title'] and 'חטיבות' in P['now'] and 'דירוג' in P['now'], (P['gauges'], P['gtext'], P['now'][:300]))
    check(sc, 'the storm line says the storm (or none, or a boom) in words', 'סערה' in P['storm'] or 'בשווקים' in P['storm'], P['storm'])
    eng = {('d%d' % d['sid']): d['struct'] for d in M['divs']}
    check(sc, 'a row per division = the engine (🔗 guaranteed / 🚧 ring-fenced in words), each with its own actions (structure, support, grow, fix, sell)',
          len(P['rows']) == len(M['divs']) and all(eng.get(r['did']) == r['struct'] and (('בערבות המטה' in r['t']) if r['struct'] == 'g' else ('מגודרת' in r['t'])) and {'structure', 'support', 'sell'} <= set(r['acts']) for r in P['rows']), (P['rows'], eng))
    check(sc, 'the group actions: the dividend (min / high / skip) as one group, bond, insurance, services', any('דיבידנד' in (x or '') for x in P['segs']) and {'bond', 'insure', 'services'} <= set(P['aids']), (P['segs'], set(P['aids'])))
    bad = await axe_bad(pg, '#gm'); check(sc, 'axe: the group panel has no critical / serious violation', not bad, bad)
    if SHOTS: await pg.wait_for_timeout(1500); await pg.add_style_tag(content='#toast{visibility:hidden !important}')
    await shot(pg, 'panel_desk')
    if SHOTS:
        await pg.evaluate("() => document.querySelector('#gmCard .divs')?.scrollIntoView({ block: 'start' })"); await pg.wait_for_timeout(500); await shot(pg, 'panel_divisions_desk')
    # insurance through E.worldAction (one tap)
    idx = await pg.evaluate("() => { const b = document.querySelector('#gmCard button[data-aid=\"insure\"]:not([disabled])'); return b ? +b.dataset.wact : -1; }")
    check(sc, 'the insurance arm can be switched', idx >= 0, idx)
    if idx >= 0:
        z0 = sum(1 for a in st.get('actions', []) if a[0] == 'Z'); i0 = bool(M.get('ins'))
        await pg.locator(f'#gmCard button[data-wact="{idx}"]').click(); await pg.wait_for_timeout(900)
        msg = await pg.evaluate("() => { const m = document.querySelector('#gmCard .wp-msg'); return { t: m.textContent, c: m.className }; }")
        st = await pg.evaluate(SAVED)
        check(sc, 'insurance went through E.worldAction (engine ins switched, one more Z action, the panel redrawn with its toast)', bool(st['world']['hd'].get('ins')) != i0 and sum(1 for a in st.get('actions', []) if a[0] == 'Z') == z0 + 1 and 'pos' in msg['c'] and 'ביטוח' in msg['t'], (msg, st['world']['hd'].get('ins')))
    # a division's sale: the first tap says the money and sells nothing; the second sells
    s_i = await pg.evaluate("() => { const b = [...document.querySelectorAll('#gmCard button[data-aid=\"sell\"]:not([disabled])')].find((x) => /נכנס \\+/.test(x.textContent)); return b ? +b.dataset.wact : -1; }")
    check(sc, 'a division with a positive net sale is offered for sale', s_i >= 0, s_i)
    if s_i >= 0:
        st0 = await pg.evaluate(SAVED); n0 = len(st0['world']['hd']['divs']); c0 = st0['cash']
        await pg.locator(f'#gmCard button[data-wact="{s_i}"]').click(); await pg.wait_for_timeout(500)
        r = await pg.evaluate("() => ({ arm: !!document.querySelector('#gmCard button[data-arm=\"1\"]'), msg: document.querySelector('#gmCard .wp-msg').textContent })")
        n1 = len((await pg.evaluate(SAVED))['world']['hd']['divs'])
        check(sc, 'a sale needs a second tap: the first says the money into HQ and "לחיצה נוספת מאשרת", sells nothing', r['arm'] and 'נכנס לקופת המטה' in r['msg'] and 'לחיצה נוספת מאשרת' in r['msg'] and n1 == n0, (r, n0, n1))
        await shot(pg, 'panel_sell_armed_desk')
        await pg.locator(f'#gmCard button[data-wact="{s_i}"]').click(); await pg.wait_for_timeout(1000)
        st1 = await pg.evaluate(SAVED)
        check(sc, 'the second tap sells: the engine has one division less, the cash goes up', len(st1['world']['hd']['divs']) == n0 - 1 and st1['cash'] > c0, (n0, len(st1['world']['hd']['divs']), c0, st1['cash']))
    rs = await pg.evaluate("import('./js/render/worldview1216.js').then((V) => ({ arm: V.needsArm({ id: 'restructure' }), t: V.armText({ id: 'restructure' }) }))")
    check(sc, 'the restructuring is a two-tap action whose first tap says "at most ★" before it confirms', rs['arm'] and '★' in rs['t'] and 'לכל היותר' in rs['t'] and 'לחיצה נוספת מאשרת' in rs['t'], rs)
    await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await close_gm(pg)
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=5000)
    row = await pg.evaluate("() => { const r = document.querySelector('#gmCard .mh-row[data-row=\"world\"]'); return r ? r.textContent : null; }")
    check(sc, '💼 has the "מפת הקבוצה והערבויות" row (divisions, rating, coverage)', row and 'מפת הקבוצה' in row and 'חטיבות' in row and 'דירוג' in row and 'כיסוי ×' in row, row)
    if row:
        await pg.click('#gmCard .mh-row[data-row="world"] button[data-hub="world"]'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
        check(sc, '💼 → the group panel opens', await pg.locator('#gmCard.wpanel').count() == 1)
        await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await close_gm(pg)
    await pg.click('#hGoalBtn'); await pg.wait_for_selector('#goalPanel:not([hidden])', timeout=5000)
    gp = await pg.evaluate("() => document.querySelector('#goalPanel').textContent")
    hud = await pg.evaluate("() => ({ sub: document.querySelector('#hGoal .gsub').textContent, tags: [...document.querySelectorAll('#hGoal .gbar em')].map((e) => e.textContent), label: document.querySelector('#hGoal .gl span').textContent })")
    check(sc, 'goal: ₪2 מיליארד, 24 months without a default, coverage ×1 (months) — never "fixed costs"; the HUD: שווי / רצף / קופה',
          '2 מיליארד' in gp and 'בלי חדלות פירעון' in gp and 'כיסוי' in gp and 'עלויות קבועות' not in gp and 'הדרך ליעד' in gp and hud['tags'] == ['שווי', 'רצף', 'קופה'] and hud['label'] == 'יעד הקבוצה' and '×' in hud['sub'], (gp[:400], hud))
    await pg.click('#hGoalBtn'); await pg.wait_for_timeout(300)
    a0 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    lv_ok = a0['divs'] and all(a0['levels'].get(k, {}).get('kind') == 'div' and a0['levels'][k].get('struct') == v['struct'] and a0['levels'][k].get('health') == v['health'] for k, v in a0['divs'].items())
    check(sc, '3D: the city equals cityModels and every division carries its level (struct, health, deficit, storm)', a0['want'] == a0['scene'] and lv_ok, a0)
    ms = {}
    for k in a0['divs']: ms[k] = ((await pg.evaluate("(k) => import('./js/scene.js').then((S) => S.levelOf ? S.levelOf(k) : null)", k)) or {}).get('model') or {}
    check(sc, '3D: each division drew its anchor (guaranteed) or its fence (ring-fenced), its health bars and its deficit ring (scene.levelOf model)',
          all(ms[k].get('cable') == v['cable'] and ms[k].get('fence') == v['fence'] and ms[k].get('distress') == v['distress'] and ms[k].get('health') == round(v['health']) for k, v in a0['divs'].items()), (ms, a0['divs']))
    tw = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().decor.tower)")
    check(sc, 'the HQ tower\'s cables = the guaranteed divisions (red = in a deficit)', tw and sorted(tw['keys']) == sorted(k for k, v in a0['divs'].items() if v['cable']) and tw['red'] == sum(1 for v in a0['divs'].values() if v['cable'] and v['distress']), (tw, a0['divs']))
    await pg.reload(); await pg.wait_for_selector('.lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
    await pg.click('.map-card[data-id="w12"]'); await pg.wait_for_selector('[data-act="continue-free"][data-id="w12"]', timeout=60000)
    await pg.click('[data-act="continue-free"][data-id="w12"]'); await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    a1 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    check(sc, 'after reload + resume: the same city and the same division levels (engine = scene)', a1['want'] == a0['want'] and a1['want'] == a1['scene'] and a1['divs'] == a0['divs'], (a0['divs'], a1['divs']))
    await ctx.close()

async def run_2d(b):
    for vp in ('desk', 'phone', 'small'):
        sc = f'2d-{vp}'; ctx, pg = await page(b, vp, flags='?ff=board2d:on')
        await pg.evaluate(START, {'seed': 7, 'ch': 'activist' if vp == 'desk' else 'thirdGen'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(1500)
        await idle(pg)
        if vp != 'desk':
            card, _ = await roll_to(pg, 'mech', title='חטיבה למכירה')
            check(sc, "reached a 'Z' tile on the 2D board", card is not None)
            if card:
                await pg.wait_for_timeout(900)
                over = await pg.evaluate("() => [...document.querySelectorAll('#evCard .grid .row, #evCard .div-h')].filter((r) => r.scrollWidth > r.clientWidth + 1).map((r) => [r.textContent, r.scrollWidth, r.clientWidth])")
                fit = await pg.evaluate("() => { const c = document.querySelector('#evCard').getBoundingClientRect(); return c.width <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#evCard button[data-o]')].every((x) => x.getBoundingClientRect().height >= 43.5); }")
                check(sc, 'the division card fits the phone width (no row overflows, every button ≥ 44 px)', fit and not over, over)
                await shot(pg, f'division_card_{vp}')
                await pg.locator('#evCard button[data-o="pass"]').click(); await pg.wait_for_timeout(600)
                await idle(pg)
        else:
            for _ in range(3): await pg.click('#roll'); await pg.wait_for_timeout(400); await idle(pg)
        a = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        cards = await pg.evaluate("""() => [...document.querySelectorAll('.b2d-card')].filter((x) => x.dataset.kind === 'div').map((c) => ({ key: c.dataset.key, label: c.getAttribute('aria-label'),
          corner: (c.querySelector('.b2d-corner-b') || {}).textContent || '', struct: c.dataset.struct, pct: c.style.getPropertyValue('--b2d-pct') }))""")
        def card_ok(c):
            v = a['divs'].get(c['key']) or {}
            return v and c['struct'] == v['struct'] and c['pct'] == f"{round(v['health'])}%" and (('בערבות המטה' in c['label']) if v['struct'] == 'g' else ('מגודרת' in c['label'])) and c['corner'] in ('🔗', '🚧', '⚠️', '🌩️')
        check(sc, '2D: every division card shows 🔗 / 🚧 (in its name, in words), its health as the bar = the engine', cards and len(cards) == len(a['divs']) and all(card_ok(c) for c in cards), (cards, a['divs']))
        th = await pg.evaluate("() => ({ world: document.body.dataset.world, sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(), board: ((document.querySelector('[class*=b2d-m-]') || {}).style || { getPropertyValue: () => '' }).getPropertyValue('--b2d-board').trim(), motif: [...(document.querySelector('[class*=b2d-m-]') || { classList: [] }).classList].find((x) => x.startsWith('b2d-m-')) || '' })")
        check(sc, '2D: the w12 look (data-world=w12, the marble sky, the verde marble board, the crown motif)', th['world'] == 'w12' and th['sky'].lower() == '#f5f5f4' and th['board'].lower() == '#cce2d4' and th['motif'] == 'b2d-m-crown', th)
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const h = document.querySelector('#hWorld').getBoundingClientRect(); const r = b.getBoundingClientRect(); return { chip: r.left >= h.left - 1 && r.right <= h.right + 1, over: document.documentElement.scrollWidth > innerWidth + 1, t: b.textContent }; }")
        check(sc, 'the 👑 chip stays inside the HUD card', chip and chip['chip'] and not chip['over'] and '👑' in chip['t'], chip)
        await shot(pg, f'board2d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        fit = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const r = c.getBoundingClientRect(); return { w: r.width, vw: innerWidth, over: document.documentElement.scrollWidth > innerWidth + 1, acts: [...c.querySelectorAll('button[data-wact]')].every((b) => b.getBoundingClientRect().height >= 43.5), touch: [...c.querySelectorAll('button[data-wact]')].every((b) => getComputedStyle(b).touchAction === 'manipulation'), rows: [...c.querySelectorAll('.wp-g, .wp-now, .drow')].every((x) => x.scrollWidth <= x.clientWidth + 1) }; }")
        check(sc, 'panel fits the width (gauges, the storm line, the division rows), every action button ≥ 44 px with touch-action manipulation', fit['w'] <= fit['vw'] and not fit['over'] and fit['acts'] and fit['touch'] and fit['rows'], fit)
        if vp != 'desk':
            if SHOTS: await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await shot(pg, f'panel_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_3dphone(b):
    for vp in ('phone', 'small'):
        sc = f'3d-{vp}'; ctx, pg = await page(b, vp)
        await pg.evaluate(START, {'seed': 7, 'ch': 'chair'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        k = await pg.evaluate("import('./js/scene.js').then((S) => S.kind)")
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const h = document.querySelector('#hWorld').getBoundingClientRect(); const r = b.getBoundingClientRect(); return { chip: r.left >= h.left - 1 && r.right <= h.right + 1, t: b.textContent }; }")
        check(sc, '3D board on a phone; the 👑 chip stays inside the HUD card', k == '3d' and chip and chip['chip'] and '👑' in chip['t'], (k, chip))
        await shot(pg, f'board3d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        g = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); return { over: document.documentElement.scrollWidth > innerWidth + 1, rows: [...c.querySelectorAll('.drow')].every((x) => x.getBoundingClientRect().right <= innerWidth + 1 && x.getBoundingClientRect().left >= -1), gauges: [...c.querySelectorAll('.wp-g')].every((x) => x.scrollWidth <= x.clientWidth + 1) }; }")
        check(sc, 'the division rows and the gauges fit the phone width', g['rows'] and not g['over'] and g['gauges'], g)
        if SHOTS:
            await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await pg.evaluate("() => document.querySelector('#gmCard .divs')?.scrollIntoView({ block: 'start' })"); await pg.wait_for_timeout(500)
        await shot(pg, f'panel_divisions_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_motion(b):
    """the HQ tower and its cables are still under reduced motion (no updater): the cables stand, the same before and after a roll"""
    sc = 'motion-reduced'; ctx, pg = await page(b, 'desk', reduced=True)
    await pg.evaluate(START, {'seed': 7, 'ch': 'chair'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    s0 = await pg.evaluate("import('./js/scene.js').then((S) => ({ red: S.perfStats().reduced, tw: S.perfStats().decor.tower, fps: S.perfStats().framesRendered }))")
    await pg.wait_for_timeout(2500)
    s1 = await pg.evaluate("import('./js/scene.js').then((S) => ({ tw: S.perfStats().decor.tower, fps: S.perfStats().framesRendered }))")
    check(sc, 'reduced motion: the HQ tower\'s cables are drawn and the idle scene does not animate (well under 60 frames in 2.5 s: only a toast or the HUD wakes it)', s0['red'] and s0['tw'] and s0['tw']['cables'] == 3 and s1['tw'] == s0['tw'] and s1['fps'] - s0['fps'] < 60, (s0, s1))
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
