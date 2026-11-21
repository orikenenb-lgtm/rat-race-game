#!/usr/bin/env python3
# T5 part B — rendering-lane browser checks (3D scene.js + 2D board2d.js). Real copy (tests/make_realcopy.sh / serve_copies.sh),
# three served locally, google-chrome + swiftshader, every non-local host fails DNS (no Supabase, R-6). Sequential, long timeouts.
#   python3 tests/t5_render_e2e.py [BASE_URL=http://localhost:8802/] [--only=boot,city,pick,phone,motion,turn,hidden,worlds,twod,shots]
#   [--shots=/tmp/t5b/shots]
# Checks (spec ids): A-35/CR-05 boot GLB list · A-26/A-27 calls+triangles (fixture city, overview, w1) · A-12 levels/parts in 3D ·
# A-41 plinth rim per world · A-16 level-less biz · A-17 tap → pick, drag/empty → none · A-18 ±22 px (phone) · A-30 idle frames ·
# A-31 hidden tab · A-23 reduced motion (dice ≤ 200 ms, 7-tile move ≤ 300 ms, no confetti, damping off, no camera shake) ·
# A-9 lastTurnMs normal/turbo · A-32 w1 → w2 → w1 memory + cache dirs · A-12/A-19 2D cards (buttons, data-level, names, pick) ·
# A-42 no page errors. Screenshots: w1–w4 + h (desktop + phone, fixture city, overview), 2D, reduced motion.
import asyncio, json, os, re, sys, time
from playwright.async_api import async_playwright
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
POS = [a for a in sys.argv[1:] if not a.startswith('--')]
BASE = POS[0] if POS else 'http://localhost:8802/'
ONLY = set(OPT['only'].split(',')) if OPT.get('only') else None
SHOTS = OPT.get('shots', '/tmp/t5b/shots'); os.makedirs(SHOTS, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info',
        '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost, EXCLUDE 127.0.0.1']
SEED = ("if (!sessionStorage.getItem('t5s')) { sessionStorage.setItem('t5s','1'); localStorage.setItem('rr2-onboarded','1');"
        "localStorage.setItem('rr2-progress', JSON.stringify({stars:{w1:3,w2:3,w3:3,w4:1},best:{w1:14},tutorialDone:true,gamesPlayed:9,wins:4})); }")
RESULTS = []; ERRS = []
def check(sc, name, cond, detail=''):
    RESULTS.append((sc, name, bool(cond), str(detail)[:300])); print(('PASS' if cond else 'FAIL'), sc, name, str(detail)[:300], flush=True)
want = lambda s: ONLY is None or s in ONLY

async def page(b, sc, q='', vp=None, mobile=False, dpr=1, init=None):
    ctx = await b.new_context(viewport=vp or {'width': 1300, 'height': 820}, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile, service_workers='block')
    await ctx.add_init_script(SEED)
    for s in init or []: await ctx.add_init_script(s)
    pg = await ctx.new_page(); pg.set_default_timeout(300000)
    reqs = []; pg.on('request', lambda r: reqs.append((time.time(), r.url)))
    pg.on('pageerror', lambda e: ERRS.append((sc, str(e)[:200])))
    t = time.time(); await pg.goto(BASE + q); await pg.wait_for_selector('.lb-home')
    return ctx, pg, reqs, t

async def start(pg, world='w1', nth=0):
    await pg.click(f'.map-card[data-id="{world}"]'); await pg.wait_for_selector('.wv-chars')
    await pg.locator('.wv-char').nth(nth).click()
    for i in range(2):
        try: await pg.wait_for_function("!document.querySelector('#roll').disabled && document.querySelector('#start').hidden", timeout=20000 if i == 0 else 300000); break
        except Exception:  # noqa: BLE001
            if await pg.locator('#gm:not([hidden]) .acts button.primary').count(): await pg.click('#gm .acts button.primary')
            elif i: raise
    await pg.evaluate("document.querySelectorAll('#coach,.coach').forEach(e => e.hidden = true)")

S = "import('/js/scene.js')"
async def stats(pg): return await pg.evaluate(S + ".then(s => { const p = s.perfStats(); delete p.glb; return p; })")
async def overview(pg, ms=2500):
    await pg.evaluate(S + ".then(s => { s.setCameraMode('overview'); s.invalidate(); })"); await pg.wait_for_timeout(ms)

async def show_world(pg, wid):
    """build another world on the running page (models preloaded), apply its theme, fixture city via the URL ?fx param"""
    return await pg.evaluate("""async (wid) => { const [s, E, u] = await Promise.all([import('/js/scene.js'), import('/js/engine.js'), import('/js/ui.js')]);
      const w = E.getWorld(wid); await s.preloadWorld(w); u.applyTheme(w); s.buildWorld(w); s.placePawn(0); s.syncCity([], { silent: true });
      s.setCameraMode('overview'); s.invalidate(); return s.perfStats().city; }""", wid)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        if want('boot') or want('city') or want('pick') or want('hidden') or want('turn') or want('worlds'):
            ctx, pg, reqs, t0 = await page(b, 'city', '?fx=levels')
            await pg.wait_for_timeout(4000)   # lobby idle (3D init behind it)
            glb_lobby = [u for _, u in reqs if u.endswith('.glb')]
            tclick = time.time(); await start(pg, 'w1'); troll = time.time()
            glb_roll = [u.split('/assets/')[-1] for t, u in reqs if u.endswith('.glb') and t <= troll]
            bad = [u for u in glb_roll if u.startswith(('life/', 'history/')) or re.match(r'w[234]/', u)]
            if want('boot'):
                check('boot', 'CR-05/A-35: no life/history/other-world GLB before roll enabled', not bad, bad)
                check('boot', 'GLBs before roll = w1 set + pawn', len(glb_roll) <= 6, glb_roll)
                check('boot', 'click → roll (s, swiftshader, report)', True, round(troll - tclick, 1))
            st = await stats(pg)
            check('city', 'tier low on software GL: shadows off, no AA, DPR 0.6', st['tier'] == 'low' and not st['shadows'] and not st['antialias'] and st['dpr'] == 0.6, st)
            await overview(pg)
            st = await stats(pg)
            check('city', 'A-26 calls 24 mixed-level items, overview, low ≤ 80', st['calls'] <= 80 and st['city'] == 24, f"calls {st['calls']} city {st['city']}")
            check('city', 'A-27 triangles ≤ 130k (low)', st['triangles'] <= 130000, st['triangles'])
            lv = await pg.evaluate(S + ".then(s => ['fx0','fx1','fx2','fx3','fx4','fx5','fx6'].map(k => s.levelOf(k)))")
            ok12 = (lv[0]['parts']['scaffold'] and not lv[0]['parts']['sign'] and lv[1]['parts']['sign'] and not lv[1]['annex'] and lv[2]['annex'] and not lv[2]['parts']['flag']
                    and lv[3]['parts']['flag'] and lv[3]['parts']['glow'] and [x['n'] for x in lv[:4]] == [0, 1, 2, 3])
            check('city', 'A-12 3D parts per stage (scaffold@0, sign@1, annex@2, flag+glow@3)', ok12, [(x['n'], x['annex']) for x in lv[:4]])
            check('city', 'A-16 plain item (and w1 has no upgrades): no level, plinth only', lv[4] is None and lv[6] is None)
            a16 = await pg.evaluate(S + ".then(s => { s.spawn('nostage', 'business', { silent: true, level: { kind: 'biz', type: 'coffee' } }); const l = s.levelOf('nostage'); s.despawn('nostage'); return l; })")
            check('city', 'A-16 biz entry without stage → plinth only', a16 is None, a16)
            await pg.screenshot(path=f'{SHOTS}/w1-desk-fixture-overview.png')
            if want('pick'):
                await pg.evaluate("import('/js/bus.js').then(({bus}) => { window.__picks = []; bus.on('city:pick', e => __picks.push(e)); })")
                # an item whose projected point is not covered by HUD / sheet DOM (taps there belong to the DOM)
                c = await pg.evaluate(S + ".then(s => { for (let i = 0; i < 24; i++) { const k = 'fx' + i; const p = s.project(k); const e = document.elementFromPoint(p.x, p.y); if (e && e.id === 'c') return { ...p, k }; } return null; })")
                check('pick', 'an uncovered item exists', c, c)
                await pg.mouse.click(c['x'], c['y']); await pg.wait_for_timeout(600)
                pk = await pg.evaluate('__picks')
                check('pick', 'A-17 click on an item → city:pick with its key', pk and pk[-1]['key'] == c['k'], (pk, c['k']))
                await pg.evaluate('__picks.length = 0')
                await pg.mouse.move(c['x'], c['y']); await pg.mouse.down(); await pg.mouse.move(c['x'] + 12, c['y'], steps=4); await pg.mouse.up(); await pg.wait_for_timeout(300)
                check('pick', 'A-17 12 px drag → no pick', not await pg.evaluate('__picks.length'))
                await pg.mouse.click(30, 400); await pg.wait_for_timeout(300)
                check('pick', 'A-17 tap on empty board → no pick', not await pg.evaluate('__picks.length'))
                hl = await pg.evaluate(S + ".then(s => { s.highlight('fx3'); return s.perfStats().city; })")
                check('pick', 'highlight() runs', hl == 24)
            if want('hidden'):
                await pg.wait_for_timeout(3500)
                f0 = (await stats(pg))['framesRendered']; await pg.wait_for_timeout(5000); f1 = (await stats(pg))['framesRendered']
                check('hidden', 'A-30 idle 5 s after 3 s quiet: frames ≤ 2', f1 - f0 <= 2, f1 - f0)
                await pg.evaluate("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))")
                f0 = (await stats(pg))['framesRendered']
                await pg.evaluate(S + ".then(s => { s.floatLabel('test', 'green', 'pawn'); s.wake(3000); })"); await pg.wait_for_timeout(3000)
                f1 = (await stats(pg))['framesRendered']
                check('hidden', 'A-31 hidden 3 s with an animation running: 0 frames', f1 == f0, f1 - f0)
                await pg.evaluate("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'))")
                await pg.wait_for_timeout(1500); f2 = (await stats(pg))['framesRendered']
                check('hidden', 'A-31 rendering resumes when visible', f2 > f1, f2 - f1)
            if want('turn'):
                tm = await pg.evaluate("""async () => { const s = await import('/js/scene.js'); s.setMotion(false); s.setSpeed(1);
                  await s.throwDice([3, 4]); for (let i = 0; i < 7; i++) await s.hop(i, i + 1, i === 6); const n = s.perfStats().lastTurnMs;
                  s.setSpeed(0.5); await s.throwDice([1, 6]); for (let i = 7; i < 14; i++) await s.hop(i, i + 1, i === 13); const t = s.perfStats().lastTurnMs; s.setSpeed(1);
                  let ts = 0; const p = s.throwDice([2, 2]); setTimeout(() => { ts = performance.now(); s.skip(); }, 50); await p; const sk = performance.now() - ts; return { n, t, sk }; }""")
                check('turn', 'A-9 7-tile turn ≤ 2600 ms requested (normal)', tm['n'] <= 2600, tm)
                check('turn', 'A-9 turbo ≤ 1400 ms', tm['t'] <= 1400, tm)
                check('turn', 'A-10 skip() → the awaited throw resolves within 100 ms', tm['sk'] <= 100, round(tm['sk']))
            if want('motion'):
                mm = await pg.evaluate("""async () => { const s = await import('/js/scene.js'); s.setMotion(true);
                  let t0 = performance.now(); await s.throwDice([5, 6]); const dice = s.perfStats().lastTurnMs;
                  s.perfStats(); t0 = performance.now(); for (let i = 0; i < 7; i++) await s.hop(i, i + 1, i === 6); const hop = performance.now() - t0; const req = s.perfStats().lastTurnMs;
                  const st0 = s.perfStats(); const c0 = performance.now(); await s.confetti(); const conf = performance.now() - c0;
                  const p0 = JSON.stringify(s.cameraState().pos); s.shake(0.4, 500); s.wake(600); await new Promise((r) => setTimeout(r, 700)); const p1 = JSON.stringify(s.cameraState().pos);
                  const damping = s.perfStats().damping; s.setMotion(false); const damping2 = s.perfStats().damping;
                  return { dice, hop, req, reduced: st0.reduced, conf, camSame: p0 === p1, damping, damping2 }; }""")
                check('motion', 'A-23 reduced: throwDice ≤ 200 ms requested', mm['dice'] <= 200, mm)
                check('motion', 'A-23 reduced: 7-tile move ≤ 300 ms requested (after the 150 ms dice)', mm['req'] - mm['dice'] <= 300, mm)
                check('motion', 'A-23 reduced: confetti resolves at once (none added), no camera shake', mm['conf'] < 50 and mm['camSame'], mm)
                check('motion', 'A-23 reduced: controls.enableDamping false (true again when full)', mm['damping'] is False and mm['damping2'] is True, mm)
                await pg.screenshot(path=f'{SHOTS}/w1-desk-reduced.png')
            if want('worlds'):
                m0 = await pg.evaluate(S + ".then(s => { const p = s.perfStats(); return { g: p.geos, t: p.textures, dirs: [...new Set(p.glb.map(u => u.split('/')[1]))] }; })")
                for wid in ('w2', 'w1'): await show_world(pg, wid); await pg.wait_for_timeout(2500)
                m1 = await pg.evaluate(S + ".then(s => { const p = s.perfStats(); return { g: p.geos, t: p.textures, dirs: [...new Set(p.glb.map(u => u.split('/')[1]))] }; })")
                check('worlds', 'A-32 w1 → w2 → w1: geometries/textures ≤ first + 5', m1['g'] <= m0['g'] + 5 and m1['t'] <= m0['t'] + 5, (m0, m1))
                check('worlds', 'A-32 cache = current world dir + life/pawns/history only', not any(d in m1['dirs'] for d in ('w2', 'w3', 'w4')), m1['dirs'])
            await ctx.close()
        if want('phone'):
            ctx, pg, _, _ = await page(b, 'phone', '?fx=levels', vp={'width': 390, 'height': 844}, mobile=True, dpr=3)
            await start(pg, 'w1'); await overview(pg, 3000)
            r = await pg.evaluate("""async () => { const s = await import('/js/scene.js'); const bad = [];
              const C = {}; for (let i = 0; i < 24; i++) C['fx' + i] = s.project('fx' + i);
              const nearest = (x, y) => { let b = null, d = Infinity; for (const [k, p] of Object.entries(C)) { const e = (p.x - x) ** 2 + (p.y - y) ** 2; if (e < d) { d = e; b = k; } } return b; };
              for (let i = 0; i < 24; i++) { const k = 'fx' + i; const c = C[k];
                for (const [dx, dy] of [[22, 0], [-22, 0], [0, 22], [0, -22]]) { const g = s.pickAt(c.x + dx, c.y + dy); const want = nearest(c.x + dx, c.y + dy); if (g !== want) bad.push([k, dx, dy, g, want]); } }
              return { bad: bad.length, sample: bad.slice(0, 6), dpr: s.perfStats().dpr }; }""")
            check('phone', 'A-18 pickAt(c ± 22 px) returns the item, overlaps → nearest centre (24 items, 390 px)', r['bad'] == 0, r)
            await pg.evaluate("import('/js/bus.js').then(({bus}) => { window.__picks = []; bus.on('city:pick', e => __picks.push(e)); })")
            c = await pg.evaluate(S + ".then(s => s.project('fx0'))")
            await pg.touchscreen.tap(c['x'], c['y']); await pg.wait_for_timeout(500)
            pk = await pg.evaluate('__picks')
            check('phone', 'A-17 touch tap → pick', pk and pk[-1]['key'] == 'fx0', pk)
            await pg.screenshot(path=f'{SHOTS}/w1-phone-fixture-overview.png')
            await ctx.close()
        if want('twod'):
            ctx, pg, reqs, _ = await page(b, 'twod', '?ff=board2d:on&fx=levels:12')
            await start(pg, 'w1')
            cards = await pg.evaluate("""() => [...document.querySelectorAll('#board2d .b2d-card')].map(c => ({ tag: c.tagName, key: c.dataset.key, level: c.dataset.level ?? null, kind: c.dataset.kind, name: c.getAttribute('aria-label'), w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height, border: getComputedStyle(c).borderTopStyle }))""")
            fx = {c['key']: c for c in cards if c['key'].startswith('fx')}
            check('twod', 'A-19 every city card is a <button>', cards and all(c['tag'] == 'BUTTON' for c in cards), len(cards))
            check('twod', 'A-12 2D data-level 0..3 and border styles', [fx[f'fx{i}']['level'] for i in range(4)] == ['0', '1', '2', '3'] and fx['fx0']['border'] == 'dashed' and fx['fx3']['border'] == 'double', [(fx[f'fx{i}']['level'], fx[f'fx{i}']['border']) for i in range(4)])
            check('twod', 'T5-C2 names carry T5-L0/L1', 'בהתחלה · עוד לא יציב' in fx['fx0']['name'] and 'שלב 2 מתוך 3 · צומח' in fx['fx2']['name'], fx['fx2']['name'])
            check('twod', 'A-39 cards ≥ 24×24 (gridN 4)', all(c['w'] >= 24 and c['h'] >= 24 for c in cards), min(c['w'] for c in cards))
            await pg.evaluate("import('/js/bus.js').then(({bus}) => { window.__picks = []; bus.on('city:pick', e => __picks.push(e)); })")
            await pg.focus('#board2d .b2d-card[data-key="fx2"]'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
            pk = await pg.evaluate('__picks')
            check('twod', 'A-19 Enter on a card → the same pick event', pk and pk[-1]['key'] == 'fx2' and pk[-1]['source'] == '2d', pk)
            check('twod', '2D: no .glb / three request', not any(u.endswith('.glb') for _, u in reqs))
            await pg.screenshot(path=f'{SHOTS}/w1-desk-2d-fixture.png')
            await ctx.close()
        if want('shots'):
            for vp, tag, mob, dpr in (({'width': 1300, 'height': 820}, 'desk', False, 1), ({'width': 390, 'height': 844}, 'phone', True, 3)):
                ctx, pg, _, _ = await page(b, 'shots', '?fx=levels:12', vp=vp, mobile=mob, dpr=dpr)
                await start(pg, 'w1'); await overview(pg)
                for wid in ('w1', 'w2', 'w3', 'w4', 'h'):
                    n = await show_world(pg, wid); await pg.wait_for_timeout(3500)
                    await pg.screenshot(path=f'{SHOTS}/{wid}-{tag}-fixture.png')
                    rim = await pg.evaluate("import('/js/scene.js').then(s => s.perfStats().city)")
                    check('shots', f'{wid} {tag}: fixture city on screen', n == 12 and rim == 12, n)
                await ctx.close()
        await b.close()
    for sc, e in ERRS: check(sc, 'A-42 no page error', False, e)
    fails = [r for r in RESULTS if not r[2]]
    print(f'{len(RESULTS) - len(fails)} passed, {len(fails)} failed')
    json.dump(RESULTS, open(f'{SHOTS}/../t5_render_e2e.json', 'w'), ensure_ascii=False, indent=1)
    sys.exit(1 if fails else 0)

asyncio.run(main())
