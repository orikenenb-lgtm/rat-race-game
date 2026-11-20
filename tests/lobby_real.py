# Integration smoke with the REAL game files (tests/make_realcopy.sh → http://localhost:8772/). No server writes except
# the anonymous lobby (guest). Usage: python3 tests/lobby_real.py
import asyncio, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8772/'
SHOT = '/tmp/lbshots/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
res = []
def log(*a): print(*a, flush=True)
def check(c, m): res.append((bool(c), m)); log(('PASS ' if c else 'FAIL ') + m)
async def run(b, name, vp, scheme):
    ctx = await b.new_context(viewport=vp, color_scheme=scheme); await ctx.add_init_script("localStorage.setItem('rr2-onboarded','1')"); pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: (errs.append(str(e)), log('PAGEERR', name, e)))
    pg.on('console', lambda m: log('CONSOLE', name, m.type, m.text) if m.type == 'error' and '404' not in m.text else None)
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home', timeout=120000); await pg.wait_for_timeout(1500)
    check(await pg.is_hidden('#loading'), f'{name}: loading gone, lobby up')
    await pg.screenshot(path=f'{SHOT}real_{name}_home.png')
    await pg.click('.map-card[data-id="w1"]'); await pg.wait_for_selector('.wv-chars'); await pg.wait_for_timeout(600)
    await pg.screenshot(path=f'{SHOT}real_{name}_world.png')
    await pg.click('.wv-char[data-c="driver"]'); await pg.wait_for_selector('#start', state='hidden', timeout=60000)
    await pg.wait_for_function("!document.querySelector('#roll').disabled", timeout=60000)
    await pg.wait_for_timeout(1200)
    await pg.screenshot(path=f'{SHOT}real_{name}_game.png')
    await pg.click('#homeBtn'); await pg.wait_for_selector('.lb-resume', timeout=20000)
    check('נהג משאית' in await pg.inner_text('.lb-resume'), f'{name}: resume banner over the real game')
    await pg.screenshot(path=f'{SHOT}real_{name}_home_active.png')
    await pg.click('.lb-resume'); await pg.wait_for_selector('#start', state='hidden')
    check(True, f'{name}: back to the game')
    # synthetic end (the real game emits the same payload shape after its celebration)
    await pg.evaluate("""import('./js/bus.js').then(m => m.bus.emit('game:end', {status:'won', stars:2, months:22, netWorth:240000, passive:7700, expenses:7400, progress:1,
      worldId:'w1', charId:'driver', mode:'free', resultId:null, challengeId:null, groupId:null, title:'',
      end:{status:'won', reason:'goal', months:22, stars:2, nearMiss:{text:'עוד 5 חודשים פחות ו־★★★ היו שלך.'}, tip:'משחק נקי. נסה דמות אחרת וראה כמה זה משנה.', lesson:'נכס מכניס כסף לכיס, התחייבות מוציאה ממנו.', achievements:['first_asset']}, stats:{}}))""")
    await pg.wait_for_selector('.lb-end', timeout=30000); await pg.wait_for_timeout(4200)
    check(await pg.locator('.end-unlock').count() == 1, f'{name}: end screen shows the unlock')
    await pg.screenshot(path=f'{SHOT}real_{name}_end.png')
    await pg.click('[data-act="end-again"]'); await pg.wait_for_selector('#start', state='hidden', timeout=30000)
    check(True, f'{name}: "עוד פעם" starts a new real game')
    check(not errs, f'{name}: no page errors')
    await ctx.close()
DRIVE = """async ([rid, world, charIdx, seed, maxM]) => {
  const E = await import('./js/engine.js'); const { net } = await import('./js/net.js');
  const w = E.getWorld(world); const list = (w.daily && w.daily.chars) || w.characters.map(c => c.id);
  const st = E.createGame({ worldId: world, charId: list[charIdx % list.length], seed, mode: 'daily', maxMonths: maxM });
  let guard = 0;
  while (st.turn < 5 && guard++ < 200) {
    E.rollDice(st); let ev = E.landing(st); let n = 0;
    while (ev && n++ < 40) { const pick = ev.options.find(o => o.enabled && ['pass', 'done', 'ok'].includes(o.id)) || ev.options.find(o => o.enabled); ev = E.choose(st, ev, pick.id).event; }
  }
  st.ui = { seq: 5 };
  await net.checkpoint(rid, 5, st);
  return { turn: st.turn, month: st.month };
}"""
async def checkpoint_resume(b):
    import random
    ctx = await b.new_context(viewport={'width': 1300, 'height': 820}); await ctx.add_init_script("localStorage.setItem('rr2-onboarded','1')"); pg = await ctx.new_page()
    pg.on('pageerror', lambda e: log('PAGEERR cp', e))
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home', timeout=120000)
    await pg.fill('#lb-root-nick', 'טסט־צקא' + str(random.randint(100, 999))); await pg.press('#lb-root-nick', 'Enter')
    await pg.wait_for_selector('#lbDaily .lb-dh-txt', timeout=30000)
    r = await pg.evaluate("import('./js/net.js').then(m => m.net.begin('daily'))")
    drove = await pg.evaluate(DRIVE, [r['result_id'], r['world'], r['char_index'] or 0, int(r['seed']), r['max_months'] or 24])
    code = await pg.evaluate("import('./js/net.js').then(m => m.net.recoveryCode())")
    await ctx.close()
    ctx = await b.new_context(viewport={'width': 390, 'height': 800}, color_scheme='dark'); await ctx.add_init_script("localStorage.setItem('rr2-onboarded','1')"); pg = await ctx.new_page()
    pg.on('pageerror', lambda e: log('PAGEERR cp2', e))
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home', timeout=120000)
    await pg.click('.lb-player'); await pg.wait_for_selector('.pf-recover'); await pg.fill('#pfRestore', code); await pg.press('#pfRestore', 'Enter')
    await pg.wait_for_function("document.querySelector('.pf-name h1') && document.querySelector('.pf-name h1').textContent.startsWith('טסט־צקא')", timeout=30000)
    await pg.click('[data-act="home"]'); await pg.wait_for_selector('[data-act="daily"]', timeout=30000)
    await pg.click('[data-act="daily"]'); await pg.wait_for_selector('#start', state='hidden', timeout=60000)
    await pg.wait_for_timeout(2500)
    month = (await pg.inner_text('#hMonth')).strip()
    check(month.split('/')[0].strip().startswith(str(drove['month'])) and not month.startswith('1 ') and month != '1', f'REAL game on a fresh device resumes the ranked daily from the server checkpoint (HUD month "{month}", checkpoint month {drove["month"]})')
    await pg.screenshot(path=f'{SHOT}real_checkpoint_resume_phone.png')
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        await run(b, 'desk', {'width': 1300, 'height': 820}, 'light')
        await run(b, 'phone', {'width': 390, 'height': 800}, 'dark')
        await checkpoint_resume(b)
        await b.close()
    f = [m for ok, m in res if not ok]; log(f'{len(res) - len(f)}/{len(res)} passed'); [log('  FAILED', m) for m in f]
asyncio.run(main())
