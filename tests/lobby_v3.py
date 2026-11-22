# v3 lobby tests (stub game, OFFLINE fake backend by default; --live = staging only; טסט nicknames): welcome · ⚡ energy (header, empty state, daily bonus,
# gifts, referral) · lesson library · time machine (history) · life story end screen + PNG · happiness gate ·
# group feed + send ⚡. Screenshots desktop 1300×820 + phone 390×800 light/dark → /tmp/lbshots/v3_*.png
import asyncio, os, sys, random, json
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
BASE = FB.base_url('http://localhost:8771/')
SHOT = os.environ.get('RR_SHOTS', '/tmp/lbshots') + '/'
fb = FB.FakeBackend(); SINKS = []    # default verify=replay (the stub game sends no action log here, so the sidecar never starts)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
TAG = str(random.randint(100, 999))
results = []
def log(*a): print(*a, flush=True)
def check(c, m): results.append((bool(c), m)); log(('PASS ' if c else 'FAIL ') + m)
async def started(pg, action, timeout=20000):
    n = await pg.evaluate('(window.__cfgs || []).length')
    await action()
    await pg.wait_for_function(f'(window.__cfgs || []).length > {n}', timeout=timeout)
    return await pg.evaluate('window.__lastCfg')
async def page(b, vp, scheme, name, onboarded=True):
    ctx = await b.new_context(**FB.new_context_kwargs(), viewport=vp, color_scheme=scheme)
    SINKS.append(await FB.install_mode(ctx, fb, MODE))
    if onboarded: await ctx.add_init_script("localStorage.setItem('rr2-onboarded','1')")
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: log('PAGEERR', name, e))
    pg.on('console', lambda m: log('CONSOLE', name, m.text) if m.type == 'error' and '404' not in m.text else None)
    return ctx, pg
async def full(pg, path):
    vp = pg.viewport_size
    h = await pg.evaluate("Math.ceil(document.getElementById('lobby-root').getBoundingClientRect().height + 80)")
    await pg.set_viewport_size({'width': vp['width'], 'height': max(vp['height'], min(h, 7000))}); await pg.wait_for_timeout(400)
    await pg.screenshot(path=path); await pg.set_viewport_size(vp); await pg.wait_for_timeout(200)
DESK = {'width': 1300, 'height': 820}; PHONE = {'width': 390, 'height': 800}
CONFIGS = [('desk_light', DESK, 'light'), ('desk_dark', DESK, 'dark'), ('phone_light', PHONE, 'light'), ('phone_dark', PHONE, 'dark')]

async def solo_flow(b, name, vp, scheme, first):
    """Everything that needs no second player. Runs per screen config (screenshots) — asserts on the first one."""
    ctx, pg = await page(b, vp, scheme, name, onboarded=False)
    A = check if first else (lambda c, m: None)
    await pg.goto(BASE); await pg.wait_for_selector('.wl-card', timeout=30000); await pg.wait_for_timeout(700)
    # T4 F1 (intentional change): the welcome no longer explains ⚡ / ★★★ / the plan — they return as just-in-time coaches in the game;
    # "יאללה, משחק ראשון" starts the first game directly, "אני רוצה לבחור דמות" opens the world view (the old path, used here)
    wl = await pg.inner_text('.wl-card')
    A('⚡' not in wl and 'תוכנית חודשית' not in wl and await pg.locator('[data-act="welcome-pick"]').count() == 1, 'first run: a short welcome (T4 F1: no ⚡ / plan text; a "choose a character" link)')
    await pg.screenshot(path=f'{SHOT}v3_{name}_welcome.png')
    await pg.click('[data-act="welcome-pick"]'); await pg.wait_for_selector('.wv-chars')
    A(await pg.evaluate("localStorage.getItem('rr2-onboarded')") == '1', 'welcome shown once')
    A('😊' in await pg.evaluate("document.querySelector('.wv-char .wv-th').textContent"), 'character cards show the happiness part of ★★★ (T4: inside "עוד פרטים")')
    await pg.click('[data-act="home"]'); await pg.wait_for_selector('.lb-home'); await pg.wait_for_timeout(900)
    A('25/25' in await pg.inner_text('.lb-energy'), 'header shows ⚡ 25/25')
    A(await pg.locator('.map-hist').count() == 1 and await pg.locator('.map-lib').count() == 1, 'map has the time machine + library entries')
    await pg.screenshot(path=f'{SHOT}v3_{name}_map.png')
    # energy: empty state with countdown
    await pg.evaluate("import('./js/energy.js').then(E => E._reset({ e: 0, at: Date.now() - 95000 }))")
    await pg.click('[data-act="home"]') if await pg.locator('[data-act="home"]').count() else None
    await pg.evaluate("import('./js/lobby.js').then(m => m.openLobby('home'))"); await pg.wait_for_selector('#lbEmpty', timeout=5000)
    w1 = await pg.inner_text('[data-energy="full-wait"]'); await pg.wait_for_timeout(2300); w2 = await pg.inner_text('[data-energy="full-wait"]')
    A(w1 != w2 and w1.startswith('4:'), f'empty-energy card counts down ({w1} → {w2})')
    A('0/25' in await pg.inner_text('.lb-energy'), 'header shows 0/25')
    await pg.screenshot(path=f'{SHOT}v3_{name}_empty_energy.png')
    await pg.evaluate("import('./js/energy.js').then(E => E._reset({ e: 25, at: Date.now() }))")
    # library
    L = await pg.evaluate("import('./js/library.js').then(m => m.lessons()).then(l => l.map(x => x.id))")
    await pg.evaluate("(ids) => window.__bus.emit('lesson', { ids })", L[:3])
    await pg.click('.map-lib') if await pg.locator('.map-lib').count() else None
    await pg.wait_for_selector('.lib-head', timeout=5000)
    A(f'3/{len(L)}' in await pg.inner_text('.lib-head'), f'library shows 3/{len(L)}')
    A(await pg.locator('.lib-card.is-locked').count() == len(L) - 3 and await pg.locator('.lib-card.is-new').count() == 3, 'locked cards show "?" and new ones are flagged')
    await full(pg, f'{SHOT}v3_{name}_library.png')
    t1 = await pg.inner_text(f'.lib-card[data-id="{L[1]}"] b')
    await pg.click(f'.lib-card[data-id="{L[1]}"]'); await pg.wait_for_selector('#lbLesson')
    A(t1 in await pg.inner_text('#lbLesson'), 'lesson opens in a sheet')
    await pg.screenshot(path=f'{SHOT}v3_{name}_lesson.png')
    await pg.click('[data-act="lesson-close"]')
    A(await pg.locator('.lib-card.is-new').count() == 2, 'read lesson loses its "new" badge')
    # time machine: teaser while locked, open after w1 ★
    await pg.click('[data-act="home"]'); await pg.wait_for_selector('.lb-home'); await pg.click('.map-hist'); await pg.wait_for_selector('.hs-card', timeout=10000)
    nsc = await pg.locator('.hs-card').count()
    A(nsc >= 3 and await pg.locator('.hs-card.is-locked').count() == nsc, f'{nsc} history scenarios visible but locked before w1 ★')
    await pg.evaluate("import('./js/progress.js').then(P => P._reset({ stars: { w1: 1 }, tutorialDone: true, gamesPlayed: 2 }))")
    await pg.evaluate("import('./js/lobby.js').then(m => m.openLobby('history'))"); await pg.wait_for_selector('.hs-card:not(.is-locked)')
    await full(pg, f'{SHOT}v3_{name}_history.png')
    sid = await pg.get_attribute('[data-act="history-go"]', 'data-id')
    cfg = await started(pg, lambda: pg.click(f'[data-act="history-go"][data-id="{sid}"]'))
    A(cfg['mode'] == 'history' and cfg['scenarioId'] == sid and cfg['worldId'] == 'h' and isinstance(cfg['seed'], int), f'history start cfg {cfg}')
    await pg.evaluate("window.__stubEnd('won', 60, { netWorth: 1240000, bench: 980000, stars: 2, lessons: ['index', 'compound'] })")
    await pg.wait_for_selector('.lb-end'); await pg.wait_for_timeout(3500)
    A('ניצחת את המדד' in await pg.inner_text('.end-title') and await pg.locator('.end-bench').count() == 1, 'history end: beat-the-index title + buy-and-hold comparison')
    A(await pg.locator('.life-card').count() == 1 and 'בגיל' in await pg.inner_text('.life-card'), 'life story card on the end screen')
    A('שיעור' in await pg.inner_text('.end-new'), 'new lessons announced on the end screen')
    hp = await pg.evaluate("(sid) => JSON.parse(localStorage.getItem('rr2-progress')).history[sid]", sid)
    A(hp and hp['best']['stars'] == 2 and hp['best']['beat'], f'best history result stored {hp}')
    A(await pg.evaluate("JSON.parse(localStorage.getItem('rr2-progress')).stars.w1") == 1, 'history never changes world stars')
    await pg.screenshot(path=f'{SHOT}v3_{name}_end_history.png'); await full(pg, f'{SHOT}v3_{name}_end_history_full.png')
    cfg2 = await started(pg, lambda: pg.click('[data-act="end-same"]'))
    A(cfg2['seed'] == cfg['seed'] and cfg2['scenarioId'] == sid, 'history: replay the same path')
    await pg.evaluate("window.__stubEnd('lost', 60, { netWorth: 700000, bench: 980000, stars: 1 })"); await pg.wait_for_selector('.lb-end'); await pg.wait_for_timeout(600)
    # world game: money was there, happiness wasn't
    await pg.evaluate("import('./js/lobby.js').then(m => m.openLobby({ k: 'world', id: 'w1' }))"); await pg.wait_for_selector('.wv-chars')
    await started(pg, lambda: pg.click('.wv-char[data-c="teacher"]'))
    await pg.evaluate("window.__stubEnd('won', 14, { stars: 2, happiness: 48, blocked: true })")
    await pg.wait_for_selector('.lb-end'); await pg.wait_for_timeout(3600)
    gate = await pg.inner_text('.end-gate') if await pg.locator('.end-gate').count() else ''
    A('האושר' in gate and '✗' in gate and '✓' in gate, f'happiness gate shows the missing part ({gate[:60]})')
    await pg.screenshot(path=f'{SHOT}v3_{name}_end_life.png'); await full(pg, f'{SHOT}v3_{name}_end_life_full.png')
    await pg.locator('.lb-end .life-save').click(); await pg.wait_for_function('window.__lifePng > 0', timeout=8000)
    A((await pg.evaluate('window.__lifePng || 0')) > 20000, 'life story PNG rendered')
    await ctx.close()

async def social(b):
    cA, A = await page(b, DESK, 'light', 'A')
    await A.goto(BASE); await A.wait_for_selector('.lb-home')
    await A.fill('#lb-root-nick', 'טסט־אנ' + TAG); await A.press('#lb-root-nick', 'Enter'); await A.wait_for_selector('#lbDaily .lb-dh-txt', timeout=20000)
    meA = await A.evaluate("JSON.parse(localStorage.getItem('rr-player'))")
    # daily → +10⚡
    await A.evaluate("import('./js/energy.js').then(E => E._reset({ e: 5, at: Date.now() }))")
    await started(A, lambda: A.click('[data-act="daily"]'))
    await A.evaluate("window.__stubEnd('lost', 24)"); await A.wait_for_selector('.end-place, .end-rank .lb-board', timeout=20000); await A.wait_for_timeout(2500)
    en = await A.evaluate("import('./js/energy.js').then(E => E.get())")
    check(en == 15 and '+10 זריקות ⚡' in await A.inner_text('.end-new'), f'daily gives +10⚡ ({en}; T4 N11 label "+10 זריקות ⚡")')
    await A.click('[data-act="end-lobby"]'); await A.wait_for_selector('.lb-home')
    await A.fill('#lbGname', 'טסט אנרגיה ' + TAG); await A.press('#lbGname', 'Enter'); await A.wait_for_selector('.gp-code', timeout=20000)
    link = await A.input_value('.gp-link input')
    check(('ref=' + meA['id']) in link, 'invite link carries ?ref=<my id>')
    gid = await A.evaluate("location.href") and await A.evaluate("document.querySelector('[data-form=newchal]').dataset.g")
    # B joins through the link (referral) and plays a free game → feed
    cB, B = await page(b, PHONE, 'dark', 'B')
    await B.goto(link); await B.wait_for_selector('.lb-invite', timeout=30000)
    check(await B.evaluate("localStorage.getItem('rr2-ref')") == meA['id'], 'referrer remembered until registration')
    await B.fill('#lb-root-nick', 'טסט־אנב' + TAG); await B.press('#lb-root-nick', 'Enter'); await B.wait_for_selector('.gp-code', timeout=30000)
    check(await B.evaluate("localStorage.getItem('rr2-ref')") is None, 'referral consumed at registration')
    # B sends ⚡ to A
    btn = B.locator(f'.gp-send[data-n="טסט־אנ{TAG}"]')
    await btn.click(); await B.wait_for_timeout(2500)
    check('נשלח' in await btn.inner_text(), 'B sent 3⚡ to A')
    await B.click('[data-act="home"]'); await B.wait_for_selector('.lb-home')
    await B.click('.map-card[data-id="w1"]'); await B.wait_for_selector('.wv-chars')
    await started(B, lambda: B.click('.wv-char[data-c="teacher"]'))
    await B.evaluate("window.__stubEnd('won', 18)"); await B.wait_for_selector('.lb-end'); await B.wait_for_timeout(2500)
    # A: claims referral (+5) and gift (+3), sees the feed
    before = await A.evaluate("import('./js/energy.js').then(E => E.get())")
    await A.evaluate("import('./js/lobby.js').then(m => m.openLobby({ k: 'group', id: '%s' }))" % gid)
    await A.wait_for_timeout(4000)
    after = await A.evaluate("import('./js/energy.js').then(E => E.get())")
    check(after - before == 8, f'A claimed referral +5⚡ and gift +3⚡ ({before} → {after})')
    await A.wait_for_function("document.querySelector('#gpFeed') && document.querySelector('#gpFeed').textContent.includes('יצא מהמירוץ')", timeout=25000)
    feed = await A.inner_text('#gpFeed'); log('feed:', feed.replace('\n', ' | ')[:300])
    check(f'טסט־אנב{TAG}' in feed and 'בגיל' in feed, "feed shows B's escape with age")
    await A.screenshot(path=SHOT + 'v3_group_feed_desk.png'); await full(A, SHOT + 'v3_group_feed_desk_full.png')
    await B.click('[data-act="end-lobby"]'); await B.wait_for_selector('.lb-home'); await B.wait_for_selector('.lb-gitem', timeout=20000); await B.click('.lb-gitem')
    await B.wait_for_selector('#gpFeed .gp-flist', timeout=20000); await B.wait_for_timeout(800)
    check(await B.locator('.gp-send.sent, .gp-send:disabled').count() >= 1, 'send button stays disabled for today (gifted_today)')
    await full(B, SHOT + 'v3_group_feed_phone_dark_full.png')
    await cA.close(); await cB.close()

async def main():
    async with async_playwright() as p:
        os.makedirs(SHOT, exist_ok=True); FB.banner(MODE, 'replay')
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        for i, (name, vp, scheme) in enumerate(CONFIGS):
            await solo_flow(b, name, vp, scheme, i == 0); log('done', name)
        await social(b)
        await b.close()
    try: [FB.assert_clean(s) for s in SINKS]; check(True, f'guard clean: no request left the fake (calls {dict(fb.calls)})')
    except AssertionError as e: check(False, str(e))
    fb.close()
    fails = [m for ok, m in results if not ok]
    log(f'\n{len(results) - len(fails)}/{len(results)} checks passed'); [log('  FAILED:', m) for m in fails]
    sys.exit(1 if fails else 0)
asyncio.run(main())
