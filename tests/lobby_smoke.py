# Quick render check of the lobby home (guest) on desktop + phone. Usage: python3 tests/lobby_smoke.py [base_url] [--live]
# Offline by default: the shared Supabase guard is installed (guest lobby: no backend use expected), fonts stubbed.
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
BASE = FB.base_url('http://localhost:8771/')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
SHOT = os.environ.get('RR_SHOTS', '/tmp/lbshots') + '/'
async def main():
    os.makedirs(SHOT, exist_ok=True); FB.banner(MODE); sinks = []; errs = []; res = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        for name, vp, scheme in (('desk', {'width': 1300, 'height': 820}, 'light'), ('phone', {'width': 390, 'height': 800}, 'dark')):
            ctx = await b.new_context(**FB.new_context_kwargs(), viewport=vp, color_scheme=scheme, device_scale_factor=1)
            sinks.append(await FB.install_mode(ctx, None, MODE))
            await ctx.add_init_script("localStorage.setItem('rr2-onboarded','1')")  # v3: skip the one-time welcome
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: (errs.append(str(e)), print('PAGEERR', e, flush=True)))
            pg.on('console', lambda m: print('CONSOLE', m.type, m.text, flush=True) if m.type in ('error', 'warning') else None)
            await pg.goto(BASE); await pg.wait_for_selector('.lb-home', timeout=30000); await pg.wait_for_timeout(1200)
            await pg.screenshot(path=f'{SHOT}smoke_{name}.png')
            await pg.screenshot(path=f'{SHOT}smoke_{name}_full.png', full_page=False)
            res.append(True); print(f'PASS {name}: lobby home rendered', flush=True)
            await ctx.close()
        await b.close()
    try: [FB.assert_clean(s) for s in sinks]; res.append(True); print('PASS guard clean (no request left the machine)', flush=True)
    except AssertionError as e: res.append(False); print('FAIL', e, flush=True)
    res.append(not errs); print(('PASS' if not errs else 'FAIL') + f' no page errors {errs[:3]}', flush=True)
    print(f'\n{sum(res)}/{len(res)} checks passed', flush=True)
    sys.exit(0 if all(res) else 1)
asyncio.run(main())
