# Owner (admin) tools, offline with the fake backend (migration supabase/migrations/20261123_admin.sql).
# A: a normal player sees no admin panel, a wrong code is refused, w4 stays locked.
# B: the owner claims the one-time code → every world + pawn open, ⚡ topped up, can give ⚡ to a player; the code then works for nobody else.
# C: the player opens the lobby and receives the owner's ⚡ ("המנהל שלח לך").
# Usage: python3 tests/admin_e2e.py [base_url]   (default http://localhost:8771/ = the lobby copy)
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
BASE = FB.base_url('http://localhost:8771/')
SHOT = os.environ.get('RR_SHOTS', '/tmp/lbshots') + '/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
fb = FB.FakeBackend(); SINKS = []; res = []
def log(*a): print(*a, flush=True)
def check(c, m): res.append((bool(c), m)); log(('PASS ' if c else 'FAIL ') + m)
OWNER = fb.seed_player('אורי', stars={'w1': 1}); KID = fb.seed_player('נועם', stars={'w1': 2}); OTHER = fb.seed_player('דני')

async def ctx_for(b, who, energy=None):
    ctx = await b.new_context(**FB.new_context_kwargs(), viewport={'width': 1300, 'height': 860}); SINKS.append(await FB.install_mode(ctx, fb, MODE))
    ctx.set_default_timeout(60000)
    init = "localStorage.setItem('rr2-onboarded','1');localStorage.setItem('rr-player', %s);" % json.dumps(json.dumps(who))
    init += "localStorage.setItem('rr2-progress', JSON.stringify({stars:{w1:1}, best:{w1:30}, tutorialDone:true, gamesPlayed:3, wins:1}));"
    if energy is not None: init += "localStorage.setItem('rr2-energy', JSON.stringify({e:%d, at:Date.now(), granted:{}}));" % energy
    await ctx.add_init_script("if(!sessionStorage.getItem('i')){sessionStorage.setItem('i','1');" + init + "}")
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: (errs.append(str(e)), log('PAGEERR', e)))
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home'); await pg.wait_for_timeout(1200)
    return ctx, pg, errs

async def energy(pg): return await pg.evaluate("import('./js/energy.js').then(m => m.get())")
async def unlocked(pg, w): return await pg.evaluate(f"import('./js/progress.js').then(m => m.isUnlocked('{w}'))")

async def main():
    os.makedirs(SHOT, exist_ok=True); FB.banner(MODE)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        # A — a normal player
        ctx, pg, errs = await ctx_for(b, OTHER, energy=10)
        check(not await unlocked(pg, 'w4'), 'A: a normal player has w4 locked')
        await pg.click('.lb-player'); await pg.wait_for_selector('.lb-profile')
        check(await pg.locator('.pf-admin').count() == 0, 'A: no admin panel for a normal player')
        await pg.click('.pf-admin-claim summary'); await pg.fill('#pfAdminCode', 'WRNG-CODE-0000'); await pg.click('form[data-form="admin-claim"] button')
        await pg.wait_for_function("document.querySelector('form[data-form=\"admin-claim\"] .err').textContent.length > 0")
        check('לא נכון' in await pg.inner_text('form[data-form="admin-claim"] .err'), 'A: a wrong code is refused')
        check(await energy(pg) == 10, 'A: no ⚡ top-up for a normal player')
        check(not errs, 'A: no page errors'); await ctx.close()
        # B — the owner
        ctx, pg, errs = await ctx_for(b, OWNER, energy=3)
        await pg.click('.lb-player'); await pg.wait_for_selector('.lb-profile')
        await pg.click('.pf-admin-claim summary'); await pg.fill('#pfAdminCode', 'test-admn-code'); await pg.click('form[data-form="admin-claim"] button')
        await pg.wait_for_selector('.pf-admin', timeout=30000)
        check(await unlocked(pg, 'w4'), 'B: after the code every world is open (w4)')
        check(await energy(pg) == 99, 'B: owner ⚡ topped up to 99')
        await pg.wait_for_selector('.pf-admin-rows li')
        names = await pg.locator('.pf-admin-who b').all_inner_texts()
        check('נועם' in names and 'דני' in names, f'B: player list shows the players {names}')
        await pg.fill('#pfAdminQ', 'נוע'); await pg.click('form[data-form="admin-search"] button'); await pg.wait_for_timeout(800)
        names = await pg.locator('.pf-admin-who b').all_inner_texts()
        check(names == ['נועם'], f'B: search by nickname {names}')
        await pg.click('.pf-admin-rows li >> text=+10 ⚡'); await pg.wait_for_timeout(1000)
        check(any(g['to'] == KID['id'] and g['kind'] == 'admin' and g['amount'] == 10 for g in fb.gifts), 'B: +10⚡ grant stored for the player')
        await pg.screenshot(path=f'{SHOT}admin_owner_profile.png')
        await pg.click('[data-act="home"]'); await pg.wait_for_selector('.lb-home'); await pg.wait_for_timeout(800)
        check(await pg.locator('.map-card[data-id="w4"] .lb-lock, .map-card.is-locked[data-id="w4"]').count() == 0, 'B: w4 card is not locked on the map')
        await pg.screenshot(path=f'{SHOT}admin_owner_home.png')
        check(not errs, 'B: no page errors'); await ctx.close()
        # the one-time code now works for nobody else
        try: fb._rr_admin_claim({'p_id': OTHER['id'], 'p_secret': OTHER['secret'], 'p_code': 'TEST-ADMN-CODE'}); check(False, 'B: second claim refused')
        except Exception: check(True, 'B: the code cannot be used a second time')
        # C — the player receives the gift
        ctx, pg, errs = await ctx_for(b, KID, energy=5)
        await pg.wait_for_function("document.body.innerText.includes('המנהל שלח לך')", timeout=30000)
        check(True, 'C: the player sees "המנהל שלח לך"')
        check(await energy(pg) == 15, f'C: the player got +10⚡ (now {await energy(pg)})')
        check(not await unlocked(pg, 'w4'), 'C: the player is not an admin (w4 locked)')
        check(not errs, 'C: no page errors'); await ctx.close()
        await b.close()
    try: [FB.assert_clean(s) for s in SINKS]; check(True, 'guard clean (no request left the machine)')
    except AssertionError as e: check(False, f'guard: {e}')
    ok = sum(1 for c, _ in res if c); log(f'\n{ok}/{len(res)} checks passed'); sys.exit(0 if ok == len(res) else 1)
asyncio.run(main())
