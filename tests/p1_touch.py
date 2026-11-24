# P1 2026-11-24 — double-tap zoom and double actions on phones (Chromium phone emulation; NOT a real iOS / Android device).
# Usage: python3 tests/p1_touch.py [--base=http://localhost:8770/index.html]   (game-only test copy, see serve_copies.sh)
#   T1 viewport: pinch-zoom stays allowed (no user-scalable=no / maximum-scale)
#   T2 touch-action: every visible control is `manipulation` (no double-tap zoom, pan + pinch kept); board canvas + dice `none`
#   T3 two quick taps on the HUD / board leave the page at scale 1 (emulation: Chromium itself does not double-tap-zoom
#      width=device-width pages, so this is a smoke check — the iOS fix is T2)
#   T4 ghost tap: a click 30 ms after an event card opens never decides it; a tap after the window does
#   T5 ghost tap on a dialog: the same for ui.modal; keyboard (detail 0) is never blocked
import asyncio, sys, os, time, json
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
BASE = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--base=')), 'http://localhost:8770/index.html')
R = {'pass': 0, 'fail': 0}; ERRS = []
def check(ok, msg):
    R['pass' if ok else 'fail'] += 1; print(('PASS ' if ok else 'FAIL ') + msg, flush=True)

TOUCH_JS = """() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const els = [...document.querySelectorAll('button, a[href], [data-act], [data-o], input, select, label, .hcard')].filter(vis);
  const bad = els.filter((el) => el.id !== 'roll' && getComputedStyle(el).touchAction !== 'manipulation').map((el) => (el.id || el.className || el.tagName) + ':' + getComputedStyle(el).touchAction);
  return { n: els.length, bad: bad.slice(0, 8), body: getComputedStyle(document.body).touchAction, html: getComputedStyle(document.documentElement).touchAction,
    canvas: getComputedStyle(document.querySelector('canvas#c')).touchAction, roll: getComputedStyle(document.querySelector('#roll')).touchAction };
}"""

async def wait_card_or_roll(pg, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = await pg.evaluate("() => ({card: !document.querySelector('#evm').hidden, roll: !document.querySelector('#roll').disabled, gm: !document.querySelector('#gm').hidden, story: !!document.querySelector('#stGo') && !document.querySelector('#story').hidden})")
        if s['gm']: await pg.click('#gm .acts button.primary'); await pg.wait_for_timeout(300); continue
        if s['story']: await pg.click('#stGo'); await pg.wait_for_timeout(300); continue
        if s['card'] or s['roll']: return s
        await pg.wait_for_timeout(200)
    raise Exception('stuck')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        ctx = await b.new_context(**{**FB.new_context_kwargs(), 'viewport': {'width': 390, 'height': 844}, 'device_scale_factor': 2, 'is_mobile': True, 'has_touch': True})
        guard = await FB.install(ctx, None)
        pg = await ctx.new_page(); pg.set_default_timeout(90000)
        pg.on('pageerror', lambda e: ERRS.append(str(e)))
        await pg.goto(BASE)
        vp = await pg.get_attribute('meta[name=viewport]', 'content')
        check('width=device-width' in vp and 'user-scalable' not in vp and 'maximum-scale' not in vp, f'T1 viewport keeps pinch-zoom ({vp})')
        await pg.wait_for_selector('.fbworld', timeout=120000)
        await pg.evaluate("async () => { try { const e = await import('/js/energy.js'); e.add && e.add(99, 'test'); } catch (x) {} }")
        t = await pg.evaluate(TOUCH_JS)
        check(not t['bad'] and t['n'] > 0, f"T2 picker: all {t['n']} visible controls touch-action:manipulation {t['bad']}")
        await pg.click('.fbworld[data-w=w1]'); await pg.wait_for_timeout(300)
        await pg.locator('.prof').first.click(); await pg.click('#fbGo')
        await pg.wait_for_selector('#start', state='hidden', timeout=30000)
        s = await wait_card_or_roll(pg)
        t = await pg.evaluate(TOUCH_JS)
        check(not t['bad'] and t['html'] == 'manipulation' and t['body'] == 'manipulation', f"T2 game screen: {t['n']} controls + html/body manipulation {t['bad']}")
        check(t['canvas'] == 'none' and t['roll'] == 'none', f"T2 board canvas / dice keep touch-action:none ({t['canvas']}, {t['roll']})")
        # T3 two quick taps on the HUD cash card and on the board
        for sel in ['#hCash', 'canvas#c']:
            box = await pg.locator(sel).bounding_box()
            x, y = box['x'] + box['width'] / 2, box['y'] + min(box['height'] / 2, 300)
            await pg.touchscreen.tap(x, y); await pg.wait_for_timeout(60); await pg.touchscreen.tap(x, y); await pg.wait_for_timeout(400)
            sc = await pg.evaluate('() => window.visualViewport ? window.visualViewport.scale : 1')
            check(abs(sc - 1) < 1e-3, f'T3 two quick taps on {sel}: scale {sc} (Chromium emulation)')
        # T4 ghost tap on an event card: arm a synthetic click 30 ms after the next card opens
        await pg.evaluate("""() => { window.__ghost = null; const m = document.querySelector('#evm');
          const ob = new MutationObserver(() => { if (m.hidden || window.__ghost) return; ob.disconnect();
            setTimeout(() => { const b = document.querySelector('#evCard button[data-o]:not([disabled])'); window.__ghost = { o: b && b.dataset.o, t: document.querySelector('#evTitle')?.textContent };
              if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); }, 30); });
          ob.observe(m, { attributes: true, attributeFilter: ['hidden'] }); }""")
        got = None
        for _ in range(40):
            s = await wait_card_or_roll(pg)
            if s['card']:
                await pg.wait_for_function('() => window.__ghost', timeout=5000); got = await pg.evaluate('() => window.__ghost'); break
            await pg.locator('#roll').click(); await pg.wait_for_timeout(500)
        check(got is not None and got['o'], f'T4 a card opened and the ghost click fired ({got})')
        await pg.wait_for_timeout(250)
        still = await pg.evaluate("() => !document.querySelector('#evm').hidden && document.querySelector('#evTitle')?.textContent")
        check(still == (got or {}).get('t'), f'T4 a click 30 ms after the card opened did not decide it (card still "{still}")')
        await pg.wait_for_timeout(300)
        btn = pg.locator('#evCard button[data-o]:not([disabled])').first
        bb = await btn.bounding_box(); await pg.touchscreen.tap(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
        await pg.wait_for_timeout(900)
        after = await pg.evaluate("() => document.querySelector('#evm').hidden ? '(closed)' : document.querySelector('#evTitle')?.textContent")
        check(after != still or after == '(closed)', f'T4 a tap after the window decides the card ({still!r} → {after!r})')
        # T5 dialog: ghost click ignored, real click answers, keyboard never blocked
        await wait_card_or_roll(pg)
        if not await pg.evaluate("() => document.querySelector('#evm').hidden"):
            await pg.evaluate("() => import('/js/ui.js').then(u => u.closeEvent())")
        res = await pg.evaluate("""async () => { const u = await import('/js/ui.js');
          const pr = u.modal({ title: 'בדיקה', actions: [{ label: 'כן', cls: 'primary', v: 'yes' }, { label: 'לא', v: 'no' }] });
          let v = 'pending'; pr.then((x) => { v = x; });
          await new Promise((r) => setTimeout(r, 30));
          document.querySelector('#gmCard button[data-i="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
          await new Promise((r) => setTimeout(r, 50)); const early = v;
          await new Promise((r) => setTimeout(r, 400));
          document.querySelector('#gmCard button[data-i="1"]').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
          await new Promise((r) => setTimeout(r, 50)); const late = v;
          const pr2 = u.modal({ title: 'מקלדת', actions: [{ label: 'אישור', cls: 'primary', v: 'ok' }] }); let k = 'pending'; pr2.then((x) => { k = x; });
          document.querySelector('#gmCard button[data-i="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
          await new Promise((r) => setTimeout(r, 50));
          return { early, late, key: k }; }""")
        check(res['early'] == 'pending' and res['late'] == 'no', f"T5 dialog: ghost click ignored, a later click answers ({res['early']}, {res['late']})")
        check(res['key'] == 'ok', f"T5 dialog: keyboard activation (detail 0) is never blocked ({res['key']})")
        check(not ERRS, f'no page errors {ERRS[:3]}')
        try: FB.assert_clean(guard); check(True, 'guard clean: no request left the machine')
        except AssertionError as e: check(False, 'guard: ' + str(e))
        await b.close()
    print(f"\n{R['pass']}/{R['pass'] + R['fail']} checks passed", flush=True)
    sys.exit(1 if R['fail'] else 0)

asyncio.run(main())
