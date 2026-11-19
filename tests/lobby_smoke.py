# Quick render check of the lobby home (guest) on desktop + phone. Usage: python3 tests/lobby_smoke.py [base_url]
import asyncio, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8771/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        for name, vp, scheme in (('desk', {'width': 1300, 'height': 820}, 'light'), ('phone', {'width': 390, 'height': 800}, 'dark')):
            ctx = await b.new_context(viewport=vp, color_scheme=scheme, device_scale_factor=1)
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: print('PAGEERR', e, flush=True))
            pg.on('console', lambda m: print('CONSOLE', m.type, m.text, flush=True) if m.type in ('error', 'warning') else None)
            await pg.goto(BASE); await pg.wait_for_selector('.lb-home', timeout=30000); await pg.wait_for_timeout(1200)
            await pg.screenshot(path=f'/tmp/lbshots/smoke_{name}.png')
            await pg.screenshot(path=f'/tmp/lbshots/smoke_{name}_full.png', full_page=False)
            await ctx.close()
        await b.close()
asyncio.run(main())
