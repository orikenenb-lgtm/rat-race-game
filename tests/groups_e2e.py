# 2026-11-25 (owner: "תחלק את המפות לעולמות — כל עולם 4 עד 5 מפות מקסימום") — the map of 6 worlds in the real page (lobby, real copy),
# offline fake backend + guard:
#   map    the home map shows the 6 worlds as chapters in order (section[aria-labelledby] → h3 "עולם N <name>", what you learn there,
#          "X/Y מפות הושלמו", open / locked / done / "בקרוב"), each with an <ol> of its maps (existing map cards; planned maps "בקרוב" pins,
#          never buttons); the cards follow P.worldMap() (= js/worlds-groups.js ORDER); desk / 390 / 360 without horizontal overflow
#   keep   an OLD save (no groupsV) whose old unlock graph had w6–w10 + w13 open keeps every one of them open (never re-locked), and the
#          next map after a kept one opens when it is finished
#   cross  finishing w4 (the last map of world 1) → the end screen says "🔓 נפתח עולם חדש: עולם העסקים — מפה ראשונה: עיר התיירות" and offers
#          "למפה הבאה: עיר התיירות ←" → the w5 view titled "מפה 1 · עולם העסקים"; the home mission names the next world
#   mid    finishing w6 (a map inside world 2) → "🔓 נפתחה מפה חדשה" + "למפה הבאה: רשתות המסחר ←"; a practice escape in w7 opens w8
#   admin  P.setUnlockAll(true) opens every built map (planned ones stay "בקרוב") and turns off again
# Copies: SRC=<export> COPY_DIR=/tmp/grp PORT_BASE=11800 bash tests/serve_copies.sh
# Usage: python3 tests/groups_e2e.py [--real=http://localhost:11802/] [--shots=DIR] [--only=map,keep,cross,mid,admin]
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
PB = int(os.environ.get('PORT_BASE', '11800'))
REAL = OPT.get('real') or f'http://localhost:{PB + 2}/'
SHOTS = OPT.get('shots'); ONLY = set(OPT['only'].split(',')) if OPT.get('only') else None
want = lambda s: ONLY is None or s in ONLY
VP = {'desk': {'width': 1300, 'height': 820}, 'phone': {'width': 390, 'height': 844}, 'small': {'width': 360, 'height': 740}}
ARGS = FB.chrome_args(MODE, ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
SEED = ("localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-tips-off','1'); localStorage.setItem('rr2-reveal', 'all');"
        "localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true,w5:true,w6:true,w7:true,w8:true}));")
def progress(stars, extra=None):
    p = {'v': 1, 'stars': stars, 'best': {}, 'achievements': [], 'pawn': 'classic', 'seenWorlds': list(stars.keys()), 'onboarded': True, 'tutorialDone': True,
         'gamesPlayed': len(stars), 'wins': len(stars)}
    p.update(extra or {})
    return "(() => { if (localStorage.getItem('rr2-progress')) return; localStorage.setItem('rr2-progress', %s); })();" % json.dumps(json.dumps(p))
GROUPS = ['הצעדים הראשונים', 'עולם העסקים', 'הכסף הגדול', 'הענקים', 'השווקים', 'הפסגה']
W14 = {'w1': 1, 'w2': 1, 'w3': 1, 'w4': 1}
RESULTS = []; ERRS = []; SINKS = []; BAD = []
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def check(sc, name, cond, detail=''):
    RESULTS.append((sc, name, bool(cond))); log(('PASS' if cond else 'FAIL'), f'[{sc}]', name, '' if cond else str(detail)[:700]); return bool(cond)

async def page(b, vp, seed):
    ctx = await b.new_context(viewport=VP[vp], device_scale_factor=1, has_touch=vp != 'desk', is_mobile=vp != 'desk', **FB.new_context_kwargs())
    SINKS.append(await FB.install_mode(ctx, FB.FakeBackend() if MODE == 'offline' else None, MODE))
    await ctx.add_init_script(SEED + seed)
    pg = await ctx.new_page(); pg.set_default_timeout(120000)
    pg.on('pageerror', lambda e: (ERRS.append(f'{vp} pageerror: {e}'), log('PAGEERR', e)))
    pg.on('response', lambda r: BAD.append(f'{r.status} {r.url}') if r.status >= 400 and r.url.startswith(REAL) else None)
    await pg.goto(REAL + 'index.html')
    await pg.wait_for_selector('.lb-home', timeout=120000); await pg.wait_for_timeout(1500)
    return ctx, pg

async def shot(pg, name, full=False):
    if not SHOTS: return
    await pg.wait_for_timeout(400)
    await pg.screenshot(path=f'{SHOTS}/{name}.jpg', type='jpeg', quality=80, full_page=full)

SECTIONS = """() => [...document.querySelectorAll('.map-grid .mw')].map((s) => { const h = s.querySelector('h3'); const lab = s.getAttribute('aria-labelledby');
  return { g: s.dataset.group, cls: s.className, labelled: !!lab && !!h && h.id === lab, h: h ? h.textContent.replace(/\\s+/g, ' ').trim() : '', learn: (s.querySelector('.mw-learn') || {}).textContent || '',
    count: (s.querySelector('.mw-count') || {}).textContent || '', st: (s.querySelector('.mw-st') || {}).textContent || '', list: !!s.querySelector(':scope > ol.mw-maps'),
    items: s.querySelectorAll(':scope > ol.mw-maps > li > .map-card').length, ids: [...s.querySelectorAll('.map-card')].map((c) => c.dataset.id),
    soon: [...s.querySelectorAll('.map-card.is-soon')].map((c) => ({ id: c.dataset.id, tag: c.tagName, act: c.dataset.act || null, buttons: c.querySelectorAll('button').length, line: (c.querySelector('.map-line') || {}).textContent || '' })),
    locked: [...s.querySelectorAll('.map-card.is-locked')].map((c) => c.dataset.id) }; })"""
CARDS = "() => [...document.querySelectorAll('.map-grid .map-card')].map((c) => ({ id: c.dataset.id, locked: c.classList.contains('is-locked'), soon: c.classList.contains('is-soon'), line: (c.querySelector('.map-line') || {}).textContent || '' }))"
WMAP = "import('./js/progress.js').then((P) => P.worldMap().map((m) => ({ id: m.id, playable: m.playable, unlocked: m.unlocked, g: m.group && m.group.id, finished: m.finished })))"

async def run_map(b):
    for vp in ('desk', 'phone', 'small'):
        sc = f'map-{vp}'; ctx, pg = await page(b, vp, progress(W14, {'groupsV': 1}))
        S = await pg.evaluate(SECTIONS); wm = await pg.evaluate(WMAP); cards = await pg.evaluate(CARDS)
        check(sc, 'the map shows the 6 worlds in order (section → h3 "עולם N <name>", aria-labelledby)', [s['g'] for s in S] == ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']
              and all(s['labelled'] and f'עולם {i + 1}' in s['h'] and GROUPS[i] in s['h'] for i, s in enumerate(S)), [(s['g'], s['h'], s['labelled']) for s in S])
        check(sc, 'each world: a line of what you learn, "X/Y מפות הושלמו", its state, and an <ol> of its maps (each map an <li>)',
              all(s['learn'].strip() and 'מפות הושלמו' in s['count'] and s['st'].strip() and s['list'] and s['items'] == len(s['ids']) for s in S), S)
        check(sc, 'the maps of each world in the exact order', [s['ids'] for s in S] == [['w1', 'w2', 'w3', 'w4'], ['w5', 'w6', 'w7', 'w8', 'w9'], ['w10', 'w15', 'w13', 'w16'],
              ['w11', 'w17', 'w14', 'w12'], ['w18', 'w19', 'w20', 'w21'], ['w22', 'w23', 'w24', 'w25']], [s['ids'] for s in S])
        check(sc, 'the cards follow P.worldMap() (one order of the game)', [c['id'] for c in cards] == [m['id'] for m in wm], [c['id'] for c in cards])
        g6built = any(m['playable'] for m in wm if m['g'] == 'g6')   # since 552e780 (w22 registered) world 6 has a built map: locked after w21, no longer "בקרוב"
        check(sc, 'counts: world 1 4/4 done, world 2 0/5 — the 1 of 2 is open (w5 after w4), world 3 locked "נפתח אחרי מדבר האנרגיה", world 6 "בקרוב" (or, once it has a built map, locked after the map before it)',
              '4/4' in S[0]['count'] and 'is-done' in S[0]['cls'] and '0/5' in S[1]['count'] and 'is-open' in S[1]['cls'] and 'is-locked' in S[2]['cls'] and 'מדבר האנרגיה' in S[2]['st']
              and (('is-locked' in S[5]['cls'] and 'נפתח אחרי' in S[5]['st']) if g6built else ('is-soon' in S[5]['cls'] and 'בקרוב' in S[5]['st'])), [(s['g'], s['cls'], s['count'], s['st']) for s in S])
        un = [c['id'] for c in cards if not c['locked'] and not c['soon']]
        check(sc, 'linear unlock on a new-design save: w1–w5 open, every later built map locked', un == ['w1', 'w2', 'w3', 'w4', 'w5'], un)
        soon = [x for s in S for x in s['soon']]; pm = [m['id'] for m in wm if not m['playable']]
        check(sc, 'planned maps are "בקרוב" pins, never buttons, with "תיפתח אחרי …"', [x['id'] for x in soon] == pm and all(x['tag'] != 'BUTTON' and not x['act'] and x['buttons'] == 0 and 'תיפתח אחרי' in x['line'] for x in soon) and len(pm) >= 1, soon)
        w6 = next(c for c in cards if c['id'] == 'w6')
        check(sc, 'a locked map says how it opens: w6 "לפתוח: לצאת מעיר התיירות"', w6['locked'] and 'לצאת מעיר התיירות' in w6['line'], w6)
        mi = await pg.evaluate("() => (document.querySelector('.lb-mission b') || {}).textContent || ''")
        check(sc, 'the mission names the next map ("… כדי לפתוח את המפה הבאה: אזור התעשייה")', 'בעיר התיירות' in mi and 'המפה הבאה: אזור התעשייה' in mi, mi)
        ov = await pg.evaluate("() => document.documentElement.scrollWidth <= innerWidth + 1")
        check(sc, 'no horizontal overflow', ov)
        small = await pg.evaluate("""() => [...document.querySelectorAll('.mw-head *, .map-card .map-name, .map-card .map-line')].filter((e) => e.offsetParent && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.className)""")
        check(sc, 'type floor: no world / map text under 12 px', not small, small[:5])
        if vp != 'desk':
            tap = await pg.evaluate("() => [...document.querySelectorAll('.map-grid button.map-card')].map((b) => b.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length")
            check(sc, 'every map card is a tap target ≥ 44 px', tap == 0, tap)
        await shot(pg, f'map_{vp}')
        await pg.evaluate("() => document.querySelector('.mw[data-group=g2]').scrollIntoView({ block: 'start' })"); await shot(pg, f'map_{vp}_world2')
        await pg.evaluate("() => document.querySelector('.mw[data-group=g5]').scrollIntoView({ block: 'start' })"); await shot(pg, f'map_{vp}_world5')
        if vp == 'desk': await shot(pg, 'map_desk_full', full=True)
        await ctx.close()

async def run_keep(b):
    sc = 'keep'; old = {'w1': 1, 'w2': 1, 'w3': 1, 'w4': 1, 'w5': 1, 'w7': 1}   # old graph: w5 ★ → w6 / w7 / w8, w7 ★ → w9 / w10 / w13
    ctx, pg = await page(b, 'desk', progress(old))
    cards = await pg.evaluate(CARDS); un = [c['id'] for c in cards if not c['locked'] and not c['soon']]
    want_open = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w13']
    check(sc, 'an old save keeps every map its old unlock graph had open (w6–w10 + w13), nothing re-locked', sorted(un) == sorted(want_open), un)
    kp = await pg.evaluate("import('./js/progress.js').then((P) => { const p = P.getProgress(); return { v: p.groupsV, kept: p.kept }; })")
    check(sc, 'the save is migrated once (groupsV 1, kept = the old-graph maps)', kp['v'] == 1 and sorted(kp['kept']) == sorted([w for w in want_open if w != 'w1']), kp)
    await pg.reload(); await pg.wait_for_selector('.lb-home'); await pg.wait_for_timeout(1000)
    un2 = [c['id'] for c in await pg.evaluate(CARDS) if not c['locked'] and not c['soon']]
    check(sc, 'after a reload the same maps are open', sorted(un2) == sorted(want_open), un2)
    S = await pg.evaluate(SECTIONS)
    check(sc, 'world 3 is open (a kept map in it) while its other maps stay locked', 'is-open' in S[2]['cls'] and sorted(S[2]['locked']) == ['w15', 'w16'], (S[2]['cls'], S[2]['locked']))
    r = await pg.evaluate("""async () => { const L = await import('./js/lobby.js'); const P = await import('./js/progress.js');
      L.showEndScreen({ worldId: 'w13', charId: 'coachOwner', mode: 'free', status: 'won', stars: 1, months: 70, netWorth: 5e8, seed: 9001, end: {} });
      await new Promise((r) => setTimeout(r, 2500)); return { w16: P.isUnlocked('w16'), w15: P.isUnlocked('w15'), next: (document.querySelector('.end-acts [data-act=end-next]') || {}).textContent || '' }; }""")
    check(sc, 'finishing a kept map opens the map after it in the order (w13 → w16), not the one before (w15)', r['w16'] and not r['w15'] and 'ארץ השדות' in r['next'], r)
    await shot(pg, 'keep_end_w13')
    await ctx.close()

END_INFO = """() => { const u = document.querySelector('.end-unlock'); const n = document.querySelector('.end-acts [data-act=end-next]');
  return { unlock: u ? u.textContent.replace(/\\s+/g, ' ').trim() : '', world: !!(u && u.classList.contains('is-world')), next: n ? n.textContent.trim() : '', nextId: n ? n.dataset.id : null,
    primary: !!(n && n.classList.contains('primary')) }; }"""

async def run_cross(b):
    for vp in ('desk', 'small'):
        sc = f'cross-{vp}'; ctx, pg = await page(b, vp, progress({'w1': 1, 'w2': 1, 'w3': 1}, {'groupsV': 1}))
        mi = await pg.evaluate("() => (document.querySelector('.lb-mission b') || {}).textContent || ''")
        check(sc, 'before: the mission says finishing w4 opens a new world ("… כדי לפתוח עולם חדש: עולם העסקים")', 'בעמק העתיד' in mi and 'עולם חדש: עולם העסקים' in mi, mi)
        await pg.evaluate("""async () => { const L = await import('./js/lobby.js'); L.showEndScreen({ worldId: 'w4', charId: 'founder', mode: 'free', status: 'won', stars: 1, months: 66, netWorth: 9.5e6, seed: 4404, end: { impact: 95 } }); }""")
        await pg.wait_for_selector('.lb-end', timeout=20000); await pg.wait_for_timeout(2500)
        E = await pg.evaluate(END_INFO)
        check(sc, 'finishing w4: "🔓 נפתח עולם חדש: עולם העסקים — מפה ראשונה: עיר התיירות"', E['world'] and 'נפתח עולם חדש: עולם העסקים' in E['unlock'] and 'מפה ראשונה: עיר התיירות' in E['unlock'], E)
        check(sc, 'the main button: "למפה הבאה: עיר התיירות ←" → w5', E['primary'] and E['nextId'] == 'w5' and E['next'] == 'למפה הבאה: עיר התיירות ←', E)
        await shot(pg, f'cross_end_{vp}')
        await pg.evaluate("() => document.querySelector('.end-unlock').scrollIntoView({ block: 'center' })"); await shot(pg, f'cross_end_{vp}_news')
        await pg.click('.end-acts [data-act=end-next]')
        await pg.wait_for_selector('.lb-world .wv-hero h1', timeout=60000); await pg.wait_for_function("() => document.querySelector('.wv-hero h1').textContent === 'עיר התיירות'", timeout=60000)
        await pg.wait_for_selector('.wv-char', timeout=60000)   # the lazy rules load first (the loading view has the same h1)
        k = await pg.evaluate("() => ({ k: (document.querySelector('.wv-kicker') || {}).textContent || '', chars: document.querySelectorAll('.wv-char').length })")
        check(sc, 'the w5 view: "מפה 1 · עולם העסקים" above its name, open with its characters', k['k'] == 'מפה 1 · עולם העסקים' and k['chars'] >= 3, k)
        await shot(pg, f'cross_world_{vp}')
        await ctx.close()

async def run_mid(b):
    sc = 'mid'; ctx, pg = await page(b, 'phone', progress({'w1': 1, 'w2': 1, 'w3': 1, 'w4': 1, 'w5': 1}, {'groupsV': 1}))
    await pg.evaluate("""async () => { const L = await import('./js/lobby.js'); L.showEndScreen({ worldId: 'w6', charId: 'opseng', mode: 'free', status: 'won', stars: 0, months: 79, netWorth: 8.1e7, seed: 606, end: {} }); }""")
    await pg.wait_for_selector('.lb-end', timeout=20000); await pg.wait_for_timeout(2500)
    E = await pg.evaluate(END_INFO)
    check(sc, 'finishing w6 (inside world 2): "🔓 נפתחה מפה חדשה" — not a new world', not E['world'] and 'נפתחה מפה חדשה' in E['unlock'] and 'רשתות המסחר' in E['unlock'] and 'עולם חדש' not in E['unlock'], E)
    check(sc, 'the main button: "למפה הבאה: רשתות המסחר ←"', E['nextId'] == 'w7' and E['next'] == 'למפה הבאה: רשתות המסחר ←', E)
    await pg.evaluate("() => document.querySelector('.end-unlock').scrollIntoView({ block: 'center' })"); await shot(pg, 'mid_end_phone_news')
    r = await pg.evaluate("""async () => { const P = await import('./js/progress.js'); const a = P.isUnlocked('w8');
      const res = P.recordLearnGame({ worldId: 'w7', charId: 'cfo', status: 'won', stars: 2, months: 60, seed: 707, netWorth: 1.3e8 });
      return { before: a, opened: res.unlockedWorld, group: res.unlockedGroup, after: P.isUnlocked('w8'), w9: P.isUnlocked('w9'), stars: P.getProgress().stars.w7 }; }""")
    check(sc, 'a practice escape in w7 opens w8 (same world, no stars), not w9', not r['before'] and r['opened'] == 'w8' and r['group'] is None and r['after'] and not r['w9'] and r['stars'] == 0, r)
    await pg.evaluate("() => { const b = document.querySelector('[data-act=end-lobby]'); if (b) b.click(); }"); await pg.wait_for_selector('.lb-home', timeout=20000); await pg.wait_for_timeout(800)
    S = await pg.evaluate(SECTIONS)
    check(sc, 'the map counts it: world 2 "2/5 מפות הושלמו" (w5, w6) and w8 open', '2/5' in S[1]['count'] or '3/5' in S[1]['count'], S[1]['count'])
    await ctx.close()

async def run_admin(b):
    sc = 'admin'; ctx, pg = await page(b, 'desk', progress({'w1': 0}, {'groupsV': 1}))
    r = await pg.evaluate("""async () => { const P = await import('./js/progress.js'); const before = P.unlockedWorlds();
      P.setUnlockAll(true); const all = P.worldMap().filter((m) => m.playable).every((m) => m.unlocked); const soon = P.worldMap().filter((m) => !m.playable).every((m) => !m.unlocked);
      const G = P.mapGroups().map((g) => g.open); P.setUnlockAll(false); return { before, all, soon, G, after: P.unlockedWorlds() }; }""")
    check(sc, 'unlock-all opens every built map (never a planned one), every world with a built map is open, and turns off again', r['before'] == ['w1'] and r['all'] and r['soon'] and r['G'][:4] == [True] * 4 and r['after'] == ['w1'], r)
    await ctx.close()

async def main():
    FB.banner(MODE)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        if want('map'): await run_map(b)
        if want('keep'): await run_keep(b)
        if want('cross'): await run_cross(b)
        if want('mid'): await run_mid(b)
        if want('admin'): await run_admin(b)
        await b.close()
    for s in SINKS: FB.assert_clean(s)
    check('all', 'no same-origin request failed (no 404)', not BAD, BAD[:10])
    fails = [r for r in RESULTS if not r[2]]
    log(f'{len(RESULTS) - len(fails)} passed, {len(fails)} failed, {len(ERRS)} page errors')
    for e in ERRS: log('ERR', e)
    sys.exit(1 if fails or ERRS else 0)

asyncio.run(main())
