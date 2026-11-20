# v3b lobby tests (stub game). Usage: python3 tests/lobby_v3b.py [base_url] [--no-live]
#  1. XSS: every server / other-player field the lobby renders (nicknames, group names, challenge titles, feed data, board
#     numbers, pawns, member stars, group counts) is filled with <img onerror> / attribute-breakout payloads (mocked backend)
#     → nothing executes, no element or on* attribute is injected, the payload shows as text.
#  2. CSP: a strict CSP without 'unsafe-inline' scripts → no script violations, broken art still hides itself.
#  3. Server verification (mocked backend): finish → verify, 503 engine_unavailable queues a retry ("later" note), the retry
#     verifies without a second finish, `actions` never inside finish stats, ✓ / ⚠ notes, ✓ / ⚠ board marks.
#  4. Learning feedback: decisions-vs-luck bars, explanation, improved / missed principle, profile "מה למדתי"; hidden without data.
#  5. Quiz reward:'lesson' → +1⚡ (live bus 'reward' + end-of-game catch-up, never twice).
#  6. LIVE (טסט players): real server echoes injected nickname / group name / challenge title / feed data → escaped.
# Screenshots → /tmp/lbshots/v3b_*.png (desktop 1300×820 + phone 390×800, light/dark).
import asyncio, sys, json, random, re, hashlib, base64, time
from playwright.async_api import async_playwright
ARGV = [a for a in sys.argv[1:] if not a.startswith('--')]
BASE = ARGV[0] if ARGV else 'http://localhost:8771/'
LIVE = '--no-live' not in sys.argv
SHOT = '/tmp/lbshots/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
SB = 'https://xvqaxphyfqdzkddmoosu.supabase.co'
TAG = str(random.randint(100, 999))
results = []
def log(*a): print(*a, flush=True)
def check(c, m): results.append((bool(c), m)); log(('PASS ' if c else 'FAIL ') + m)
DESK = {'width': 1300, 'height': 820}; PHONE = {'width': 390, 'height': 800}
CONFIGS = [('desk_light', DESK, 'light'), ('desk_dark', DESK, 'dark'), ('phone_light', PHONE, 'light'), ('phone_dark', PHONE, 'dark')]

X1 = '<img src=x onerror="window.__xss=(window.__xss||0)+1">'
X2 = '"><img src=x onerror=window.__xss=1>'
X3 = "' onmouseover='window.__xss=1' x='"
X4 = '<svg onload=window.__xss=1>'
XS = '<img src=x onerror=__xss=1>'      # short enough for live nickname / group-name limits
ME = {'id': '0b0b0b0b-0000-4000-8000-00000000c0de', 'secret': 'mock-secret', 'nickname': 'טסט־מוק'}
FUT = '2099-01-01T00:00:00Z'

def rows(verified=True):
    return [
        {'nickname': X1, 'status': 'won', 'months': X1, 'pawn': X2, 'stars': X1, 'me': False, 'verified': True, 'progress': 1},
        {'nickname': 'טסט־מאומת', 'status': 'won', 'months': 15, 'pawn': 'car', 'stars': 4, 'verified': True, 'progress': 1},
        {'nickname': ME['nickname'], 'status': 'lost', 'months': 24, 'pawn': 'classic', 'stars': 2, 'me': True, 'verified': verified, 'progress': 0.81},
        {'nickname': X3, 'status': 'lost', 'months': 24, 'pawn': '__proto__', 'stars': 1, 'verified': None, 'progress': 0.6},
        {'nickname': 'טסט־זייפן', 'status': 'won', 'months': 3, 'pawn': 'constructor', 'stars': 12, 'verified': False, 'progress': 1},
        {'nickname': X4, 'status': 'playing', 'months': 4, 'progress': X1},
    ]

class Mock:
    def __init__(s):
        s.calls = []; s.verify_queue = []; s.finish_err = None; s.my_verified = True
    def profile(s):
        return {'id': ME['id'], 'nickname': ME['nickname'], 'stars': {}, 'total_stars': 0, 'achievements': [], 'pawn': 'classic', 'daily_streak': 0, 'best_streak': 0, 'last_daily': None, 'meta': {}}
    def answer(s, fn, b):
        if fn in ('rr_profile', 'rr_sync_progress2'): return s.profile()
        if fn == 'rr_claim_energy': return {'total': 0, 'from': []}
        if fn == 'rr_daily': return {'key': 'd', 'world': 'w1', 'char_index': 0, 'max_months': X1, 'ends_at': FUT, 'my_status': None, 'streak': X1, 'board': rows(s.my_verified)}
        if fn == 'rr_weekly': return {'key': 'w', 'world': 'w1', 'char_index': 1, 'ends_at': FUT, 'my_status': None, 'board': rows(s.my_verified)}
        if fn == 'rr_my_groups': return [{'id': 'g1', 'code': 'ABC123', 'name': X1, 'is_owner': True, 'members': X1, 'active': X2}]
        if fn == 'rr_group':
            return {'id': 'g1', 'code': 'ABC123', 'name': X1, 'is_owner': True,
                    'members': [{'nickname': X1, 'owner': True, 'me': False, 'stars': X1, 'pawn': X2}, {'nickname': X3, 'stars': 3, 'pawn': 'tophat'}, {'nickname': ME['nickname'], 'me': True, 'stars': 2, 'pawn': 'car'}],
                    'challenges': [{'id': 'c1', 'title': X1, 'profession': X2, 'world': X1, 'starts_at': FUT, 'ends_at': FUT, 'active': True, 'my_status': None, 'board': rows(s.my_verified)},
                                   {'id': 'c2', 'title': X4, 'profession': 'teacher', 'world': 'w1', 'starts_at': FUT, 'ends_at': X1, 'active': False, 'my_status': 'won', 'board': []}]}
        if fn == 'rr_group_feed':
            return {'gifted_today': [X1], 'feed': [
                {'nickname': X1, 'kind': 'escaped', 'data': {'world': X1, 'age': X1, 'months': X1, 'stars': -1}, 'at': X1, 'me': False},
                {'nickname': X2, 'kind': 'ranked_won', 'data': {'title': X1, 'mode': X1, 'months': X2, 'stars': X1}, 'at': '2026-11-20T10:00:00Z'},
                {'nickname': X3, 'kind': 'ranked_won', 'data': {'mode': '__proto__', 'months': '7', 'stars': 2}, 'at': '2026-11-20T10:00:00Z'},
                {'nickname': X4, 'kind': 'ranked_lost', 'data': {'title': X2, 'progress': X1}, 'at': '2026-11-20T10:00:00Z'},
                {'nickname': X1, 'kind': 'ranked_lost', 'data': {'mode': 'daily', 'stats': {'progress': X1}}, 'at': '2026-11-20T10:00:00Z'},
                {'nickname': X1, 'kind': 'history_done', 'data': {'scenario': X1, 'beat': True, 'stars': 99}, 'at': '2026-11-20T10:00:00Z'},
                {'nickname': X1, 'kind': 'stars3', 'data': {'world': X1}, 'at': '2026-11-20T10:00:00Z'},
                {'nickname': X1, 'kind': 'world_unlocked', 'data': {'world': 'constructor'}, 'at': '2026-11-20T10:00:00Z'},
                {'nickname': X1, 'kind': X1, 'data': X1, 'at': '2026-11-20T10:00:00Z'},
                {'nickname': X4, 'kind': 'joined', 'data': None, 'at': '2026-11-20T10:00:00Z'},
                {'nickname': X1, 'kind': 'gift', 'data': {}, 'at': '2026-11-20T10:00:00Z'}]}
        if fn == 'rr_begin':
            mode = b.get('p_mode')
            r = {'result_id': f'r-{mode}-{TAG}-{len(s.calls)}', 'status': 'playing', 'seed': 4242, 'world': 'w1', 'char_index': 0, 'max_months': 24 if mode == 'daily' else None,
                 'title': 'טסט אתגר', 'group_id': 'g1' if mode == 'challenge' else None, 'streak': 1, 'checkpoint_turn': 0, 'checkpoint': None}
            if mode == 'challenge': r['char'] = 'teacher'
            return r
        if fn == 'rr_finish':
            if s.finish_err: return (400, {'message': s.finish_err})
            return {'ok': True}
        return {'ok': True}

async def install_mock(ctx, M):
    async def rpc(route, request):
        if request.method == 'OPTIONS':
            return await route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'})
        fn = request.url.split('/rpc/')[1].split('?')[0]
        b = json.loads(request.post_data or '{}')
        M.calls.append((fn, b))
        d = M.answer(fn, b); st = 200
        if isinstance(d, tuple): st, d = d
        await route.fulfill(status=st, content_type='application/json', body=json.dumps(d), headers={'access-control-allow-origin': '*'})
    async def verify(route, request):
        if request.method == 'OPTIONS':
            return await route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'})
        b = json.loads(request.post_data or '{}')
        M.calls.append(('verify', b))
        st, d = M.verify_queue.pop(0) if M.verify_queue else (200, {'ok': True, 'verified': True, 'stored': False, 'result': {}})
        await route.fulfill(status=st, content_type='application/json', body=json.dumps(d), headers={'access-control-allow-origin': '*'})
    await ctx.route(SB + '/rest/v1/rpc/**', rpc)
    await ctx.route(SB + '/functions/v1/verify-result', verify)

async def page(b, vp, scheme, name, mock=None, me=True, csp=None):
    ctx = await b.new_context(viewport=vp, color_scheme=scheme)
    init = "localStorage.setItem('rr2-onboarded','1');"
    if me: init += f"if (!localStorage.getItem('rr-player')) localStorage.setItem('rr-player', {json.dumps(json.dumps(ME))});"
    init += "document.addEventListener('securitypolicyviolation', (e) => (window.__csp ||= []).push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sample || '')));"
    await ctx.add_init_script(init)
    if mock: await install_mock(ctx, mock)
    if csp:
        async def doc(route, request):
            r = await route.fetch(); body = await r.text()
            await route.fulfill(response=r, body=body, headers={**r.headers, 'content-security-policy': csp})
        await ctx.route(re.compile(r'^' + re.escape(BASE) + r'(\?.*)?$'), doc)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: (errs.append(str(e)), log('PAGEERR', name, e)))
    pg.on('console', lambda m: log('CONSOLE', name, m.text) if m.type == 'error' and '404' not in m.text and 'Failed to load' not in m.text else None)
    pg.__errs = errs
    return ctx, pg

async def full(pg, path):
    vp = pg.viewport_size
    h = await pg.evaluate("Math.ceil(document.getElementById('lobby-root').getBoundingClientRect().height + 80)")
    await pg.set_viewport_size({'width': vp['width'], 'height': max(vp['height'], min(h, 7000))}); await pg.wait_for_timeout(400)
    await pg.screenshot(path=path); await pg.set_viewport_size(vp); await pg.wait_for_timeout(200)

INJECTED = """() => {
  const r = document.getElementById('lobby-root'); const bad = [];
  for (const el of r.querySelectorAll('*')) {
    for (const a of el.attributes) if (/^on/i.test(a.name)) bad.push(el.tagName + '[' + a.name + ']');
    if (el.tagName === 'IMG' && el.getAttribute('src') === 'x') bad.push('img[src=x]');
    if (el.tagName.toLowerCase() === 'svg' && !el.closest('.lb-pawn')) bad.push('svg');
    if (el.hasAttribute('x')) bad.push(el.tagName + '[x]');
  }
  return { xss: window.__xss || 0, bad };
}"""

async def no_injection(pg, where):
    await pg.wait_for_timeout(900)
    # hover every list row: an attribute breakout would have added onmouseover
    for sel in ['.lb-board li', '.gp-flist li', '.gp-mlist li']:
        n = await pg.locator(sel).count()
        for i in range(min(n, 6)):
            try: await pg.locator(sel).nth(i).hover(timeout=800)
            except Exception: pass
    r = await pg.evaluate(INJECTED)
    check(r['xss'] == 0 and not r['bad'], f'{where}: nothing injected/executed (xss={r["xss"]}, bad={r["bad"][:4]})')

LEARN1 = {'decisionQuality': 78, 'decisions': 23, 'verdicts': {'strong': 12, 'ok': 7, 'risky': 4},
          'principles': {'cashflow': {'mastery': 0.86, 'n': 7, 'shown': True}, 'cushion': {'mastery': 0.42, 'n': 4, 'shown': True}, 'debt_cost': {'mastery': 0.66, 'n': 3, 'shown': True}, 'time': {'mastery': 0.9, 'n': 5, 'shown': True}},
          'luck': {'total': -26000, 'parts': {'index': -21000, 'angels': -5000}},
          'top': [{'c': 'בניין 4 דירות בעפולה', 'o': 'buy', 'score': 35, 'verdict': 'risky', 'why': 'השאיר אותך בלי כרית'}],
          'sentence': 'ההחלטות שלך היו טובות — המזל פחות. במשחק הבא עם אותן החלטות, סביר שתצא מהר יותר.'}
LEARN2 = {'decisionQuality': 84, 'decisions': 19, 'principles': {'cashflow': 0.9, 'cushion': {'mastery': 0.74, 'n': 5}, 'fees_tax': {'mastery': 0.5, 'n': 2}},
          'luck': {'total': 9000, 'parts': {}}, 'top': [], 'sentence': None}
ACTIONS = [['r'], ['l'], ['c', 'buy', 1]] + [['r'], ['l'], ['c', 'ok']] * 60

async def free_game(pg, char='teacher'):
    await pg.evaluate("import('./js/lobby.js').then(m => m.openLobby({ k: 'world', id: 'w1' }))"); await pg.wait_for_selector('.wv-chars')
    n = await pg.evaluate('(window.__cfgs || []).length')
    await pg.click(f'.wv-char[data-c="{char}"]'); await pg.wait_for_function(f'(window.__cfgs || []).length > {n}', timeout=15000)

async def ranked(pg, act, sel_done='.end-ver, .end-rank .err'):
    n = await pg.evaluate('(window.__cfgs || []).length')
    await pg.evaluate(f"import('./js/lobby.js').then(m => m.openLobby('home'))"); await pg.wait_for_selector('.lb-home')
    await pg.wait_for_selector(f'[data-act="{act}"]', timeout=15000); await pg.click(f'[data-act="{act}"]')
    await pg.wait_for_function(f'(window.__cfgs || []).length > {n}', timeout=15000)
    return await pg.evaluate('window.__lastCfg')

# ------------------------------------------------------------------------------------------------ 1. XSS (mocked backend)
async def xss_mock(b):
    M = Mock(); ctx, pg = await page(b, DESK, 'light', 'xss', mock=M)
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home')
    await pg.wait_for_selector('#lbDaily .lb-board', timeout=15000); await pg.wait_for_selector('#lbWeekly .lb-board'); await pg.wait_for_selector('.lb-gitem')
    await no_injection(pg, 'home: daily/weekly boards + groups list')
    t = await pg.inner_text('#lb-root' if await pg.locator('#lb-root').count() else '#lobby-root')
    check('<img src=x' in t, 'payloads are shown as plain text')
    check('ספרינט 24 חודשים' in await pg.inner_text('#lbDaily'), 'daily max_months "<img…>" → 24')
    gi = await pg.inner_text('.lb-gitem small')
    check('NaN' not in gi and '<' not in gi, f'group counts coerced ({gi})')
    await pg.click('.lb-gitem'); await pg.wait_for_selector('#gpFeed .gp-flist', timeout=15000)
    await no_injection(pg, 'group page: members, challenges, feed')
    feed = await pg.inner_text('#gpFeed')
    check('NaN' not in feed and 'undefined' not in feed, 'feed numbers coerced (no NaN/undefined)')
    check(await pg.locator('.gp-flist li').count() == 11, 'every feed item rendered (no DoS from stars:-1 / odd kinds)')
    await pg.evaluate("import('./js/lobby.js').then(m => m.openLobby('profile'))"); await pg.wait_for_selector('.pf-head')
    await no_injection(pg, 'profile')
    check(not pg.__errs, f'no page errors ({pg.__errs[:2]})')
    await ctx.close()

# ------------------------------------------------------------------------------------------------ 2. CSP without unsafe-inline
async def csp_check(b):
    html = open('/tmp/rr2lobby/index.html', encoding='utf-8').read() if BASE.startswith('http://localhost:8771') else None
    if html is None: log('SKIP csp (unknown test copy)'); return
    im = re.search(r'<script type="importmap">(.*?)</script>', html, re.S).group(1)
    h = base64.b64encode(hashlib.sha256(im.encode()).digest()).decode()
    csp = (f"default-src 'self'; script-src 'self' 'sha256-{h}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; "
           f"img-src 'self' data: blob:; connect-src 'self' {SB}; object-src 'none'; base-uri 'self'")
    M = Mock(); ctx, pg = await page(b, DESK, 'light', 'csp', mock=M, csp=csp)
    await ctx.route('**/assets/history/card.png', lambda r: r.fulfill(status=404, body='nope'))
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home'); await pg.wait_for_timeout(1500)
    check(await pg.evaluate("!!document.querySelector('.map-hist-art img') && getComputedStyle(document.querySelector('.map-hist-art img')).display === 'none'"), 'broken history art hides itself (no inline onerror)')
    await pg.evaluate("import('./js/progress.js').then(P => P._reset({ stars: { w1: 1 }, tutorialDone: true, gamesPlayed: 2 }))")
    await pg.evaluate("import('./js/lobby.js').then(m => m.openLobby('history'))"); await pg.wait_for_selector('.hs-head'); await pg.wait_for_timeout(1200)
    check(await pg.locator('.hs-head img').count() == 0, 'broken history header art removes itself')
    await pg.evaluate("window.__xss = 0; document.getElementById('lobby-root').insertAdjacentHTML('beforeend', '<img src=x onerror=\"window.__xss=1\">')"); await pg.wait_for_timeout(500)
    blocked = await pg.evaluate('window.__xss')
    v = await pg.evaluate("(window.__csp || []).filter((x) => /^script-src/.test(x))")
    check(blocked == 0 and len(v) == 1, f'CSP is really on (a planted inline handler is blocked: {v[:1]})')
    await pg.evaluate("window.__csp = []")
    await free_game(pg); await pg.evaluate("window.__stubEnd('won', 14, { stars: 2 })"); await pg.wait_for_selector('.lb-end'); await pg.wait_for_timeout(2500)
    await pg.click('[data-act="end-lobby"]'); await pg.wait_for_selector('.lb-home'); await pg.click('.lb-gitem'); await pg.wait_for_selector('#gpFeed .gp-flist', timeout=15000)
    await pg.evaluate("import('./js/lobby.js').then(m => m.openLobby('profile'))"); await pg.wait_for_selector('.pf-learn'); await pg.wait_for_timeout(600)
    v = await pg.evaluate("(window.__csp || []).filter((x) => /^script-src/.test(x))")
    check(not v, f'no script CSP violations across home / history / end / group / profile ({v[:2]})')
    check(not pg.__errs, f'no page errors under CSP ({pg.__errs[:2]})')
    await ctx.close()

# ------------------------------------------------------------------------------------------------ 3–5. verify + learning + quiz ⚡
async def verify_flow(b):
    M = Mock(); ctx, pg = await page(b, DESK, 'light', 'verify', mock=M)
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home'); await pg.wait_for_selector('#lbDaily [data-act="daily"]', timeout=15000)
    # daily: verify answers 503 (engine pinned to the next release) → queued, "later" note, board still shown
    M.verify_queue = [(503, {'error': 'engine_unavailable'})]
    cfg = await ranked(pg, 'daily')
    await pg.evaluate("(a) => window.__stubEnd('lost', 24, { summary: { seed: 4242, stats: { quizRight: 0 }, learning: { decisionQuality: 70 }, log: [], actions: a }, learning: %s })" % json.dumps(LEARN1), ACTIONS)
    await pg.wait_for_selector('.end-ver', timeout=20000)
    fin = [c for c in M.calls if c[0] == 'rr_finish']; ver = [c for c in M.calls if c[0] == 'verify']
    check(len(fin) == 1 and 'actions' not in fin[0][1]['p_stats'] and 'learning' in fin[0][1]['p_stats'], 'finish sent once, stats without the action log')
    check(len(ver) == 1 and ver[0][1]['result_id'] == cfg['resultId'] and len(ver[0][1]['actions']) == len(ACTIONS), 'verify called with result id + the full action log')
    check(await pg.get_attribute('.end-ver', 'data-verify') == 'later' and await pg.locator('.end-rank .lb-board').count() == 1, '503 → gentle "later" note, board still loads')
    pend = await pg.evaluate("JSON.parse(localStorage.getItem('rr2-pending-finish') || '[]')")
    check(len(pend) == 1 and pend[0]['finished'] is True and len(pend[0]['actions']) == len(ACTIONS), 'item stays queued as finished, with its log')
    await pg.screenshot(path=SHOT + 'v3b_end_verify_later_desk.png')
    # retry (back online): verify only, no second finish
    M.verify_queue = [(200, {'ok': True, 'verified': True, 'stored': True, 'result': {}})]
    await pg.evaluate("dispatchEvent(new Event('online'))"); await pg.wait_for_timeout(1500)
    fin2 = [c for c in M.calls if c[0] == 'rr_finish']; ver2 = [c for c in M.calls if c[0] == 'verify']
    check(len(fin2) == 1 and len(ver2) == 2 and await pg.evaluate("JSON.parse(localStorage.getItem('rr2-pending-finish') || '[]').length") == 0, 'retry verifies without re-finishing and empties the queue')
    # weekly: rejected claim → ⚠ note, not retried
    M.verify_queue = [(200, {'ok': True, 'verified': False, 'error': 'claim_mismatch', 'result': {}})]; M.my_verified = False
    await pg.click('[data-act="end-lobby"]'); await pg.wait_for_selector('.lb-home')
    await ranked(pg, 'weekly')
    await pg.evaluate("(a) => window.__stubEnd('won', 30, { stars: 1, summary: { seed: 4242, actions: a } })", ACTIONS[:30]); await pg.wait_for_selector('.end-ver', timeout=20000)
    check(await pg.get_attribute('.end-ver', 'data-verify') == 'bad' and 'לא אומתה' in await pg.inner_text('.end-ver'), 'verified:false → ⚠ note on the end screen')
    check(await pg.evaluate("JSON.parse(localStorage.getItem('rr2-pending-finish') || '[]').length") == 0, 'a rejected result is not retried')
    check(await pg.locator('.end-rank li.me.unver .lb-ver.bad').count() == 1, 'my rejected row is dimmed with ⚠ on the board')
    # 409 not_finished → finish again on retry; 422 no_actions → dropped
    M.my_verified = True
    M.verify_queue = [(409, {'error': 'not_finished'}), (200, {'ok': True, 'verified': True, 'already': True})]
    await pg.click('[data-act="end-lobby"]'); await pg.wait_for_selector('.lb-home')
    await pg.evaluate("localStorage.removeItem('rr2-quiz-credit')")
    nf = len([c for c in M.calls if c[0] == 'rr_finish'])
    await ranked(pg, 'daily')
    await pg.evaluate("(a) => window.__stubEnd('won', 20, { stars: 2, summary: { seed: 4242, actions: a } })", ACTIONS[:9]); await pg.wait_for_selector('.end-ver', timeout=20000)
    await pg.evaluate("dispatchEvent(new Event('online'))"); await pg.wait_for_timeout(1500)
    nf2 = len([c for c in M.calls if c[0] == 'rr_finish'])
    check(nf2 - nf == 2 and await pg.evaluate("JSON.parse(localStorage.getItem('rr2-pending-finish') || '[]').length") == 0, f'409 not_finished → finish is sent again, then verified ({nf2 - nf} finishes)')
    M.verify_queue = [(422, {'error': 'no_actions'})]
    await pg.click('[data-act="end-lobby"]'); await pg.wait_for_selector('.lb-home')
    await ranked(pg, 'weekly')
    await pg.evaluate("window.__stubEnd('lost', 30, { summary: { seed: 4242, actions: [['r']] } })"); await pg.wait_for_selector('.end-rank .lb-board', timeout=20000); await pg.wait_for_timeout(500)
    check(await pg.locator('.end-ver').count() == 0 and await pg.evaluate("JSON.parse(localStorage.getItem('rr2-pending-finish') || '[]').length") == 0, '422 no_actions → dropped quietly (no note)')
    # v2 payload without a log → finish only, never verify
    nv = len([c for c in M.calls if c[0] == 'verify'])
    await pg.click('[data-act="end-lobby"]'); await pg.wait_for_selector('.lb-home')
    await ranked(pg, 'daily')
    await pg.evaluate("window.__stubEnd('lost', 24)"); await pg.wait_for_selector('.end-rank .lb-board', timeout=20000); await pg.wait_for_timeout(500)
    check(len([c for c in M.calls if c[0] == 'verify']) == nv, 'no action log → no verify call')
    # challenge: verified → ✓ note
    M.verify_queue = [(200, {'ok': True, 'verified': True, 'stored': True, 'result': {}})]
    await pg.evaluate("import('./js/lobby.js').then(m => m.openLobby({ k: 'group', id: 'g1' }))"); await pg.wait_for_selector('[data-act="chal"]', timeout=15000)
    n = await pg.evaluate('(window.__cfgs || []).length'); await pg.click('[data-act="chal"]'); await pg.wait_for_function(f'(window.__cfgs || []).length > {n}', timeout=15000)
    await pg.evaluate("(a) => window.__stubEnd('won', 16, { stars: 2, summary: { seed: 4242, actions: a } })", ACTIONS[:12]); await pg.wait_for_selector('.end-ver', timeout=20000)
    check(await pg.get_attribute('.end-ver', 'data-verify') == 'ok' and 'אומתה בשרת' in await pg.inner_text('.end-ver'), 'verified:true → "✓ התוצאה אומתה בשרת"')
    check(not pg.__errs, f'no page errors ({pg.__errs[:2]})')
    await ctx.close()

async def learning_flow(b):
    M = Mock(); ctx, pg = await page(b, DESK, 'light', 'learn', mock=M)
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home')
    await pg.evaluate("import('./js/progress.js').then(P => P._reset({ tutorialDone: true, gamesPlayed: 1 }))")
    await pg.evaluate("import('./js/lobby.js').then(m => m.openLobby('profile'))"); await pg.wait_for_selector('.pf-learn')
    check(await pg.locator('.pf-learn .lb-empty').count() == 1, 'profile: "מה למדתי" empty state before any data')
    # no learning block → hidden
    await free_game(pg); await pg.evaluate("window.__stubEnd('lost', 60)"); await pg.wait_for_selector('.lb-end'); await pg.wait_for_timeout(600)
    check(await pg.locator('.end-learn').count() == 0, 'end screen: no learning block when the engine sends none')
    # quiz ⚡: live reward events + catch-up at the end
    await pg.evaluate("import('./js/energy.js').then(E => E._reset({ e: 10, at: Date.now() }))")
    await free_game(pg)
    await pg.evaluate("window.__bus.emit('reward', { kind: 'lesson', lesson: 'cashflow', right: true })")
    await pg.evaluate("window.__bus.emit('reward', { kind: 'lesson', lesson: 'cashflow', right: false })")
    await pg.evaluate("window.__bus.emit('reward', { kind: 'money', right: true })")
    e1 = await pg.evaluate("import('./js/energy.js').then(E => E.get())")
    check(e1 == 11, f'right quiz answer (reward:lesson) → +1⚡, wrong / other rewards → nothing ({e1})')
    await pg.evaluate("window.__stubEnd('lost', 50, { stats: { quizRight: 3, quizWrong: 1 }, learning: %s })" % json.dumps(LEARN1)); await pg.wait_for_selector('.end-learn'); await pg.wait_for_timeout(3500)
    e2 = await pg.evaluate("import('./js/energy.js').then(E => E.get())")
    check(e2 == 13 and '+2⚡' in await pg.inner_text('.end-new'), f'end of game pays only the missing quiz ⚡ (+2 → {e2})')
    await pg.evaluate("window.__bus.emit('game:end', window.__lastEnd)"); await pg.wait_for_timeout(1200)
    check(await pg.evaluate("import('./js/energy.js').then(E => E.get())") == 13, 'the same game:end twice never pays twice')
    L = await pg.inner_text('.end-learn')
    check('איכות ההחלטות' in L and 'מזל' in L and '78/100' in L, 'two bars: decision quality vs luck')
    check(await pg.evaluate("parseFloat(document.querySelector('.lr-bar.dq i').style.width)") == 78 and await pg.locator('.lr-bar.luck i.neg').count() == 1, 'bar widths: quality 78%, luck against you')
    check('המזל פחות' in L, 'one-line explanation from the engine')
    check('כדאי לחזק' in L and 'כרית ביטחון' in L, 'weakest principle (cushion 42%) shown')
    check('הכי חזק' in L and 'זמן ואנרגיה' in L, 'strongest principle shown on the first game')
    check('בניין 4 דירות' in L, 'the decision worth rethinking is named')
    for name, vp, scheme in CONFIGS:
        await pg.set_viewport_size(vp); await pg.emulate_media(color_scheme=scheme); await pg.wait_for_timeout(300)
        await pg.locator('.end-learn').scroll_into_view_if_needed(); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{SHOT}v3b_end_learning_{name}.png')
        await full(pg, f'{SHOT}v3b_end_learning_{name}_full.png')
    await pg.set_viewport_size(DESK); await pg.emulate_media(color_scheme='light')
    # v3.2: ★★★ also needs a 3-month emergency fund (world rules + end-screen explanation)
    await pg.evaluate("import('./js/lobby.js').then(m => m.openLobby({ k: 'world', id: 'w1' }))"); await pg.wait_for_selector('.wv-chars')
    check('קרן חירום 3 חודשים' in await pg.inner_text('.wv-char .wv-th') and '😊 60' in await pg.inner_text('.wv-char .wv-th'), 'world rules: ★★★ needs 😊 60 + 🐷 3-month fund (from starThresholds)')
    await free_game(pg); await pg.evaluate("window.__stubEnd('won', 14, { stars: 2, happiness: 72, fundBlocked: true })"); await pg.wait_for_selector('.end-gate'); await pg.wait_for_timeout(600)
    g = await pg.inner_text('.end-gate')
    check('חסרה קרן חירום של 3 חודשים' in g and 'חופש שלא שורד משבר' in g and '✗' in g, f'end: fund gate explains the missing ★ ({g[:70]!r})')
    await pg.locator('.end-gate').scroll_into_view_if_needed(); await pg.screenshot(path=SHOT + 'v3b_end_fund_gate_desk.png')
    await pg.set_viewport_size(PHONE); await pg.emulate_media(color_scheme='dark'); await pg.wait_for_timeout(300)
    await pg.locator('.end-gate').scroll_into_view_if_needed(); await pg.screenshot(path=SHOT + 'v3b_end_fund_gate_phone_dark.png')
    await pg.set_viewport_size(DESK); await pg.emulate_media(color_scheme='light')
    # second game: cushion improves
    await free_game(pg); await pg.evaluate("window.__stubEnd('won', 18, { stars: 2, learning: %s })" % json.dumps(LEARN2)); await pg.wait_for_selector('.end-learn'); await pg.wait_for_timeout(600)
    L2 = await pg.inner_text('.end-learn')
    check('השתפרת' in L2 and 'כרית ביטחון' in L2 and '42%' in L2 and '74%' in L2, f'improved principle across games ({L2[-90:]!r})')
    check(await pg.locator('.lr-bar.luck i.pos').count() == 1 and 'המזל עזר' in L2, 'positive luck fills the other way')
    check('fees_tax' not in L2 and 'מסים ועמלות' in L2, 'principle ids are translated')
    await pg.evaluate("import('./js/lobby.js').then(m => m.openLobby('profile'))"); await pg.wait_for_selector('.pf-lp')
    P = await pg.inner_text('.pf-learn')
    check('81/100' in P and await pg.locator('.pf-lp li').count() == 5 and await pg.locator('.pf-dqh i').count() == 2, f'profile "מה למדתי": average quality + 5 principles + history')
    check(await pg.locator('.pf-lp li.l1').count() >= 1 and await pg.locator('.pf-lp li.l3').count() >= 1, 'mastery levels (שולט / לחזק)')
    for name, vp, scheme in CONFIGS:
        await pg.set_viewport_size(vp); await pg.emulate_media(color_scheme=scheme); await pg.wait_for_timeout(300)
        await pg.locator('.pf-learn').scroll_into_view_if_needed(); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{SHOT}v3b_profile_learn_{name}.png')
    check(not pg.__errs, f'no page errors ({pg.__errs[:2]})')
    await ctx.close()

async def board_shots(b):
    """Board with ✓ / ⚠ (mocked server rows) + a ranked end screen with learning bars and the ✓ note."""
    for name, vp, scheme in CONFIGS:
        M = Mock(); ctx, pg = await page(b, vp, scheme, 'shots-' + name, mock=M)
        await pg.goto(BASE); await pg.wait_for_selector('#lbWeekly .lb-board', timeout=15000); await pg.wait_for_timeout(600)
        if name == 'desk_light':
            check(await pg.locator('#lbWeekly .lb-ver.ok').count() == 3 and await pg.locator('#lbWeekly .lb-ver.bad').count() == 1 and await pg.locator('#lbWeekly li .lb-ver').count() == 4, 'weekly board: ✓ for verified rows, ⚠ for the rejected one, nothing for unknown')
            check(await pg.locator('#lbDaily li.unver .lb-ver.bad').count() == 1, 'daily board: rejected row ⚠ + dimmed')
        await pg.locator('#lbDaily').scroll_into_view_if_needed(); await pg.wait_for_timeout(200)
        await pg.locator('#lbDaily').screenshot(path=f'{SHOT}v3b_board_verified_{name}.png')
        M.verify_queue = [(200, {'ok': True, 'verified': True, 'stored': True, 'result': {}})]
        await ranked(pg, 'daily')
        await pg.evaluate("(a) => window.__stubEnd('lost', 24, { summary: { seed: 4242, actions: a }, learning: %s, stats: { quizRight: 1 } })" % json.dumps(LEARN1), ACTIONS[:9])
        await pg.wait_for_selector('.end-ver', timeout=20000); await pg.wait_for_timeout(3500)
        await pg.screenshot(path=f'{SHOT}v3b_end_ranked_{name}.png'); await full(pg, f'{SHOT}v3b_end_ranked_{name}_full.png')
        check(not pg.__errs, f'{name}: no page errors')
        await ctx.close()

# ------------------------------------------------------------------------------------------------ 6. LIVE server echo
async def live_xss(b):
    cA, A = await page(b, DESK, 'light', 'liveA', me=False)
    await A.goto(BASE); await A.wait_for_selector('.lb-home')
    nick = f'טסט<img src=x>{TAG}'
    await A.fill('#lb-root-nick', nick); await A.press('#lb-root-nick', 'Enter'); await A.wait_for_selector('#lbDaily .lb-dh-txt', timeout=25000)
    check(await A.evaluate("JSON.parse(localStorage.getItem('rr-player')).nickname") == nick, f'live: server accepted the HTML-ish nickname')
    await no_injection(A, 'live: own header with HTML nickname')
    gname = f'טסט {XS}{TAG}'
    await A.fill('#lbGname', gname); await A.press('#lbGname', 'Enter'); await A.wait_for_selector('.gp-code', timeout=25000)
    gid = await A.evaluate("document.querySelector('[data-form=newchal]').dataset.g"); code = await A.inner_text('.gp-code')
    await A.fill('[data-form=newchal] input[name=title]', XS); await A.click('[data-form=newchal] button'); await A.wait_for_selector('.gp-chal', timeout=25000)
    await A.evaluate("""async (x) => { const { net } = await import('./js/net.js');
      await net.logEvent('escaped', { world: x, age: x, months: x, stars: -1 });
      await net.logEvent('ranked_won', { title: x, mode: x, months: x, stars: x });
      await net.logEvent('history_done', { scenario: x, beat: true, stars: 7 }); }""", XS)
    cB, B = await page(b, PHONE, 'dark', 'liveB', me=False)
    await B.goto(BASE + '?join=' + code); await B.wait_for_selector('.lb-invite', timeout=30000)
    await B.fill('#lb-root-nick', f'טסט<svg>{TAG}'); await B.press('#lb-root-nick', 'Enter'); await B.wait_for_selector('.gp-code', timeout=30000)
    await B.wait_for_function("document.querySelector('#gpFeed .gp-flist') && document.querySelectorAll('#gpFeed .gp-flist li').length >= 3", timeout=30000)
    t = await B.inner_text('#lobby-root')
    check('<img src=x' in t and nick in t, 'live: B sees the injected strings as text')
    await no_injection(B, 'live: B — group name, members, challenge title, feed from A')
    await B.screenshot(path=SHOT + 'v3b_live_xss_group_phone_dark.png'); await full(B, SHOT + 'v3b_live_xss_group_phone_dark_full.png')
    await B.click('[data-act="home"]'); await B.wait_for_selector('.lb-gitem', timeout=20000)
    await no_injection(B, 'live: B home — groups list')
    for P_, c in ((A, cA), (B, cB)):
        try: await P_.evaluate("(g) => import('./js/net.js').then(({ net }) => net.leaveGroup(g))", gid)
        except Exception as e: log('leave failed', e)
    check(not A.__errs and not B.__errs, 'live: no page errors')
    await cA.close(); await cB.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        only = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--only=')), None)
        for fn in (xss_mock, csp_check, verify_flow, learning_flow, board_shots) + ((live_xss,) if LIVE else ()):
            if only and fn.__name__ not in only: continue
            try: await fn(b)
            except Exception as e: check(False, f'{fn.__name__} crashed: {e!r}'[:400])
            log('done', fn.__name__)
        await b.close()
    fails = [m for ok, m in results if not ok]
    log(f'\n{len(results) - len(fails)}/{len(results)} checks passed'); [log('  FAILED:', m) for m in fails]
asyncio.run(main())
