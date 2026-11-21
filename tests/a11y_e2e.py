#!/usr/bin/env python3
# App-wide accessibility regression net (T7 §4). axe-core (vendored, no network) on every screen of the §4.1 tour that exists in
# the build, keyboard/focus flows K-1…K-10, and the §4.3 checks. Offline: the fake backend with a seeded player (group, challenge,
# finished daily, stars in w1–w2). Usage:
#   python3 tests/a11y_e2e.py [base_url=http://localhost:8772/] [--strict] [--strict-allowlist] [--out=/tmp/t7a11y/run.json] [--only=axe,keys,checks]
# Gate (ratchet): 0 critical/serious axe violations that no tests/a11y_known.json entry matches; --strict ignores the allowlist (AX-3);
# --strict-allowlist also fails on STALE entries. Screens/checks whose feature or harness piece is missing print N/A(...) or
# NOT IMPLEMENTED(...) and are never counted as PASS.
import asyncio, json, os, re, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
HERE = os.path.dirname(os.path.abspath(__file__))
MODE = FB.mode_from_argv()
if MODE == 'live': print('a11y_e2e runs offline only'); sys.exit(2)
BASE = FB.base_url('http://localhost:8772/')
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
STRICT = 'strict' in OPT; STRICT_ALLOW = 'strict-allowlist' in OPT
ONLY = set(OPT['only'].split(',')) if OPT.get('only') else {'axe', 'keys', 'checks'}
OUT = OPT.get('out', f'/tmp/t7a11y/a11y-{int(time.time())}.json')
SHOT = os.environ.get('RR_SHOTS', '/tmp/t7a11y/shots') + '/'
AXE_VERSION = '4.14.1'
AXE = next((p for p in (os.environ.get('RR_AXE'), os.path.join(HERE, 'vendor', 'axe-core', 'axe.min.js'), '/tmp/t/node_modules/axe-core/axe.min.js') if p and os.path.exists(p)), None)
if not AXE: print('axe-core not found: expected tests/vendor/axe-core/axe.min.js (or RR_AXE=<path>). No download is attempted.'); sys.exit(2)
KNOWN = json.load(open(os.path.join(HERE, 'a11y_known.json'), encoding='utf-8'))['entries']
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
TO = 240000
DESK = ('desk_light', {'width': 1300, 'height': 820}, 'light'); PHONE = ('phone_dark', {'width': 390, 'height': 844}, 'dark'); SMALL = ('small_light', {'width': 360, 'height': 740}, 'light')
R = {'meta': {}, 'axe': {}, 'checks': []}; SINKS = []
def log(*a): print(*a, flush=True)
def rec(cid, status, detail=''):
    R['checks'].append({'id': cid, 'status': status, 'detail': detail}); log(f'{status:18} {cid}  {str(detail)[:260]}')

# ---------------------------------------------------------------- fake backend + seeded player
fb = FB.FakeBackend(verify='accept'); fb.set_daily('w1', 0)
ME = fb.seed_player('טסט־נגיש', stars={'w1': 3, 'w2': 2}, pawn='tophat')
FR = fb.seed_player('טסט־חבר', stars={'w1': 1})
G = fb.seed_group(ME, 'טסט קבוצת נגישות', [FR]); CH = fb.seed_challenge(G, world='w1', char='driver')
for p, months, status in ((ME, 24, 'lost'), (FR, 20, 'won')):
    b = {'p_id': p['id'], 'p_secret': p['secret']}
    r = fb.handle('rr_begin', {**b, 'p_mode': 'daily', 'p_challenge': None})[1]
    fb.handle('rr_finish', {**b, 'p_result': r['result_id'], 'p_status': status, 'p_months': months, 'p_passive': 5000, 'p_expenses': 7000, 'p_net_worth': 90000, 'p_stats': {'progress': 0.7, 'stars': 1}})
    fb.handle('rr_log_event', {**b, 'p_kind': 'escaped', 'p_data': {'world': 'w1', 'age': 34, 'months': months}})
PROGRESS = {'stars': {'w1': 3, 'w2': 2}, 'best': {'w1': 14, 'w2': 30}, 'tutorialDone': True, 'gamesPlayed': 5, 'wins': 3, 'seenWorlds': ['w1', 'w2']}
SEED = ("if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded','1'); localStorage.setItem('rr2-onboarded','1');"
        f"localStorage.setItem('rr-player', {json.dumps(json.dumps(ME, ensure_ascii=False))}); localStorage.setItem('rr2-progress', {json.dumps(json.dumps(PROGRESS))}); }}")

async def new_page(b, vp, scheme, seeded=True, reduced=None, **kw):
    ctx = await b.new_context(**FB.new_context_kwargs(), viewport=vp, color_scheme=scheme, reduced_motion=reduced or 'no-preference', **kw)
    SINKS.append(await FB.install(ctx, fb))
    if seeded: await ctx.add_init_script(SEED)
    ctx.set_default_timeout(TO); pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.__errs = errs
    return ctx, pg

QUIET = """() => new Promise((res) => { let t = setTimeout(done, 400); const t0 = performance.now();
  const mo = new MutationObserver(() => { clearTimeout(t); if (performance.now() - t0 > 6000) return done(); t = setTimeout(done, 400); });
  function done() { mo.disconnect(); res(true); } mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true }); })"""
AXE_RUN = """async (inc) => { const r = await axe.run(inc ? { include: [inc] } : document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'] }, resultTypes: ['violations'] });
  return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target.join(' ')) })); }"""

async def axe(pg, screen, inc=None):
    await pg.evaluate(QUIET)
    if not await pg.evaluate("typeof axe !== 'undefined'"):
        await pg.add_script_tag(path=AXE)
        v = await pg.evaluate('axe.version')
        if v != AXE_VERSION and not os.environ.get('RR_AXE'): raise SystemExit(f'axe version {v} != pinned {AXE_VERSION}')
    viol = await pg.evaluate(AXE_RUN, inc)
    R['axe'][screen] = viol
    try: await pg.screenshot(path=f'{SHOT}{screen}.png')
    except Exception: pass  # noqa: BLE001
    log(f'AXE {screen}: ' + ', '.join(f"{x['id']}({x['impact']}×{len(x['nodes'])})" for x in viol))

def na(screen, why): R['axe'][screen] = None; rec('screen ' + screen, why)

async def open_view(pg, view, sel):
    await pg.evaluate(f"import('./js/lobby.js').then(m => m.openLobby({json.dumps(view)}))"); await pg.wait_for_selector(sel, state='visible')

async def start_w1(pg, nth=0):
    await pg.click('.map-card[data-id="w1"]'); await pg.wait_for_selector('.wv-chars')
    await pg.locator('.wv-char').nth(nth).click()
    for i in range(2):
        try: await pg.wait_for_function("!document.querySelector('#roll').disabled && document.querySelector('#start').hidden", timeout=8000 if i == 0 else TO); break
        except Exception:  # noqa: BLE001
            if await pg.locator('#gm:not([hidden]) .acts button.primary').count(): await pg.click('#gm .acts button.primary')
            elif i: raise
    while await pg.evaluate("!!document.querySelector('#coach') && !document.querySelector('#coach').hidden"):
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
        if await pg.evaluate("!!document.querySelector('#coach') && !document.querySelector('#coach').hidden"):
            btn = pg.locator('#coach button').first
            if await btn.count(): await btn.click()
            else: break

async def roll_once(pg):
    await pg.click('#roll')
    await pg.wait_for_function("!document.querySelector('#evm').hidden || !document.querySelector('#roll').disabled || !document.querySelector('#gm').hidden", timeout=TO)
    await pg.wait_for_timeout(1200)
    return await pg.evaluate("!document.querySelector('#evm').hidden")

END_JS = """(st) => import('./js/bus.js').then(m => m.bus.emit('game:end', {status: st, stars: st === 'won' ? 2 : 0, months: st === 'won' ? 22 : 60, netWorth: 240000, passive: 7700, expenses: 7400,
  progress: st === 'won' ? 1 : 0.6, worldId: 'w1', charId: 'driver', mode: 'free', resultId: null, challengeId: null, groupId: null, title: '',
  end: {status: st, reason: st === 'won' ? 'goal' : 'time', months: st === 'won' ? 22 : 60, stars: st === 'won' ? 2 : 0, nearMiss: {text: 'עוד 5 חודשים.'}, tip: 'נסה דמות אחרת.', lesson: 'נכס מכניס כסף לכיס.', achievements: []}, stats: {}}))"""

# ---------------------------------------------------------------- axe tour
async def tour(b, cfg):
    name, vp, scheme = cfg
    ctx, pg = await new_page(b, vp, scheme, seeded=False)          # 1 welcome: empty storage
    await pg.goto(BASE)
    try: await pg.wait_for_selector('.wl-card', state='visible', timeout=60000); await axe(pg, f'01_welcome_{name}')
    except Exception as e: na(f'01_welcome_{name}', f'N/A (no welcome screen: {type(e).__name__})')  # noqa: BLE001
    await ctx.close()
    ctx, pg = await new_page(b, vp, scheme)
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home', state='visible')
    await pg.wait_for_selector('#lbDaily .lb-board, #lbDaily .lb-empty', timeout=60000)
    await axe(pg, f'02_home_{name}')
    await axe(pg, f'07_daily_{name}', '#lbDaily')
    await pg.click('.map-card[data-id="w1"]'); await pg.wait_for_selector('.wv-chars', state='visible'); await axe(pg, f'03_world_{name}')
    await open_view(pg, 'profile', '.pf-head'); await axe(pg, f'04_profile_{name}')
    await open_view(pg, 'home', '.lb-home')
    if await pg.locator('.map-lib').count():
        await pg.click('.map-lib'); await pg.wait_for_selector('.lib-head', state='visible'); await axe(pg, f'05_library_{name}')
        ids = await pg.evaluate("import('./js/library.js').then(m => m.lessons()).then(l => l.map(x => x.id))")
        await pg.evaluate("(ids) => import('./js/bus.js').then(m => m.bus.emit('lesson', { ids }))", ids[:2])
        await open_view(pg, 'library', '.lib-head')
        card = pg.locator('.lib-card:not(.is-locked)').first
        if await card.count():
            await card.click(); await pg.wait_for_selector('#lbLesson', state='visible'); await axe(pg, f'05b_lesson_{name}')
            if await pg.locator('[data-act="lesson-close"]').count(): await pg.click('[data-act="lesson-close"]')
        else: na(f'05b_lesson_{name}', 'N/A (no unlocked lesson card)')
    else: na(f'05_library_{name}', 'N/A (no library entry)')
    await open_view(pg, {'k': 'group', 'id': G['id']}, '#gpFeed'); await pg.wait_for_timeout(800); await axe(pg, f'06_group_{name}')
    await pg.evaluate(END_JS, 'won'); await pg.wait_for_selector('.lb-end', state='visible'); await pg.wait_for_timeout(4200); await axe(pg, f'16_end_won_{name}')
    await open_view(pg, 'home', '.lb-home'); await pg.evaluate(END_JS, 'lost'); await pg.wait_for_selector('.lb-end', state='visible'); await pg.wait_for_timeout(4200); await axe(pg, f'17_end_lost_{name}')
    await ctx.close()
    await game_screens(b, cfg)

async def game_screens(b, cfg, also_2d=True):
    name, vp, scheme = cfg
    ctx, pg = await new_page(b, vp, scheme, is_mobile=vp['width'] < 500, has_touch=vp['width'] < 500)
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home', state='visible'); await start_w1(pg)
    card = await roll_once(pg)
    await axe(pg, f'08_hud_{name}')
    if card:
        kind = await pg.evaluate("(document.querySelector('#evCard') || {}).className || ''")
        await axe(pg, f'09_card_{name}'); R['meta'][f'09_card_{name}'] = kind
        b2 = pg.locator('#evCard button:enabled').last
        if await b2.count(): await b2.click(); await pg.wait_for_timeout(1500)
    else: na(f'09_card_{name}', 'N/A (first landing opened no card)')
    na(f'10_card_payday_plan_focus_{name}', 'NOT IMPLEMENTED (engine driver for forced cards: T7 part B)')
    na(f'11_story_inbox_{name}', 'NOT IMPLEMENTED (engine driver; T3 stories)')
    na(f'12_gm_modal_{name}', 'NOT IMPLEMENTED (opener for #gm index / emergency fund: T7 part B)')
    if await pg.locator('#sheetBtn').is_visible():
        await pg.click('#sheetBtn'); await pg.wait_for_timeout(900); await axe(pg, f'13_sheet_{name}')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    else: na(f'13_sheet_{name}', 'N/A (#sheetBtn not visible at this width)')
    na(f'14_asset_info_{name}', 'NOT IMPLEMENTED (needs an owned asset: engine driver)')
    na(f'15_help_{name}', 'N/A (not implemented: T4 — no #helpBtn in the build)')
    na(f'18_learning_end_{name}', 'N/A (not implemented: T4 learning mode)')
    await ctx.close()
    if also_2d:
        ctx, pg = await new_page(b, vp, scheme)
        await pg.goto(BASE + ('&' if '?' in BASE else '?') + 'ff=board2d:on'); await pg.wait_for_selector('.lb-home', state='visible'); await start_w1(pg)
        on2d = await pg.evaluate("!!document.querySelector('#board2d') && !document.querySelector('#board2d').hidden && getComputedStyle(document.querySelector('#board2d')).display !== 'none'")
        if on2d: await roll_once(pg); await axe(pg, f'19_board2d_{name}')
        else: na(f'19_board2d_{name}', 'N/A (?ff=board2d:on did not show #board2d: T1 2D mode absent)')
        await ctx.close()

def gate_axe():
    used = set(); new = []; mod = {}
    for screen, viol in R['axe'].items():
        if viol is None: continue
        for v in viol:
            sev = v['impact'] in ('critical', 'serious') or (STRICT and v['id'] == 'landmark-no-duplicate-banner')
            if not sev: mod[v['id']] = mod.get(v['id'], 0) + len(v['nodes']); continue
            for node in v['nodes']:
                hit = None if STRICT else next((i for i, k in enumerate(KNOWN) if k['rule'] == v['id'] and re.search(k['screen'], screen) and re.search(k['selector_regex'], node)), None)
                if hit is None: new.append((screen, v['id'], v['impact'], node))
                else: used.add(hit)
    if not R['axe']: rec('AX-2 axe gate', 'NOT RUN'); return
    rec('AX-2 axe gate (critical/serious' + (', strict' if STRICT else ', ratchet') + ')', 'PASS' if not new else 'FAIL',
        f'{len(new)} unallowlisted: ' + '; '.join(f'{s}:{r}({i}) {n}' for s, r, i, n in new[:12]))
    stale = [k for i, k in enumerate(KNOWN) if i not in used and k['rule'] not in mod]
    if not STRICT:
        for k in stale: rec(f"allowlist {k['rule']} ({k['cr']})", 'FAIL' if STRICT_ALLOW else 'STALE', 'STALE allowlist entry → remove it')
    rec('axe moderate/minor (report)', 'REPORT', mod)
    R['axe_new'] = new

# ---------------------------------------------------------------- keyboard and focus flows
FOCUS = """() => { const e = document.activeElement; if (!e || e === document.body) return { el: 'body', inLobby: false };
  return { el: (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/)[0] : '')) + (e.dataset.id ? '[' + e.dataset.id + ']' : ''),
    inLobby: !!e.closest('#start'), inBg: !!e.closest('#hud, #bar, #sheet, #c'), inEvm: !!e.closest('#evm'), inEnd: !!e.closest('.lb-end'), inSheet: !!e.closest('#sheet'),
    ring: (() => { const s = getComputedStyle(e); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none'); })() }; }"""
async def tabs(pg, n, shift=False):
    out = []
    for _ in range(n): await pg.keyboard.press('Shift+Tab' if shift else 'Tab'); out.append(await pg.evaluate(FOCUS))
    return out
async def keys(b):
    ctx, pg = await new_page(b, DESK[1], 'light')
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home', state='visible'); await pg.evaluate(QUIET)
    seq = await tabs(pg, 40)
    ok = seq[0]['inLobby'] and not any(s.get('inBg') for s in seq)
    rec('K-1 lobby: first Tab stop in the lobby, none of 40 in #hud/#bar/#sheet/#c', 'PASS' if ok else 'FAIL', [s['el'] for s in seq[:8]] + ['… bg:', [s['el'] for s in seq if s.get('inBg')][:5]])
    bad = [s['el'] for s in seq if not s.get('ring') and s['el'] != 'body']
    rec('focus ring visible on every lobby stop (report)', 'REPORT', f'{len(bad)} stops without a ring: {bad[:6]}')
    res = {}
    for view, sel, how in (('world', '.wv-chars', "document.querySelector('.map-card[data-id=\"w1\"]').click()"), ('profile', '.pf-head', None), ('library', '.lib-head', None),
                           ('group', '#gpFeed', None), ('back', '.lb-home', "document.querySelector('[data-act=\"home\"]').click()")):
        if how: await pg.evaluate(how)
        else: await pg.evaluate(f"import('./js/lobby.js').then(m => m.openLobby({json.dumps({'k': 'group', 'id': G['id']} if view == 'group' else view)}))")
        await pg.wait_for_selector(sel, state='visible'); await pg.evaluate(QUIET); res[view] = (await pg.evaluate(FOCUS))['el']
    rec('K-2 every lobby view change moves focus off <body>', 'PASS' if all(v != 'body' for v in res.values()) else 'FAIL', res)
    await ctx.close()
    # K-3 / K-4 / K-5 / K-9 (keyboard only)
    ctx, pg = await new_page(b, DESK[1], 'light')
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home', state='visible'); await pg.evaluate(QUIET)
    presses = 0; found = False
    for _ in range(60):
        await pg.keyboard.press('Tab'); presses += 1
        if await pg.evaluate("document.activeElement && document.activeElement.matches('.map-card[data-id=\"w1\"]')"): found = True; break
    if found:
        await pg.keyboard.press('Enter'); presses += 1; await pg.wait_for_selector('.wv-chars', state='visible'); await pg.evaluate(QUIET)
        for _ in range(40):
            if await pg.evaluate("document.activeElement && document.activeElement.matches('.wv-char')"): break
            await pg.keyboard.press('Tab'); presses += 1
        await pg.keyboard.press('Enter'); presses += 1
        try:
            await pg.wait_for_function("document.querySelector('#start').hidden", timeout=TO)
            rec('K-3 lobby → w1 → character → game in ≤ 12 key presses', 'PASS' if presses <= 12 else 'FAIL', f'{presses} presses')
        except Exception as e: rec('K-3 lobby → w1 → character → game in ≤ 12 key presses', 'FAIL', f'game did not start ({e!r})'[:200])  # noqa: BLE001
        await pg.wait_for_function("!document.querySelector('#roll').disabled", timeout=TO); await pg.wait_for_timeout(1500)
        while await pg.evaluate("!!document.querySelector('#coach') && !document.querySelector('#coach').hidden"): await pg.keyboard.press('Enter'); await pg.wait_for_timeout(600)
        await pg.evaluate("document.activeElement && document.activeElement.blur()")
        n = None
        for i in range(30):
            await pg.keyboard.press('Tab')
            if await pg.evaluate("document.activeElement && document.activeElement.id === 'roll'"): n = i + 1; break
        await pg.evaluate("document.activeElement && document.activeElement.blur()")
        await pg.keyboard.press('Space'); await pg.wait_for_timeout(1500)
        space = await pg.evaluate("document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden")
        rec('K-4 roll reachable in ≤ 8 Tabs or by Space outside controls', 'PASS' if (n and n <= 8) or space else 'FAIL', f'tabs={n} space_rolls={space}')
        try:
            await pg.wait_for_function("!document.querySelector('#evm').hidden || !document.querySelector('#roll').disabled", timeout=TO); await pg.wait_for_timeout(1200)
        except Exception: pass  # noqa: BLE001
        if await pg.evaluate("!document.querySelector('#evm').hidden"):
            f0 = await pg.evaluate(FOCUS); nf = await pg.evaluate("[...document.querySelectorAll('#evm button, #evm [href], #evm input, #evm [tabindex]:not([tabindex=\"-1\"])')].filter(e => e.offsetParent && !e.disabled).length")
            fw = await tabs(pg, nf + 2); bw = await tabs(pg, nf + 2, shift=True)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500); still = await pg.evaluate("!document.querySelector('#evm').hidden")
            ok = f0.get('inEvm') and all(s.get('inEvm') for s in fw + bw)
            rec('K-5 event card: initial focus inside, (n+2) Tab / Shift+Tab stay inside', 'PASS' if ok else 'FAIL', f"initial={f0['el']} fw={[s['el'] for s in fw][:6]} escape_keeps_decision_open={still}")
            for _ in range(6):   # answer the card(s) so later flows (K-9, K-7) start from a clean game
                if not await pg.evaluate("!document.querySelector('#evm').hidden"): break
                btn = pg.locator('#evCard button.choice:enabled, #evCard button.primary:enabled').last
                if not await btn.count(): break
                await btn.click(); await pg.wait_for_timeout(1500)
        else: rec('K-5 event card focus trap', 'N/A (no card after the first roll)')
        await pg.evaluate("document.querySelector('#homeBtn').click()"); await pg.wait_for_selector('.lb-home', state='visible'); await pg.evaluate(QUIET)
        f = await pg.evaluate(FOCUS); first = (await tabs(pg, 1))[0]
        rec('K-9 return to the lobby: focus lands in the lobby', 'PASS' if f.get('inLobby') or first.get('inLobby') else 'FAIL', f"active={f['el']} firstTab={first['el']}")
        await pg.evaluate(END_JS, 'won'); await pg.wait_for_selector('.lb-end', state='visible'); await pg.wait_for_timeout(4200)
        first = (await tabs(pg, 1))[0]
        rec('K-7 end screen: first Tab stop inside the end screen', 'PASS' if first.get('inEnd') else 'FAIL', first['el'])
    else: rec('K-3 lobby → game by keyboard', 'FAIL', 'w1 card never focused in 60 Tabs')
    await ctx.close()
    ctx, pg = await new_page(b, PHONE[1], 'dark', is_mobile=True, has_touch=True)
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home', state='visible'); await start_w1(pg)
    if await pg.locator('#sheetBtn').is_visible():
        await pg.focus('#sheetBtn'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(900)
        sq = await tabs(pg, 12); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(600)
        closed = await pg.evaluate("(() => { const s = document.querySelector('#sheet'); const r = s.getBoundingClientRect(); return s.hidden || r.top >= innerHeight - 4 || !document.body.classList.contains('sheet-open') && !s.classList.contains('open'); })()")
        rec('K-8 phone sheet: focus trapped while open, Escape closes', 'PASS' if all(s.get('inSheet') for s in sq) and closed else 'FAIL', f"stops={[s['el'] for s in sq][:6]} closed={closed}")
    else: rec('K-8 phone sheet', 'N/A (#sheetBtn not visible)')
    await ctx.close()
    rec('K-6 coach bubble vs focused card', 'NOT IMPLEMENTED (T7 part B)'); rec('K-10 2D board Tab order', 'NOT IMPLEMENTED (T7 part B)')

# ---------------------------------------------------------------- §4.3 checks
TARGETS = """(primary) => { const els = [...document.querySelectorAll('button, a[href], input, select, textarea, [role=button], [tabindex]:not([tabindex="-1"])')]
  .filter(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[hidden]') && !e.closest('[inert]'); });
  const d = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/)[0] : ''));
  const u24 = [], p44 = [];
  for (const e of els) { const r = e.getBoundingClientRect(); const w = Math.round(r.width), h = Math.round(r.height);
    if (Math.min(w, h) < 24) u24.push(d(e) + ' ' + w + 'x' + h);
    if (e.matches(primary) && Math.min(w, h) < 44) p44.push(d(e) + ' ' + w + 'x' + h); }
  return { n: els.length, u24, p44 }; }"""
PRIMARY = '#roll, #evCard button, .lb-big, #gm .acts button, .wv-char, [data-act="daily"]'
NONAME = """() => [...document.querySelectorAll('button, a[href], [role=button], input, select')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && !e.closest('[hidden]') && !e.closest('[inert]'); })
  .filter(e => { const lb = (e.getAttribute('aria-labelledby') || '').split(/\\s+/).map(i => document.getElementById(i)).filter(Boolean).map(x => x.textContent).join('');
    const lab = (e.getAttribute('aria-label') || e.getAttribute('title') || lb || (e.labels && e.labels[0] && e.labels[0].textContent) || e.getAttribute('placeholder') || e.getAttribute('alt') || '').trim();
    return !lab && !(e.innerText || e.textContent || e.value || '').trim() && !e.querySelector('img[alt]:not([alt=""])'); })
  .map(e => { const p = e.closest('[id]'); return (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '')) + ' in #' + (p ? p.id : '?') + ' ' + e.outerHTML.replace(/\\s+/g, ' ').slice(0, 70); })"""
OVER = """() => { const r = document.querySelector('#roll'); const rr = r && r.getBoundingClientRect(); const vis = r && !document.querySelector('#start').hidden ? null : rr;
  const chips = [...document.querySelectorAll('#hud .chip, #hud [id^="h"], #evCard h2, #evCard button')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map(e => e.id || e.className).slice(0, 5);
  return { hOverflow: document.documentElement.scrollWidth > innerWidth + 1, docW: document.documentElement.scrollWidth, vw: innerWidth,
    rollInside: vis ? (vis.left >= 0 && vis.right <= innerWidth && vis.top >= 0 && vis.bottom <= innerHeight) : null, clipped: chips }; }"""
ANIM = """() => { const a = document.getAnimations().filter(x => x.playState === 'running');
  return { infinite: a.filter(x => x.effect && x.effect.getTiming().iterations === Infinity).map(x => x.animationName || x.transitionProperty || 'anim').slice(0, 6),
    long: a.filter(x => { const t = x.effect && x.effect.getTiming(); return t && t.iterations !== Infinity && (Number(t.duration) || 0) * (t.iterations || 1) > 600; }).map(x => x.animationName || x.transitionProperty || 'anim').slice(0, 6) }; }"""
async def checks(b):
    t_u24, t_p44, names, widths, motion = [], [], [], [], []
    for w, h in ((360, 740), (390, 844), (414, 896)):
        ctx, pg = await new_page(b, {'width': w, 'height': h}, 'light', is_mobile=True, has_touch=True)
        await pg.goto(BASE); await pg.wait_for_selector('.lb-home', state='visible'); await pg.evaluate(QUIET)
        for scr in ('home', 'world', 'game'):
            if scr == 'world': await pg.click('.map-card[data-id="w1"]'); await pg.wait_for_selector('.wv-chars', state='visible'); await pg.evaluate(QUIET)
            if scr == 'game':
                await open_view(pg, 'home', '.lb-home'); await start_w1(pg); await roll_once(pg)
            t = await pg.evaluate(TARGETS, PRIMARY); t_u24 += [f'{scr}@{w}: {x}' for x in t['u24']]; t_p44 += [f'{scr}@{w}: {x}' for x in t['p44']]
            names += [f'{scr}@{w}: {x}' for x in await pg.evaluate(NONAME)]
        await ctx.close()
    rec('AX-T targets: 0 interactive elements below 24×24 (WCAG 2.5.8)', 'PASS' if not t_u24 else 'FAIL', t_u24[:10])
    rec('AX-T primary controls ≥ 44×44 (#roll, card options, lobby CTAs, modal actions)', 'PASS' if not t_p44 else 'FAIL', t_p44[:10])
    rec('AX-N no visible interactive element without an accessible name', 'PASS' if not names else 'FAIL', names[:10])
    for w, h in ((360, 740), (390, 844), (414, 896), (820, 1180), (1300, 820)):
        ctx, pg = await new_page(b, {'width': w, 'height': h}, 'light')
        await pg.goto(BASE); await pg.wait_for_selector('.lb-home', state='visible'); await pg.evaluate(QUIET)
        lo = await pg.evaluate(OVER); await start_w1(pg); await roll_once(pg); go = await pg.evaluate(OVER)
        widths.append({'w': w, 'lobby_hOverflow': lo['hOverflow'], 'game_hOverflow': go['hOverflow'], 'rollInside': go['rollInside'], 'clipped': go['clipped']})
        if w == 390:
            a = await pg.evaluate("document.querySelector('#dieSr') ? document.querySelector('#dieSr').textContent : null")
            rec('AX-C after a roll a live region has the dice values', 'PASS' if a and re.search(r'\d', a) else 'FAIL', repr(a))
            rec('AX-C … and the landing tile name', 'REPORT', 'needs E.boardInfo() label source (CR-27: #dieSr has the dice only)')
        await ctx.close()
    bad = [x for x in widths if x['lobby_hOverflow'] or x['game_hOverflow'] or x['rollInside'] is False]
    rec('AX-W 360/390/414/820/1300: no horizontal overflow, #roll inside the viewport', 'PASS' if not bad else 'FAIL', bad or widths)
    rec('AX-W clipped HUD chips / card titles / option labels (report)', 'REPORT', [(x['w'], x['clipped']) for x in widths if x['clipped']])
    for scr in ('home', 'game'):
        ctx, pg = await new_page(b, {'width': 390, 'height': 844}, 'light', reduced='reduce')
        await pg.goto(BASE); await pg.wait_for_selector('.lb-home', state='visible'); await pg.evaluate(QUIET)
        if scr == 'game': await start_w1(pg); await roll_once(pg); await pg.wait_for_timeout(1500)
        motion.append((scr, await pg.evaluate(ANIM))); await ctx.close()
    bad = [(s, a) for s, a in motion if a['infinite'] or a['long']]
    rec('AX-M reduced motion: no running infinite or > 600 ms CSS animation (lobby, game)', 'PASS' if not bad else 'FAIL', bad or motion)
    for (w, h, dpr, hard) in ((650, 410, 2, True), (320, 256, 1, False)):
        ctx, pg = await new_page(b, {'width': w, 'height': h}, 'light', device_scale_factor=dpr)
        await pg.goto(BASE); await pg.wait_for_selector('.lb-home', state='visible'); await pg.evaluate(QUIET)
        o = await pg.evaluate(OVER); await ctx.close()
        rec(f'AX-Z2 page zoom {"200" if hard else "400"} % ({w}×{h}): lobby has no horizontal scroll', ('PASS' if not o['hOverflow'] else 'FAIL') if hard else 'REPORT', o)
    for cid in ('AX-S sounds have a text counterpart', 'AX-B RTL / ₪ placement scan', 'AX-L no auto-dismissing required content', 'AX-Z1 text-only zoom 200 %'):
        rec(cid, 'NOT IMPLEMENTED (T7 part B)')

async def main():
    os.makedirs(SHOT, exist_ok=True); os.makedirs(os.path.dirname(OUT), exist_ok=True)
    FB.banner(MODE, 'accept'); R['meta'] = {'base': BASE, 'axe': AXE, 'strict': STRICT, 'date': time.strftime('%Y-%m-%d %H:%M:%S'), 'loadavg': os.getloadavg()[0]}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        steps = ([(tour, (DESK,)), (tour, (PHONE,)), (game_screens, (SMALL, False))] if 'axe' in ONLY else []) + ([(keys, ())] if 'keys' in ONLY else []) + ([(checks, ())] if 'checks' in ONLY else [])
        for fn, a in steps:
            t = time.time()
            try: await fn(b, *a)
            except Exception as e: rec(f'{fn.__name__}{a[0][0] if a else ""} crashed', 'FAIL', repr(e)[:300])  # noqa: BLE001
            log(f'-- {fn.__name__} {a[0][0] if a else ""} {round(time.time() - t)} s')
        await b.close()
    if 'axe' in ONLY: gate_axe()
    try: [FB.assert_clean(s) for s in SINKS]; rec('guard clean (no request left the fake)', 'PASS')
    except AssertionError as e: rec('guard clean', 'FAIL', str(e))
    fb.close()
    json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
    st = {}
    for c in R['checks']: k = c['status'].split(' ')[0].split('(')[0]; st[k] = st.get(k, 0) + 1
    log(f'\nsummary {st} · backend=fake · renderer=swiftshader · axe {AXE_VERSION} · saved {OUT}')
    sys.exit(1 if st.get('FAIL') else 0)
asyncio.run(main())
