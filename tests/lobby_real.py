# Integration smoke with the REAL game files (tests/make_realcopy.sh → http://localhost:8772/). OFFLINE by default: the fake
# backend with verify=replay (the real engine replays ranked games in tests/fakeverify.mjs). The browser and the fake share the
# real wall clock, so both pick the same rules era. --live = staging only. Usage: python3 tests/lobby_real.py [base_url] [--live]
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
BASE = FB.base_url('http://localhost:8772/')
SHOT = os.environ.get('RR_SHOTS', '/tmp/lbshots') + '/'
fb = FB.FakeBackend(verify='replay'); SINKS = []
async def new_ctx(b, **kw):
    ctx = await b.new_context(**FB.new_context_kwargs(), **kw); SINKS.append(await FB.install_mode(ctx, fb, MODE))
    await ctx.add_init_script("localStorage.setItem('rr2-onboarded','1')"); return ctx
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
res = []
def log(*a): print(*a, flush=True)
def check(c, m): res.append((bool(c), m)); log(('PASS ' if c else 'FAIL ') + m)
async def run(b, name, vp, scheme):
    ctx = await new_ctx(b, viewport=vp, color_scheme=scheme); pg = await ctx.new_page()
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
    ctx = await new_ctx(b, viewport={'width': 1300, 'height': 820}); pg = await ctx.new_page()
    pg.on('pageerror', lambda e: log('PAGEERR cp', e))
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home', timeout=120000)
    await pg.fill('#lb-root-nick', 'טסט־צקא' + str(random.randint(100, 999))); await pg.press('#lb-root-nick', 'Enter')
    await pg.wait_for_selector('#lbDaily .lb-dh-txt', timeout=30000)
    r = await pg.evaluate("import('./js/net.js').then(m => m.net.begin('daily'))")
    drove = await pg.evaluate(DRIVE, [r['result_id'], r['world'], r['char_index'] or 0, int(r['seed']), r['max_months'] or 24])
    code = await pg.evaluate("import('./js/net.js').then(m => m.net.recoveryCode())")
    await ctx.close()
    ctx = await new_ctx(b, viewport={'width': 390, 'height': 800}, color_scheme='dark'); pg = await ctx.new_page()
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
# a ranked game played to the end with the REAL engine in the page, finished + verified through net.js (FB-5: replay sidecar)
PLAY_RANKED = """async ([mode, forge]) => {
  const E = await import('./js/engine.js'); const { net } = await import('./js/net.js');
  const r = await net.begin(mode); const w = E.getWorld(r.world); const list = (w.daily && w.daily.chars) || w.characters.map(c => c.id);
  const charId = r.char || list[(r.char_index || 0) % list.length];
  const st = E.createGame({ worldId: r.world, charId, seed: Number(r.seed), mode, maxMonths: r.max_months || undefined, tutorial: false, bailout: false });
  let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let guard = 0; !st.over && guard < 4000; guard++) {
    if (st.pending) { let ev = E.currentEvent(st); let n = 0; while (ev && !st.over && n++ < 60) { const en = ev.options.filter(o => o.enabled); const o = n > 2 ? (en.find(x => ['done', 'ok', 'pass'].includes(x.id)) || en[0]) : en[Math.floor(rnd() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } continue; }
    E.rollDice(st); let ev = E.landing(st); let n = 0;
    while (ev && !st.over && n++ < 60) { const en = ev.options.filter(o => o.enabled); const o = n > 2 ? (en.find(x => ['done', 'ok', 'pass'].includes(x.id)) || en[0]) : en[Math.floor(rnd() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; }
  }
  const R = st.result;
  await net.finish({ resultId: r.result_id, status: R.status, months: R.months, passive: R.passive, expenses: R.expenses, netWorth: R.netWorth + (forge ? 100000 : 0), stats: { stars: R.stars || 0, progress: R.progress ?? null } });
  const v = await net.verify(r.result_id, st.actions);
  return { over: st.over, months: Math.round(R.months), actions: st.actions.length, verified: v.verified, error: v.error || null };
}"""
async def ranked_verified(b):
    ctx = await new_ctx(b, viewport={'width': 1300, 'height': 820}); pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: (errs.append(str(e)), log('PAGEERR rk', e)))
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home', timeout=120000)
    await pg.fill('#lb-root-nick', 'טסט־אמת'); await pg.press('#lb-root-nick', 'Enter'); await pg.wait_for_selector('#lbDaily .lb-dh-txt', timeout=30000)
    honest = await pg.evaluate(PLAY_RANKED, ['daily', False]); log('honest daily', honest)
    check(honest['over'] and honest['verified'] is True, f"honest ranked daily, real engine in the page → verify-result replay → verified:true ({honest})")
    forged = await pg.evaluate(PLAY_RANKED, ['weekly', True]); log('forged weekly', forged)
    check(forged['verified'] is False and forged['error'] == 'claim_mismatch', f"forged claim (+₪100,000 net worth) → verified:false claim_mismatch ({forged})")
    d = await pg.evaluate("import('./js/net.js').then(m => m.net.daily())")
    check(any(r['me'] and r['verified'] is True for r in d['board']), 'daily board row carries verified:true (✓)')
    check(not errs, f'ranked: no page errors {errs[:2]}')
    await ctx.close()
async def main():
    async with async_playwright() as p:
        os.makedirs(SHOT, exist_ok=True); FB.banner(MODE, 'replay')
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        for fn, a in ((run, ('desk', {'width': 1300, 'height': 820}, 'light')), (run, ('phone', {'width': 390, 'height': 800}, 'dark')), (checkpoint_resume, ()), (ranked_verified, ())):
            try: await fn(b, *a)
            except Exception as e: check(False, f'{fn.__name__}{a[:1]} crashed: {e!r}'[:400])
        await b.close()
    try: [FB.assert_clean(s) for s in SINKS]; check(True, f'guard clean: no request left the fake (calls {dict(fb.calls)})')
    except AssertionError as e: check(False, str(e))
    fb.close()
    f = [m for ok, m in res if not ok]; log(f'{len(res) - len(f)}/{len(res)} passed'); [log('  FAILED', m) for m in f]
    sys.exit(1 if f else 0)
asyncio.run(main())
