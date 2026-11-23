# 3D upgrade wave 2 (team ד) — the economic HUD in a real browser: "יעד העולם" panel per world (values = the engine's, read from
# the saved state in the page), keyboard / Esc / focus return, the new-debt chip after a bank loan, no horizontal scroll at
# 360 / 390, the 360 deal card's actions in view, the card bubble's clamp, the w1 coach for a player who finished the tutorial.
# Screenshots (jpeg q80): desk 1300×820 · phone 390×844 · phone360 360×740.
# Usage: python3 tests/hud_goal_e2e.py [--base=http://localhost:8770/index.html] [--shots=DIR] [--worlds=w1,w2,w3,w4] [--vps=desk,phone,phone360]
#        (the game-only test copy: tests/serve_copies.sh port +0). No backend is touched (fakebackend guard).
import asyncio, sys, os, json, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB   # T7 guard: no backend use here
MODE = FB.mode_from_argv(); GUARDS = []
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
opt = lambda k, d: next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{k}=')), d)
BASE = opt('base', 'http://localhost:8770/index.html')
SHOTS = opt('shots', '/tmp/rrshots/hudgoal').rstrip('/'); os.makedirs(SHOTS, exist_ok=True)
WORLDS = opt('worlds', 'w1,w2,w3,w4').split(',')
VPS = {'desk': (1300, 820), 'phone': (390, 844), 'phone360': (360, 740)}
VPN = opt('vps', 'desk,phone,phone360').split(',')
SEED = "localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true})); localStorage.setItem('rr2-settings', JSON.stringify({turbo:true}));"
RES = []; ERRS = []
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def check(c, msg, extra=''):
    RES.append((bool(c), msg)); log('PASS' if c else 'FAIL', msg, extra if not c else '')

def attach(pg, tag):
    pg.set_default_timeout(90000)
    def con(m):
        if m.type != 'error': return
        url = (m.location or {}).get('url', '')
        if 'lobby.js' in url or 'lobby.css' in url or 'progress.js' in url: return
        if 'Failed to load resource' in m.text and ('lobby' in url or url == '' or 'progress' in url): return
        ERRS.append(f'{tag}: {m.text} @ {url}')
    pg.on('console', con); pg.on('pageerror', lambda e: ERRS.append(f'{tag} pageerror: {e}'))

async def shot(pg, name): await pg.screenshot(path=f'{SHOTS}/{name}.jpg', type='jpeg', quality=80)

async def new_page(b, vp, dark=False, init=SEED):
    w, h = VPS[vp]; ph = w < 600
    ctx = await b.new_context(**FB.new_context_kwargs(), viewport={'width': w, 'height': h}, device_scale_factor=1, has_touch=ph, is_mobile=ph, color_scheme='dark' if dark else 'light')
    GUARDS.append(await FB.install(ctx, None))   # every context: Supabase guard (offline)
    await ctx.add_init_script(f"if(!sessionStorage.getItem('hg-seed')){{sessionStorage.setItem('hg-seed','1');{init}}}")
    pg = await ctx.new_page(); attach(pg, vp)
    return ctx, pg

async def start(pg, world, char_idx=0):
    await pg.goto(BASE); await pg.wait_for_selector('.fbworld', timeout=120000)
    await pg.evaluate("async () => { try { const e = await import('./js/energy.js'); e.add && e.add(99, 'test'); } catch (x) {} }")
    await pg.click(f'.fbworld[data-w={world}]'); await pg.wait_for_timeout(300)
    profs = pg.locator('.prof'); n = await profs.count(); await profs.nth(char_idx % n).click()
    await pg.click('#fbGo'); await pg.wait_for_selector('#start', state='hidden', timeout=60000)
    await idle(pg)

async def idle(pg, t=120):
    t0 = time.time()
    while time.time() - t0 < t:
        s = await pg.evaluate("() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden, gm: !document.querySelector('#gm').hidden, coach: !document.querySelector('#coach').hidden, story: !!document.querySelector('#stGo') && !document.querySelector('#story').hidden })")
        if s['gm']: await pg.click('#gm .acts button.primary'); await pg.wait_for_timeout(300); continue
        if s['story']: await pg.click('#stGo'); await pg.wait_for_timeout(300); continue
        if s['coach']:
            b = pg.locator('#coach [data-c="next"]')
            if await b.count(): await b.first.click(); await pg.wait_for_timeout(200); continue
        if s['card'] or s['roll']: return s
        await pg.wait_for_timeout(250)
    raise Exception('stuck')

# the engine's model for the saved state, computed in the page (same modules the game runs)
ENGINE_MODEL = """async (w) => { const E = await import('./js/engine.js'); const H = await import('./js/hudgoal.js');
  const raw = localStorage.getItem('rr2-save-free-' + w); const st = E.deserialize(JSON.parse(raw).state); const m = E.metrics(st);
  const M = H.goalPanelModel(m, { thresholds: E.starThresholds(E.getWorld(w), st.charId, m.rules), impactPending: (m.worldIndicators || {}).impactPending || 0 });
  return { M, liab: m.totalLiabilities, debtMonthly: H.debtMonthly(m) }; }"""
NOSCROLL = "() => document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1"

async def world_run(b, vp, world):
    ctx, pg = await new_page(b, vp)
    await start(pg, world)
    await pg.wait_for_timeout(1200)
    tag = f'{vp}/{world}'
    await shot(pg, f'{vp}_{world}_1_hud')
    btn = pg.locator('#hGoalBtn')
    check(await btn.is_visible(), f'{tag} the goal card is a toggle (#hGoalBtn)')
    bb = await btn.bounding_box(); check(bb and bb['height'] >= 43.5 and bb['width'] >= 44, f'{tag} toggle ≥ 44×44', bb)
    check(await pg.evaluate("() => { const m = document.querySelector('#hGoal [role=meter]'); return !!m && m.getAttribute('aria-valuenow') != null && !document.querySelector('#hGoal').hasAttribute('role'); }"), f'{tag} the meter keeps role=meter + value (inner element)')
    # keyboard: focus the toggle, Enter opens, focus lands on the heading
    await pg.focus('#hGoalBtn'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
    check(await pg.is_visible('#goalPanel'), f'{tag} Enter opens the panel')
    check(await pg.evaluate("() => document.activeElement && document.activeElement.id === 'gpH'"), f'{tag} focus moves to the panel heading')
    check(await pg.get_attribute('#hGoalBtn', 'aria-expanded') == 'true', f'{tag} aria-expanded=true')
    E = await pg.evaluate(ENGINE_MODEL, world); M = E['M']
    txt = await pg.inner_text('#goalPanel')
    norm = lambda s: s.replace('⁦', '').replace('⁩', '').replace('⁠', '')
    t = norm(txt)
    for g in M['gaps']: check(norm(g) in t, f'{tag} panel shows the engine gap "{g}"', t[:300])
    if world in ('w1', 'w2'): check(any(g.startswith('חסרה ₪') and g.endswith('הכנסה פסיבית לכיסוי ההוצאות') for g in M['gaps']) or M['met'], f'{tag} w1/w2: "חסרה ₪X הכנסה פסיבית לכיסוי ההוצאות"')
    for s in M['stars'] or []: check(f"עד חודש {s['limit']}" in t, f"{tag} ★×{s['n']} month limit {s['limit']} shown")
    for k in ('assetsText', 'liabilitiesText', 'netWorthText'): check(norm(M['totals'][k]) in t, f"{tag} total {k} = {M['totals'][k]}")
    check('קרן חירום' in t and 'אושר' in t, f'{tag} ★★★ gates (fund, happiness) listed')
    check('משכורות ברצף' in t, f'{tag} the 2-payday hold rule is shown')
    ticks = await pg.evaluate("() => [...document.querySelectorAll('#goalPanel .gp-ok')].map(e => e.textContent)")
    check(len(ticks) >= 5 and set(ticks) <= {'✓', '✗'}, f'{tag} criteria carry ✓/✗ ({ticks})')
    check(await pg.evaluate(NOSCROLL), f'{tag} no horizontal scroll with the panel open')
    pb = await pg.evaluate("() => { const r = document.querySelector('#goalPanel').getBoundingClientRect(); return [r.left, r.right, r.bottom, innerWidth, innerHeight]; }")
    check(pb[0] >= 0 and pb[1] <= pb[3] + 0.5 and pb[2] <= pb[4] + 0.5, f'{tag} the panel stays inside the viewport', pb)
    xb = await pg.locator('#goalPanel .gp-x').bounding_box(); check(xb and xb['width'] >= 44 and xb['height'] >= 44, f'{tag} ✕ is 44×44', xb)
    await shot(pg, f'{vp}_{world}_2_goal_panel')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(250)
    check(await pg.is_hidden('#goalPanel') and await pg.evaluate("() => document.activeElement && document.activeElement.id === 'hGoalBtn'"), f'{tag} Esc closes and focus returns to the toggle')
    # tap open, tap outside closes
    await pg.click('#hGoalBtn'); await pg.wait_for_timeout(250); check(await pg.is_visible('#goalPanel'), f'{tag} a tap opens the panel')
    pt = await pg.evaluate("() => { const r = document.querySelector('#goalPanel').getBoundingClientRect(); if (r.bottom < innerHeight - 30) return [innerWidth / 2, (r.bottom + innerHeight) / 2]; const w = document.querySelector('#hWorld').getBoundingClientRect(); return [w.left + w.width / 2, w.top + w.height / 2]; }")
    await pg.mouse.click(pt[0], pt[1]); await pg.wait_for_timeout(250)
    check(await pg.is_hidden('#goalPanel'), f'{tag} a tap outside closes it')
    if world == 'w1': await debt_run(pg, tag, vp, world)
    await ctx.close()

async def debt_run(pg, tag, vp, world):
    await idle(pg)
    if await pg.evaluate("() => !document.querySelector('#evm').hidden"):
        return log(tag, 'card open — debt chip step skipped')
    before = await pg.evaluate(ENGINE_MODEL, world)
    if await pg.is_visible('#sheetBtn'): await pg.click('#sheetBtn'); await pg.wait_for_timeout(500)
    await pg.click('#sheet [data-act="loan"]'); await pg.wait_for_selector('#gm:not([hidden])')
    await pg.click('#gm .acts button.primary'); await pg.wait_for_timeout(300)
    await pg.wait_for_selector('#debtChip.on', timeout=10000)
    chip = (await pg.inner_text('#debtChip')).replace('⁦', '').replace('⁩', '').replace('⁠', '')
    after = await pg.evaluate(ENGINE_MODEL, world)
    d = after['liab'] - before['liab']; mo = after['debtMonthly'] - before['debtMonthly']
    exp = await pg.evaluate("async ([d, mo]) => { const E = await import('./js/engine.js'); return `חוב חדש ${E.fmtM(d)}${mo > 0 ? ` · ${E.fmtM(mo)} בחודש` : ''}`; }", [d, mo])
    check(d > 0 and exp in chip, f'{tag} new-debt chip "{chip.strip()}" = engine Δ ("{exp}")')
    check(await pg.get_attribute('#debtChip', 'role') == 'status', f'{tag} the chip is a status region')
    if await pg.is_visible('#sheet.open'): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    if await pg.is_visible('#sheet.open'):
        x = pg.locator('#sheet .sh-close');
        if await x.count(): await x.first.click(); await pg.wait_for_timeout(300)
    await pg.wait_for_selector('#debtChip.on', timeout=3000)
    await shot(pg, f'{vp}_{world}_3_debt_chip')
    # no timed dismissal: still there a while later; the next roll clears it
    await pg.wait_for_timeout(1500); check(await pg.is_visible('#debtChip.on'), f'{tag} the chip stays (no timed dismissal)')
    await pg.evaluate("() => { window.__chipCleared = false; const el = document.querySelector('#debtChip'); new MutationObserver(() => { if (!el.classList.contains('on')) window.__chipCleared = true; }).observe(el, { attributes: true, attributeFilter: ['class'] }); }")
    await pg.click('#roll'); await pg.wait_for_timeout(400)
    check(await pg.evaluate("() => window.__chipCleared"), f'{tag} the next roll clears the chip')
    await idle(pg)

async def deal_run(b, vp='phone360'):
    ctx, pg = await new_page(b, vp, init=SEED.replace('{turbo:true}', '{turbo:true, lite:true}'))
    await start(pg, 'w1')
    found = False
    for i in range(80):
        s = await idle(pg)
        if s['card']:
            cls = await pg.evaluate("() => document.querySelector('#evCard').className")
            if 'ev-deal' in cls and await pg.evaluate("() => !!document.querySelector('#evCard > .acts button')"): found = True; break
            btns = pg.locator('#evCard .acts button:not([disabled]), #evCard .choices button:not([disabled])'); n = await btns.count()
            if n: await btns.nth(n - 1).click()
            else:
                ok = pg.locator('#evCard button:not([disabled])'); await ok.last.click()
            await pg.wait_for_timeout(300); continue
        await pg.click('#roll'); await pg.wait_for_timeout(500)
    check(found, f'{vp} reached a deal card')
    if not found: return await ctx.close()
    await pg.wait_for_timeout(700)
    r = await pg.evaluate("""() => { const c = document.querySelector('#evCard'); c.scrollTop = 0; const bs = [...c.querySelectorAll(':scope > .acts button')];
      const st = document.querySelector('#evCard .say .st'); const cs = st && getComputedStyle(st);
      return { vh: innerHeight, n: bs.length, bots: bs.map(b => Math.round(b.getBoundingClientRect().bottom)), tops: bs.map(b => Math.round(b.getBoundingClientRect().top)),
        say: cs ? [cs.paddingBottom, cs.borderBottomWidth, cs.overflow] : null, sw: document.documentElement.scrollWidth, iw: innerWidth }; }""")
    check(r['n'] > 0 and max(r['bots']) <= r['vh'] and min(r['tops']) >= 0, f'{vp} deal card: every decision button is on screen with the card at its top ({r["tops"]}..{r["bots"]} of {r["vh"]})')
    check(r['say'] is None or (r['say'][0] == '0px' and r['say'][2] == 'hidden'), f'{vp} the card bubble has no bottom padding inside its clamp ({r["say"]})')
    check(r['sw'] <= r['iw'], f'{vp} deal card: no horizontal scroll')
    await shot(pg, f'{vp}_w1_4_deal_card')
    await ctx.close()

async def coach_run(b):
    init = SEED.replace("localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true}));", '') + "localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:2, tutorialDone:true, stars:{w1:1}}));"
    ctx, pg = await new_page(b, 'phone', init=init)
    await pg.goto(BASE); await pg.wait_for_selector('.fbworld', timeout=120000)
    await pg.click('.fbworld[data-w=w1]'); await pg.wait_for_timeout(300); await pg.locator('.prof').nth(0).click(); await pg.click('#fbGo')
    await pg.wait_for_selector('#start', state='hidden', timeout=60000)
    await pg.wait_for_function("() => !document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=120000)
    seen = False
    for _ in range(16):
        if await pg.evaluate("() => !document.querySelector('#coach').hidden"): seen = True; break
        await pg.wait_for_timeout(250)
    check(not seen, 'tutorial finished: no w1 world coach over the board at game start')
    check(json.loads(await pg.evaluate("() => localStorage.getItem('rr2-coach') || '{}'")).get('w1') is True, 'w1 recorded as coached')
    await ctx.close()
    # a brand-new player in w2 still gets the first-visit mechanic coach
    ctx, pg = await new_page(b, 'phone', init="localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:2, tutorialDone:true}));")
    await pg.goto(BASE); await pg.wait_for_selector('.fbworld', timeout=120000)
    await pg.click('.fbworld[data-w=w2]'); await pg.wait_for_timeout(300); await pg.locator('.prof').nth(0).click(); await pg.click('#fbGo')
    await pg.wait_for_selector('#start', state='hidden', timeout=60000)
    try: await pg.wait_for_selector('#coach:not([hidden])', timeout=15000); w2c = True
    except Exception: w2c = False
    # info only: the first-visit coach is skipped by design when a card / flow is busy at that moment (onboard alive()), unchanged by this wave
    log('INFO w2 first visit mechanic coach shown:', w2c)
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        for vp in VPN:
            for w in WORLDS:
                try: await world_run(b, vp, w)
                except Exception as e: check(False, f'{vp}/{w} ran', repr(e))
        if 'phone360' in VPN:
            try: await deal_run(b)
            except Exception as e: check(False, 'phone360 deal card ran', repr(e))
        try: await coach_run(b)
        except Exception as e: check(False, 'coach run', repr(e))
        await b.close()
    for g in GUARDS:
        try: FB.assert_clean(g)
        except Exception as e: check(False, f'backend guard: {e}')
    check(not ERRS, f'no console / page errors ({len(ERRS)})', ERRS[:5])
    npass = sum(1 for c, _ in RES if c); nfail = len(RES) - npass
    print(f'hud_goal_e2e: {npass} passed, {nfail} failed'); sys.exit(1 if nfail else 0)

asyncio.run(main())
