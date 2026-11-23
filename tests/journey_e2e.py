# Wave 3a (game screen, J1 P0 — docs/full-upgrade/research/J1-journey-learning.md §3): real-page checks of
#   P-1 the compact payday card (one phone screen, ≤ 8 visible buttons, details under "פירוט", gendered heading),
#   P-2 the "💼 ניהול כסף" hub (fund → loans → index → plan → focus, each action opens the existing flow),
#   P-3 the near-goal milestone (#hNext = hudgoal.nextMilestone(metrics), ladder in the goal panel) in w1–w4,
#   P-4 "★ עד חודש N" in a free game, the one-time "לסכם את הריצה" offer after the ★ limit, and the normal end path
#       (lobby end screen, rr2-last-game written, a 'capped' result; nothing new in the save's ui).
# Offline fake backend + guard, chrome --no-proxy-server. Copies: SRC=<export> COPY_DIR=/tmp/w3a PORT_BASE=10000 bash tests/serve_copies.sh
# Usage: python3 tests/journey_e2e.py [--game=http://localhost:10000/index.html] [--real=http://localhost:10002/] [--shots=DIR] [--only=pay,hub,ms,end]
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
PB = int(os.environ.get('PORT_BASE', '10000'))
GAME = OPT.get('game') or f'http://localhost:{PB}/index.html'; REAL = OPT.get('real') or f'http://localhost:{PB + 2}/'
SHOTS = OPT.get('shots'); ONLY = set(OPT['only'].split(',')) if OPT.get('only') else None
want = lambda s: ONLY is None or s in ONLY
VP = {'desk': {'width': 1300, 'height': 820}, 'phone': {'width': 390, 'height': 844}, 'small': {'width': 360, 'height': 740}}
ARGS = FB.chrome_args(MODE, ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
SEED = "localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true})); localStorage.setItem('rr2-tips-off','1');"
RESULTS = []; ERRS = []; SINKS = []
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def check(sc, name, cond, detail=''):
    RESULTS.append((sc, name, bool(cond))); log(('PASS' if cond else 'FAIL'), f'[{sc}]', name, '' if cond else str(detail)[:400]); return bool(cond)

# a game played in the page with the engine itself (deterministic choices), saved, then resumed by game.js
SETUP = """async ({w, ch, seed, until, months, female}) => {
 const E = await import('./js/engine.js'); const SV = await import('./js/saves.js');
 const wd = E.getWorld(w); const chars = wd.characters; const c = ch || (female ? (chars.find(x => x.gender === 'f') || chars[0]) : chars[0]).id;
 const st = E.createGame({ worldId: w, charId: c, seed, mode: 'free' });
 const tiles = E.boardInfo(w); const lim = until === 'limit' ? st.maxMonths + 1 : months;
 for (let i = 0; i < 900; i++) {
   if (st.phase === 'roll') E.rollDice(st);
   const t = tiles[st.pos];
   if (until === 'payday' && t.type === 'payday' && st.month >= (months || 3)) break;
   if ((until === 'month' || until === 'limit') && st.month >= lim) break;
   let ev = E.landing(st) || E.currentEvent(st); let g = 0;
   while (ev && !st.over && g++ < 40) { const os = ev.options.filter(o => o.enabled !== false); const o = (until === 'limit' ? os.find(o => o.id === 'done' || o.id === 'ok' || o.id === 'pass' || o.id === 'skip') : os.find(o => o.primary)) || os[0]; if (!o) break;
     let r = E.choose(st, ev, o.id, { qty: 1 });
     for (let j = 0; r && r.ok === false && j < os.length; j++) r = E.choose(st, ev, os[j].id, { qty: 1 });   // a refused choice: the next option
     ev = (r && r.event) || E.currentEvent(st); }
   if (st.over) break;
 }
 const cfg = { worldId: w, charId: st.charId, mode: 'free', seed, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true };
 SV.write('rr2-save-free-' + w, cfg, st);
 const G = await import('./js/game.js'); await G.initGame(); G.startGame({ ...cfg, resume: true });
 return { month: st.month, max: st.maxMonths, over: st.over || null, char: st.charId, gender: st.gender, uiKeys: Object.keys(st.ui || {}) };
}"""
STATE = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden, gm: !document.querySelector('#gm').hidden,
  gmCls: document.querySelector('#gmCard').className, start: !document.querySelector('#start').hidden, type: (document.querySelector('#evCard').className.match(/ev-(\\w+)/)||[])[1]||null })"""
VISBTN = "(sel) => [...document.querySelectorAll(sel + ' button')].filter(b => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden' && !b.closest('details:not([open]) > :not(summary)')).length"

async def page(b, url, vp, mobile=False):
    ctx = await b.new_context(viewport=VP[vp], device_scale_factor=1, has_touch=mobile, is_mobile=mobile, **FB.new_context_kwargs())
    SINKS.append(await FB.install_mode(ctx, FB.FakeBackend() if MODE == 'offline' else None, MODE))
    await ctx.add_init_script(SEED)
    pg = await ctx.new_page(); pg.set_default_timeout(120000)
    pg.on('pageerror', lambda e: (ERRS.append(f'{vp} pageerror: {e}'), log('PAGEERR', e)))
    await pg.goto(url)
    await pg.wait_for_function('() => window.__rrBooted', timeout=120000); await pg.wait_for_timeout(600)
    return ctx, pg

async def setup(pg, **kw):
    r = await pg.evaluate(SETUP, {'w': 'w1', 'ch': None, 'seed': 7, 'until': 'payday', 'months': 3, 'female': False, **kw})
    await pg.wait_for_selector('#start', state='hidden', timeout=90000); await pg.wait_for_timeout(1500)
    return r

async def shot(pg, name):
    if not SHOTS: return
    await pg.wait_for_timeout(300)
    await pg.screenshot(path=f'{SHOTS}/{name}.jpg', type='jpeg', quality=80)

async def quiet(pg):
    for _ in range(6):
        if await pg.locator('#coach:not([hidden]) [data-c="next"], #coach:not([hidden]) button').count():
            await pg.locator('#coach:not([hidden]) button').first.click(); await pg.wait_for_timeout(250)
        else: break

async def idle(pg, timeout=120, answer=True):
    t0 = time.time()
    while time.time() - t0 < timeout:
        await quiet(pg)
        s = await pg.evaluate(STATE)
        if s['gm'] and 'sumoffer' in s['gmCls']: return s
        if s['gm']:
            b = pg.locator('#gm .acts button.primary:not([disabled])')
            if await b.count(): await b.first.click(); await pg.wait_for_timeout(300); continue
        if s['card'] and answer:
            ok = pg.locator('#evCard button[data-o="ok"]:not([disabled]), #evCard button[data-o="pass"]:not([disabled]), #evCard button[data-o="skip"]:not([disabled])')
            btn = ok.first if await ok.count() else pg.locator('#evCard button[data-o]:not([disabled])').first
            try: await btn.click(timeout=5000)
            except Exception: await pg.evaluate("() => document.querySelector('#evCard button[data-o]:not([disabled])')?.click()")
            await pg.wait_for_timeout(500)
            d = pg.locator('#evCard button[data-o="done"]')
            if await d.count() and await d.first.is_visible(): await d.first.click()
            continue
        if s['card'] or s['roll'] or s['start']: return s
        if await pg.evaluate("() => { const x = document.querySelector('#story'); return !!x && !x.hidden && !!document.querySelector('#stGo'); }"):
            await pg.click('#stGo'); await pg.wait_for_timeout(300); continue
        await pg.wait_for_timeout(250)
    raise Exception('stuck: ' + json.dumps(await pg.evaluate(STATE)))

async def run_pay(b, vp):
    sc = f'pay-{vp}'; ctx, pg = await page(b, GAME, vp, mobile=vp != 'desk')
    r = await setup(pg, female=True)
    await pg.wait_for_selector('#evm:not([hidden])', timeout=60000); await pg.wait_for_timeout(1200); await quiet(pg)
    info = await pg.evaluate("""(vis) => { const c = document.querySelector('#evCard'); const V = eval(vis);
      return { type: (c.className.match(/ev-(\\w+)/)||[])[1], h: c.scrollHeight, vh: innerHeight, btn: V('#evCard'), head: c.querySelector('h3.ph')?.textContent || '',
        plans: c.querySelectorAll('.plans .plan').length, det: !!c.querySelector('details.pddet'), detOpen: !!c.querySelector('details.pddet[open]'),
        slipInDet: !!c.querySelector('details.pddet .grid'), impInDet: !!c.querySelector('details.pddet #impP') || !c.querySelector('#impP'), save: !!c.querySelector('[data-o="save"]') }; }""", VISBTN)
    check(sc, 'a landed payday opens the plan card', info['type'] == 'payday' and info['plans'] >= 4, info)
    check(sc, 'female character: the heading is gendered ("איך תעבירי…")', 'תעבירי' in info['head'], info['head'])
    check(sc, '≤ 8 buttons on screen (details closed)', info['btn'] <= 8, info)
    check(sc, 'the card fits one screen (scrollHeight ≤ viewport height)', info['h'] <= info['vh'], info)
    check(sc, 'payslip + plan numbers + impact are under "פירוט" (closed)', info['det'] and not info['detOpen'] and info['slipInDet'] and info['impInDet'], info)
    await shot(pg, f'payday_{vp}')
    await pg.locator('#evCard details.pddet > summary').click(); await pg.wait_for_timeout(400)
    t = await pg.inner_text('#evCard details.pddet')
    check(sc, '"פירוט" opens the full payslip (ברוטו, מס הכנסה, נטו)', 'ברוטו' in t and 'מס הכנסה' in t, t[:200])
    if vp == 'phone': await shot(pg, f'payday_{vp}_details')
    # choose a plan from the compact tile: the card closes and the engine took it
    await pg.locator('#evCard .plans .plan[data-o^="plan:"]:not([disabled])').first.click(); await pg.wait_for_timeout(800)
    s = await idle(pg)
    check(sc, 'a compact plan tile still decides (card closed, roll available)', s['roll'] or s['card'], s)
    await ctx.close()

async def run_hub(b, vp):
    sc = f'hub-{vp}'; ctx, pg = await page(b, GAME, vp, mobile=vp != 'desk')
    await setup(pg, until='month', months=5); s = await idle(pg)
    btn = pg.locator('#hubBtn')
    check(sc, '"💼 ניהול כסף" is on screen (not behind ⋯)', await btn.is_visible())
    bb = await btn.bounding_box(); check(sc, 'hub button ≥ 44 px high', bb and bb['height'] >= 43.5, bb)
    await btn.click(); await pg.wait_for_selector('#gmCard.mhub', timeout=5000)
    rows = await pg.evaluate("() => [...document.querySelectorAll('#gmCard .mh-row')].map(r => r.dataset.row)")
    check(sc, 'rows in order: fund, loans, index, plan, focus', rows[:5] == ['fund', 'loans', 'index', 'plan', 'focus'], rows)
    E = await pg.evaluate("""async () => { const E = await import('./js/engine.js'); const H = await import('./js/hudgoal.js'); const raw = JSON.parse(localStorage.getItem('rr2-save-free-w1'));
      return H.moneyHubModel(E.metrics(E.deserialize(raw.state))).rows.map(r => r.value); }""")
    shown = await pg.evaluate("() => [...document.querySelectorAll('#gmCard .mh-row small')].map(e => e.textContent.replace(/[\\u2066-\\u2069\\u2060]/g, ''))")
    check(sc, 'every row shows the engine value (moneyHubModel of the saved state)', [x.replace('⁦', '').replace('⁩', '').replace('⁠', '') for x in E] == shown, (E, shown))
    await shot(pg, f'money_hub_{vp}')
    # the fund row opens the existing deposit flow; the loan row opens the impact confirm (cancel both)
    await pg.locator('#gmCard [data-hub="save"]').click(); await pg.wait_for_timeout(500)
    check(sc, 'להפקיד → the emergency-fund dialog', 'קרן' in (await pg.inner_text('#gmCard')) and await pg.locator('#gmCard #svq').count() == 1)
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub'); await pg.locator('#gmCard [data-hub="loan"]').click(); await pg.wait_for_timeout(500)
    t = await pg.inner_text('#gmCard')
    check(sc, 'לקחת הלוואה → the "מה זה עושה לי?" confirm (nothing taken yet)', 'הלוואה' in t, t[:120])
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub'); await pg.locator('#gmCard [data-hub="plan"]').click(); await pg.wait_for_timeout(500)
    check(sc, 'לשנות תוכנית → the plan picker', await pg.locator('#gmCard [data-plan]').count() >= 4)
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    await ctx.close()

async def run_ms(b, vp):
    for w in ('w1', 'w2', 'w3', 'w4'):
        sc = f'ms-{vp}-{w}'; ctx, pg = await page(b, GAME, vp, mobile=vp != 'desk')
        await setup(pg, w=w, until='month', months=6); await idle(pg); await pg.wait_for_timeout(600)
        exp = await pg.evaluate(f"""async () => {{ const E = await import('./js/engine.js'); const H = await import('./js/hudgoal.js'); const raw = JSON.parse(localStorage.getItem('rr2-save-free-{w}'));
          const m = E.metrics(E.deserialize(raw.state)); return {{ n: H.nextMilestone(m), lad: H.milestoneLadder(m).map(x => x.id) }}; }}""")
        hn = await pg.evaluate("() => { const e = document.querySelector('#hNext'); return e && !e.hidden && e.getClientRects().length ? { t: e.textContent, a: e.getAttribute('aria-label') } : null; }")
        n = exp['n']
        check(sc, 'the next milestone (engine metrics → nextMilestone) is on screen in #hNext', n and hn and n['title'] in hn['t'] and f"שלב {n['step']} מתוך {n['of']}" in hn['t'], (n, hn))
        await pg.click('#hGoalBtn'); await pg.wait_for_timeout(400)
        lad = await pg.evaluate("() => [...document.querySelectorAll('#goalPanel .gp-ladder li')].map(l => l.className)")
        check(sc, 'the goal panel lists the whole ladder, the next rung marked', len(lad) == len(exp['lad']) and lad.count('next') == 1, lad)
        if w in ('w1', 'w4'): await shot(pg, f'milestone_{vp}_{w}')
        await ctx.close()

async def run_end(b, vp):
    sc = f'end-{vp}'; ctx, pg = await page(b, REAL, vp, mobile=vp != 'desk')
    r = await setup(pg, until='limit', ch='doctor')
    if r['over']: return check(sc, 'setup reached the ★ limit without ending', False, r)
    s = await idle(pg)
    star = await pg.evaluate("() => document.querySelector('#hMonth')?.textContent || ''")
    check(sc, 'the HUD shows the ★ limit of a free game', '★' in star and str(r['max']) in star, star)
    if vp == 'desk': await shot(pg, f'end_run_{vp}_1_hud')
    offered = False
    for _ in range(10):
        s = await idle(pg)
        if s['gm'] and 'sumoffer' in s['gmCls']: offered = True; break
        if s['roll']: await pg.click('#roll'); await pg.wait_for_timeout(500)
    check(sc, 'after the ★ limit the one-time "לסכם את הריצה" offer opens', offered, (s, await pg.evaluate("() => document.querySelector('#hMonth')?.textContent")))
    if not offered: await ctx.close(); return
    t = await pg.inner_text('#gmCard')
    check(sc, 'the offer names the month limit and that the summary ends the run', f"חודש {r['max']}" in t and 'מסיים' in t, t[:200])
    await shot(pg, f'end_run_{vp}_2_offer')
    await pg.locator('#gmCard button', has_text='לסכם את הריצה').click()
    await pg.wait_for_selector('.lb-end', timeout=90000); await pg.wait_for_timeout(2500)
    end = await pg.evaluate("""() => ({ title: document.querySelector('.lb-end .end-title, .lb-end h1')?.textContent || '', last: !!localStorage.getItem('rr2-last-game'),
      lastSeed: (JSON.parse(localStorage.getItem('rr2-last-game') || '{}').cfg || {}).seed, text: document.querySelector('.lb-end').innerText.slice(0, 600),
      offered: JSON.parse(localStorage.getItem('rr2-sum-offered') || '[]') })""")
    check(sc, 'the normal end screen opens (lobby .lb-end)', bool(end['title']), end)
    check(sc, 'rr2-last-game written by the normal end path (rewind / "רגעי החלטה")', end['last'] and end['lastSeed'] == 7, end)
    check(sc, 'the offer is recorded outside the save (rr2-sum-offered)', len(end['offered']) == 1, end)
    await shot(pg, f'end_run_{vp}_3_end')
    check(sc, 'the save gained no new ui key', not (set(r['uiKeys']) - {'seq', 'coach', 'firstPayday', 'tl', 'trackMonth'}), r['uiKeys'])
    await ctx.close()

async def main():
    FB.banner(MODE)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        for vp in ('desk', 'phone', 'small'):
            if want('pay'): await run_pay(b, vp)
            if want('hub'): await run_hub(b, vp)
        if want('ms'):
            for vp in ('desk', 'phone'): await run_ms(b, vp)
        if want('end'):
            for vp in ('desk', 'phone'): await run_end(b, vp)
        await b.close()
    for s in SINKS: FB.assert_clean(s)
    fails = [r for r in RESULTS if not r[2]]
    log(f'{len(RESULTS) - len(fails)} passed, {len(fails)} failed, {len(ERRS)} page errors')
    for e in ERRS: log('ERR', e)
    sys.exit(1 if fails or ERRS else 0)

asyncio.run(main())
