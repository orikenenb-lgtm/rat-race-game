# w13 אצטדיון הכוכבים end to end in the real page (lobby + game), offline fake backend + guard:
#   map   P.worldMap(): once the map before it in the order of the worlds is finished (2026-11-25, linear), w13 is a playable card (button, what it teaches, generated art 🏟️); without it w13 is
#         locked and says how to open it
#   pick  w13 card → its rules load lazily → the character picker (coachOwner / localTycoon / academyDirector, pros / cons, 📣 👑 🌱 — never the
#         🙂 fallback) → a game starts in w13 (body[data-world=w13], the night sky, the ⚽ chip + the live table strip, no 404 / page error /
#         failed model: the w13 models are procedural)
#   play  a fixed-seed coachOwner game: rolls through a payday to an 'H' (שוק ההעברות) tile — the transfer card (a token with an age ring, band,
#         rating, the potential RANGE, wage × months, the public estimate, the price, the round of 3, the rivals' count, the three levels with
#         "over the estimate" in words, the guide's budget); a low bid that a rival beats re-describes the SAME card in place (round 2, who
#         outbid and at what price), a tap right after the update is ignored (the ghost-tap guard), then walk = nothing spent; the club panel
#         from the HUD chip and from 💼 (4 gauges: wages ÷ revenue in %, the rank with the cliff, strength, fill; the league table with zones in
#         words; the squad as tokens; the club's actions); naming rights through E.worldAction; selling a player needs a second tap and then
#         sells him (engine squad − 1, cash + the price, a Z action); the goal panel (₪450M and wages ≤ 70 % shown in %, never ₪); 3D city =
#         cityModels (the stadium's club level: seats, stage, fill, tier, rank); save → reload → resume: the same city and the same levels
#   2d    the 2D board on desk / 390 / 360: w13 colours + the pitch motif, the stadium card (⚽ corner, the fill bar, "מקום" in its name); on
#         phones the transfer card and the panel fit the width, every panel button ≥ 44 px
#   3d    the 3D board on 390 / 360; the chip and the strip stay inside the HUD card; the table / squad fit; floodlights are on (still)
# Copies: SRC=<export> COPY_DIR=/tmp/ui13 PORT_BASE=11300 bash tests/serve_copies.sh
# Usage: python3 tests/w13_e2e.py [--real=http://localhost:11302/] [--shots=DIR] [--only=map,pick,play,2d,3d]
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
PB = int(os.environ.get('PORT_BASE', '11300'))
REAL = OPT.get('real') or f'http://localhost:{PB + 2}/'
SHOTS = OPT.get('shots'); ONLY = set(OPT['only'].split(',')) if OPT.get('only') else None
want = lambda s: ONLY is None or s in ONLY
VP = {'desk': {'width': 1300, 'height': 820}, 'phone': {'width': 390, 'height': 844}, 'small': {'width': 360, 'height': 740}}
ARGS = FB.chrome_args(MODE, ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
STARS = json.dumps({'w1': 1, 'w2': 1, 'w3': 1, 'w4': 1, 'w5': 1, 'w6': 1, 'w7': 1, 'w8': 1, 'w9': 1, 'w10': 1, 'w15': 1})   # 2026-11-25 worlds / maps: every map before w13 in the order of the game finished (linear unlocks, groupsV 1)
SEED = ("localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-tips-off','1'); localStorage.setItem('rr2-reveal', 'all');"
        "localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true,w5:true,w6:true,w7:true,w8:true,w9:true,w10:true,w13:true}));")
UNLOCK = ("(() => { if (localStorage.getItem('rr2-progress')) return; localStorage.setItem('rr2-progress', JSON.stringify({ v: 1, groupsV: 1, stars: %s, best: {}, achievements: [], pawn: 'classic',"
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
  en: [...c.querySelectorAll('button[data-o]:not([disabled])')].map((b) => b.dataset.o), text: c.textContent, auc: !!c.querySelector('.aucmini'), tok: !!c.querySelector('.lot .ptok'),
  lv: c.querySelectorAll('.auc-lv li').length, over: c.querySelectorAll('.auc-lv li.over').length, lg: !!c.querySelector('.lgmini') }; }"""

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
    # never a missing file: every same-origin response must be < 400 (the w13 models are procedural, the card art generated)
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
       An auction card that is not stopped on is walked away from (never a buy by accident). seen: the first deal card with a league block."""
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
            if s['type'] == 'mech' and await pg.locator('#evCard button[data-o="walk"]:not([disabled])').count():
                await pg.locator('#evCard button[data-o="walk"]').click(); await pg.wait_for_timeout(500); continue
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
    c = next((x for x in cards if x['id'] == 'w13'), None)
    check(sc, 'after every map before it (up to w15), w13 is a playable map card (button, what it teaches, difficulty, generated art 🏟️)',
          c and c['tag'] == 'BUTTON' and c['act'] == 'world' and not c['soon'] and not c['locked'] and 'טורניר' in c['learn'] and c['diff'] and c['gen'] and c['motif'] == '🏟️', c)
    r = await pg.evaluate("""async () => { const P = await import('./js/progress.js'); P._reset && P._reset({ ...P.getProgress(), stars: { w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1, w7: 1, w8: 1, w9: 1, w10: 1 } });
      const m = P.worldMap().filter((x) => x.id === 'w13').map((x) => ({ id: x.id, unlocked: x.unlocked, lock: x.lockText })); P._reset && P._reset({ ...P.getProgress(), stars: %s }); return m; }""" % STARS)
    check(sc, 'w13 needs a w15 escape (the map before it in world 3): locked without it, and says so', r and r[0]['unlocked'] is False and 'מגדלי הענן' in (r[0]['lock'] or ''), r)
    await shot(pg, 'map_desk')
    await ctx.close()

async def run_pick(b):
    sc = 'pick-desk'; ctx, pg = await page(b, 'desk')
    pre = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w13'))")
    check(sc, 'w13 rules are not loaded at boot (lazy)', pre is False, pre)
    await pg.click('.map-card[data-id="w13"]')
    await pg.wait_for_selector('.wv-char[data-w="w13"]', timeout=60000)
    info = await pg.evaluate("""() => ({ chars: [...document.querySelectorAll('.wv-char')].map((c) => c.dataset.c), h1: document.querySelector('.wv-hero h1').textContent,
      icons: [...document.querySelectorAll('.wv-char .wv-ic')].map((x) => x.textContent), goal: (document.querySelector('.wv-goal') || {}).textContent || '',
      pros: document.querySelectorAll('.wv-char .wv-str').length, cons: document.querySelectorAll('.wv-char .wv-weak').length })""")
    info['loaded'] = await pg.evaluate("import('./js/engine.js').then((E) => E.isLoaded('w13'))")
    check(sc, 'the picker waits for the rules, then lists the 3 w13 characters', info['loaded'] and info['chars'] == ['coachOwner', 'localTycoon', 'academyDirector'] and info['h1'] == 'אצטדיון הכוכבים', info)
    check(sc, 'character icons 📣 / 👑 / 🌱 (never the 🙂 fallback); pros / cons; the ₪450M + wages goal', info['icons'] == ['📣', '👑', '🌱'] and info['pros'] >= 3 and info['cons'] >= 3 and '450' in info['goal'], info)
    await shot(pg, 'picker_desk')
    await pg.click('.wv-go[data-c="coachOwner"]')
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500); await quiet(pg)
    await idle(pg)
    g = await pg.evaluate("""() => ({ world: document.body.dataset.world, chip: (document.querySelector('#worldPanelBtn') || {}).textContent || '', sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(),
      ink: getComputedStyle(document.body).getPropertyValue('--accent-ink').trim(), strip: document.querySelectorAll('#hInd .lgstrip i').length, us: document.querySelectorAll('#hInd .lgstrip i.us').length,
      stripName: (document.querySelector('#hInd .lgstrip') || { getAttribute: () => '' }).getAttribute('aria-label') })""")
    g['cfg'] = await pg.evaluate("import('./js/game.js').then((G) => G.activeConfig())")
    check(sc, 'a w13 game started from the picker (coachOwner, free), the night sky', g['world'] == 'w13' and g['cfg'] and g['cfg']['worldId'] == 'w13' and g['cfg']['charId'] == 'coachOwner' and g['sky'].lower() == '#0b1020', g)
    check(sc, 'the HUD shows the ⚽ club chip (the place, the wage ratio) and the live table strip (8 places, ours marked, an accessible name)', '⚽' in g['chip'] and 'מקום' in g['chip'] and g['strip'] == 8 and g['us'] == 1 and 'הטבלה' in (g['stripName'] or ''), g)
    fails = await pg.evaluate("import('./js/scene.js').then((S) => S.failedModels ? S.failedModels() : [])")
    check(sc, 'no model failed (the w13 stand-ins are procedural)', not fails, fails)
    glb = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().glb)")
    check(sc, 'no w13 .glb was ever requested', not any('/w13/' in u for u in glb), glb)
    fl = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().decor.floodlights)")
    check(sc, 'the night-match decor: four floodlight masts, lit', fl and fl['masts'] == 4 and fl['lit'], fl)
    await ctx.close()

START = """async ({ seed, ch }) => { const E = await import('./js/engine.js'); await E.ensureWorld('w13'); const G = await import('./js/game.js'); await G.initGame();
  G.startGame({ worldId: 'w13', charId: ch || 'coachOwner', mode: 'free', seed, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true, resume: false }); return true; }"""
SAVED = "() => { const r = JSON.parse(localStorage.getItem('rr2-save-free-w13') || 'null'); return r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); }"
PANEL = """() => { const c = document.querySelector('#gmCard'); return { gauges: [...c.querySelectorAll('.wp-g')].map((g) => g.dataset.g), gtext: [...c.querySelectorAll('.wp-g')].map((g) => g.textContent),
  table: [...c.querySelectorAll('.lgtbl tbody tr')].map((r) => ({ us: r.classList.contains('us'), zone: r.dataset.zone, t: r.textContent })), caption: !!c.querySelector('.lgtbl caption'),
  squad: c.querySelectorAll('.squad .prow').length, tokens: [...c.querySelectorAll('.squad .ptok')].map((t) => [t.className, t.getAttribute('aria-label')]),
  acts: c.querySelectorAll('button[data-wact]').length, sells: c.querySelectorAll('button[data-aid="sell"]').length,
  title: (c.querySelector('h2') || {}).textContent || '', now: (c.querySelector('.wp-now') || {}).textContent || '', text: c.textContent }; }"""

async def close_gm(pg, n=8):
    for _ in range(n):
        if await pg.evaluate("() => document.querySelector('#gm').hidden"): return
        b = pg.locator('#gm .acts button.primary:not([disabled])')
        if await b.count(): await b.first.click()
        else: await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(400)

async def roll_to(pg, kind, n=60, seen=None, title=None):
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

LOT_WORDS = ['שוק ההעברות', 'גיל', 'דירוג', 'פוטנציאל', 'שכר', 'הערכת שווי ציבורית', 'מחיר עכשיו', 'סבב', 'מועדונים מתמודדים', 'ההצעות בסבב הזה', 'המנטור']
LG = "(st) => st && st.world && st.world.league"

async def run_play(b):
    sc = 'play-desk'; ctx, pg = await page(b, 'desk')
    await pg.evaluate(START, {'seed': 7, 'ch': 'coachOwner'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    await shot(pg, 'board3d_desk')
    seen = {}; paid_any = False; outbid = None
    for attempt in range(6):
        lot, paid = await roll_to(pg, 'mech', seen=seen, title='שוק ההעברות')
        paid_any = paid_any or paid
        if not lot: break
        if attempt == 0:
            check(sc, "landed on an 'H' tile: the transfer card (a token with an age ring, band, rating, the potential range, wage × months, the estimate, the price, round n of 3, the rivals, the three levels, the guide)",
                  all(w in lot['text'] for w in LOT_WORDS) and {'bid', 'raise', 'jump', 'walk'} <= set(lot['opts']) and lot['auc'] and lot['tok'] and lot['lv'] == 3 and 'סבב' in lot['text'] and '1 מתוך 3' in lot['text'],
                  (lot['opts'], [w for w in LOT_WORDS if w not in lot['text']], lot['text'][:500]))
            bad = await axe_bad(pg, '#evm'); check(sc, 'axe: the transfer card has no critical / serious violation', not bad, bad)
            await shot(pg, 'auction_card_desk')
        cash0 = (await pg.evaluate(SAVED))['cash']
        # a low bid (the opening price): a rival with a higher sealed ceiling answers → the same card, round 2; then a tap right after the update is ignored
        r = await pg.evaluate("""async () => { const c = document.querySelector('#evCard'); const t0 = c.querySelector('h2').textContent; const b = c.querySelector('button[data-o="bid"]');
          if (!b || b.disabled) return { skip: true }; b.click();
          for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 25)); if (document.querySelector('#evm').hidden || /2 מתוך 3/.test(c.textContent)) break; }
          const open = !document.querySelector('#evm').hidden; const round2 = open && /2 מתוך 3/.test(c.textContent);
          let ghost = null; if (round2) { const w = c.querySelector('button[data-o="walk"]'); w.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); await new Promise((r) => setTimeout(r, 60)); ghost = !document.querySelector('#evm').hidden && /2 מתוך 3/.test(c.textContent); }
          return { open, round2, ghost, same: open && c.querySelector('h2').textContent === t0, text: c.textContent }; }""")
        if r.get('round2'):
            outbid = r; break
        await idle(pg)
    check(sc, 'rolled through a payday', paid_any)
    check(sc, 'a low bid that a rival beats re-describes the SAME card in place: round 2 of 3, who outbid and at what price', outbid and outbid['same'] and 'מי הציע' in outbid['text'] and 'הציע' in outbid['text'], outbid and outbid['text'][:400])
    if outbid:
        check(sc, 'a tap right after the card changed is ignored (the ghost-tap guard): still round 2', outbid['ghost'] is True, outbid)
        await shot(pg, 'auction_outbid_desk')
        st = await pg.evaluate(SAVED); cash1 = st['cash']; n1 = len(st['world']['league']['squad'])
        await pg.wait_for_timeout(400); await pg.locator('#evCard button[data-o="walk"]').click(); await pg.wait_for_timeout(700)
        s = await pg.evaluate(STATE); st = await pg.evaluate(SAVED)
        check(sc, 'walk closes the auction: nothing paid, no player added', not (s['card'] and s['type'] == 'mech') and st['world']['league']['squad'].__len__() == n1 and st['cash'] >= cash1 - 1, (s, st['cash'], cash1))
        await idle(pg)
    d = seen.get('deal')
    if d: check(sc, 'a sponsor / facility deal card shows its club block (the wage ratio now)', d['lg'] and 'שכר מול הכנסות' in d['text'], d['text'][:300])
    if SHOTS:
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('overview'))"); await pg.wait_for_timeout(1800); await shot(pg, 'board3d_desk_overview')
        await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('follow'))"); await pg.wait_for_timeout(800)
    await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
    P = await pg.evaluate(PANEL); st = await pg.evaluate(SAVED); L = st['world']['league']
    check(sc, 'panel: 4 gauges (wages ÷ revenue in %, the rank with the cliff, strength vs the tier, the fill), the club line',
          P['gauges'] == ['wageRatio', 'rank', 'strength', 'fill'] and '%' in P['gtext'][0] and '₪' not in P['gtext'][0] and 'מתוך 8' in P['gtext'][1] and 'המועדון' in P['title'] and 'מחזור' in P['now'] and 'הכנסות החודש' in P['now'], (P['gauges'], P['gtext'], P['now'][:300]))
    zones_ok = len(P['table']) == 8 and sum(1 for x in P['table'] if x['us']) == 1 and all(('עולה' in x['t']) == (x['zone'] == 'up') and ('יורדת' in x['t']) == (x['zone'] == 'down') for x in P['table'])
    check(sc, 'the league table: 8 clubs, one is ours (named), the zones in words (▲ עולה / ▼ יורדת), a caption', zones_ok and P['caption'] and any('(שלך)' in x['t'] for x in P['table']), P['table'])
    tok_ok = P['squad'] == len(L['squad']) and all(any(k in cls for k in ('age-young', 'age-rising', 'age-prime', 'age-late', 'age-vet')) and 'גיל' in al for cls, al in P['tokens'])
    check(sc, 'the squad: a row per player (= the engine squad) as a token with an age ring (the age in its name), a sale button for each', tok_ok and P['sells'] == len(L['squad']), (P['squad'], len(L['squad']), P['tokens'][:3], P['sells']))
    bad = await axe_bad(pg, '#gm'); check(sc, 'axe: the club panel has no critical / serious violation', not bad, bad)
    if SHOTS: await pg.wait_for_timeout(1500); await pg.add_style_tag(content='#toast{visibility:hidden !important}')
    await shot(pg, 'panel_desk')
    if SHOTS:
        await pg.evaluate("() => document.querySelector('#gmCard .squad')?.scrollIntoView({ block: 'start' })"); await pg.wait_for_timeout(500); await shot(pg, 'panel_squad_desk')
    # naming rights through E.worldAction (share: 8 % of the gate for 3 years)
    idx = await pg.evaluate("() => { const b = [...document.querySelectorAll('#gmCard button[data-aid=\"naming\"]')].find((x) => !x.disabled && x.textContent.includes('8%')); return b ? +b.dataset.wact : -1; }")
    check(sc, 'naming rights are offered (a share of the gate)', idx >= 0, idx)
    if idx >= 0:
        await pg.locator(f'#gmCard button[data-wact="{idx}"]').click(); await pg.wait_for_timeout(900)
        msg = await pg.evaluate("() => { const m = document.querySelector('#gmCard .wp-msg'); return { t: m.textContent, c: m.className }; }")
        st = await pg.evaluate(SAVED)
        check(sc, 'the action went through E.worldAction (engine naming = share, logged Z, panel redrawn with its toast)', (st['world']['league'].get('naming') or {}).get('mode') == 'share' and any(a[0] == 'Z' for a in st.get('actions', [])) and 'pos' in msg['c'] and 'שם האצטדיון' in msg['t'], (msg, st['world']['league'].get('naming')))
    # a player's sale: the first tap arms, the second sells him (engine squad − 1, cash + the price)
    sell = await pg.evaluate("() => { const bs = [...document.querySelectorAll('#gmCard button[data-aid=\"sell\"]:not([disabled])')]; const b = bs[bs.length - 1]; return b ? { i: +b.dataset.wact, pid: b.dataset.pid } : null; }")
    check(sc, 'selling a player is offered', sell is not None, sell)
    if sell:
        st0 = await pg.evaluate(SAVED); n0 = len(st0['world']['league']['squad']); c0 = st0['cash']; z0 = sum(1 for a in st0.get('actions', []) if a[0] == 'Z')
        await pg.locator(f'#gmCard button[data-wact="{sell["i"]}"]').click(); await pg.wait_for_timeout(500)
        r = await pg.evaluate("() => ({ arm: !!document.querySelector('#gmCard button[data-arm=\"1\"]'), msg: document.querySelector('#gmCard .wp-msg').textContent })")
        n1 = len((await pg.evaluate(SAVED))['world']['league']['squad'])
        check(sc, 'selling a player needs a second tap (the first one arms the button and sells nothing)', r['arm'] and 'אי אפשר לבטל' in r['msg'] and n1 == n0, (r, n0, n1))
        await pg.locator(f'#gmCard button[data-wact="{sell["i"]}"]').click(); await pg.wait_for_timeout(1000)
        st1 = await pg.evaluate(SAVED); P2 = await pg.evaluate(PANEL)
        check(sc, 'the second tap sells him: engine squad − 1, cash up, one more Z action, the panel redrawn (one row less)', len(st1['world']['league']['squad']) == n0 - 1 and st1['cash'] > c0 and sum(1 for a in st1.get('actions', []) if a[0] == 'Z') == z0 + 1 and P2['squad'] == n0 - 1,
              (len(st1['world']['league']['squad']), n0, st1['cash'], c0, P2['squad']))
    await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=5000)
    row = await pg.evaluate("() => { const r = document.querySelector('#gmCard .mh-row[data-row=\"world\"]'); return r ? r.textContent : null; }")
    check(sc, '💼 has the "המועדון והטבלה" row (the place, the wage ratio)', row and 'המועדון' in row and 'מקום' in row and 'שכר' in row, row)
    if row:
        await pg.click('#gmCard .mh-row[data-row="world"] button[data-hub="world"]'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
        check(sc, '💼 → the club panel opens', await pg.locator('#gmCard.wpanel').count() == 1)
        await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
    await close_gm(pg)   # a dialog that queued behind the panel (a new lesson / milestone after the sale) is answered first
    await pg.click('#hGoalBtn'); await pg.wait_for_selector('#goalPanel:not([hidden])', timeout=5000)
    gp = await pg.evaluate("() => document.querySelector('#goalPanel').textContent")
    gsub = await pg.evaluate("() => (document.querySelector('#hGoal .gsub') || {}).textContent || ''")
    check(sc, 'goal panel: ₪450 מיליון at book AND wages ≤ 70 % (in %, never ₪), the rule and the ladder', '450 מיליון' in gp and 'עד 70%' in gp and 'הספרים' in gp and 'הדרך ליעד' in gp and '₪0.7' not in gp and '⚖️' in gsub and '70%' in gsub, (gp[:400], gsub))
    await pg.click('#hGoalBtn'); await pg.wait_for_timeout(300)
    a0 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    lv_ok = all(a0['levels'].get(k, {}).get('kind') == 'club' and a0['levels'][k].get('seats') == v['seats'] and a0['levels'][k].get('div') == v['div'] and a0['levels'][k].get('rank') == v['rank'] for k, v in a0['club'].items())
    check(sc, '3D: the city equals cityModels and the stadium carries its club level (seats, tier, rank, fill)', a0['want'] == a0['scene'] and a0['club'] and lv_ok, a0)
    models = {k: await pg.evaluate("(k) => import('./js/scene.js').then((S) => S.levelOf ? S.levelOf(k) : null)", k) for k in a0['club']}
    def mo_ok(k):
        v = a0['club'][k]; m = (models[k] or {}).get('model') or {}
        return m and m.get('crane') == (v['stage'] > 0) and m.get('stars') == v['div'] + 1 and m.get('crowdRows') == round(min(1, max(0, v['fill'])) * m.get('rows', 6)) and m.get('lamps') is True
    check(sc, '3D: the stadium drew its crowd ∝ fill, the tier stars, the crane only while building, the floodlights on (scene.levelOf model)', models and all(mo_ok(k) for k in models), {k: (models[k] or {}).get('model') for k in models})
    await pg.reload(); await pg.wait_for_selector('.lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
    await pg.click('.map-card[data-id="w13"]'); await pg.wait_for_selector('[data-act="continue-free"][data-id="w13"]', timeout=60000)
    await pg.click('[data-act="continue-free"][data-id="w13"]'); await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    a1 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
    check(sc, 'after reload + resume: the same city and the same club levels (engine = scene)', a1['want'] == a0['want'] and a1['want'] == a1['scene'] and a1['club'] == a0['club'] and a1['sponsors'] == a0['sponsors'], (a0['club'], a1['club']))
    await ctx.close()

async def run_2d(b):
    for vp in ('desk', 'phone', 'small'):
        sc = f'2d-{vp}'; ctx, pg = await page(b, vp, flags='?ff=board2d:on')
        await pg.evaluate(START, {'seed': 7, 'ch': 'academyDirector'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(1500)
        await idle(pg)
        if vp != 'desk':
            lot, _ = await roll_to(pg, 'mech', title='שוק ההעברות')
            check(sc, "reached an 'H' tile on the 2D board", lot is not None)
            if lot:
                await pg.wait_for_timeout(900)
                fit = await pg.evaluate("() => { const c = document.querySelector('#evCard').getBoundingClientRect(); return c.width <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#evCard .grid .row, #evCard .auc-lv li, #evCard .lot')].every((r) => r.scrollWidth <= r.clientWidth + 1) && [...document.querySelectorAll('#evCard button[data-o]')].every((x) => x.getBoundingClientRect().height >= 43.5); }")
                over = await pg.evaluate("() => [...document.querySelectorAll('#evCard .grid .row, #evCard .auc-lv li, #evCard .lot')].filter((r) => r.scrollWidth > r.clientWidth + 1).map((r) => [r.textContent, r.scrollWidth, r.clientWidth])")
                check(sc, 'the transfer card fits the phone width (no row overflows, every button ≥ 44 px)', fit and lot['auc'], over)
                await shot(pg, f'auction_card_{vp}')
                await pg.locator('#evCard button[data-o="walk"]').click(); await pg.wait_for_timeout(600)
                await idle(pg)
        else:
            for _ in range(3): await pg.click('#roll'); await pg.wait_for_timeout(400); await idle(pg)
        a = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        cards = await pg.evaluate("""() => [...document.querySelectorAll('.b2d-card')].filter((x) => x.dataset.kind === 'club').map((c) => ({ key: c.dataset.key, label: c.getAttribute('aria-label'),
          corner: (c.querySelector('.b2d-corner-b') || {}).textContent || '', light: c.dataset.light, pct: c.style.getPropertyValue('--b2d-pct'), div: c.dataset.div }))""")
        def card_ok(c):
            v = a['club'].get(c['key']) or {}
            return v and f"מקום {v['rank']}" in c['label'] and 'מקומות' in c['label'] and c['corner'] in ('⚽', '🏗️') and c['pct'] == f"{round((v.get('fill') or 0) * 100)}%" and c['div'] == str(v['div'])
        check(sc, '2D: the stadium card shows its state (⚽ corner, the fill bar, "מקום N · … מקומות" in its name) = the engine', cards and len(cards) == len(a['club']) and all(card_ok(c) for c in cards), (cards, a['club']))
        th = await pg.evaluate("() => ({ world: document.body.dataset.world, sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(), board: ((document.querySelector('[class*=b2d-m-]') || {}).style || { getPropertyValue: () => '' }).getPropertyValue('--b2d-board').trim(), motif: [...(document.querySelector('[class*=b2d-m-]') || { classList: [] }).classList].find((x) => x.startsWith('b2d-m-')) || '' })")
        check(sc, '2D: the w13 look (data-world=w13, night sky, the pitch board from WORLD_STYLE, the pitch motif)', th['world'] == 'w13' and th['sky'].lower() == '#0b1020' and th['board'].lower() == '#166534' and th['motif'] == 'b2d-m-pitch', th)
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'), s = document.querySelector('#hInd .lgstrip'); if (!b) return null; const h = document.querySelector('#hWorld').getBoundingClientRect(); const ins = (e) => { const r = e.getBoundingClientRect(); return r.left >= h.left - 1 && r.right <= h.right + 1; }; return { chip: ins(b), strip: !!s && ins(s), over: document.documentElement.scrollWidth > innerWidth + 1 }; }")
        check(sc, 'the ⚽ chip and the table strip stay inside the HUD card', chip and chip['chip'] and chip['strip'] and not chip['over'], chip)
        await shot(pg, f'board2d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        fit = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const r = c.getBoundingClientRect(); return { w: r.width, vw: innerWidth, over: document.documentElement.scrollWidth > innerWidth + 1, acts: [...c.querySelectorAll('button[data-wact]')].every((b) => b.getBoundingClientRect().height >= 43.5), touch: [...c.querySelectorAll('button[data-wact]')].every((b) => getComputedStyle(b).touchAction === 'manipulation'), rows: [...c.querySelectorAll('.wp-row, .wp-g')].every((x) => x.scrollWidth <= x.clientWidth + 1), table: (() => { const t = c.querySelector('.lgtbl'); return !!t && t.getBoundingClientRect().right <= innerWidth + 1 && t.getBoundingClientRect().left >= -1; })(), youth: c.querySelectorAll('.squad .ptok.age-young').length }; }")
        check(sc, 'panel fits the width (table, rows, gauges), every action button ≥ 44 px with touch-action manipulation; the academy\'s youngsters carry the young ring', fit['w'] <= fit['vw'] and not fit['over'] and fit['acts'] and fit['touch'] and fit['rows'] and fit['table'] and fit['youth'] >= 3, fit)
        if vp != 'desk':
            if SHOTS: await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await shot(pg, f'panel_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_3dphone(b):
    for vp in ('phone', 'small'):
        sc = f'3d-{vp}'; ctx, pg = await page(b, vp)
        await pg.evaluate(START, {'seed': 7, 'ch': 'localTycoon'})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await idle(pg)
        k = await pg.evaluate("import('./js/scene.js').then((S) => S.kind)")
        chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'), s = document.querySelector('#hInd .lgstrip'); if (!b) return null; const h = document.querySelector('#hWorld').getBoundingClientRect(); const ins = (e) => { const r = e.getBoundingClientRect(); return r.left >= h.left - 1 && r.right <= h.right + 1; }; return { chip: ins(b), strip: !!s && ins(s), t: b.textContent }; }")
        check(sc, '3D board on a phone; the ⚽ chip and the table strip stay inside the HUD card', k == '3d' and chip and chip['chip'] and chip['strip'] and '⚽' in chip['t'], (k, chip))
        await shot(pg, f'board3d_{vp}')
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
        g = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const t = c.querySelector('.lgtbl'); const r = t.getBoundingClientRect(); return { vw: innerWidth, over: document.documentElement.scrollWidth > innerWidth + 1, table: r.left >= -1 && r.right <= innerWidth + 1, rows: [...c.querySelectorAll('.wp-row')].every((x) => x.scrollWidth <= x.clientWidth + 1), gauges: [...c.querySelectorAll('.wp-g')].every((x) => x.scrollWidth <= x.clientWidth + 1) }; }")
        check(sc, 'the table, the squad rows and the gauges fit the phone width', g['table'] and not g['over'] and g['rows'] and g['gauges'], g)
        if SHOTS:
            await pg.add_style_tag(content='#toast{visibility:hidden !important}')
            await pg.evaluate("() => document.querySelector('#gmCard .lgtbl')?.scrollIntoView({ block: 'start' })"); await pg.wait_for_timeout(500)
        await shot(pg, f'panel_table_{vp}')
        await pg.locator('#gmCard .acts button.primary').click()
        await ctx.close()

async def run_motion(b):
    """the floodlights are on with and without reduced motion (still decor, nothing moves)"""
    sc = 'motion-reduced'; ctx, pg = await page(b, 'desk', reduced=True)
    await pg.evaluate(START, {'seed': 7, 'ch': 'coachOwner'})
    await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
    await idle(pg)
    st = await pg.evaluate("import('./js/scene.js').then((S) => ({ red: S.perfStats().reduced, fl: S.perfStats().decor.floodlights }))")
    check(sc, 'reduced motion: the floodlights are still on (four lit masts)', st['red'] and st['fl'] and st['fl']['masts'] == 4 and st['fl']['lit'], st)
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
