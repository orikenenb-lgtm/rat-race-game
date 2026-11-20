# Game-screen e2e (front-end agent). Plays every world through the built-in picker (no lobby.js in the test copy),
# answers cards with varied choices, exercises the trade window, resume and game:end; screenshots desktop + phone.
# Usage: python3 tests/game_e2e.py [worlds=w1,w2,w3,w4] [turns=16] [--phone] [--hq]   (server: test copy on :8770)
import asyncio, random, sys, time, json
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
BASE = next((a.split('=',1)[1] for a in sys.argv if a.startswith('--base=')), 'http://localhost:8770/index.html')
SHOTS = '/tmp/rrshots'
PFX = next((a.split('=',1)[1] for a in sys.argv if a.startswith('--prefix=')), 'v32_')  # screenshot file prefix
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
ERRS = []

def attach(pg, tag):
    pg.set_default_timeout(90000)   # 2-core box shared with other leads' test runs: swiftshader frames can take seconds
    def con(m):
        if m.type != 'error': return
        url = (m.location or {}).get('url', '')
        if 'lobby.js' in url or 'lobby.css' in url or 'progress.js' in url: return  # expected: no lobby in this copy
        if 'Failed to load resource' in m.text and ('lobby' in url or url == '' or 'rr_checkpoint' in url): return
        ERRS.append(f'{tag} console: {m.text} @ {url}'); log('CONSOLE-ERR', tag, m.text, url)
    pg.on('console', con)
    pg.on('pageerror', lambda e: (ERRS.append(f'{tag} pageerror: {e}'), log('PAGEERR', tag, e)))

STATE_JS = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden,
  start: !document.querySelector('#start').hidden, coach: !document.querySelector('#coach').hidden, gm: !document.querySelector('#gm').hidden,
  type: (document.querySelector('#evCard').className.match(/ev-(\\w+)/)||[])[1]||null,
  title: (document.querySelector('#evTitle')||{}).textContent||'', month: document.querySelector('#hMonth').textContent,
  cash: document.querySelector('#hCash').textContent, toast: document.querySelector('#toast').className.includes('on') ? document.querySelector('#toast').textContent : '' })"""

async def st(pg): return await pg.evaluate(STATE_JS)

async def wait_idle(pg, timeout=90):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = await st(pg)
        if s['gm']:  # a mentor modal (bail-out): read it and continue
            log('  modal:', await pg.inner_text('#gmCard h2')); await pg.wait_for_timeout(400)
            await pg.screenshot(path=f'{SHOTS}/{PFX}modal_{int(time.time())}.png')
            await pg.click('#gm .acts button.primary'); await pg.wait_for_timeout(300); continue
        if s['card'] or s['roll'] or s['start']: return s
        await pg.wait_for_timeout(250)
    raise Exception('stuck: ' + json.dumps(await st(pg), ensure_ascii=False))

STATS = {}
TOASTSHOT = {}
async def trade(pg, rnd, tag):
    """v1.1 trade window: +steps, slider, max/all/reset, repeated buy/sell, done."""
    STATS['trade'] = STATS.get('trade', 0) + 1
    card = pg.locator('#evCard')
    cash0 = await pg.inner_text('#qcash')
    q0 = await pg.inner_text('#qv'); can_buy = not await card.locator('[data-q="max"]').is_disabled()
    if can_buy: assert q0 != '0', 'trade window opened with qty 0 although you can buy'
    if await pg.is_visible('#qgainRow'): log(tag, '  unrealised:', await pg.inner_text('#qgainRow'))
    maxbuy = not await card.locator('[data-q="max"]').is_disabled()
    if maxbuy and rnd.random() < 0.85:
        await card.locator('.qty button').nth(3).click()          # +small step
        await pg.wait_for_timeout(150)
        q1 = await pg.inner_text('#qv')
        await card.locator('[data-q="max"]').click(); await pg.wait_for_timeout(150)
        qmax = await pg.inner_text('#qv')
        await card.locator('[data-q="zero"]').click(); await pg.wait_for_timeout(150)
        assert (await pg.inner_text('#qv')) == '0', 'reset failed'
        # slider: set to ~half of max
        # (slider spans max(maxBuy, maxSell), so aim at half of what you can *buy*)
        mb = int(qmax.replace(',', '') or '1')
        await pg.evaluate("(mb) => { const s=document.querySelector('#qs'); s.value=Math.max(1,Math.floor(mb/2)); s.dispatchEvent(new Event('input',{bubbles:true})); }", mb)
        await pg.wait_for_timeout(150)
        qh = await pg.inner_text('#qv')
        await card.locator('[data-o="buy"]').click()
        await pg.wait_for_function("(c0) => document.querySelector('#qcash') && document.querySelector('#qcash').textContent !== c0", arg=cash0, timeout=20000)
        hold = await pg.inner_text('#qhold'); cash1 = await pg.inner_text('#qcash')
        log(tag, f'  trade +step={q1} max={qmax} half={qh} → bought; hold "{hold}" cash {cash0}→{cash1}')
        STATS['trade_buy'] = STATS.get('trade_buy', 0) + 1
        assert cash1 != cash0, 'cash did not change after buy'
        if rnd.random() < 0.6:  # undo: sell everything inside the same window
            await card.locator('[data-q="all"]').click(); await pg.wait_for_timeout(150)
            c1 = await pg.inner_text('#qcash')
            await card.locator('[data-o="sell"]').click()
            await pg.wait_for_function("(c0) => document.querySelector('#qcash').textContent !== c0", arg=c1, timeout=20000)
            g = await pg.inner_text('#qgainRow') if await pg.is_visible('#qgainRow') else ''
            log(tag, f'  after sell-all, gain row visible: {bool(g)}')
            log(tag, f'  trade sell-all → hold "{await pg.inner_text("#qhold")}" cash {await pg.inner_text("#qcash")}')
            STATS['trade_sell'] = STATS.get('trade_sell', 0) + 1
    await card.locator('[data-o="done"]').click()

async def handle_card(pg, rnd, tag, s):
    t = s['type']; STATS[t] = STATS.get(t, 0) + 1
    card = pg.locator('#evCard')
    if t == 'trade':
        await trade(pg, rnd, tag); return
    sells = card.locator('.sells button[data-o^="sell:"]')
    if await sells.count() and rnd.random() < 0.6:
        await sells.first.click(); STATS['sold'] = STATS.get('sold', 0) + 1
        await pg.wait_for_timeout(600)
        await card.locator('button[data-o="done"]').click(); return
    roi = card.locator('[data-roi]')
    if await roi.count() and rnd.random() < 0.5:
        await roi.click(); await pg.wait_for_timeout(100)
        assert await pg.is_visible('#roiBox'), 'ROI box did not open'
    btns = card.locator('button[data-o]:not([disabled])')
    n = await btns.count()
    if n == 0: raise Exception('card without enabled options: ' + s['title'])
    labels = [await btns.nth(i).get_attribute('data-o') for i in range(n)]
    # varied: mostly first (buy/pay/primary-ish), sometimes others
    i = 0 if rnd.random() < 0.55 else rnd.randrange(n)
    await btns.nth(i).click()
    log(tag, f'  card {t} "{s["title"]}" → {labels[i]}  (of {labels})')

async def play(pg, turns, tag, rnd, shot_at=None):
    for k in range(turns):
        s = await wait_idle(pg)
        if s['start']: log(tag, 'game ended at turn', k); return 'ended'
        guard = 0
        while s['card']:
            if shot_at and k == shot_at[0] and not shot_at[1].get('done'):
                await pg.wait_for_timeout(700); await pg.screenshot(path=shot_at[1]['path']); shot_at[1]['done'] = True
            await handle_card(pg, rnd, tag, s); await pg.wait_for_timeout(250)
            s = await wait_idle(pg); guard += 1
            if guard > 12: raise Exception('card loop')
        if s['start']: return 'ended'
        if s['coach']:
            await pg.click('#coach [data-c="next"]')
        await pg.click('#roll')
        s2 = await st(pg)
        log(tag, f'turn {k+1}: month {s2["month"]} cash {s2["cash"]}')
        for _ in range(12):
            t = (await st(pg))['toast']
            if t:
                log(tag, '  toast:', t); STATS['toast'] = STATS.get('toast', 0) + 1
                if not TOASTSHOT.get(tag): TOASTSHOT[tag] = 1; await pg.screenshot(path=f'{SHOTS}/{PFX}{tag}_toast.png')
                break
            if (await st(pg))['card']: break
            await pg.wait_for_timeout(250)
        await pg.wait_for_timeout(300)
    s = await wait_idle(pg)
    while s['card']:
        await handle_card(pg, rnd, tag, s); await pg.wait_for_timeout(250); s = await wait_idle(pg)
    return 'ok'

async def top_up_energy(pg):
    await pg.evaluate("async () => { try { const e = await import('/js/energy.js'); e.add && e.add(99, 'test'); } catch (x) {} }")

async def start_world(pg, world, char_idx=0, tutorial=False):
    await pg.wait_for_selector('.fbworld', timeout=120000)
    await top_up_energy(pg)
    if world.startswith('h:'):
        await pg.click(f'.fbworld[data-h="{world[2:]}"]')
        await pg.wait_for_selector('#start', state='hidden', timeout=30000)
        await pg.wait_for_function("() => !document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=120000)
        return
    await pg.click(f'.fbworld[data-w={world}]'); await pg.wait_for_timeout(300)
    profs = pg.locator('.prof'); n = await profs.count()
    await profs.nth(char_idx % n).click()
    if tutorial: await pg.check('#fbTut')
    await pg.click('#fbGo')
    await pg.wait_for_selector('#start', state='hidden', timeout=30000)
    await pg.wait_for_function("() => !document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=120000)

async def run_world(b, world, turns, phone=False, hq=False):
    vp = {'width': 390, 'height': 800} if phone else {'width': 1300, 'height': 820}
    dark = '--dark' in sys.argv
    ctx = await b.new_context(viewport=vp, device_scale_factor=1, has_touch=phone, is_mobile=phone, color_scheme='dark' if dark else 'light')
    pg = await ctx.new_page(); tag = f'{world}{"-phone" if phone else ""}{"-dark" if dark else ""}'; attach(pg, tag)
    rnd = random.Random(hash(tag) & 0xffff)
    tag = tag.replace(':', '_')
    await pg.goto(BASE + ('?hq' if hq else ''))
    await start_world(pg, world, char_idx={'w1': 0, 'w2': 1, 'w3': 2, 'w4': 0}.get(world, 0))
    for i in (1, 2):  # first visit to a world: 2 coach marks about its mechanic
        try: await pg.wait_for_selector('#coach:not([hidden]) .bubble', timeout=6000)
        except Exception: log(tag, 'no world coach mark', i); break
        await pg.wait_for_timeout(500); await pg.screenshot(path=f'{SHOTS}/{PFX}{tag}_coach{i}.png')
        log(tag, 'coach:', (await pg.inner_text('#coach .bubble b')))
        await pg.click('#coach [data-c="next"]'); await pg.wait_for_timeout(400)
    await pg.wait_for_timeout(800)
    await pg.screenshot(path=f'{SHOTS}/{PFX}{tag}_start.png')
    if world == 'w1' and not phone:  # HUD toggles persist in rr2-settings
        await pg.click('#turboBtn'); await pg.click('#muteBtn')
        st_ = await pg.evaluate("() => JSON.parse(localStorage.getItem('rr2-settings'))")
        assert st_.get('turbo') is True and st_.get('muted') is True, f'settings not persisted {st_}'
        assert await pg.get_attribute('#turboBtn', 'aria-pressed') == 'true'
        await pg.click('#muteBtn'); await pg.click('#turboBtn')
        log(tag, 'turbo/mute toggles persisted', await pg.evaluate("() => localStorage.getItem('rr2-settings')"))
    if world == 'w2':  # Space rolls when nothing is focused
        await pg.evaluate('() => document.activeElement && document.activeElement.blur()')
        m0 = (await st(pg))['month']; await pg.keyboard.press('Space')
        await pg.wait_for_function("() => document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=10000)
        log(tag, 'Space started a roll')
    cardshot = {'path': f'{SHOTS}/{PFX}{tag}_card.png'}
    r = await play(pg, turns, tag, rnd, shot_at=(min(3, turns - 1), cardshot))
    await pg.wait_for_timeout(1200)
    await pg.screenshot(path=f'{SHOTS}/{PFX}{tag}_after.png')
    if phone and r != 'ended':
        await pg.click('#sheetBtn'); await pg.wait_for_timeout(700)
        await pg.screenshot(path=f'{SHOTS}/{PFX}{tag}_sheet.png')
        await pg.click('#sheet [data-act="close"]'); await pg.wait_for_timeout(400)
    if r == 'ended':
        log(tag, 'game over during the run (bankrupt/won) — end screen shown, resume step skipped')
        await ctx.close(); return r
    # resume: reload mid-game and continue
    month = (await st(pg))['month']
    await pg.reload()
    if world.startswith('h:'):
        await pg.wait_for_selector('.fbworld', timeout=120000); await top_up_energy(pg)
        await pg.evaluate("async (sid) => { const g = await import('/js/game.js'); const sv = g.savedGame('rr2-save-history-' + sid); await g.startGame({ ...sv.cfg, resume: true }); }", world[2:])
    else:
        await pg.wait_for_selector('#fbCont', timeout=120000)
        await pg.click('#fbCont')
    await pg.wait_for_function("() => !document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=120000)
    m2 = (await st(pg))['month']
    log(tag, f'resume: month before {month} after {m2}')
    assert month == m2, f'resume month mismatch {month} vs {m2}'
    await play(pg, 2, tag + '-resumed', rnd)
    await ctx.close()
    return r

async def test_end(b):
    """Force a win in a TEST copy via the save, check the in-board celebration and the 'game:end' payload."""
    ctx = await b.new_context(viewport={'width': 1300, 'height': 820}, device_scale_factor=1)
    pg = await ctx.new_page(); attach(pg, 'end')
    await pg.goto(BASE)
    await start_world(pg, 'w1', 0)
    await pg.evaluate("""async () => { const {bus} = await import('/js/bus.js'); window.__ends=[]; window.__ach=[];
       bus.on('game:end', p => window.__ends.push(p)); bus.on('achievement', p => window.__ach.push(p)); }""")
    await pg.click('#homeBtn'); await pg.wait_for_selector('#fbCont', timeout=20000)
    await pg.evaluate("""() => { const k='rr2-save-free-w1'; const s=JSON.parse(localStorage.getItem(k));
       s.state.assets.push({id:99,k:'biz',n:'מכונת כסף (בדיקה)',cost:1000,down:1000,debt:0,value:1000,month:1,ups:0,cf:999999}); s.state.nextId=100;
       localStorage.setItem(k, JSON.stringify(s)); }""")
    await pg.click('#fbCont')
    await pg.wait_for_function("() => !document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=120000)
    rnd = random.Random(5)
    for k in range(40):   # v3.1: the goal must hold on 2 consecutive paydays (GOAL_HOLD)
        s = await wait_idle(pg)
        if s['start']: break
        if s['card']: await handle_card(pg, rnd, 'end', s); await pg.wait_for_timeout(400); continue
        await pg.click('#roll')
    await pg.wait_for_function("() => window.__ends && window.__ends.length", timeout=120000)
    p = (await pg.evaluate("() => window.__ends"))[0]
    log('game:end payload', json.dumps({k: p[k] for k in p if k not in ('end', 'stats')}, ensure_ascii=False))
    for key in ['status', 'stars', 'months', 'netWorth', 'passive', 'expenses', 'progress', 'worldId', 'charId', 'mode', 'resultId', 'challengeId', 'groupId', 'title', 'end', 'stats']:
        assert key in p, 'payload missing ' + key
    assert p['status'] == 'won' and p['end']['status'] == 'won'
    await pg.wait_for_selector('#fbAgain', timeout=20000)
    await pg.screenshot(path=f'{SHOTS}/{PFX}end_fallback.png')
    saved = await pg.evaluate("() => JSON.parse(localStorage.getItem('rr2-save-free-w1')).state.over")
    assert saved == 'won', 'final state not saved'
    log('achievements emitted:', await pg.evaluate("() => JSON.stringify(window.__ach)"))
    await ctx.close()

async def test_tutorial(b, phone=False):
    vp = {'width': 390, 'height': 800} if phone else {'width': 1300, 'height': 820}
    ctx = await b.new_context(viewport=vp, device_scale_factor=1)
    pg = await ctx.new_page(); tag = 'tut' + ('-phone' if phone else ''); attach(pg, tag)
    await pg.goto(BASE)
    await start_world(pg, 'w1', 0, tutorial=True)
    await pg.wait_for_selector('#coach:not([hidden])', timeout=30000)
    await pg.wait_for_timeout(500)
    await pg.screenshot(path=f'{SHOTS}/{PFX}{tag}_coach1.png')
    await pg.click('#coach [data-c="next"]')
    seen = set(); rnd = random.Random(1)
    for k in range(12):
        s = await wait_idle(pg)
        if s['coach']:
            txt = await pg.inner_text('#coach .bubble small'); seen.add(txt)
            await pg.wait_for_timeout(400); await pg.screenshot(path=f'{SHOTS}/{PFX}{tag}_coach{len(seen)+1}.png')
            await pg.click('#coach [data-c="next"]'); await pg.wait_for_timeout(200); continue
        if s['card']:
            await pg.wait_for_timeout(900)
            s = await st(pg)
            if s['coach']: continue
            await handle_card(pg, rnd, tag, s); await pg.wait_for_timeout(300); continue
        await pg.click('#roll'); await pg.wait_for_timeout(300)
    log(tag, 'coach marks seen after the first:', seen)
    await ctx.close()

async def test_stub(b):
    """Lobby contract with tests/stubs/lobby_stub.js as js/lobby.js: ranked daily (resultId key, pawn, server checkpoints
    intercepted), HUD lobby → banner-style resume (only hides #start) with and without a pending card, server-state resume
    (cfg.state, no local save), free w2, shared modal/toast."""
    ctx = await b.new_context(viewport={'width': 1300, 'height': 820}, device_scale_factor=1)
    pg = await ctx.new_page(); attach(pg, 'stub')
    cks = []
    async def ck(route):
        body = json.loads(route.request.post_data or '{}'); cks.append(body.get('p_turn'))
        if len(cks) == 3:  # simulate "the server already has a newer checkpoint" once: must be ignored silently
            await route.fulfill(status=400, content_type='application/json', body='{"message":"stale_checkpoint"}'); return
        await pg.evaluate('([s, t]) => { window.__lastCkState = s; window.__lastCkTurn = t; }', [body.get('p_state'), body.get('p_turn')])
        await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    await pg.route('**/rest/v1/rpc/rr_checkpoint', ck)
    await pg.add_init_script("localStorage.setItem('rr-player', JSON.stringify({id:'00000000-0000-0000-0000-000000000000', secret:'test', nickname:'טסט־בדיקה'}))")
    await pg.goto(BASE)
    await pg.wait_for_selector('#stubDaily', timeout=120000)
    await pg.click('#stubDaily')
    await pg.wait_for_function("() => !document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=120000)
    m = await pg.inner_text('#hMonth'); log('stub daily month label', m)
    assert '/24' in m.replace(' ', ''), 'ranked month limit not shown'
    rnd = random.Random(3)
    await play(pg, 4, 'stub-daily', rnd)
    await pg.wait_for_timeout(500)
    log('checkpoint p_turn sequence', cks)
    assert len(cks) >= 3 and all(cks[i] < cks[i + 1] for i in range(len(cks) - 1)), 'checkpoint seq must increase'
    await pg.screenshot(path=f'{SHOTS}/{PFX}stub_daily_w3.png')
    has = await pg.evaluate("() => !!localStorage.getItem('rr2-save-stub-r1')"); assert has, 'ranked save key missing'
    # B1: lobby → "חזרה למשחק" (hide #start) between turns → roll enabled
    await pg.click('#homeBtn'); await pg.wait_for_selector('#stubBack', timeout=20000)
    await pg.click('#stubBack'); await pg.wait_for_timeout(600)
    s = await st(pg); log('banner resume between turns', s['roll'], s['card']); assert s['roll'] or s['card'], 'B1: roll disabled after banner resume'
    # B1 with a pending card
    for k in range(10):
        s = await wait_idle(pg)
        if s['card']: break
        await pg.click('#roll'); await pg.wait_for_timeout(500)
    s = await wait_idle(pg)
    if s['card']:
        t1 = s['title']
        await pg.click('#homeBtn'); await pg.wait_for_selector('#stubBack', timeout=20000)
        await pg.click('#stubBack'); await pg.wait_for_timeout(600)
        s2 = await st(pg); log('banner resume with pending card:', t1, '→', s2['title'], s2['card'])
        assert s2['card'] and s2['title'] == t1, 'B1: pending card lost after banner resume'
        await pg.screenshot(path=f'{SHOTS}/{PFX}stub_card_after_banner.png')
        await handle_card(pg, rnd, 'stub', s2); s3 = await wait_idle(pg)
        assert s3['roll'] or s3['card'], 'B1: stuck after answering the pending card'
    # second device: no local save, resume from the server checkpoint
    month = await pg.evaluate("() => JSON.parse(localStorage.getItem('rr2-save-stub-r1')).state.month")
    seq = await pg.evaluate("() => JSON.parse(localStorage.getItem('rr2-save-stub-r1')).state.ui.seq")
    await pg.click('#homeBtn'); await pg.wait_for_selector('#stubServer', timeout=20000)
    await pg.click('#stubServer')
    await pg.wait_for_function("() => !document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=120000)
    m2 = await pg.inner_text('#hMonth'); seq2 = await pg.evaluate("() => JSON.parse(localStorage.getItem('rr2-save-stub-r1')).state.ui.seq")
    log('server-state resume: month', month, '→', m2, '· seq', seq, '→', seq2)
    assert m2.startswith(str(month)), 'cfg.state resume failed'
    assert seq2 >= seq - 1, 'seq went backwards after server resume'
    n_before = len(cks); last_turn = await pg.evaluate('() => window.__lastCkTurn')
    await play(pg, 2, 'stub-server', rnd)
    log('checkpoints total', len(cks), 'last', cks[-3:])
    assert all(t > last_turn for t in cks[n_before:]), 'checkpoints after server resume must continue above checkpoint_turn'
    await pg.click('#homeBtn'); await pg.wait_for_selector('#stubFree', timeout=20000)
    await pg.click('#stubFree')
    await pg.wait_for_function("() => document.body.dataset.world==='w2' && (!document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden)", timeout=120000)
    n0 = len(cks)
    await pg.wait_for_timeout(2500)
    await pg.screenshot(path=f'{SHOTS}/{PFX}stub_free_w2_crown.png')
    await play(pg, 2, 'stub-w2', rnd)
    assert len(cks) == n0, 'free games must not send checkpoints'
    log('stub achievements', await pg.evaluate('() => JSON.stringify(window.__stub.ach)'))
    await pg.evaluate("async () => { const u = await import('/js/ui.js'); window.__cb = 'pending'; u.confirmBox('לצאת מהמשחק?').then((v) => window.__cb = v); }")
    await pg.wait_for_selector('#gm:not([hidden]) .acts button.primary', timeout=10000)
    await pg.click('#gm .acts button.primary'); await pg.wait_for_function('() => window.__cb === true', timeout=5000)
    log('stub confirmBox ok')
    await ctx.close()

async def test_bailout(b, phone=False):
    """Fast-forward a reckless w1 game (engine only, in the page) to the roll before the first bankruptcy, save it,
    resume through the picker and roll: the bail-out mentor card must appear (cfg.bailout)."""
    vp = {'width': 390, 'height': 800} if phone else {'width': 1300, 'height': 820}
    ctx = await b.new_context(viewport=vp, device_scale_factor=1); pg = await ctx.new_page(); tag = 'bail' + ('-phone' if phone else ''); attach(pg, tag)
    await pg.goto(BASE); await pg.wait_for_selector('.fbworld', timeout=120000)
    ok = await pg.evaluate("""async () => {
      const E = await import('/js/engine.js');
      const cfg = { worldId: 'w1', charId: 'driver', seed: 224, mode: 'free', bailout: true, pawn: 'classic', pawnColor: '#e2483d', tutorial: false };
      const st = E.createGame(cfg); st.ui = { seq: 0, coach: {}, firstPayday: true };
      for (let t = 0; t < 80 && !st.over; t++) {
        const pre = JSON.parse(JSON.stringify(st));
        const r = E.rollDice(st);
        if (r.bailout) { localStorage.setItem('rr2-save-free-w1', JSON.stringify({ v: 2, cfg, state: pre })); localStorage.setItem('rr2-coach', JSON.stringify({w1:true})); return t; }
        let ev = E.landing(st); let n = 0;
        while (ev && n++ < 30) {
          let o = ev.auto ? ev.options[0] : (ev.options.find((x) => x.enabled && /^(buy|buyVar|pay|inv:2|ok|done)$/.test(x.id)) || ev.options.find((x) => x.enabled && !x.needsQty));
          if (o.needsQty || (n > 3 && ev.options.some((x) => x.id === 'done'))) o = ev.options.find((x) => x.id === 'done');
          const res = E.choose(st, ev, o.id); ev = res.event; if (res.end) break;
        }
      }
      return -1; }""")
    log(tag, 'bail-out prepared at turn', ok); assert ok >= 0
    await pg.reload(); await pg.wait_for_selector('#fbCont', timeout=120000); await pg.click('#fbCont')
    await pg.wait_for_function("() => !document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=120000)
    s = await wait_idle(pg)
    if s['card']: await handle_card(pg, random.Random(1), tag, s); await wait_idle(pg)
    await pg.click('#roll')
    await pg.wait_for_selector('#gm:not([hidden])', timeout=60000); await pg.wait_for_timeout(900)
    await pg.screenshot(path=f'{SHOTS}/{PFX}{tag}_card.png'); log(tag, 'bail-out card:', await pg.inner_text('#gmCard h2'))
    await pg.click('#gm .acts button.primary')
    s = await wait_idle(pg); log(tag, 'after bail-out: roll', s['roll'], 'card', s['card'])
    await ctx.close()

FORCE_JS = """(a) => { window.__forced = 'pending'; (async () => {
  const E = await import('/js/engine.js'); const g = await import('/js/game.js');
  const key = 'rr2-save-free-' + a.world; const sv = JSON.parse(localStorage.getItem(key)); const st = sv.state;
  const W = E.getWorld(st.worldId);
  st.pending = null; if (a.ch) { st.pos = W.board.indexOf(a.ch); st.phase = 'land'; } else { st.pos = a.pos; st.phase = 'roll'; }
  if (a.ch === 'P' && !st.lastPayday) st.lastPayday = { tile: 0, step: 0, amount: 1000, salary: st.salary, passive: 0, expenses: 7000, month: st.month, landed: true };
  for (const [path, v] of Object.entries(a.patch || {})) { const ks = path.split('.'); let o = st; for (const k of ks.slice(0, -1)) o = o[k]; o[ks[ks.length - 1]] = v; }
  localStorage.setItem(key, JSON.stringify(sv));
  g.startGame({ ...sv.cfg, resume: true }); window.__forced = 'started:' + a.n;
})().catch((e) => { window.__forced = 'error: ' + e; console.error(e); }); }"""

FORCED = [0]
async def force_card(pg, world, ch, patch=None, want=None):
    """TEST copy only: edit the save so the pawn stands on tile `ch` with no card drawn, then resume → the game draws that card."""
    FORCED[0] += 1; n = FORCED[0]
    await pg.evaluate(FORCE_JS, {'world': world, 'ch': ch, 'patch': patch or {}, 'n': n, 'pos': (patch or {}).pop('__pos', 0) if patch else 0})
    await pg.wait_for_function("(n) => window.__forced === 'started:' + n || String(window.__forced).startsWith('error')", arg=n, timeout=30000)
    assert not str(await pg.evaluate('() => window.__forced')).startswith('error'), 'force failed'
    # startGame is running: wait until it has drawn the card (or settled on the roll button)
    await pg.wait_for_function("() => !document.querySelector('#evm').hidden || !document.querySelector('#roll').disabled", timeout=60000)
    await pg.wait_for_timeout(300)
    s = await wait_idle(pg)
    if want and s['type'] != want: log('  forced', ch, 'got', s['type'], s['title'])
    return s

async def verdict_seen(pg, tag, name):
    try:
        await pg.wait_for_selector('#verdict.on', timeout=8000)
        txt = await pg.inner_text('#verdict'); log(tag, '  verdict pill:', txt.replace('\n', ' | '))
        await pg.screenshot(path=f'{SHOTS}/{PFX}{name}.png'); STATS['verdict'] = STATS.get('verdict', 0) + 1
        return True
    except Exception:
        log(tag, '  (no verdict pill)'); return False

async def test_v32(b, phone=False):
    """v3.2 cards on demand: K business (offer → manage, a decision inside the open card), doodad with 3 interest-free
    installments, payday 'save' to the emergency fund, tax office 'report' — then the sheet with the fund box."""
    vp = {'width': 360, 'height': 760} if phone else {'width': 1300, 'height': 820}
    ctx = await b.new_context(viewport=vp, device_scale_factor=1, has_touch=phone, is_mobile=phone)
    pg = await ctx.new_page(); tag = 'v32' + ('-phone' if phone else ''); attach(pg, tag); sfx = '_phone' if phone else ''
    await pg.goto(BASE); await pg.evaluate("() => localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true}))")
    await start_world(pg, 'w1', 0)
    rnd = random.Random(32)
    s = await wait_idle(pg)
    while s['card']: await handle_card(pg, rnd, tag, s); s = await wait_idle(pg)
    hit = {}
    # 1) business offer
    s = await force_card(pg, 'w1', 'K', {'cash': 90000}, 'business')
    assert s['type'] == 'business', 'K tile did not open a business card: ' + json.dumps(s, ensure_ascii=False)
    await pg.wait_for_timeout(500); await pg.screenshot(path=f'{SHOTS}/{PFX}biz_offer{sfx}.png')
    assert await pg.is_visible('#evCard .bizkind'), 'business offer: active/passive explanation missing'
    await pg.click('#evCard [data-o="start"]'); hit['business'] = 1
    await verdict_seen(pg, tag, f'verdict_after_biz{sfx}')
    s = await wait_idle(pg)
    # 2) business manage: a decision keeps the card open and shows the verdict line inside it
    s = await force_card(pg, 'w1', 'K', None, 'business')
    assert s['type'] == 'business'
    await pg.wait_for_timeout(500); await pg.screenshot(path=f'{SHOTS}/{PFX}biz_manage{sfx}.png')
    btn = pg.locator('#evCard .bizgrid button[data-o^="biz:"]:not([disabled])').first
    lbl = await btn.get_attribute('data-o'); await btn.click()
    await pg.wait_for_selector('#evCard .vline', timeout=20000)
    log(tag, '  business decision', lbl, '→', (await pg.inner_text('#evCard .vline')).replace('\n', ' '))
    assert await pg.is_visible('#evCard .okmsg'), 'business: last decision not confirmed on the card'
    await pg.wait_for_timeout(300); await pg.screenshot(path=f'{SHOTS}/{PFX}biz_decision{sfx}.png')
    await pg.click('#evCard .acts button[data-o="ok"]'); s = await wait_idle(pg)
    # 3) doodad with 3 interest-free installments (+ the honest revolving-credit label)
    for i in range(16):
        s = await force_card(pg, 'w1', 'D', {'cash': 90000}, 'doodad')
        if not s['card']: continue
        if await pg.locator('#evCard [data-o="inst3"]').count():
            await pg.wait_for_timeout(400); await pg.screenshot(path=f'{SHOTS}/{PFX}doodad_inst3{sfx}.png')
            log(tag, '  doodad options:', [x.replace('\n', ' / ') for x in await pg.locator('#evCard .acts button').all_inner_texts()])
            await pg.click('#evCard [data-o="inst3"]'); hit['inst3'] = 1
            await verdict_seen(pg, tag, f'verdict_inst3{sfx}'); s = await wait_idle(pg); break
        await handle_card(pg, rnd, tag, s); s = await wait_idle(pg)
    # 4) payday → move money to the emergency fund
    s = await force_card(pg, 'w1', 'P', {'cash': 60000, 'savings': 0}, 'payday')
    assert s['type'] == 'payday', 'P tile did not open the payday card'
    await pg.wait_for_selector('#evCard [data-o="save"]', timeout=10000)
    await pg.wait_for_timeout(400); await pg.screenshot(path=f'{SHOTS}/{PFX}payday_save{sfx}.png')
    await pg.click('#evCard [data-o="save"]'); hit['save'] = 1
    await verdict_seen(pg, tag, f'verdict_save{sfx}'); s = await wait_idle(pg)
    # 5) tax office → open a file for the side hustle (report), then settle
    s = await force_card(pg, 'w1', 'T', {'life.plan': 'side', 'life.side.total': 5000, 'life.sideTaxDue': 900, 'life.sideReport': False}, 'tax')
    assert s['type'] == 'tax', 'T tile did not open the tax card'
    await pg.wait_for_timeout(400); await pg.screenshot(path=f'{SHOTS}/{PFX}tax_report{sfx}.png')
    await pg.click('#evCard [data-o="report"]'); hit['report'] = 1
    await pg.wait_for_timeout(900)
    s = await st(pg)
    if s['card']: await pg.click('#evCard .acts button[data-o="ok"]')
    s = await wait_idle(pg)
    while s['card']: await handle_card(pg, rnd, tag, s); s = await wait_idle(pg)
    # 6) the sheet: emergency fund box (months covered) + taxes + business badge
    if await pg.is_visible('#sheetBtn'): await pg.click('#sheetBtn')
    await pg.wait_for_timeout(800)
    fund = await pg.inner_text('#sheet .wbox.fund'); log(tag, '  sheet fund box:', fund.replace('\n', ' | ')[:160])
    await pg.screenshot(path=f'{SHOTS}/{PFX}sheet_fund{sfx}.png')
    await pg.locator('#sheet .wbox.fund').scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
    await pg.screenshot(path=f'{SHOTS}/{PFX}sheet_fund2{sfx}.png')
    if phone: await pg.click('#sheet [data-act="close"]'); await pg.wait_for_timeout(400)
    for k, v in hit.items(): STATS['v32_' + k] = STATS.get('v32_' + k, 0) + v
    log(tag, 'v3.2 cards hit:', hit)
    assert all(k in hit for k in ('business', 'inst3', 'save', 'report')), f'missing v3.2 cards: {hit}'
    # tile labels must read upright from the follow camera on every side of the ring (far side = index 20..29)
    for pos in (5, 14, 25, 35):
        await force_card(pg, 'w1', None, {'__pos': pos})
        await pg.wait_for_timeout(1800); await pg.screenshot(path=f'{SHOTS}/{PFX}follow_tile{pos}{sfx}.png')
    # board tiles (new icons) from above
    if not phone:
        await pg.click('#camBtn'); await pg.wait_for_timeout(1500); await pg.screenshot(path=f'{SHOTS}/{PFX}board_overview.png')
    await ctx.close()

async def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    worlds = (args[0] if args else 'w1,w2,w3,w4').split(',')
    turns = int(args[1]) if len(args) > 1 else 16
    phone = '--phone' in sys.argv; hq = '--hq' in sys.argv
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        if '--stub' in sys.argv: await test_stub(b)
        if '--end' in sys.argv: await test_end(b)
        if '--bail' in sys.argv: await test_bailout(b, phone)
        if '--tut' in sys.argv: await test_tutorial(b, phone)
        if '--nov32' not in sys.argv: await test_v32(b, phone)
        if '--noplay' not in sys.argv:
            for w in worlds:
                t0 = time.time(); r = await run_world(b, w, turns, phone, hq); log(w, 'done', r, round(time.time() - t0), 's')
        await b.close()
    log('STATS', json.dumps(STATS, ensure_ascii=False))
    log('ERRORS', len(ERRS)); [log('  ', e) for e in ERRS]
    sys.exit(1 if ERRS else 0)

asyncio.run(main())
