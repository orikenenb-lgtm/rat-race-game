# P0b 2026-11-24 — a win must never be lost when the page is closed / reloaded during the win celebration.
# Real copy (lobby + real game), offline fake backend + guard. The save is a real near-end w1 FREE game (tests/t6_fixture.mjs).
#   A. play to the win; the moment the save says "over" (before the end screen) the page reloads →
#      the lobby records the win on boot: w2 opens, a toast says so, the save is marked endSent, gamesPlayed +1 once
#   B. a finished save whose end was never delivered, resumed from the world view → the end screen with "לעולם הבא",
#      and the game is NOT counted twice (persistent end signatures)
#   C. another reload → nothing is recorded again
# Usage: python3 tests/p0b_unrecorded_win.py [--real=http://localhost:8772/]
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
arg = lambda k, d: next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{k}=')), d)
REAL = arg('real', 'http://localhost:8772/')
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
RES = []; ERRS = []
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def check(ok, msg): RES.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
FLAGS = {'board2d': 'on'}
STATE = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden, gm: !document.querySelector('#gm').hidden,
  start: !document.querySelector('#start').hidden, coach: !document.querySelector('#coach').hidden, story: !!document.querySelector('#story') && !document.querySelector('#story').hidden,
  end: !!document.querySelector('#start:not([hidden]) .lb-end') })"""
PROG = "() => import('./js/progress.js').then(P => ({ w2: P.isUnlocked('w2'), games: P.getProgress().gamesPlayed, wins: P.getProgress().wins, best: P.getProgress().best.w1 ?? null, stars: P.getProgress().stars.w1 }))"
SAVE = "() => { const r = JSON.parse(localStorage.getItem('rr2-save-free-w1') || 'null'); const s = r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); return s ? { over: s.over || null, sent: !!(s.ui && s.ui.endSent), result: !!s.result } : null; }"

async def step(pg):
    s = await pg.evaluate(STATE)
    if s['end']: return s
    if s['coach']: await pg.evaluate("() => (document.querySelector('#coach button.primary') || document.querySelector('#coach button')).click()")
    elif s['gm']: await pg.evaluate("() => (document.querySelector('#gm .acts button.primary') || document.querySelector('#gm .acts button')).click()")
    elif s['story']: await pg.evaluate("() => document.querySelector('#stGo')?.click()")
    elif s['card']:
        await pg.evaluate("""() => { const c = document.querySelector('#evCard'); if (!c) return;
          const b = c.querySelector('button.primary:not(:disabled)') || ['done','ok','pass','skip','pay','buy'].map((id) => c.querySelector(`button[data-o="${id}"]:not(:disabled)`)).find(Boolean) || c.querySelector('button[data-o]:not(:disabled)'); if (b) b.click(); }""")
    elif s['roll'] and not s['start']: await pg.evaluate("() => document.querySelector('#roll').click()")
    await pg.wait_for_timeout(400); return s

async def to_world(pg):
    await pg.wait_for_selector('.lb-home, .lb-world', timeout=120000); await pg.wait_for_timeout(500)
    await pg.evaluate("() => document.querySelector('[data-act=\"world\"][data-id=\"w1\"]')?.click()"); await pg.wait_for_selector('.lb-world', timeout=30000)

async def scenario(b, fx, how):
    """how = 'reload' (the page reloads during the celebration) | 'lobby' (the in-game לובי button during the celebration)"""
    ctx = await b.new_context(**FB.new_context_kwargs(), viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    fb = FB.FakeBackend(); sink = await FB.install_mode(ctx, fb, MODE)
    init = ("if(!sessionStorage.getItem('p0binit')){sessionStorage.setItem('p0binit','1');localStorage.setItem('rr2-onboarded','1');"
            f"localStorage.setItem('rr2-flags',{json.dumps(json.dumps(FLAGS))});localStorage.setItem({json.dumps(fx['key'])},{json.dumps(fx['raw'])});}}")
    await ctx.add_init_script(init)
    pg = await ctx.new_page(); pg.set_default_timeout(120000)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(REAL + 'index.html'); await to_world(pg)
    p0 = await pg.evaluate(PROG)
    check(not p0['w2'], f'{how}: before, w2 is locked')
    await pg.click('[data-act="continue-free"]:not([data-learn])')
    act = "location.reload()" if how == 'reload' else "document.querySelector('#homeBtn').click()"
    await pg.evaluate("""() => { window.__p0b = setInterval(() => { try { const r = JSON.parse(localStorage.getItem('rr2-save-free-w1') || 'null');
      const s = r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state);
      if (s && s.over && !(s.ui && s.ui.endSent)) { clearInterval(window.__p0b); sessionStorage.setItem('p0b-hit', s.over); """ + act + """; } } catch (e) {} }, 15); }""")
    hit = False
    for i in range(600):
        try:
            if await pg.evaluate("() => sessionStorage.getItem('p0b-hit')"): hit = True; break
            await step(pg)
        except Exception:
            await pg.wait_for_timeout(500)
    check(hit, f'{how}: the game reached its end and the player left during the celebration (before the end screen)')
    await pg.wait_for_selector('.lb-home, .lb-world, .lb-end', timeout=120000); await pg.wait_for_timeout(4000)
    won = await pg.evaluate("() => sessionStorage.getItem('p0b-hit')")
    p1 = await pg.evaluate(PROG); sv = await pg.evaluate(SAVE)
    view = await pg.evaluate("() => ({ end: !!document.querySelector('#start:not([hidden]) .lb-end'), next: !!document.querySelector('.lb-end [data-act=end-next][data-id=w2]'), toast: document.querySelector('#lb-toast')?.textContent || '' })")
    check(won == 'won', f'{how}: it was a win ({won})')
    check(p1['w2'] and p1['games'] == p0['games'] + 1 and p1['wins'] == p0['wins'] + 1 and p1['best'] is not None, f'{how}: the win is recorded exactly once — w2 open, games +1, wins +1 ({p0} → {p1})')
    check(view['end'] and view['next'] or 'נפתח עולם חדש' in view['toast'], f'{how}: the player sees it (end screen with "לעולם הבא", or the "נפתח עולם חדש" message) {view}')
    check(sv is None or sv['sent'], f'{how}: the finished save will not deliver its end again ({sv})')
    await pg.reload(); await pg.wait_for_selector('.lb-home, .lb-world', timeout=120000); await pg.wait_for_timeout(1500)
    p2 = await pg.evaluate(PROG)
    check(p2['games'] == p1['games'] and p2['wins'] == p1['wins'] and p2['w2'], f'{how}: another reload records nothing again ({p2})')
    await pg.evaluate("() => document.querySelector('[data-act=\"world\"][data-id=\"w2\"]')?.click()"); await pg.wait_for_selector('.lb-world', timeout=30000)
    wv = await pg.evaluate("() => ({ locked: !!document.querySelector('.wv-hero.is-locked'), chars: document.querySelectorAll('.wv-char').length })")
    check(not wv['locked'] and wv['chars'] > 0, f'{how}: w2 opens with its characters ({wv})')
    check(not errs, f'{how}: no page errors {errs[:3]}')
    try: FB.assert_clean(sink); check(True, f'{how}: guard clean')
    except AssertionError as e: check(False, 'guard: ' + str(e))
    await ctx.close()

async def main():
    out = subprocess.run(['node', os.path.join(HERE, 't6_fixture.mjs')], capture_output=True, text=True, timeout=300, cwd=ROOT)
    F = json.loads(out.stdout); fx = F['nearEndFree']
    check(fx is not None, 'fixture: a real near-end w1 free game')
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        for how in ('reload', 'lobby'):
            await scenario(b, fx, how)
        await b.close()
    print(f"\n{sum(RES)}/{len(RES)} checks passed", flush=True)
    sys.exit(0 if all(RES) else 1)

asyncio.run(main())
