# Screenshot pass: map, daily, world, group, profile, end (win+unlock / ranked loss+near-miss) in
# desktop 1300×820 and phone 390×800, light and dark. OFFLINE: renders the fake state lobby_e2e.py left in
# /tmp/lb/fake_state.json (FB-8) if present, else seeds its own טסט player/group/challenge. --real-fonts opts into Google Fonts (network).
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
if MODE == 'live': print('lobby_shots renders fake state only; --live is not supported'); sys.exit(2)
BASE = FB.base_url('http://localhost:8771/')
SHOT = os.environ.get('RR_SHOTS', '/tmp/lbshots') + '/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
STATE = os.environ.get('RR_FAKE_STATE', '/tmp/lb/fake_state.json')
if os.path.exists(STATE):
    fb = FB.FakeBackend.load(STATE, verify='accept'); CREDS = {'A': fb.meta['A']}; SRC = 'loaded ' + STATE
else:
    fb = FB.FakeBackend(verify='accept'); A0 = fb.seed_player('טסט־צילום', stars={'w1': 3, 'w2': 1}, pawn='tophat')
    g0 = fb.seed_group(A0, 'טסט קבוצת צילום', [fb.seed_player('טסט־חבר', stars={'w1': 2})]); fb.seed_challenge(g0, world='w1', char='driver')
    CREDS = {'A': A0}; SRC = 'seeded (no lobby_e2e state)'
SINKS = []
SEED = {'stars': {'w1': 3, 'w2': 1, 'w3': 0, 'w4': 0}, 'best': {'w1': 14, 'w2': 41}, 'achievements': ['first_asset', 'no_trap', 'golden', 'cushion', 'three_apts', 'w1_fast'],
        'pawn': 'tophat', 'pawnColor': '#3b82f6', 'pawnChosenAt': 1, 'gamesPlayed': 9, 'wins': 5, 'tutorialDone': True, 'seenWorlds': ['w1', 'w2'], 'lastChar': {'w1': 'teacher', 'w2': 'chef'}}
CONFIGS = [('desk_light', {'width': 1300, 'height': 820}, 'light'), ('desk_dark', {'width': 1300, 'height': 820}, 'dark'),
           ('phone_light', {'width': 390, 'height': 800}, 'light'), ('phone_dark', {'width': 390, 'height': 800}, 'dark')]
def log(*a): print(*a, flush=True)
async def settle(pg, ms=900): await pg.wait_for_timeout(ms)
async def full(pg, path):
    # the lobby scrolls inside the fixed #start overlay, so grow the viewport to the content height for a full capture
    vp = pg.viewport_size
    h = await pg.evaluate("Math.ceil(document.getElementById('lobby-root').getBoundingClientRect().height + 80)")
    await pg.set_viewport_size({'width': vp['width'], 'height': max(vp['height'], min(h, 7000))}); await pg.wait_for_timeout(400)
    await pg.screenshot(path=path); await pg.set_viewport_size(vp); await pg.wait_for_timeout(200)
async def main():
    async with async_playwright() as p:
        os.makedirs(SHOT, exist_ok=True); FB.banner(MODE, 'accept'); log('fake state:', SRC)
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        gid = None
        for name, vp, scheme in CONFIGS:
            ctx = await b.new_context(**FB.new_context_kwargs(), viewport=vp, color_scheme=scheme)
            SINKS.append(await FB.install(ctx, fb, fonts='allow' if '--real-fonts' in sys.argv else 'stub'))
            init = "if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('rr-player'," + json.dumps(json.dumps(CREDS['A'])) + ");localStorage.setItem('rr2-onboarded','1');localStorage.setItem('rr2-progress'," + json.dumps(json.dumps(SEED)) + ");}"
            await ctx.add_init_script(init)
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: log('PAGEERR', name, e))
            await pg.goto(BASE); await pg.wait_for_selector('#lbDaily .lb-db .lb-board, #lbDaily .lb-empty', timeout=30000); await pg.wait_for_selector('#lbGroups .lb-glist', timeout=20000); await settle(pg, 1400)
            await pg.screenshot(path=f'{SHOT}{name}_1_map.png'); await full(pg, f'{SHOT}{name}_1_map_full.png')
            await pg.locator('#lbDaily').screenshot(path=f'{SHOT}{name}_2_daily.png')
            await pg.click('.map-card[data-id="w2"]'); await pg.wait_for_selector('.wv-chars'); await settle(pg, 700)
            await pg.screenshot(path=f'{SHOT}{name}_3_world.png')
            # group
            if gid is None:
                g = await pg.evaluate("import('./js/net.js').then(m => m.net.createGroup('טסט צילומים'))"); gid = g['id']
            cid = (await pg.evaluate("(gid) => import('./js/net.js').then(m => m.net.createChallenge({groupId: gid, title: 'טסט מי יוצא ראשון?', world: 'w1', charId: 'driver', days: 1}))", gid))['id']
            await pg.evaluate("(gid) => import('./js/lobby.js').then(m => m.openLobby({k:'group', id: gid}))", gid)
            await pg.wait_for_selector(f'[data-act="chal"][data-id="{cid}"]', timeout=20000); await settle(pg)
            await pg.screenshot(path=f'{SHOT}{name}_4_group.png'); await full(pg, f'{SHOT}{name}_4_group_full.png')
            # ranked loss with near-miss
            n = await pg.evaluate('(window.__cfgs||[]).length')
            await pg.click(f'[data-act="chal"][data-id="{cid}"]'); await pg.wait_for_function(f'(window.__cfgs||[]).length > {n}', timeout=20000)
            await pg.evaluate("""window.__stubEnd('lost', 60, { netWorth: -79790, stats: { toysResisted: 4200 },
              leaks: [{ key: 'interest', label: 'ריבית על הלוואות', amount: 18400 }, { key: 'toys', label: 'פיתויים שבחרת לקנות', amount: 9650 }, { key: 'autoLoan', label: 'הלוואות חירום', amount: 20000, note: 'הבנק הלווה כשנגמר המזומן' }, { key: 'forced', label: 'הוצאות חובה ומשברים (לא באשמתך)', amount: 31000 }],
              achievements: ['first_asset', 'no_trap', 'cushion', 'credit_free'] })""")
            await pg.wait_for_selector('.end-place', timeout=20000); await settle(pg, 2500)
            await pg.screenshot(path=f'{SHOT}{name}_6_end_loss.png'); await full(pg, f'{SHOT}{name}_6_end_loss_full.png')
            # profile
            await pg.click('[data-act="end-lobby"]'); await pg.wait_for_selector('.lb-home'); await pg.click('.lb-player'); await pg.wait_for_selector('.pf-head'); await settle(pg)
            await pg.screenshot(path=f'{SHOT}{name}_5_profile.png'); await full(pg, f'{SHOT}{name}_5_profile_full.png')
            # free win that unlocks the next world (fresh local progress)
            await pg.evaluate("import('./js/progress.js').then(P => P._reset({tutorialDone: true, gamesPlayed: 3, pawnColor: '#ef4444'}))")
            await pg.click('[data-act="home"]'); await pg.wait_for_selector('.lb-home'); await pg.click('.map-card[data-id="w1"]'); await pg.wait_for_selector('.wv-chars')
            n = await pg.evaluate('(window.__cfgs||[]).length')
            await pg.click('.wv-char[data-c="teacher"]'); await pg.wait_for_function(f'(window.__cfgs||[]).length > {n}')
            await pg.evaluate('window.__stubEnd("won", 19)')
            await pg.wait_for_selector('.lb-end'); await settle(pg, 4800)
            await pg.screenshot(path=f'{SHOT}{name}_7_end_win.png'); await full(pg, f'{SHOT}{name}_7_end_win_full.png')
            log('done', name)
            await ctx.close()
        await b.close()
    try: [FB.assert_clean(s) for s in SINKS]; log('PASS guard clean'); ok = True
    except AssertionError as e: log('FAIL', e); ok = False
    fb.close(); sys.exit(0 if ok else 1)
asyncio.run(main())
