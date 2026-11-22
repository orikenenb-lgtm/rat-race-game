# Game-screen e2e (front-end agent). Plays every world through the built-in picker (no lobby.js in the test copy),
# answers cards with varied choices, exercises the trade window, resume and game:end; screenshots desktop + phone.
# Usage: python3 tests/game_e2e.py [worlds=w1,w2,w3,w4] [turns=16] [--phone] [--hq]   (server: test copy on :8770)
import asyncio, random, sys, time, json, os
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB   # T7 guard: no backend use here
MODE = FB.mode_from_argv(); GUARDS = []
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
BASE = next((a.split('=',1)[1] for a in sys.argv if a.startswith('--base=')), 'http://localhost:8770/index.html')
SHOTS = next((a.split('=',1)[1] for a in sys.argv if a.startswith('--shots=')), '/tmp/rrshots').rstrip('/')
os.makedirs(SHOTS, exist_ok=True)
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
        # T6 §6.1 / A11Y-13: the life-story overlay no longer closes by itself — tap its button
        if await pg.evaluate("() => { const x = document.querySelector('#story'); return !!x && !x.hidden && !!document.querySelector('#stGo'); }"):
            await pg.click('#stGo'); await pg.wait_for_timeout(400); continue
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

SIGN_JS = """() => [...document.querySelectorAll('#evCard .choice .fx')].map((e) => {
  const t = e.textContent.replace(/[\u2066-\u2069\u2060]/g, ''); const m = /([+−-])₪?\\d/.exec(t); if (!m) return null;
  const want = m[1] === '+' ? 'pos' : 'neg'; return e.classList.contains(want) ? null : t; }).filter(Boolean)"""

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
    if t in ('life', 'story'):   # T3 C5/UI-1: a chip's sign and its colour always agree (the old money-sign bug)
        bad = await pg.evaluate(SIGN_JS)
        assert not bad, f'chip sign/colour mismatch on "{s["title"]}": {bad}'
        STATS['signchecked'] = STATS.get('signchecked', 0) + 1
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

SAVE_JS = "(k) => { const s = JSON.parse(localStorage.getItem(k) || 'null'); return s && s.state; }"

async def find_dd_deal(pg, world, tag, tries=14, no_rival=True):
    """Force deal tiles until a card with the due-diligence box (inspections) shows up."""
    for i in range(tries):
        s = await force_card(pg, world, 'O', {'cash': 900000, 'life.energy': 90}, 'deal')
        if s['card'] and s['type'] == 'deal' and await pg.locator('#evCard .ddbox [data-o="inspect:1"]').count():
            # T2 verify D9: an inspection is a delay step — a T6 rival may close the deal; this flow needs a card without competition
            if no_rival and await pg.locator('#evCard .rvrow.on').count(): pass
            elif await pg.locator('#evCard .ddflags .b').count() or i >= tries // 2: return s   # prefer a deal with public flags
        if s['card']:
            b = pg.locator('#evCard button[data-o="pass"]')
            if await b.count(): await b.click()
            else: await handle_card(pg, random.Random(i), tag, s)
            await wait_idle(pg)
    raise Exception('no deal with inspections in %d tries' % tries)

async def test_nextlevel(b, phone=False):
    """T2 'Next Level' UI: a w2 game at mentor 'hint' (engine default) — no highlighted option, hint on request (counted),
    due diligence (flags, claimed vs range, inspection keeps the card open), impact panel, focus picker + agenda, economy gauge,
    payday focus section, mentor level change from the ❓ menu, pro game end-screen analysis; then a w1 'guide' game unchanged."""
    vp = {'width': 390, 'height': 800} if phone else {'width': 1300, 'height': 820}
    ctx = await b.new_context(viewport=vp, device_scale_factor=1, has_touch=phone, is_mobile=phone)
    pg = await ctx.new_page(); tag = 'nl' + ('-phone' if phone else ''); attach(pg, tag); sfx = '_phone' if phone else '_desk'
    await pg.goto(BASE); await pg.evaluate("() => localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true}))")
    await start_world(pg, 'w2', 1)
    rnd = random.Random(77)
    s = await wait_idle(pg)
    while s['card']: await handle_card(pg, rnd, tag, s); s = await wait_idle(pg)
    st0 = await pg.evaluate(SAVE_JS, 'rr2-save-free-w2')
    assert st0['mentor'] == 'hint', 'w2 default mentor must be hint, got %s' % st0.get('mentor')
    assert (st0.get('rules') or 3) == 4, 'new games play rules 4'
    # 1) a deal with due diligence
    s = await find_dd_deal(pg, 'w2', tag)
    await pg.wait_for_timeout(600)
    n_primary = await pg.locator('#evCard button.primary[data-o]').count()
    assert n_primary == 0, 'hint level: no highlighted option (%d)' % n_primary
    foc = await pg.evaluate("() => document.activeElement && document.activeElement.id")
    assert foc == 'evTitle', 'hint level: first focus on the card title, got %s' % foc
    assert await pg.locator('#evCard .grid .b.warn').count(), 'dd status badge (seller · not checked) missing'
    assert not await pg.is_visible('#hintP'), 'hint shown before asking'
    flags = await pg.locator('#evCard .ddflags .b').all_inner_texts()
    log(tag, '  dd flags:', flags, '· grid:', (await pg.inner_text('#evCard .grid')).replace('\n', ' | ')[:240])
    await pg.evaluate("() => { const c = document.querySelector('#evCard'); const g = c.querySelector('.grid'); c.scrollTop = g.offsetTop - 60; }"); await pg.wait_for_timeout(300)
    await pg.screenshot(path=f'{SHOTS}/{PFX}deal_dd{sfx}.png')
    # hint (counted once, saved)
    h0 = (await pg.evaluate(SAVE_JS, 'rr2-save-free-w2'))['dq'].get('hints', 0)
    await pg.click('#evCard [data-hint]')
    await pg.wait_for_selector('#hintP:not([hidden]) li', timeout=10000)
    h1 = (await pg.evaluate(SAVE_JS, 'rr2-save-free-w2'))['dq'].get('hints', 0)
    assert h1 == h0 + 1, 'hint not counted/saved (%s → %s)' % (h0, h1)
    assert await pg.locator('#evCard button.primary[data-o]').count() == 0, 'a hint must never add the primary class'
    log(tag, '  hint:', (await pg.inner_text('#hintP')).replace('\n', ' | ')[:200], '· hinted buttons', await pg.locator('#evCard button.hinted').count())
    await pg.locator('#hintP').scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
    await pg.screenshot(path=f'{SHOTS}/{PFX}hint{sfx}.png')
    # impact panel (collapsed at hint level; opens on tap; engine numbers + disclaimer)
    assert await pg.locator('#impP').count(), 'impact panel missing on a deal with major options'
    assert not await pg.evaluate("() => document.getElementById('impP').open"), 'impact panel must start collapsed at hint level'
    await pg.click('#impP > summary')
    await pg.wait_for_selector('#impP .imp-body table.ba', timeout=10000)
    assert await pg.locator('#impP .disc').count(), 'impact disclaimer missing'
    tabs = await pg.locator('#impP [data-imp]').count()
    if tabs > 1:
        await pg.locator('#impP [data-imp]').nth(1).click(); await pg.wait_for_timeout(300)
        await pg.locator('#impP [data-imp]').nth(0).click(); await pg.wait_for_timeout(300)
    log(tag, '  impact:', (await pg.inner_text('#impP .imp-body')).replace('\n', ' | ')[:240])
    await pg.evaluate("() => { const c = document.querySelector('#evCard'); c.scrollTop = document.getElementById('impP').offsetTop - 20; }"); await pg.wait_for_timeout(300)
    await pg.screenshot(path=f'{SHOTS}/{PFX}impact{sfx}.png')
    await pg.click('#impP details.more > summary'); await pg.wait_for_timeout(300)
    await pg.evaluate("() => { const c = document.querySelector('#evCard'); c.scrollTop = document.querySelector('#impP details.more').offsetTop - 20; }"); await pg.wait_for_timeout(300)
    await pg.screenshot(path=f'{SHOTS}/{PFX}impact_details{sfx}.png')
    # inspection: the card stays open and re-renders with the range; the hint is cleared (new facts)
    await pg.click('#evCard [data-o="inspect:1"]')
    await pg.wait_for_selector('#evCard .ddbox.lv1, #evCard .grid .b:not(.warn):not(.ok), #gm:not([hidden])', timeout=15000)
    if await pg.is_visible('#gm'):   # D9: still lost to a rival (a deal without competition was not found) — the T6 panel, then stop here
        log(tag, '  inspection lost the deal to a rival:', await pg.inner_text('#gmCard h2')); await pg.click('#gm .acts button'); await wait_idle(pg)
        raise Exception('D9: the inspected deal went to a rival although a deal without competition was asked for')
    s = await st(pg); assert s['card'] and s['type'] == 'deal', 'inspection must keep the deal card open'
    assert not await pg.is_visible('#hintP'), 'hint must clear after an inspection'
    log(tag, '  after inspection:', (await pg.inner_text('#evCard .grid')).replace('\n', ' | ')[:240])
    await pg.evaluate("() => { const c = document.querySelector('#evCard'); const g = c.querySelector('.grid'); c.scrollTop = g.offsetTop - 60; }"); await pg.wait_for_timeout(300)
    await pg.screenshot(path=f'{SHOTS}/{PFX}deal_inspected{sfx}.png')
    await pg.click('#evCard button[data-o="pass"]'); s = await wait_idle(pg)
    while s['card']: await handle_card(pg, rnd, tag, s); s = await wait_idle(pg)
    # 2) focus picker from the HUD chip (this month) + the agenda
    await pg.click('#hLife [data-life="focus"]')
    await pg.wait_for_selector('#gm:not([hidden]) .ftile', timeout=10000)
    await pg.wait_for_timeout(400); await pg.screenshot(path=f'{SHOTS}/{PFX}focus_picker{sfx}.png')
    tile = pg.locator('#gm .ftile[data-fid="research"]:not([disabled]), #gm .ftile[data-fid="frugal"]:not([disabled]), #gm .ftile[data-fid="scout"]:not([disabled])').first
    fid = await tile.get_attribute('data-fid'); await tile.click()
    await pg.click('#gm .acts button.primary'); await pg.wait_for_timeout(700)
    st1 = await pg.evaluate(SAVE_JS, 'rr2-save-free-w2')
    assert st1['life']['focus']['id'] == fid, 'focus not set: %s vs %s' % (st1['life']['focus'], fid)
    await pg.click('#hLife [data-life="focus"]'); await pg.wait_for_selector('#gm:not([hidden]) .fslot', timeout=10000)
    await pg.click('#gm .fslot[data-slot="1"]'); await pg.wait_for_timeout(200)
    await pg.locator('#gm .ftile[data-fid="network"]').click()
    await pg.click('#gm .acts button.primary'); await pg.wait_for_timeout(600)
    st2 = await pg.evaluate(SAVE_JS, 'rr2-save-free-w2')
    assert st2['life']['agenda'][0] == 'network', 'agenda slot 1 not set: %s' % st2['life']['agenda']
    log(tag, '  focus:', fid, '· agenda:', st2['life']['agenda'])
    # 3) economy gauge
    await pg.click('#hLife [data-life="econ"]')
    await pg.wait_for_selector('#gm:not([hidden]) .econ.big', timeout=10000)
    log(tag, '  econ:', (await pg.inner_text('#gmCard')).replace('\n', ' | ')[:200])
    await pg.wait_for_timeout(300); await pg.screenshot(path=f'{SHOTS}/{PFX}econ{sfx}.png')
    await pg.click('#gm .acts button.primary'); await pg.wait_for_timeout(300)
    await pg.screenshot(path=f'{SHOTS}/{PFX}hud{sfx}.png')
    # 4) payday card: the focus section under the plans
    s = await force_card(pg, 'w2', 'P', {'cash': 60000}, 'payday')
    if s['type'] == 'payday':
        await pg.wait_for_selector('#evCard .fsec', timeout=10000)
        await pg.locator('#evCard .fsec').scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SHOTS}/{PFX}payday_focus{sfx}.png')
        log(tag, '  payday focus:', (await pg.inner_text('#evCard .fsec')).replace('\n', ' | ')[:160])
    s = await wait_idle(pg)
    while s['card']:
        ok = pg.locator('#evCard button[data-o="ok"]')
        if await ok.count(): await ok.first.click()
        else: await handle_card(pg, rnd, tag, s)
        s = await wait_idle(pg)
    # 5) mentor level from the ❓ menu → pro: no hint button any more
    await pg.locator('#helpBtn:visible, #helpBtnM:visible').first.click(); await pg.wait_for_selector('#gm:not([hidden]) [data-h="mentor"]', timeout=10000)
    await pg.click('#gm [data-h="mentor"]'); await pg.wait_for_selector('#gm:not([hidden]) [data-lv="pro"]', timeout=10000)
    await pg.wait_for_timeout(300); await pg.screenshot(path=f'{SHOTS}/{PFX}mentor_level{sfx}.png')
    await pg.click('#gm [data-lv="pro"]'); await pg.wait_for_selector('#gm:not([hidden]) .acts button.primary', timeout=10000)
    await pg.click('#gm .acts button.primary'); await pg.wait_for_timeout(600)
    st3 = await pg.evaluate(SAVE_JS, 'rr2-save-free-w2'); assert st3['mentor'] == 'pro', 'mentor level not changed: %s' % st3['mentor']
    s = await find_dd_deal(pg, 'w2', tag)
    assert await pg.locator('#evCard [data-hint]').count() == 0, 'pro: no hint button'
    await pg.click('#evCard button[data-o="pass"]'); await wait_idle(pg)
    # 6) end screen (pro): win fast with a test asset, then the fallback end card carries the open analysis
    await pg.click('#homeBtn'); await pg.wait_for_selector('#fbCont', timeout=20000)
    await pg.evaluate("""() => { const k='rr2-save-free-w2'; const s=JSON.parse(localStorage.getItem(k));
       s.state.pending = null; s.state.phase = 'roll';
       s.state.assets.push({id:99,k:'biz',n:'מכונת כסף (בדיקה)',cost:1000,down:1000,debt:0,value:1000,month:1,ups:0,cf:9999999}); s.state.nextId=100;
       localStorage.setItem(k, JSON.stringify(s)); }""")
    await pg.click('#fbCont')
    await pg.wait_for_function("() => !document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=120000)
    for k in range(60):
        s = await wait_idle(pg)
        if s['start']: break
        if s['card']:
            ok = pg.locator('#evCard button[data-o="ok"], #evCard button[data-o="pass"], #evCard button[data-o="skip"]')
            if await ok.count(): await ok.first.click()
            else: await handle_card(pg, rnd, tag, s)
            await pg.wait_for_timeout(300); continue
        await pg.click('#roll')
    await pg.wait_for_selector('.fb.end .end-analysis', timeout=120000)
    assert await pg.evaluate("() => document.querySelector('.end-analysis').open"), 'pro: the analysis opens by itself'
    await pg.locator('.end-analysis').scroll_into_view_if_needed(); await pg.wait_for_timeout(400)
    log(tag, '  end analysis:', (await pg.inner_text('.end-analysis')).replace('\n', ' | ')[:300])
    await pg.screenshot(path=f'{SHOTS}/{PFX}end_pro{sfx}.png', full_page=True)
    await ctx.close()
    # 7) w1 'guide' game: unchanged — a highlighted option with keyboard focus on it
    ctx = await b.new_context(viewport=vp, device_scale_factor=1, has_touch=phone, is_mobile=phone)
    pg = await ctx.new_page(); attach(pg, tag + '-w1'); await pg.goto(BASE)
    await pg.evaluate("() => localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true}))")
    await start_world(pg, 'w1', 0)
    s = await wait_idle(pg)
    while s['card']: await handle_card(pg, rnd, tag, s); s = await wait_idle(pg)
    assert (await pg.evaluate(SAVE_JS, 'rr2-save-free-w1'))['mentor'] == 'guide', 'w1 default mentor must be guide'
    found = False
    for i in range(10):
        s = await force_card(pg, 'w1', 'O', {'cash': 50000}, 'deal')
        if s['card'] and s['type'] == 'deal' and await pg.locator('#evCard button.primary[data-o]').count():
            await pg.wait_for_timeout(500)
            foc = await pg.evaluate("() => document.activeElement && document.activeElement.classList.contains('primary')")
            assert foc, 'guide: keyboard focus on the highlighted option'
            await pg.screenshot(path=f'{SHOTS}/{PFX}w1_guide_deal{sfx}.png'); found = True
            await pg.locator('#evCard button.primary[data-o]').first.click(); await wait_idle(pg); break
        if s['card']: await handle_card(pg, rnd, tag, s); await wait_idle(pg)
    assert found, 'guide: no deal card with a highlighted option'
    log(tag, 'next-level UI checks passed')
    STATS['nextlevel' + sfx] = 1
    await ctx.close()

# ---------------------------------------------------------------- T3 stories & business + T4 first minute (in-game UI lane)
SEED_JS = """(a) => { window.__seeded = 'pending'; (async () => {
  const E = await import('/js/engine.js'); const CH = await import('/js/systems/chains.js'); const g = await import('/js/game.js');
  const key = 'rr2-save-free-' + a.world; const sv = JSON.parse(localStorage.getItem(key)); let st = E.deserialize(sv.state); const ui0 = st.ui;
  const W = E.getWorld(st.worldId); const S = st.story;
  const chain = (stage, step) => ({ stage, run: 1, path: null, startM: st.month, nextAt: null, nextStep: null, endM: null, seal: { entry: 0.5, a: 0.5, b: 0.5 }, data: {}, hist: [], steps: [step], step });
  if (a.kind === 'chainCard') {   // the car chain's entry step as the tile-L card (test copy only: edits the save, like FORCE_JS)
    S.chains.car = chain('card', 's1'); const pos = W.board.indexOf('L');
    st.pending = { id: 900 + a.n, type: 'life', tile: 'L', pos, month: st.month, eventId: CH.CHAINS.car.entry.card, r: 0.5, chain: { id: 'car', step: 's1' }, k0: st.actions.length };
    st.phase = 'event'; st.pos = pos;
  }
  if (a.kind === 'inbox') {       // the next car step as an inbox item; keeps the chain data the real s1 choice wrote
    const c = S.chains.car && S.chains.car.stage !== 'done' ? S.chains.car : (S.chains.car = chain('item', a.step));
    c.stage = 'item'; c.nextAt = null; c.nextStep = null;
    const it = { id: S.nextId++, kind: 'chain', chain: 'car', step: a.step, createdM: st.month, due: st.month + 2, seal: { a: 0.5, b: 0.5 }, data: {} };
    S.inbox.push(it); c.item = it.id; c.step = a.step; if (!c.steps.includes(a.step)) c.steps.push(a.step);
    st.pending = null; st.phase = 'roll';
  }
  if (a.kind === 'biz') {         // w1 teacher, seed 33: a toy shop (lean setup) played by the engine until its first decision item is open
    st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 33, mode: 'free', mentor: 'guide' });
    st.cash = 60000; st.pending = null; st.pos = W.board.indexOf('K'); st.phase = 'land';
    let ev = E.landing(st); E.choose(st, ev, 'start:lean'); let found = false;
    for (let t = 0; t < 200 && !st.over && !found; t++) {
      E.rollDice(st); let e = E.landing(st) || E.currentEvent(st); let n = 0;
      while (e && n++ < 8) {
        if (e.type === 'business' && e.data.mode === 'manage') { E.choose(st, e, 'ok'); break; }
        const o = E.inbox(st).some((c) => c.kind === 'biz') ? (e.options.find((x) => ['ok', 'pass', 'skip', 'done'].includes(x.id) && x.enabled) || e.options.find((x) => x.enabled)) : (e.options.find((x) => x.primary && x.enabled) || e.options.find((x) => x.enabled && !/^offer|inspect/.test(x.id)) || e.options[0]);
        const r = E.choose(st, e, o.id, o.needsQty ? { qty: 1 } : {}); if (!r.ok) { const o2 = e.options.find((x) => ['ok', 'pass', 'skip'].includes(x.id)); if (!o2) break; E.choose(st, e, o2.id); break; }
        e = r.event;
      }
      found = !st.pending && E.inbox(st).some((c) => c.kind === 'biz');
    }
    if (!found) throw new Error('no business item');
    st.pending = null; st.pos = W.board.indexOf('K'); st.phase = 'land';
    sv.cfg = { ...sv.cfg, worldId: 'w1', charId: 'teacher', seed: 33 };
  }
  if (a.kind === 'practice') { st.lessons = [...new Set([...(st.lessons || []), 'emergency_fund'])]; st.turn = Math.max(st.turn || 0, 6); st.pending = null; st.phase = 'roll'; }
  if (a.kind === 'dream') { st = E.createGame({ worldId: st.worldId, charId: st.charId, seed: st.seed, mode: 'free', dream: 'biz', mentor: st.mentor }); }
  st.ui = { ...(ui0 || {}), ...(st.ui || {}), ibSeen: a.kind === 'inbox' && a.auto ? [] : ((ui0 && ui0.ibSeen) || []) };
  sv.state = JSON.parse(E.serialize(st)); localStorage.setItem(key, JSON.stringify(sv));
  g.startGame({ ...sv.cfg, resume: true }); window.__seeded = 'started:' + a.n;
})().catch((e) => { window.__seeded = 'error: ' + e; console.error(e); }); }"""
SEEDN = [0]
async def seed(pg, world, kind, **kw):
    SEEDN[0] += 1; n = SEEDN[0]
    await pg.evaluate(SEED_JS, {'world': world, 'kind': kind, 'n': n, **kw})
    await pg.wait_for_function("(n) => window.__seeded === 'started:' + n || String(window.__seeded).startsWith('error')", arg=n, timeout=60000)
    assert not str(await pg.evaluate('() => window.__seeded')).startswith('error'), 'seed failed: ' + str(await pg.evaluate('() => window.__seeded'))
    await pg.wait_for_function("() => !document.querySelector('#evm').hidden || !document.querySelector('#roll').disabled", timeout=60000)
    await pg.wait_for_timeout(400)
    return await wait_idle(pg)
async def shot(pg, name, sfx=''):
    await pg.wait_for_timeout(500); path = f'{SHOTS}/{PFX}{name}{sfx}.png'; await pg.screenshot(path=path); log('  shot', path)
async def card_shot(pg, name, sfx='', scroll_to=None):
    if scroll_to: await pg.evaluate("(q) => { const c = document.querySelector('#evCard'); const el = c.querySelector(q); if (el) c.scrollTop = el.offsetTop - 70; }", scroll_to)
    await shot(pg, name, sfx)
async def last_action(pg, world):
    return await pg.evaluate("(k) => { const s = JSON.parse(localStorage.getItem(k)).state; return s.actions[s.actions.length - 1]; }", 'rr2-save-free-' + world)
async def clear_cards(pg, rnd, tag):
    s = await wait_idle(pg)
    for _ in range(12):
        if not s['card']: break
        await handle_card(pg, rnd, tag, s); s = await wait_idle(pg)
    if s['coach']: await pg.click('#coach [data-c="next"]'); await pg.wait_for_timeout(300)
    return s

async def test_t3(b, phone=False):
    """T3 UI: chain card (tile L) with signed chips / totals / odds, the inbox (chip, list, card, "אחר כך", default), auto-open after
    the roll before the landing card, the layered business card with an open decision (q: → resolveStory), offer setups, practice + dream."""
    vp = {'width': 390, 'height': 844} if phone else {'width': 1300, 'height': 820}
    ctx = await b.new_context(viewport=vp, device_scale_factor=1, has_touch=phone, is_mobile=phone)
    pg = await ctx.new_page(); tag = 't3' + ('-phone' if phone else ''); attach(pg, tag); sfx = '_phone' if phone else ''; rnd = random.Random(3)
    await pg.goto(BASE); await pg.evaluate("() => localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true}))")
    await start_world(pg, 'w2', 0); await clear_cards(pg, rnd, tag)
    # 1) chain entry card (tile L): life chips from `flow` — the bus saving is +/green, the lease cost −/red; totals; odds "במשחק"
    s = await seed(pg, 'w2', 'chainCard')
    assert s['card'] and s['type'] == 'life', f'chain card did not open: {s}'
    info = await pg.evaluate("""() => { const c = document.querySelector('#evCard'); const t = (q) => (c.querySelector(q) || {}).textContent || '';
      const fx = (id) => [...c.querySelectorAll(`button[data-o="${id}"] .fx`)].map((e) => [e.textContent.replace(/[\u2066-\u2069\u2060]/g, ''), e.className]);
      return { bus: fx('bus'), lease: fx('new'), tot: c.querySelectorAll('.choice .tot').length, odds: t('.choice .godds'), hint: t('.godds.hintl'), step: t('.chipline .b.step'), cush: t('.note.cush') }; }""")
    log(tag, 'chain card', json.dumps(info, ensure_ascii=False))
    assert any('+' in x[0] and 'בחודש' in x[0] and 'pos' in x[1] for x in info['bus']), 'bus: +₪ בחודש in green'
    assert any('−' in x[0] and 'בחודש' in x[0] and 'neg' in x[1] for x in info['lease']), 'lease: −₪ בחודש in red'
    assert info['tot'] >= 2 and 'במשחק' in info['odds'] and 'במשחק' in info['hint'], 'totals + odds labelled במשחק'
    assert 'שלב' in info['step'] and 'כרית' in info['cush'], 'progress chip + cushion line'
    assert not await pg.evaluate(SIGN_JS), 'sign check'
    await card_shot(pg, 't3_chain_card', sfx, '.choices')
    await pg.click('#evCard button[data-o="fix"]'); s = await clear_cards(pg, rnd, tag)
    # 2) inbox: the 📬 chip → the card itself (one item): "זוכר?" line, default marked + announced, "אחר כך" keeps it open
    s = await seed(pg, 'w2', 'inbox', step='s2fix')
    assert await pg.locator('#hLife .lc.inbox').count() == 1, '📬 chip shown'
    assert '1' in await pg.inner_text('#hLife .lc.inbox'), '📬 count'
    await shot(pg, 't3_inbox_chip', sfx)
    await pg.click('#hLife .lc.inbox'); await pg.wait_for_selector('#evCard.ev-story', timeout=20000); await pg.wait_for_timeout(400)
    ib = await pg.evaluate("""() => { const c = document.querySelector('#evCard'); const d = c.querySelector('.choice.dflt');
      return { rem: (c.querySelector('.remember') || {}).textContent || '', dfl: (c.querySelector('#evDflt') || {}).textContent || '', desc: d ? d.getAttribute('aria-describedby') : '', later: !!c.querySelector('[data-later]'), due: (c.querySelector('.b.due') || {}).textContent || '' }; }""")
    log(tag, 'inbox card', json.dumps(ib, ensure_ascii=False))
    assert 'זוכר' in ib['rem'], '"זוכר?" memory line'
    assert ib['dfl'].startswith('אם לא תחליט') and 'evDflt' in (ib['desc'] or ''), 'default line + aria-describedby'
    assert ib['later'] and 'משכור' in ib['due'], '"אחר כך" + due chip'
    await card_shot(pg, 't3_inbox_card', sfx)
    await pg.click('#evCard [data-later]'); await pg.wait_for_timeout(500)
    s = await st(pg); assert not s['card'] and await pg.locator('#hLife .lc.inbox').count() == 1, '"אחר כך" closes, the item stays'
    await pg.click('#hLife .lc.inbox'); await pg.wait_for_selector('#evCard.ev-story', timeout=20000)
    await pg.click('#evCard button[data-o="swap"]'); await pg.wait_for_timeout(800)
    a = await last_action(pg, 'w2'); assert a[0] == 'Q' and a[2] == 'swap', f'resolveStory logged Q: {a}'
    assert await pg.locator('#hLife .lc.inbox').count() == 0, '📬 chip gone after the decision'
    s = await clear_cards(pg, rnd, tag)
    # 3) auto-open: a NEW chain item opens after the roll and before the landing card
    s = await seed(pg, 'w2', 'inbox', step='s2fix', auto=True)
    await pg.click('#roll')
    await pg.wait_for_function("() => !document.querySelector('#evm').hidden", timeout=60000); await pg.wait_for_timeout(400)
    s = await st(pg); assert s['type'] == 'story', f'the inbox item opens first, got {s["type"]} "{s["title"]}"'
    STATS['t3_autoopen' + sfx] = 1
    await pg.click('#evCard button.choice.dflt'); await pg.wait_for_timeout(600)
    s = await clear_cards(pg, rnd, tag)
    # 4) the layered business card with an open decision first (w1 toy shop)
    await pg.goto(BASE); await start_world(pg, 'w1', 0); await clear_cards(pg, rnd, tag)
    s = await seed(pg, 'w1', 'biz')
    assert s['card'] and s['type'] == 'business', f'manage card: {s}'
    bz = await pg.evaluate("""() => { const c = document.querySelector('#evCard');
      return { q: c.querySelectorAll('.bizq button[data-o^="q:"]').length, l1: c.querySelectorAll('.l1 .l1n').length + (c.querySelector('.l1e') ? 3 : 0), bars: c.querySelectorAll('.seasons .sbars i').length,
        stage: !!c.querySelector('.bizstage .pips'), order: c.querySelector('.bizq') && c.querySelector('.bizgrid') ? (c.querySelector('.bizq').compareDocumentPosition(c.querySelector('.bizgrid')) & 4) > 0 : false, dfl: !!c.querySelector('.bizq .choice.dflt') }; }""")
    log(tag, 'business card', bz)
    assert bz['q'] >= 2 and bz['l1'] == 3 and bz['bars'] == 12 and bz['stage'] and bz['order'] and bz['dfl'], f'layered card: {bz}'
    await card_shot(pg, 't3_biz_card', sfx)
    await pg.evaluate("() => { const d = document.querySelector('#evCard details.bizl2'); if (d) d.open = true; }")
    await card_shot(pg, 't3_biz_details', sfx, 'details.bizl2')
    qid = await pg.evaluate("() => document.querySelector('#evCard .bizq button[data-o^=\"q:\"]:not(.dflt)').dataset.o")
    await pg.click(f'#evCard button[data-o="{qid}"]'); await pg.wait_for_timeout(800)
    a = await last_action(pg, 'w1'); assert a[0] == 'Q', f'q: option → resolveStory (Q): {a}'
    s = await st(pg); assert s['card'] and s['type'] == 'business' and await pg.locator('#evCard .bizq').count() == 0, 'the card stays open, the item is gone'
    await pg.click('#evCard button[data-o="ok"]'); s = await clear_cards(pg, rnd, tag)
    # 5) offer setups (a fresh w1 game: no business yet)
    await pg.goto(BASE); await start_world(pg, 'w1', 1); await clear_cards(pg, rnd, tag)
    for i in range(3):
        s = await force_card(pg, 'w1', 'K', {'cash': 90000}, 'business')
        if s['card'] and s['type'] == 'business': break
    of = await pg.evaluate("() => ({ setups: document.querySelectorAll('#evCard .choice.setup').length, bars: document.querySelectorAll('#evCard .sbars i').length, cash: [...document.querySelectorAll('#evCard .choice.setup .fx')].some((e) => e.textContent.includes('קופה')) })")
    log(tag, 'offer card', of)
    assert of['setups'] >= 2 and of['bars'] == 12 and of['cash'], f'offer setups + seasons: {of}'
    await card_shot(pg, 't3_offer_setups', sfx)
    await pg.click('#evCard button[data-o="pass"]'); s = await clear_cards(pg, rnd, tag)
    # 6) T4 practice chip (free game, turn ≥ 4, a practice lesson unlocked): offered between turns, answered through E.answerPractice (K)
    s = await seed(pg, 'w1', 'practice')
    await pg.click('#roll'); s = await clear_cards(pg, rnd, tag)
    ok = False
    for _ in range(20):
        if await pg.locator('#practiceChip').count(): ok = True; break
        await pg.wait_for_timeout(300)
    assert ok, 'practice chip offered'
    await shot(pg, 't4_practice_chip', sfx)
    await pg.click('#practiceChip'); await pg.wait_for_selector('#gm:not([hidden]) [data-pa]', timeout=10000)
    await pg.click('#gm [data-pa="0"]'); await pg.wait_for_selector('#gm .pres p', timeout=10000)
    await shot(pg, 't4_practice_answer', sfx)
    a = await last_action(pg, 'w1'); assert a[0] == 'K', f'practice logged K: {a}'
    await pg.click('#gm .acts button'); await pg.wait_for_timeout(300)
    # 7) T4 dream chip + missions
    s = await seed(pg, 'w1', 'dream'); await clear_cards(pg, rnd, tag)
    assert await pg.locator('#hDream:not([hidden])').count() == 1, 'dream chip'
    await pg.click('#hDream'); await pg.wait_for_selector('#gm:not([hidden]) .dms li', timeout=10000)
    await shot(pg, 't4_dream', sfx)
    await pg.click('#gm .acts button')
    log(tag, 'T3 / T4 in-game checks passed'); STATS['t3' + sfx] = 1
    await ctx.close()

async def test_intro(b, phone=True):
    """T4 first minute (tutorial w1): salary → glitch → choice → effect → next goal, with the gradual HUD reveal."""
    vp = {'width': 390, 'height': 844} if phone else {'width': 1300, 'height': 820}
    ctx = await b.new_context(viewport=vp, device_scale_factor=1, has_touch=phone, is_mobile=phone)
    pg = await ctx.new_page(); tag = 'intro' + ('-phone' if phone else ''); attach(pg, tag); sfx = '_phone' if phone else ''
    t0 = time.time(); await pg.goto(BASE)
    await start_world(pg, 'w1', 0, tutorial=True)
    await pg.wait_for_selector('#evCard.ev-intro', timeout=60000); await pg.wait_for_timeout(500)
    r1 = await pg.evaluate("""() => ({ net: document.querySelector('#evCard .grid').textContent, cf: !document.querySelector('#hCf').closest('.stat').hidden,
      goal: document.querySelector('#hGoal').hidden, en: !!document.querySelector('#hLife .lc.en') && document.querySelector('#hLife .lc.en').hidden, reveal: JSON.parse(localStorage.getItem('rr2-save-free-w1')).state.ui.reveal })""")
    log(tag, 'beat 1', json.dumps(r1, ensure_ascii=False))
    assert '₪0' not in r1['net'].replace('\u2066', '').replace('\u2069', '')[:40] or 'נטו' in r1['net'], 'salary rows'
    assert r1['reveal'] and r1['cf'] and r1['goal'] and r1['en'], f'gradual reveal: cf shown, meter + 🔋 hidden ({r1})'
    await shot(pg, 't4_intro1_salary', sfx)
    await pg.click('[data-intro-opt="next"]'); await pg.wait_for_selector('[data-intro-opt="fix:pay"]', timeout=20000)
    log(tag, 'first decision enabled after', round(time.time() - t0, 1), 's'); STATS['intro_first_decision_s'] = round(time.time() - t0, 1)
    chips = await pg.evaluate("() => [...document.querySelectorAll('[data-intro-opt=\"fix:inst\"] .fx')].map((e) => [e.textContent, e.className])")
    assert any('בחודש' in c[0] and 'neg' in c[1] for c in chips), f'installments: a red monthly cost ({chips})'
    await shot(pg, 't4_intro2_glitch', sfx)
    await pg.click('[data-intro-opt="fix:inst"]'); await pg.wait_for_selector('[data-intro-opt="go"]', timeout=20000); await pg.wait_for_timeout(500)
    r3 = await pg.evaluate("() => ({ rows: document.querySelectorAll('#evCard .grid .row').length, goal: (document.querySelector('#evCard .nextgoal') || {}).textContent || '' })")
    assert r3['rows'] >= 1 and 'המטרה הבאה' in r3['goal'], f'result rows + next goal ({r3})'
    await shot(pg, 't4_intro3_result', sfx)
    await pg.click('[data-intro-opt="go"]'); await pg.wait_for_timeout(900)
    r4 = await pg.evaluate("() => ({ next: !!document.querySelector('#hNext:not([hidden])'), txt: (document.querySelector('#hNext') || {}).textContent || '', keys: JSON.parse(localStorage.getItem('rr2-save-free-w1')).state.ui.reveal.keys, coach: !document.querySelector('#coach').hidden })")
    log(tag, 'after the intro', json.dumps(r4, ensure_ascii=False))
    assert r4['next'] and 'cf' in r4['keys'] and 'next' in r4['keys'], f'#hNext + reveal keys ({r4})'
    await shot(pg, 't4_intro4_next', sfx)
    log(tag, 'first-minute checks passed'); STATS['intro' + sfx] = 1
    await ctx.close()

async def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    worlds = (args[0] if args else 'w1,w2,w3,w4').split(',')
    turns = int(args[1]) if len(args) > 1 else 16
    phone = '--phone' in sys.argv; hq = '--hq' in sys.argv
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        _nc = b.new_context
        async def guarded(**kw):   # every context gets the Supabase guard; this suite's own page routes keep priority
            ctx = await _nc(**{**FB.new_context_kwargs(), **kw}); GUARDS.append(await FB.install(ctx, None)); return ctx
        b.new_context = guarded
        if '--stub' in sys.argv: await test_stub(b)
        if '--end' in sys.argv: await test_end(b)
        if '--bail' in sys.argv: await test_bailout(b, phone)
        if '--tut' in sys.argv: await test_tutorial(b, phone)
        if '--nl' in sys.argv: await test_nextlevel(b, phone)
        if '--intro' in sys.argv: await test_intro(b, phone)
        if '--t3' in sys.argv: await test_t3(b, phone)
        if '--nov32' not in sys.argv: await test_v32(b, phone)
        if '--noplay' not in sys.argv:
            for w in worlds:
                t0 = time.time(); r = await run_world(b, w, turns, phone, hq); log(w, 'done', r, round(time.time() - t0), 's')
        await b.close()
    log('STATS', json.dumps(STATS, ensure_ascii=False))
    for g in GUARDS:
        try: FB.assert_clean(g)
        except AssertionError as e: ERRS.append('guard: ' + str(e))
    log('ERRORS', len(ERRS)); [log('  ', e) for e in ERRS]
    sys.exit(1 if ERRS else 0)

asyncio.run(main())
