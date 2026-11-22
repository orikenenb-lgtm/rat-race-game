# T6 client e2e (rivals / end summary / practice rewind / ranked gates / perf) — offline: every *.supabase.co request goes to the
# shared fake backend + guard (tests/fakebackend.py); nothing leaves the machine, production is never called.
# Usage:  COPY_DIR=/tmp/t6c PORT_BASE=8840 bash tests/serve_copies.sh
#         python3 tests/t6_e2e.py [--real=http://localhost:8842/] [--copy=/tmp/t6c/rr2real] [--only=end,rewind,live,ranked,verdict,deal,perf] [--shots=/tmp/t6c]
# The archetype policies are an engine-lane module that has not landed: when the copy has no js/systems/archetypes.js the test copies
# tests/fixtures/t6_archetypes.mjs there (a TEST-ONLY stand-in) so the worker pipeline runs; the real module is used when it exists.
# Saves are fixtures built by replaying real sim games (tests/t6_fixture.mjs) — no production test hook.
import asyncio, hashlib, json, os, shutil, subprocess, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
arg = lambda k, d: next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{k}=')), d)
COPY_DIR = os.environ.get('COPY_DIR', '/tmp/t6c'); PORT_BASE = int(os.environ.get('PORT_BASE', '8840'))
REAL = arg('real', f'http://localhost:{PORT_BASE + 2}/'); COPY = arg('copy', f'{COPY_DIR}/rr2real')
SHOT = arg('shots', os.environ.get('RR_SHOTS', COPY_DIR)).rstrip('/') + '/'
ONLY = arg('only', '').split(',') if arg('only', '') else None
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
RES = []; ERRS = []; SINKS = []; NOTES = []
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def check(ok, msg): RES.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
PHONE = {'width': 390, 'height': 844}; DESK = {'width': 1300, 'height': 820}
FLAGS = {'rivals': True, 'rewind': True, 'recap2': True, 'board2d': 'on'}   # the flat board: the T6 code paths are renderer-independent, and it is ~5× faster here

def fixtures():
    out = subprocess.run(['node', os.path.join(HERE, 't6_fixture.mjs')], capture_output=True, text=True, timeout=300, cwd=ROOT)
    if out.returncode: raise SystemExit('fixture generator failed: ' + out.stderr[-500:])
    return json.loads(out.stdout)

def stand_in_policies():
    """the ghosts run the engine lane's js/systems/archetypes.js (ARCH_API 2) — no stand-in any more (review m2 / M7)"""
    dst = os.path.join(COPY, 'js', 'systems', 'archetypes.js')
    if not os.path.exists(dst) or 'TEST-ONLY stand-in' in open(dst, encoding='utf8').read(): raise SystemExit('the copy has no real js/systems/archetypes.js')
    NOTES.append('archetypes: the engine lane module (ARCH_API 2)')

async def life_click(pg, kind):
    """tap a HUD life chip; on a narrow row it may sit behind the "⋯" chip (T7 polish: overflow list) — open the list first"""
    if not await pg.locator(f'#hLife > [data-life={kind}]:not([hidden])').count() and await pg.locator('#hLife > .lc.more').count():
        if await pg.get_attribute('#hLife > .lc.more', 'aria-expanded') != 'true': await pg.click('#hLife > .lc.more')
        await pg.click(f'#hLifeMore [data-life={kind}]'); return
    await pg.click(f'#hLife > [data-life={kind}]')

async def page(b, vp=PHONE, saves=(), flags=FLAGS, extra=''):
    ctx = await b.new_context(**FB.new_context_kwargs(), viewport=vp, device_scale_factor=1)
    fb = FB.FakeBackend(); SINKS.append(await FB.install_mode(ctx, fb, MODE))
    init = "if(!sessionStorage.getItem('t6init')){sessionStorage.setItem('t6init','1');localStorage.setItem('rr2-onboarded','1');" + \
        f"localStorage.setItem('rr2-flags',{json.dumps(json.dumps(flags))});" + \
        ''.join(f"localStorage.setItem({json.dumps(k)},{json.dumps(v)});" for k, v in saves) + "}" + extra
    await ctx.add_init_script(init)
    pg = await ctx.new_page(); pg.set_default_timeout(120000)
    pg.on('pageerror', lambda e: (ERRS.append(str(e)), log('PAGEERR', e)))
    pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and (ERRS.append(m.text), log('CONSOLE', m.text)))
    return ctx, pg

STATE = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden, gm: !document.querySelector('#gm').hidden,
  start: !document.querySelector('#start').hidden, coach: !document.querySelector('#coach').hidden, story: !document.querySelector('#story').hidden,
  end: !!document.querySelector('#start:not([hidden]) .lb-end'), month: (document.querySelector('#hMonth')||{}).textContent })"""
async def st(pg): return await pg.evaluate(STATE)
async def answer(pg):
    await pg.evaluate("""() => { const c = document.querySelector('#evCard'); if (!c) return;
      const b = c.querySelector('button.primary:not(:disabled)') || ['done','ok','pass','skip','pay','buy','buyVar'].map((id) => c.querySelector(`button[data-o="${id}"]:not(:disabled)`)).find(Boolean)
        || c.querySelector('button[data-o]:not(:disabled)'); if (b) b.click(); }""")
async def step(pg, rolls_max=1):
    """one unit of play; → state"""
    s = await st(pg)
    if s['end']: return s
    if s['coach']: await pg.evaluate("() => (document.querySelector('#coach button.primary') || document.querySelector('#coach button')).click()"); await pg.wait_for_timeout(250); return s
    if s['gm']: await pg.evaluate("() => (document.querySelector('#gm .acts button.primary') || document.querySelector('#gm .acts button')).click()"); await pg.wait_for_timeout(250); return s
    if s['story']: await pg.click('#stGo'); await pg.wait_for_timeout(300); return s
    if s['card']: await answer(pg); await pg.wait_for_timeout(350); return s
    if s['roll'] and not s['start']: await pg.click('#roll'); await pg.wait_for_timeout(600); return s
    await pg.wait_for_timeout(300); return s
async def click_calm(pg, sel, tries=12):
    """click `sel`; a T4 coach bubble (e.g. the 🛟 fund hint) that opens meanwhile intercepts pointer events by design — dismiss it
    (step() presses its button) and try again. Toasts hide by themselves (each try waits up to 10 s for them)."""
    for i in range(tries):
        try: await pg.click(sel, timeout=10000); return
        except Exception:  # noqa: BLE001
            if i == tries - 1: raise
            if (await st(pg))['coach']: await step(pg)
async def play_until(pg, cond, limit=400, label=''):
    for i in range(limit):
        if await cond(): return True
        await step(pg)
    log('play_until gave up', label, await st(pg)); return False
async def rolls(pg, n):
    k = 0
    for i in range(n * 12):
        s = await st(pg)
        if s['end'] or s['start']: return k
        if s['roll'] and not s['card'] and not s['gm'] and not s['coach']: k += 1
        if k > n: return k
        await step(pg)
    return k
async def shot(pg, name): await pg.wait_for_timeout(700); await pg.screenshot(path=SHOT + f't6_{name}.png'); log('  shot', SHOT + f't6_{name}.png')
async def ls(pg, k): return await pg.evaluate("(k) => localStorage.getItem(k)", k)
async def hashes(pg, keys):
    return [hashlib.sha256(v.encode()).hexdigest() if v is not None else 'ABSENT' for v in [await ls(pg, k) for k in keys]]
async def to_world(pg, wid='w1'):
    await pg.goto(REAL + 'index.html'); await pg.wait_for_selector('.lb-home, .lb-world', timeout=120000); await pg.wait_for_timeout(600)
    await pg.evaluate(f"() => document.querySelector('[data-act=\"world\"][data-id=\"{wid}\"]')?.click()"); await pg.wait_for_selector('.lb-world', timeout=30000)
async def wait_ready(pg, t=150):
    for i in range(int(t * 4)):
        if i and i % 80 == 0: log('  waiting for the game…', await st(pg))
        s = await st(pg)
        if not s['start'] and (s['roll'] or s['card'] or s['gm'] or s['coach']): return True
        await pg.wait_for_timeout(250)
    return False

# ---------------------------------------------------------------- A. play a learning game to the end: summary, graph, table, ghosts
async def t_end(b, F):
    if not F['nearEnd']: check(False, 'fixture: a near-end learn game'); return
    ctx, pg = await page(b, PHONE, saves=[(F['nearEnd']['key'], F['nearEnd']['raw']), (F['mid']['key'], F['mid']['raw'])])
    await to_world(pg)
    await pg.click('[data-act="continue-free"][data-learn="1"]'); check(await wait_ready(pg), 'learn game resumed from the fixture save')
    await pg.wait_for_timeout(800)
    hud = await pg.evaluate("() => ({ rv: !!document.querySelector('#hLife [data-life=rivals]'), mo: !!document.querySelector('#hLife [data-life=moments]') })")
    check(hud['rv'] and hud['mo'], f'HUD chips 👥 יריבים + ⏪ רגעי החלטה in a learn game ({hud})')
    ended = await play_until(pg, lambda: pg.evaluate("() => !!document.querySelector('#start:not([hidden]) .lb-end')"), 500, 'to end')
    check(ended, 'played the learning game to its end through the UI')
    if not ended: await shot(pg, 'end_stuck'); await ctx.close(); return
    await pg.wait_for_selector('#endTop', timeout=20000)
    await pg.wait_for_timeout(700)
    await shot(pg, 'end_top_phone')
    info = await pg.evaluate("""() => { const t = document.querySelector('#endTop'); const svg = t.querySelector('svg.t6-graph');
      return { h: t.scrollHeight, vh: innerHeight, svg: !!svg, role: svg && svg.getAttribute('role'), alt: svg && svg.getAttribute('aria-label'), dims: t.querySelectorAll('.t6-dim').length,
        more: !!document.querySelector('#t6More'), story: !document.querySelector('#story').hidden, sug: !!t.querySelector('.t6-sug'), rw: !!t.querySelector('[data-act=t6-moments],[data-act=t6-rewind]') }; }""")
    log('  endTop', info)
    check(info['svg'] and info['role'] == 'img' and (info['alt'] or '').startswith('שווי נקי: התחלת ב־'), 'graph: SVG role=img with the alt sentence')
    check(info['dims'] == 5, 'five dimension rows')
    check(info['h'] <= 1.5 * info['vh'], f"AC-23: #endTop {info['h']} px ≤ 1.5 × {info['vh']} (phone)")
    check(not info['story'], 'recap2: no life-story overlay (it is the "סיפור החיים" section)')
    check(info['rw'], 'rewind entry on the end screen (free / learn, flag rewind)')
    # AC-25: the table toggle by keyboard; the table holds the timeline months
    await pg.focus('#endTop [data-t6="table"]'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
    tb = await pg.evaluate("""() => { const t = document.querySelector('#endTop table.t6-table'); return t ? { cap: t.querySelector('caption').textContent, rows: t.querySelectorAll('tbody tr').length, more: !!document.querySelector('#endTop [data-t6=rows]') } : null; }""")
    check(tb and tb['cap'] == 'הנתונים של הגרף' and tb['rows'] >= 1, f'AC-25: keyboard toggle → the table ({tb})')
    if tb and tb['more']:
        await pg.focus('#endTop [data-t6=rows]'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
    tlm = await pg.evaluate("""() => [...document.querySelectorAll('#endTop table.t6-table tbody th')].map((x) => +x.textContent)""")
    saved = json.loads(F['nearEnd']['raw'])['state']['ui']['tl']['m']
    check(len(tlm) >= len(saved) and tlm[:len(saved)] == saved, f'AC-25: table rows = the timeline months ({len(tlm)} rows)')
    await pg.focus('#endTop [data-t6="table"]'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
    check(await pg.evaluate("() => !!document.querySelector('#endTop svg.t6-graph')"), 'AC-25: toggle back to the graph by keyboard')
    await pg.click('#endTop [data-t6="tab"][data-s="happy"]'); await pg.wait_for_timeout(200)
    check(await pg.evaluate("() => !!document.querySelector('#endTop svg.t6-graph .g-hap')"), 'tab 😊 אושר וכוח: happiness + energy lines')
    # ghosts finish → comparison lines + "מול היריבים"
    ok = False
    for i in range(240):
        ok = await pg.evaluate("() => document.querySelectorAll('#t6Dims .t6-cmp:not(.pend)').length >= 3")
        if ok: break
        await pg.wait_for_timeout(500)
    st6 = await pg.evaluate("() => window.__rrGhosts && window.__rrGhosts.status()")
    check(ok, f'ghosts finished: comparison lines under the dimensions ({st6})')
    cmp = await pg.evaluate("() => [...document.querySelectorAll('#t6Dims .t6-cmp')].map((x) => x.textContent)")
    log('  compare', cmp)
    check(all(c.startswith('מקום ') for c in cmp if c), 'comparison lines are places (raw facts, no score)')
    await pg.click('#t6More > summary'); await pg.wait_for_timeout(200)
    await pg.evaluate("() => { const s = [...document.querySelectorAll('.t6-sec')].find((d) => d.querySelector('summary').textContent === 'מול היריבים'); if (s) s.open = true; }")
    vs = await pg.evaluate("() => { const t = document.querySelector('.t6-vs'); return t ? t.querySelectorAll('tr').length : 0; }")
    check(vs == 6, f'"מול היריבים": you + 4 personas ({vs - 1 if vs else 0} rows)')
    await shot(pg, 'end_more_phone')
    life = await pg.evaluate("() => !![...document.querySelectorAll('.t6-sec summary')].find((s) => s.textContent === 'סיפור החיים')")
    check(life, '"סיפור החיים" section present')
    check(await pg.evaluate("() => !!document.querySelector('.end-analysis')"), 'ניתוח (ui.endAnalysisHtml) rendered by the lobby itself')
    last = await ls(pg, 'rr2-last-game')
    check(last is not None and json.loads(last)['cfg']['worldId'] == 'w1', 'rr2-last-game written at the end')
    ghc = await ls(pg, 'rr2-ghosts'); check(ghc is not None and len(json.loads(ghc)) == 1 and len(ghc) <= 80 * 1024, f'finished ghosts cached in rr2-ghosts ({len(ghc or "")} bytes)')
    # AC-18: the browser worker's ghost games equal a Node run of the same key (same engine, same policies)
    br = await pg.evaluate("() => ({ ends: window.__rrGhosts.ends(), cfg: JSON.parse(localStorage.getItem('rr2-last-game')).rcfg, cap: window.__rrGhosts.status().cap })")
    tmp = os.path.join(COPY_DIR, 't6_ac18.json'); json.dump(br, open(tmp, 'w'))
    out = subprocess.run(['node', os.path.join(HERE, 't6_ghost_node.mjs'), tmp], capture_output=True, text=True, timeout=600, cwd=os.path.join(COPY))
    log('  AC-18 node', out.stdout.strip()[-300:], out.stderr.strip()[-300:])
    check(out.returncode == 0 and 'SAME' in out.stdout, f'AC-18: browser worker ghosts == Node ghosts for the same key ({out.stdout.strip()[-120:]})')
    await ctx.close()

# ---------------------------------------------------------------- B. rewind from the end screen (origin = rr2-last-game), branch, compare, lobby card
async def t_rewind(b, F):
    ctx, pg = await page(b, PHONE, saves=[(F['nearEnd']['key'], F['nearEnd']['raw']), (F['mid']['key'], F['mid']['raw'])])
    await to_world(pg)
    await pg.click('[data-act="continue-free"][data-learn="1"]'); await wait_ready(pg)
    ended = await play_until(pg, lambda: pg.evaluate("() => !!document.querySelector('#start:not([hidden]) .lb-end')"), 500, 'to end')
    if not ended: check(False, 'rewind: game ended'); await ctx.close(); return
    await pg.wait_for_selector('#endTop', timeout=20000)
    ORIG = ['rr2-save-free-w1', 'rr2-save-learn-w1', 'rr2-last-game']
    h0 = await hashes(pg, ORIG)
    t0 = time.time()
    if await pg.locator('#endTop [data-act=t6-rewind]').count():   # the engine's suggestion carries its decision's card start (rule 1)
        k0 = await pg.evaluate("() => +document.querySelector('#endTop [data-act=t6-rewind]').dataset.k0")
        check(k0 > 0, f'suggestion CTA "🔁 לנסות את ההחלטה הזו אחרת" carries k0 = {k0}')
        await pg.click('#endTop [data-act=t6-rewind]')
    else:
        await pg.click('#endTop [data-act=t6-moments]')
        await pg.wait_for_selector('#gm:not([hidden]) .t6mo-list button[data-k0]', timeout=30000)
        n = await pg.evaluate("() => document.querySelectorAll('.t6mo-list button[data-k0]').length")
        check(n >= 3, f'"רגעי החלטה" sheet lists decisions of the last game ({n})')
        await shot(pg, 'moments_phone')
        await pg.evaluate("() => document.querySelectorAll('.t6mo-list button[data-k0]')[3].click()")
    await pg.wait_for_function('() => window.__t6branchMs != null || window.__t6branchErr', timeout=60000)
    okb = await wait_ready(pg, 120)
    ms = await pg.evaluate('() => window.__t6branchMs')
    check(okb, f'branch started (createBranch {ms} ms, total {time.time() - t0:.1f} s)')
    ban = await pg.evaluate("() => { const b = document.querySelector('#t6branch'); return b && !b.hidden ? b.textContent : null; }")
    check(ban and 'ענף תרגול' in ban, 'branch banner visible')
    br = json.loads(await ls(pg, 'rr2-save-branch-w1') or 'null')
    check(br and br['cfg'].get('learn') is True and br['state']['ui'].get('branch'), 'branch slot rr2-save-branch-w1 with learn:true and ui.branch')
    await shot(pg, 'branch_phone')
    k = await rolls(pg, 20)
    log('  branch rolls', k)
    h1 = await hashes(pg, ORIG)
    check(h1 == h0, f'AC-27: origin keys unchanged after create + {k} branch rolls')
    s = await st(pg)
    if not s['end'] and not s['start']:
        for i in range(20):
            s = await st(pg)
            if s['roll'] and not s['card'] and not s['gm'] and not s['coach']: break
            await step(pg)
        await click_calm(pg, '#t6branch [data-b=compare]'); await pg.wait_for_selector('#gm:not([hidden]) .t6-limits', timeout=10000)
        cmpi = await pg.evaluate("() => ({ lines: document.querySelectorAll('#gm svg .g-cmp, #gm svg .g-nw').length, lim: document.querySelectorAll('#gm .t6-limits li').length })")
        check(cmpi['lim'] == 5 and cmpi['lines'] >= 1, f'compare sheet: both lines + the 5 limits ({cmpi})')
        await shot(pg, 'compare_phone')
        await pg.click('#gm .acts button.primary')
        # M2: rr2-last-game now holds another game → no "המקור" any more
        keep = await ls(pg, 'rr2-last-game')
        await pg.evaluate("() => { const r = JSON.parse(localStorage.getItem('rr2-last-game')); r.rcfg = { ...r.rcfg, seed: (r.rcfg.seed + 1) >>> 0 }; localStorage.setItem('rr2-last-game', JSON.stringify(r)); }")
        await pg.wait_for_timeout(300); await click_calm(pg, '#t6branch [data-b=compare]')
        # toasts are queued (6 kept): the answer may wait behind a toast already on screen — poll for it (≤ 15 s)
        for _ in range(60):
            await pg.wait_for_timeout(250)
            tt = await pg.evaluate("() => ({ toast: document.querySelector('#toast').className.includes('on') ? document.querySelector('#toast').textContent : '', sheet: !!document.querySelector('#gm:not([hidden]) .t6-limits') })")
            if 'כבר לא זמין' in tt['toast'] or tt['sheet']: break
        check(not tt['sheet'] and 'כבר לא זמין' in tt['toast'], f'M2: another game in rr2-last-game → "the original is no longer available", no compare ({tt})')
        await pg.evaluate("(v) => localStorage.setItem('rr2-last-game', v)", keep)
        await pg.click('#homeBtn'); await pg.wait_for_selector('.lb-home', timeout=30000)
    await pg.evaluate("() => document.querySelector('[data-act=\"world\"][data-id=\"w1\"]').click()"); await pg.wait_for_selector('.lb-world')
    card = await pg.evaluate("() => ({ br: !!document.querySelector('[data-act=t6-branch]'), del: !!document.querySelector('[data-act=t6-branch-del]'), last: !!document.querySelector('[data-act=t6-last]') })")
    check(card['br'] and card['del'] and card['last'], f'lobby world card: branch continue / delete + "לחזור לרגע מהמשחק האחרון" ({card})')
    await shot(pg, 'world_branch_phone')
    await pg.click('[data-act=t6-branch-del]'); await pg.wait_for_selector('#gm:not([hidden])'); await pg.click('#gm .acts button.primary'); await pg.wait_for_timeout(500)
    gone = await pg.evaluate("() => localStorage.getItem('rr2-save-branch-w1') === null && !document.querySelector('[data-act=t6-branch]')")
    check(gone, 'delete: the branch slot is gone, its card too')
    check(await hashes(pg, ORIG) == h0, 'AC-27: origin keys unchanged after delete')
    # M1: an unfinished learning game exists; a branch is played to ITS end; "עוד תרגול" must not clear the learning game silently
    await pg.evaluate("(a) => localStorage.setItem(a[0], a[1])", [F['midLearn']['key'], F['midLearn']['raw']])
    hl = await hashes(pg, [F['midLearn']['key']])
    await pg.click('[data-act=t6-last]'); await pg.wait_for_selector('#gm:not([hidden]) .t6mo-list button[data-k0]', timeout=30000)
    await pg.evaluate("() => document.querySelectorAll('.t6mo-list button[data-k0]')[0].click()")   # the newest decision: the branch ends quickly
    await wait_ready(pg, 120)
    bend = await play_until(pg, lambda: pg.evaluate("() => !!document.querySelector('#start:not([hidden]) .lb-end')"), 500, 'branch to end')
    check(bend, 'M1: the practice branch was played to its own end')
    if bend:
        await pg.wait_for_selector('#endTop', timeout=20000); await shot(pg, 'branch_end_phone')
        cmp = await pg.evaluate("() => { const c = document.querySelector('#endTop .t6-bcmp'); return c ? { rows: [...c.querySelectorAll('tbody tr')].map((r) => [...r.children].map((x) => x.textContent.trim())), head: c.querySelector('h3').textContent } : null; }")
        check(cmp and len(cmp['rows']) >= 2 and any('שווי נקי' in r[0] and '₪' in r[1] and '₪' in r[2] for r in cmp['rows']) and any('זמן' in r[0] for r in cmp['rows']),
              f'director decision 5: the branch end compares with the original (M2 identity matches): {cmp}')
        btn = await pg.evaluate("() => [...document.querySelectorAll('.end-acts button, .end-more button')].map((x) => x.dataset.act)")
        check(await hashes(pg, [F['midLearn']['key']]) == hl, f'M1: the branch end did not touch the learning slot (buttons {btn})')
        await pg.evaluate("() => { window.__t6confirm = 0; }")
        await pg.click('[data-act="end-learn"]'); await pg.wait_for_selector('#gm:not([hidden])', timeout=10000)
        q = await pg.evaluate("() => document.querySelector('#gm').textContent")
        check('ימחק' in q, f'M1: "עוד תרגול" after a branch asks before replacing the learning game ({q[:60]})')
        await pg.click('#gm .acts button:not(.primary)'); await pg.wait_for_timeout(500)
        check(await hashes(pg, [F['midLearn']['key']]) == hl, 'M1: cancelled → the learning game is untouched')
    await ctx.close()

# ---------------------------------------------------------------- C. in-game: rivals panel (clamped), live branch from a free game
async def t_live(b, F):
    ctx, pg = await page(b, PHONE, saves=[(F['mid']['key'], F['mid']['raw']), (F['midLearn']['key'], F['midLearn']['raw'])])
    await to_world(pg)
    # M4: a live FREE game has no "רגעי החלטה" (it would be a look-ahead tool for a game that still earns rewards)
    await pg.click('[data-act="continue-free"]:not([data-learn])'); check(await wait_ready(pg), 'free game resumed (mid-game fixture)')
    await pg.wait_for_timeout(600)
    fm = await pg.evaluate("() => ({ mo: !!document.querySelector('#hLife [data-life=moments]'), rv: !!document.querySelector('#hLife [data-life=rivals]') })")
    check(not fm['mo'] and fm['rv'], f'M4: a live free game shows 👥 but no ⏪ רגעי החלטה ({fm})')
    await pg.click('#homeBtn'); await pg.wait_for_selector('.lb-home', timeout=30000)
    await pg.evaluate("() => document.querySelector('[data-act=\"world\"][data-id=\"w1\"]').click()"); await pg.wait_for_selector('.lb-world')
    await pg.click('[data-act="continue-free"][data-learn="1"]'); check(await wait_ready(pg), 'learning game resumed (mid-game fixture)')
    await rolls(pg, 4)
    for i in range(40):
        s = await st(pg)
        if s['roll'] and not s['card'] and not s['gm'] and not s['coach']: break
        await step(pg)
    await life_click(pg, 'rivals'); await pg.wait_for_selector('#t6rpBody', timeout=10000)
    for i in range(60):
        n = await pg.evaluate("() => document.querySelectorAll('#t6rpBody .t6rp-row .t6bar').length")
        if n >= 5: break
        await pg.wait_for_timeout(500)
    v = await pg.evaluate("() => { const m = +document.querySelector('#hMonth').textContent.replace(/[^0-9]/g,'') || 0; const g = window.__rrGhosts; const V = g.view(m); return { m, state: V.state, maxRow: Math.max(0, ...Object.values(V.ghosts).flatMap((x) => x.rows.map((r) => r[0]))), audit: g.audit(), status: g.status() }; }")
    log('  rivals view', v)
    check(n >= 5, f'rivals sheet: you + 4 ghost rows with progress ({n})')
    check(v['maxRow'] <= v['status']['upTo'] and v['audit']['violations'] == 0, f"AC-17: ghost rows ≤ the player's month ({v['maxRow']} ≤ {v['status']['upTo']}), 0 violations")
    await shot(pg, 'rivals_phone')
    await pg.click('#gm .acts button.primary'); await pg.wait_for_timeout(300)
    h0 = None
    await life_click(pg, 'moments'); await pg.wait_for_selector('#gm:not([hidden]) .t6mo-list button[data-k0]', timeout=20000)
    await pg.evaluate("() => document.querySelectorAll('.t6mo-list button[data-k0]')[1].click()")
    await wait_ready(pg, 120); await pg.wait_for_timeout(500)
    lb = await pg.evaluate("() => ({ ms: window.__t6branchMs, err: window.__t6branchErr, banner: !!(document.querySelector('#t6branch') && !document.querySelector('#t6branch').hidden) })")
    check(lb['banner'] and lb['ms'] is not None, f"live branch started ({lb})")
    ORIG = ['rr2-save-free-w1', 'rr2-save-learn-w1', 'rr2-last-game']
    h0 = await hashes(pg, ORIG)
    k = await rolls(pg, 8)
    check(await hashes(pg, ORIG) == h0, f'AC-27 (live learning origin): the original slots are unchanged after {k} branch rolls')
    for i in range(30):
        s = await st(pg)
        if s['roll'] and not s['card'] and not s['gm']: break
        await step(pg)
    await pg.click('#t6branch [data-b=back]'); await wait_ready(pg)
    back = await pg.evaluate("() => ({ banner: !!(document.querySelector('#t6branch') && !document.querySelector('#t6branch').hidden) })")
    check(not back['banner'], '"חזרה למקור" resumes the original (no banner)')
    await ctx.close()

# ---------------------------------------------------------------- D. ranked: no rewind / after-win anywhere, gates hold with ?ff=
async def t_ranked(b, F):
    ctx, pg = await page(b, PHONE, flags={**FLAGS, 'afterwin': True})
    await pg.goto(REAL + 'index.html?ff=rewind,afterwin'); await pg.wait_for_selector('.lb-home', timeout=120000)
    r = await pg.evaluate("""async () => { const RW = await import('/js/rewind.js'); const F = await import('/js/flags.js'); const out = {};
      out.flag = ['daily','weekly','challenge'].map((m) => F.flagFor('rewind', { mode: m }) || F.flagFor('afterwin', { mode: m }));
      out.allowed = ['daily','weekly','challenge'].map((m) => RW.allowed({ mode: m, worldId: 'w1' }));
      out.free = RW.endAllowed({ mode: 'free', worldId: 'w1' }) && !RW.allowed({ mode: 'free', worldId: 'w1' }) && RW.allowed({ mode: 'free', worldId: 'w1', learn: true });   // M4: live branches in learn games only
      try { await RW.createBranch({ origin: 'live', w: 'w1', k0: 1, originKey: 'rr2-save-free-w1', cfg: { mode: 'daily', worldId: 'w1' } }); out.thrown = null; } catch (e) { out.thrown = e.message; }
      const g = await import('/js/game.js'); out.diverged = g.pickRankedState({ seed: 1, ui: { seq: 9 }, actions: [['r'], ['l'], ['c','x']] }, { seed: 1, ui: { seq: 2 }, actions: [['r'], ['l'], ['c','y']] }).ui.seq;
      return out; }""")
    check(r['flag'] == [False, False, False] and r['allowed'] == [False, False, False] and r['free'] is True, f'AC-29: flagFor/allowed false in ranked modes even with ?ff= ({r})')
    check(r['thrown'] == 'rewind_ranked', "AC-29: createBranch(ranked) throws rewind_ranked")
    check(r['diverged'] == 2, 'AC-29: ranked resume ignores a newer local save that does not extend the server log')
    await pg.evaluate("() => { import('/js/game.js').then((g) => g.startGame({ worldId: 'w1', charId: 'teacher', mode: 'daily', seed: 4242, maxMonths: 24, pawn: 'classic', pawnColor: '#e2483d', dateKey: '2026-11-22' })); }")   # startGame resolves after the coach: do not await it
    await wait_ready(pg); await rolls(pg, 2)
    for i in range(20):
        s = await st(pg)
        if s['roll'] and not s['card'] and not s['gm']: break
        await step(pg)
    dom = await pg.evaluate("() => ({ mo: !!document.querySelector('[data-life=moments]'), aw: !!document.querySelector('[data-life=afterwin]'), rv: !!document.querySelector('[data-life=rivals]'), br: !!(document.querySelector('#t6branch') && !document.querySelector('#t6branch').hidden) })")
    check(not dom['mo'] and not dom['aw'] and not dom['br'], f'AC-29: a daily game has no rewind / after-win UI ({dom})')
    await shot(pg, 'daily_hud_phone')
    await ctx.close()

# ---------------------------------------------------------------- E. phone verdict pill never covers a card / dialog
async def t_verdict(b, F):
    ctx, pg = await page(b, PHONE, saves=[(F['mid']['key'], F['mid']['raw'])])
    await to_world(pg); await pg.click('[data-act="continue-free"]:not([data-learn])'); await wait_ready(pg)
    for i in range(30):
        s = await st(pg)
        if s['roll'] and not s['card'] and not s['gm'] and not s['coach']: break
        await step(pg)
    r = await pg.evaluate("""async () => { const u = await import('/js/ui.js'); const gm = document.querySelector('#gm'); const on = () => /\\bon\\b/.test((document.querySelector('#verdict')||{}).className || '');
      const sleep0 = (ms) => new Promise((r) => setTimeout(r, ms)); const sleep = async (ms) => { const cc = document.querySelector('#coach'); if (cc && !cc.hidden) (cc.querySelector('button.primary') || cc.querySelector('button'))?.click(); await sleep0(ms); };   // a coach bubble holds the overlay queue (by design)
      for (let i = 0; i < 40 && document.querySelector('#toast').className.includes('on'); i++) await sleep(250);
      gm.hidden = false; u.verdict({ score: 71, verdict: 'ok', why: 'בדיקה' }); let whileOpen = false; for (let i = 0; i < 8; i++) { await sleep(250); whileOpen = whileOpen || on(); }
      gm.hidden = true; let after = false, pos = null;
      for (let i = 0; i < 40 && !after; i++) { await sleep(200); after = on(); }
      if (after) { await sleep(400); const a = document.querySelector('#verdict').getBoundingClientRect(), c = document.querySelector('#bar').getBoundingClientRect(); pos = { bottom: Math.round(a.bottom), barTop: Math.round(c.top) }; }
      return { whileOpen, after, pos }; }""")
    check(r['whileOpen'] is False and r['after'] is True, f'phone: the verdict pill waits while a dialog covers the screen, then shows ({r})')
    check(r['pos'] is not None and r['pos']['bottom'] <= r['pos']['barTop'], f"the pill sits above the mentor bar, never over it ({r['pos']})")
    await shot(pg, 'verdict_phone')
    await ctx.close()

# ---------------------------------------------------------------- F. deal competition UI (engine data injected into a real deal card; the engine part is pending)
async def t_deal(b, F):
    """§12.1 with REAL engine data: a w1 state standing on a competed deal (found by the engine), resumed through the lobby; the interest
    row / persona chips / per-step risk chips come from ev.data.rivals and o.rivalRisk; the lower offer loses (seed checked on a copy) →
    the lost panel (no timed dismissal, no second sticky copy); 6 months later the reveal line stays until tapped / the next roll."""
    ctx, pg = await page(b, PHONE)
    await pg.goto(REAL + 'index.html'); await pg.wait_for_selector('.lb-home', timeout=120000)
    r = await pg.evaluate("""async () => { const E = await import('/js/engine.js');
      for (let seed = 1; seed < 400; seed++) {
        const st = E.createGame({ worldId: 'w1', seed, mode: 'free', mentor: 'hint' }); st.cash = 150000; const W = E.getWorld('w1');
        st.pending = null; st.pos = W.board.indexOf('O'); st.phase = 'land';
        const ev = E.landing(st); if (!ev || ev.type !== 'deal' || !ev.data.rivals || !(ev.data.rivals.n >= 1) || !ev.options.some((o) => o.kind === 'inspect')) continue;
        const off = ev.options.filter((o) => /^offer:/.test(o.id) && o.enabled).pop(); if (!off) continue;
        const tr = E.deserialize(E.serialize(st)); const rr = E.choose(tr, E.currentEvent(tr), off.id);
        if (!(rr.rival && rr.rival.lost)) continue;
        const cfg = { worldId: 'w1', charId: st.charId, seed, mode: 'free', pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true };
        localStorage.setItem('rr2-save-free-w1', JSON.stringify({ v: 3, app: 'nl1', sv: E.SAVE_VERSION, cfg, state: JSON.parse(E.serialize({ ...st, ui: { seq: 0, coach: {}, firstPayday: true } })), savedAt: 1 }));
        return { seed, offer: off.id, n: ev.data.rivals.n, text: ev.data.rivals.text, hz: ev.data.rivals.hazardNext, lostText: rr.rival.text }; }
      return null; }""")
    if not r: check(False, 'deal UI: the engine produced a competed deal whose lower offer loses (400 seeds)'); await ctx.close(); return
    log('  real deal', r)
    await to_world(pg); await pg.click('[data-act="continue-free"]:not([data-learn])'); await wait_ready(pg)
    await pg.wait_for_selector('#evCard.ev-deal', timeout=60000); await pg.wait_for_timeout(500)
    d = await pg.evaluate("""() => { const c = document.querySelector('#evCard'); const ins = c.querySelector('button[data-o="inspect:1"]'); const off = c.querySelector('button[data-o^="offer:"]'); const buy = c.querySelector('button[data-o^="buy"]');
      return { row: (c.querySelector('.rvrow') || {}).textContent || '', chips: c.querySelectorAll('.rvp').length, note: !!c.querySelector('.rvnote'),
        ins: ins ? ins.textContent : '', off: off ? off.textContent : '', buyChip: buy ? !!buy.querySelector('.rvchip') : null, clock: /⏳/.test(c.textContent) }; }""")
    log('  card', d)
    pct = f"{round(r['hz'] * 100)}%"
    check('מתעניין' in d['row'] and d['chips'] == r['n'] and d['note'], f"§12.1 interest row from ev.data.rivals: {r['n']} persona chips + explain line")
    check(pct in d['ins'] and 'שיקדימו אותך' in d['ins'] and pct in d['off'], f'o.rivalRisk ({pct}) on the inspect and offer buttons, part of their names')
    check(d['buyChip'] is False and not d['clock'], 'no chip on buy, no clock icon')
    await shot(pg, 'deal_live_phone')
    await pg.click(f'#evCard button[data-o="{r["offer"]}"]')
    await pg.wait_for_selector('#gm:not([hidden])', timeout=30000); await pg.wait_for_timeout(400)
    lp = await pg.evaluate("() => ({ t: (document.querySelector('#gmTitle') || {}).textContent || '', b: (document.querySelector('#gm .acts button') || {}).textContent || '', sticky: !!document.querySelector('#t6news.on') })")
    check(lp['t'] == r['lostText'] and lp['b'] == 'הבנתי' and not lp['sticky'], f'lost panel: out.rival.text, button "הבנתי", no duplicate sticky line ({lp})')
    await shot(pg, 'deal_lost_phone')
    await pg.wait_for_timeout(1500)
    check(await pg.evaluate("() => !document.querySelector('#gm').hidden"), 'the lost panel is not dismissed by a timer')
    await pg.click('#gm .acts button'); await pg.wait_for_timeout(500)
    # 6 months later: move the reveal to this payday and stand one tile before payday → the next roll reveals it
    await pg.evaluate("""async () => { const E = await import('/js/engine.js'); const G = await import('/js/game.js'); const k = 'rr2-save-free-w1';
      const sv = JSON.parse(localStorage.getItem(k)); const st = sv.state; const W = E.getWorld('w1');
      st.rivalDeals[0].revealAt = st.month; st.pos = (W.board.indexOf('P') - 1 + W.board.length) % W.board.length; st.pending = null; st.phase = 'roll';
      localStorage.setItem(k, JSON.stringify(sv)); G.startGame({ ...sv.cfg, resume: true }); await new Promise((r) => setTimeout(r, 300)); }""")
    await wait_ready(pg)
    for i in range(20):
        s = await st(pg)
        if s['roll'] and not s['card'] and not s['gm'] and not s['coach']: break
        await step(pg)
    await pg.click('#roll')
    ok = False
    for i in range(120):   # phones: the line waits in the one overlay queue until the board is clear — answer what opens
        ok = await pg.evaluate("() => !!document.querySelector('#t6news.on')")
        if ok: break
        s = await st(pg)
        if s['card'] or s['gm'] or s['coach'] or s['story']: await step(pg)
        await pg.wait_for_timeout(250)
    txt = await pg.evaluate("() => (document.querySelector('#t6news') || {}).textContent || ''")
    check(ok and len(txt) > 5, f'reveal news (real payday): a sticky line ({txt[:60]})')
    await shot(pg, 'deal_reveal_phone')
    await pg.wait_for_timeout(3000)
    check(await pg.evaluate("() => !!document.querySelector('#t6news.on')"), 'the reveal line is not timed (still there after 3 s)')
    await ctx.close()

# ---------------------------------------------------------------- F2. continue after the win (W) and retire (X) with the engine's real functions
async def t_afterwin(b, F):
    if not F['nearEnd']: check(False, 'fixture: a near-end learn game'); return
    ctx, pg = await page(b, PHONE, saves=[(F['nearEnd']['key'], F['nearEnd']['raw'])], flags={**FLAGS, 'afterwin': True})
    await to_world(pg)
    await pg.click('[data-act="continue-free"][data-learn="1"]'); await wait_ready(pg)
    ended = await play_until(pg, lambda: pg.evaluate("() => !!document.querySelector('#start:not([hidden]) .lb-end')"), 500, 'to end')
    check(ended, 'after-win: the learning game reached its win')
    if not ended: await ctx.close(); return
    await pg.wait_for_timeout(800)
    n = await pg.locator('[data-act="t6-afterwin"]').count()
    check(n >= 1, 'after-win: the "keep living" entry on the end screen (E.continueAfterWin exists, flag on)')
    if not n: await ctx.close(); return
    await pg.click('[data-act="t6-afterwin"]'); await wait_ready(pg); await pg.wait_for_timeout(800)
    hud = await pg.evaluate("() => { const c = document.querySelector('#hLife [data-life=afterwin]'); return c ? c.textContent : null; }")
    acts = json.loads(await ls(pg, F['nearEnd']['key']))['state']['actions']
    check(hud and 'אחרי החופש' in hud and acts[-1][0] == 'W', f'W logged and the 🌴 chip shown ({hud}, last action {acts[-1]})')
    await rolls(pg, 2)
    for i in range(20):
        s = await st(pg)
        if s['roll'] and not s['card'] and not s['gm'] and not s['coach']: break
        await step(pg)
    await shot(pg, 'afterwin_hud_phone')
    await life_click(pg, 'afterwin'); await pg.wait_for_selector('#gm:not([hidden])', timeout=10000)
    await pg.click('#gm .acts button.primary')
    ok = False
    for i in range(160):
        ok = await pg.evaluate("() => !!document.querySelector('#start:not([hidden]) .lb-end')")
        if ok: break
        await pg.wait_for_timeout(250)
    acts = json.loads(await ls(pg, F['nearEnd']['key']) or '{"state":{"actions":[["?"]]}}')['state']['actions'] if await ls(pg, F['nearEnd']['key']) else [['cleared']]
    check(ok, f'X: retiring ends the game on the after-win end screen (last action {acts[-1]})')
    await shot(pg, 'afterwin_end_phone')
    await ctx.close()

# ---------------------------------------------------------------- F3. AC-15 lobby after-win flow (free game) + AC-23 at 360 px
async def t_aw15(b, F):
    if not F['nearEndFree']: check(False, 'fixture: a near-end free game'); return
    ctx, pg = await page(b, {'width': 360, 'height': 780}, saves=[(F['nearEndFree']['key'], F['nearEndFree']['raw'])], flags={**FLAGS, 'afterwin': True})
    await to_world(pg)
    await pg.click('[data-act="continue-free"]:not([data-learn])'); await wait_ready(pg)
    ended = await play_until(pg, lambda: pg.evaluate("() => !!document.querySelector('#start:not([hidden]) .lb-end')"), 500, 'free to win')
    check(ended, 'AC-15: the free game reached its win')
    if not ended: await ctx.close(); return
    await pg.wait_for_selector('#endTop', timeout=20000); await pg.wait_for_timeout(800)
    h = await pg.evaluate("() => ({ h: document.querySelector('#endTop').scrollHeight, vh: innerHeight, aw: !!document.querySelector('[data-act=t6-afterwin]') })")
    check(h['h'] <= 1.5 * h['vh'], f"AC-23 at 360×780 (free, won, after-win offered): #endTop {h['h']} px ≤ 1.5 × {h['vh']}")
    await shot(pg, 'end_free_360')
    sv = await ls(pg, 'rr2-save-free-w1')
    check(h['aw'] and sv is not None, 'AC-15: the won save is kept while "keep living" is offered')
    prog0 = await ls(pg, 'rr2-progress'); ach0 = await pg.evaluate("() => JSON.parse(localStorage.getItem('rr2-progress') || '{}').achievements || null")
    await pg.click('[data-act="t6-afterwin"]'); await wait_ready(pg); await pg.wait_for_timeout(600)
    await rolls(pg, 3)
    for i in range(20):
        s = await st(pg)
        if s['roll'] and not s['card'] and not s['gm'] and not s['coach']: break
        await step(pg)
    await life_click(pg, 'afterwin'); await pg.wait_for_selector('#gm:not([hidden])', timeout=10000); await pg.click('#gm .acts button.primary')
    for i in range(160):
        if await pg.evaluate("() => !!document.querySelector('#start:not([hidden]) .lb-end')"): break
        await pg.wait_for_timeout(250)
    await pg.wait_for_selector('#endTop', timeout=20000); await pg.wait_for_timeout(600)
    e = await pg.evaluate("() => ({ title: document.querySelector('.end-title').textContent, lines: [...document.querySelectorAll('.t6-awl li')].map((x) => x.textContent), h: document.querySelector('#endTop').scrollHeight })")
    check(e['title'] == 'מה החופש נתן לך' and len(e['lines']) >= 5, f"AC-15: the continuation end shows the engine's after-win lines ({e['lines'][:2]})")
    check(await ls(pg, 'rr2-progress') == prog0, 'AC-15: the continuation end records nothing (rr2-progress unchanged: no recordGame, achievements, milestones)')
    check(e['h'] <= 1.5 * 780, f"AC-23 at 360×780 (after-win end): #endTop {e['h']} px ≤ {1.5 * 780:.0f}")
    await shot(pg, 'afterwin_end_360')
    await ctx.close()

# ---------------------------------------------------------------- G. perf: main-thread cost of the ghosts with 4× CPU throttling (CDP)
async def t_perf(b, F):
    ctx, pg = await page(b, PHONE, saves=[(F['midLearn']['key'], F['midLearn']['raw'])])
    cdp = await ctx.new_cdp_session(pg)
    await to_world(pg); await pg.click('[data-act="continue-free"][data-learn="1"]'); await wait_ready(pg)
    await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    await pg.evaluate("""() => { window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: false }); } catch (e) {} }""")
    t0 = time.time(); k = await rolls(pg, 14)
    a = await pg.evaluate("() => window.__rrGhosts.audit()")
    lt = await pg.evaluate("() => window.__lt")
    st6 = await pg.evaluate("() => window.__rrGhosts.status()")
    for i in range(30):
        s = await st(pg)
        if s['roll'] and not s['card'] and not s['gm'] and not s['coach']: break
        await step(pg)
    bms = []
    for rep in range(3):   # AC-20: createBranch at mid-game, 4× throttled (w1)
        await life_click(pg, 'moments'); await pg.wait_for_selector('#gm:not([hidden]) .t6mo-list button[data-k0]', timeout=20000)
        await pg.evaluate("() => { window.__t6branchMs = null; window.__t6branchErr = null; }")
        await pg.evaluate("(i) => document.querySelectorAll('.t6mo-list button[data-k0]')[i].click()", 2 + rep)
        await pg.wait_for_function('() => window.__t6branchMs != null || window.__t6branchErr', timeout=60000)
        await pg.wait_for_timeout(300); await wait_ready(pg, 120); bms.append(await pg.evaluate('() => window.__t6branchMs'))
        if bms[-1] is None: log('  branch not created:', await pg.evaluate('() => window.__t6branchErr'), await st(pg))
        for i in range(30):
            s = await st(pg)
            if s['roll'] and not s['card'] and not s['gm'] and not s['coach']: break
            await step(pg)
    NOTES.append(f'createBranch (w1, mid-game, 4× throttled): {bms} ms')
    check(all(x is not None and x <= 1000 for x in bms), f'AC-20: createBranch ≤ 1.0 s at 4× ({bms} ms)')
    await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
    log(f'  perf (4× CPU): {k} rolls in {time.time() - t0:.0f} s; ghost messages {a["msgs"]} (rows {a["rowMsgs"]}), handler p95 {a["p95"]:.2f} ms, max {a["max"]:.2f} ms; long tasks (all sources) n={len(lt)} max={max(lt) if lt else 0} ms; ghosts {st6}')
    NOTES.append('CDP CPU throttling slows the page only, not dedicated workers: worker timing is measured in Node (tests/t6_ghost_node.mjs --time)')
    NOTES.append(f'perf 4×: ghost message handler p95 {a["p95"]:.2f} ms, max {a["max"]:.2f} ms over {a["n"]} messages; page long tasks n={len(lt)}, max {max(lt) if lt else 0} ms (all sources, incl. 3D)')
    check(a['n'] > 0 and a['p95'] <= 4, f"AC-19: ghost message handling p95 {a['p95']:.2f} ms ≤ 4 ms (4× throttled)")
    await ctx.close()

TESTS = {'end': t_end, 'rewind': t_rewind, 'live': t_live, 'ranked': t_ranked, 'verdict': t_verdict, 'deal': t_deal, 'afterwin': t_afterwin, 'aw15': t_aw15, 'perf': t_perf}
async def main():
    FB.banner(MODE)
    stand_in_policies()
    F = fixtures()
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        for name, fn in TESTS.items():
            if ONLY and name not in ONLY: continue
            log('==', name)
            try: await fn(b, F)
            except Exception as e: check(False, f'{name}: exception {e!r}')
        await b.close()
    try: [FB.assert_clean(s) for s in SINKS]; check(True, 'guard clean: no request left the machine')
    except AssertionError as e: check(False, str(e))
    errs = [e for e in ERRS if 'lobby' not in e.lower() or 'error' in e.lower()]
    check(not errs, f'no page errors ({errs[:3]})')
    for n in NOTES: print('NOTE', n)
    print(f'\nt6_e2e: {sum(RES)} passed, {len(RES) - sum(RES)} failed')
    sys.exit(0 if all(RES) else 1)
asyncio.run(main())
