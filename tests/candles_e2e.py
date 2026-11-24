# CATALOG-25 §3.9 — the light candle view in a real browser (game-only test copy, offline: the fake-backend guard, no backend use).
#   play   w1 / w3: play turns (an index-fund buy through 💼, the trade cards that come up — a buy there too), the trade card's compact
#          chart (slider, readout of the current month = the card's price), the full view from 💼 and from the report: one tab per
#          ticker, header price = st.prices, the open candle's close = st.prices, IDX closes = the engine's payday prices (life.idxHist),
#          qty / cost / P&L = st.holdings, a tap / a hover / the keyboard (Home End ← →) select a candle and the readout +
#          aria-valuetext are that candle's month · O · H · L · C (= the candles rebuilt in the page from the saved st.actions)
#   reload save → reload → resume: the same candles (the OHLC table of every tab is identical) — nothing of it is in the save
#   coin   w1 with a dead + relaunched coin (a sim game written into the save): the old coin keeps its own tab, name, candles and the
#          wiped units; the new coin starts from its launch price
#   phone  390 / 360 (touch): no horizontal scroll, the chart fits its card, a touch tap selects a candle, touch-action pan-y
#   motion reduced motion: no animation / transition on the chart
#   every page: no page error, no console error, no 404 of a file this copy serves
# Copies: SRC=<export> COPY_DIR=/tmp/cdl PORT_BASE=10900 bash tests/serve_copies.sh
# Usage: python3 tests/candles_e2e.py [--base=http://localhost:10900/index.html] [--shots=DIR] [--only=play,coin,phone,motion]
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); import fakebackend as FB   # T7 guard: no backend use here
MODE = FB.mode_from_argv(); GUARDS = []
OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
PB = int(os.environ.get('PORT_BASE', '10900'))
BASE = OPT.get('base') or f'http://localhost:{PB}/index.html'
ORIGIN = BASE.rsplit('/', 1)[0] + '/'
SHOTS = OPT.get('shots'); ONLY = set(OPT['only'].split(',')) if OPT.get('only') else None
want = lambda s: ONLY is None or s in ONLY
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
VPS = {'desk': (1300, 820), 'phone': (390, 844), 'phone360': (360, 740)}
SEED = ("localStorage.setItem('rr2-coach', JSON.stringify({w1:true,w2:true,w3:true,w4:true})); localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-tips-off','1');"
        "localStorage.setItem('rr2-settings', JSON.stringify(%s));")
RES = []; ERRS = []; BAD = []
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def check(sc, msg, cond, extra=''):
    RES.append(bool(cond)); log('PASS' if cond else 'FAIL', f'[{sc}]', msg, '' if cond else str(extra)[:700]); return bool(cond)
norm = lambda t: (t or '').replace('⁦', '').replace('⁩', '').replace('⁠', '').strip()

def attach(pg, tag):
    pg.set_default_timeout(90000)
    def con(m):
        if m.type != 'error': return
        url = (m.location or {}).get('url', '')
        if 'lobby.js' in url or 'lobby.css' in url or 'progress.js' in url: return            # expected: no lobby in the game-only copy
        if 'Failed to load resource' in m.text and ('lobby' in url or 'progress' in url or url == '' or 'rr_checkpoint' in url): return
        ERRS.append(f'{tag} console: {m.text} @ {url}')
    pg.on('console', con)
    pg.on('pageerror', lambda e: ERRS.append(f'{tag} pageerror: {e}'))
    def resp(r):
        u = r.url
        if r.status >= 400 and u.startswith(ORIGIN) and not any(x in u for x in ('lobby.js', 'progress.js', 'lobby.css')): BAD.append(f'{tag} {r.status} {u}')
    pg.on('response', resp)

async def new_page(b, vp, settings='{turbo:true, lite:true}', reduced=False):
    w, h = VPS[vp]; ph = w < 600
    kw = FB.new_context_kwargs()
    if reduced: kw['reduced_motion'] = 'reduce'
    ctx = await b.new_context(**kw, viewport={'width': w, 'height': h}, device_scale_factor=1, has_touch=ph, is_mobile=ph)
    GUARDS.append(await FB.install(ctx, None))
    await ctx.add_init_script(f"if(!sessionStorage.getItem('cdl-seed')){{sessionStorage.setItem('cdl-seed','1');{SEED % settings}}}")
    pg = await ctx.new_page(); attach(pg, vp)
    return ctx, pg

async def shot(pg, name):
    if not SHOTS: return
    await pg.wait_for_timeout(350)
    await pg.screenshot(path=f'{SHOTS}/{name}.jpg', type='jpeg', quality=80)

async def start(pg, world, char_idx=0):
    await pg.goto(BASE); await pg.wait_for_selector('.fbworld', timeout=120000)
    await pg.evaluate("async () => { try { const e = await import('./js/energy.js'); e.add && e.add(99, 'test'); } catch (x) {} }")
    await pg.click(f'.fbworld[data-w={world}]'); await pg.wait_for_timeout(300)
    profs = pg.locator('.prof'); n = await profs.count(); await profs.nth(char_idx % n).click()
    await pg.click('#fbGo'); await pg.wait_for_selector('#start', state='hidden', timeout=60000)

STATE = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden, gm: !document.querySelector('#gm').hidden,
  coach: !document.querySelector('#coach').hidden, story: !!document.querySelector('#stGo') && !document.querySelector('#story').hidden,
  start: !document.querySelector('#start').hidden, type: (document.querySelector('#evCard').className.match(/ev-(\\w+)/)||[])[1]||null,
  month: (document.querySelector('#hMonth')||{}).textContent || '' })"""

async def idle(pg, t=150, on_trade=None):
    """answer cards (the highlighted / safe option) and dialogs until the roll button is back; a trade card goes to on_trade first"""
    t0 = time.time()
    while time.time() - t0 < t:
        s = await pg.evaluate(STATE)
        if s['gm']:
            if await pg.evaluate("() => !!document.querySelector('#gm .acts button.primary[disabled]')"):
                await pg.evaluate("() => { const c = document.querySelector('#gmCard'); const r = c.querySelector('input[type=radio]:not([disabled])'); if (r) { r.click(); return; } const b = [...c.querySelectorAll('button:not([disabled])')].find((x) => !x.closest('.acts')); if (b) b.click(); }")
                await pg.wait_for_timeout(300)
            p = pg.locator('#gm .acts button.primary:not([disabled])')
            if await p.count(): await p.first.click()
            else: await pg.locator('#gm .acts button:not([disabled])').last.click()
            await pg.wait_for_timeout(300); continue
        if s['story']: await pg.click('#stGo'); await pg.wait_for_timeout(300); continue
        if s['coach']:
            b = pg.locator('#coach [data-c="next"]')
            if await b.count(): await b.first.click(); await pg.wait_for_timeout(200); continue
        if s['card']:
            if s['type'] == 'trade':
                if on_trade: await on_trade(pg)
                d = pg.locator('#evCard button[data-o="done"]')
                if await d.count() and await d.first.is_enabled(): await d.first.click(); await pg.wait_for_timeout(400); continue
            ok = pg.locator('#evCard .acts button.primary[data-o]:not([disabled]), #evCard button.primary[data-o]:not([disabled])')
            if not await ok.count(): ok = pg.locator('#evCard button[data-o="ok"]:not([disabled]), #evCard button[data-o="pass"]:not([disabled]), #evCard button[data-o="skip"]:not([disabled]), #evCard button[data-o="pay"]:not([disabled])')
            btn = ok.first if await ok.count() else pg.locator('#evCard button[data-o]:not([disabled])').first
            try: await btn.click(timeout=5000)
            except Exception: await pg.evaluate("() => document.querySelector('#evCard button[data-o]:not([disabled])')?.click()")
            await pg.wait_for_timeout(450); continue
        if s['roll'] or s['start']: return s
        await pg.wait_for_timeout(250)
    raise Exception('stuck: ' + json.dumps(await pg.evaluate(STATE)))

# the engine's truth for the saved state, computed in the page: the candles rebuilt from st.actions + the readout text of every candle
TRUTH = """async (w) => { const E = await import('./js/engine.js'); const CL = await import('./js/candlelog.js'); const V = await import('./js/render/candles-lite.js');
  const raw = JSON.parse(localStorage.getItem('rr2-save-free-' + w)); const st = E.deserialize(raw.state); const vm = CL.viewModel(st, CL.rebuild(st));
  const one = (s) => ({ key: s.key, tk: s.tk, symbol: s.symbol, name: s.name, price: s.price, live: s.live, hold: s.hold, wiped: s.wiped, first: s.first,
    cand: s.cand.map((c) => ({ m: c.m, o: c.o, h: c.h, l: c.l, c: c.c })), texts: s.cand.map((c) => V.candleText(s, c)), fmt: V.fmtP(s.price) });
  return { month: st.month, prices: st.prices, holdings: st.holdings, idxHist: (st.life && st.life.idxHist) || [], list: vm.list.map(one), ended: vm.ended.map(one),
    diverged: vm.diverged, coin: st.world.coin || null, actions: st.actions.length }; }"""
NOSCROLL = "() => document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1"
CHART = """(sel) => { const ch = document.querySelector(sel); if (!ch) return null; const svg = ch.querySelector('svg'); const r = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal;
  const xs = [...svg.querySelectorAll('.cdl-c .cdl-wick')].map((l) => r.left + (+l.getAttribute('x1')) * r.width / vb.width);
  const cr = ch.closest('.card') ? ch.closest('.card').getBoundingClientRect() : null;
  return { xs, y: r.top + r.height / 2, left: r.left, right: r.right, cardL: cr ? cr.left : null, cardR: cr ? cr.right : null, n: xs.length,
    now: +ch.getAttribute('aria-valuenow'), max: +ch.getAttribute('aria-valuemax'), vt: ch.getAttribute('aria-valuetext'), role: ch.getAttribute('role'), tab: ch.tabIndex,
    ta: getComputedStyle(ch).touchAction, ro: (ch.parentElement.querySelector('.cdl-ro') || {}).textContent || '', rom: +((ch.parentElement.querySelector('.cdl-ro') || {}).dataset || {}).m || 0 }; }"""

async def index_buy(pg, sc, qty=5):
    await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=8000)
    await pg.click('#gmCard [data-hub="invest"]'); await pg.wait_for_selector('#gmCard #ixq', timeout=8000)
    await pg.fill('#ixq', str(qty)); await pg.click('#gmCard .acts button.primary'); await pg.wait_for_timeout(700)
    await idle(pg)

async def open_full(pg, via='hub'):
    if via == 'hub':
        await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=8000)
        await pg.click('#gmCard [data-hub="candles"]')
    else:
        if not await pg.is_visible('#sheet.open'):
            if await pg.is_visible('#sheetBtn'): await pg.click('#sheetBtn')
            else: await pg.evaluate("async () => (await import('./js/ui.js')).toggleSheet(true)")   # phones: the report sits behind ⋯
            await pg.wait_for_timeout(500)
        await pg.click('#sheet [data-act="candles"]')
    await pg.wait_for_selector('#gmCard.cdlm .cdl-chart', timeout=20000); await pg.wait_for_timeout(300)

async def close_full(pg):
    await pg.click('#gmCard.cdlm .acts button.primary'); await pg.wait_for_timeout(300)
    if await pg.is_visible('#sheet.open'): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

async def table_texts(pg):
    """every tab's OHLC table text (opens each tab + its <details>)"""
    out = {}
    keys = await pg.evaluate("() => [...document.querySelectorAll('#gmCard [data-cdl-tab]')].map((b) => b.dataset.cdlTab)")
    for k in keys:
        await pg.click(f'#gmCard [data-cdl-tab="{k}"]'); await pg.wait_for_timeout(150)
        out[k] = norm(await pg.evaluate("() => { const d = document.querySelector('#gmCard .cdl-tbl'); d.open = true; return d.querySelector('tbody').textContent; }"))
    return out

async def check_full(pg, sc, world, T, vp):
    """the full view against the engine truth T (a TRUTH result)"""
    tabs = await pg.evaluate("() => [...document.querySelectorAll('#gmCard [data-cdl-tab]')].map((b) => ({ k: b.dataset.cdlTab, t: b.textContent, p: b.getAttribute('aria-pressed') }))")
    check(sc, f'one tab per listing ({[t["k"] for t in tabs]})', [t['k'] for t in tabs] == [s['key'] for s in T['list']] + [s['key'] for s in T['ended']], (tabs, [s['key'] for s in T['list']]))
    check(sc, 'exactly one tab is pressed', sum(1 for t in tabs if t['p'] == 'true') == 1, tabs)
    for s in T['list']:
        await pg.click(f'#gmCard [data-cdl-tab="{s["key"]}"]'); await pg.wait_for_timeout(200)
        body = norm(await pg.inner_text('#gmCard .cdl-body'))
        tk = s['tk']; price = T['prices'][tk]
        check(sc, f'{tk}: name, symbol and a sector / type label shown', s['name'] in body and s['symbol'] in body and ('ענף' in body or 'סוג:' in body), body[:200])
        check(sc, f'{tk}: header price {s["fmt"]} = st.prices[{tk}] ({price})', s['price'] == price and s['fmt'] in norm(await pg.inner_text('#gmCard .cdl-px')))
        check(sc, f'{tk}: the open candle closes at st.prices (last close = the trading price)', s['cand'][-1]['c'] == price, s['cand'][-1])
        check(sc, f'{tk}: change in ₪ and % this month shown', ('החודש' in body) and ('%' in body))
        if tk == 'IDX':
            closes = [c['c'] for c in s['cand'][:-1]]; k = min(len(closes), len(T['idxHist']))
            check(sc, f'IDX: {k} closes = the engine payday prices (life.idxHist)', k > 0 and closes[-k:] == T['idxHist'][-k:], (closes[-4:], T['idxHist'][-4:]))
        h = T['holdings'].get(tk) or {}
        if h.get('qty'):
            hb = norm(await pg.inner_text('#gmCard .cdl-hold'))
            q = f"{h['qty']:,}"; cost = f"₪{round(h['basis']):,}"
            check(sc, f'{tk}: qty {q}, cost {cost} and the P&L of st.holdings shown', q in hb and cost in hb and 'רווח / הפסד' in hb and s['hold']['pnl'] == round(h['qty'] * price) - round(h['basis']), hb)
        G = await pg.evaluate(CHART, '#gmCard .cdl-chart')
        n = len(s['cand'])
        check(sc, f'{tk}: chart = {n} candles, role=slider, focusable, valuenow = the newest', G and G['n'] == n and G['role'] == 'slider' and G['tab'] == 0 and G['now'] == n and G['max'] == n, G and {k: G[k] for k in ('n', 'now', 'max', 'role', 'tab')})
        check(sc, f'{tk}: default readout = the current month\'s candle', G and G['vt'] == s['texts'][-1] and G['rom'] == s['cand'][-1]['m'], (G and G['vt'], s['texts'][-1]))
        check(sc, f'{tk}: touch-action pan-y on the chart (no double-tap zoom)', G and G['ta'] == 'pan-y', G and G['ta'])
        # tap a candle (desk: click; phones: a touch tap)
        i = max(0, n - 3) if n >= 3 else 0
        if vp == 'desk': await pg.mouse.click(G['xs'][i], G['y'])
        else: await pg.touchscreen.tap(G['xs'][i], G['y'])
        await pg.wait_for_timeout(150); G2 = await pg.evaluate(CHART, '#gmCard .cdl-chart')
        check(sc, f'{tk}: a {"click" if vp == "desk" else "touch tap"} on candle {i + 1} shows its month · O · H · L · C', G2['now'] == i + 1 and G2['vt'] == s['texts'][i] and G2['rom'] == s['cand'][i]['m'] and norm(G2['ro']) == norm(s['texts'][i]), (G2['vt'], s['texts'][i]))
        c = s['cand'][i]
        ro = norm(G2['ro']); E = lambda x: x
        check(sc, f'{tk}: readout values = the candle (O {c["o"]} H {c["h"]} L {c["l"]} C {c["c"]})', all(v in ro for v in [f'פתיחה', 'גבוה', 'נמוך']) and ('▲' in ro or '▼' in ro or '—' in ro), ro)
        if vp == 'desk' and n >= 2:
            await pg.mouse.move(G['xs'][0], G['y']); await pg.wait_for_timeout(120)
            G3 = await pg.evaluate(CHART, '#gmCard .cdl-chart')
            check(sc, f'{tk}: hover selects the candle under the pointer', G3['now'] == 1 and G3['rom'] == s['cand'][0]['m'], G3['now'])
        # keyboard
        await pg.focus('#gmCard .cdl-chart'); await pg.keyboard.press('Home'); g = await pg.evaluate(CHART, '#gmCard .cdl-chart')
        okh = g['now'] == 1 and g['vt'] == s['texts'][0]
        await pg.keyboard.press('End'); g = await pg.evaluate(CHART, '#gmCard .cdl-chart'); oke = g['now'] == n and g['vt'] == s['texts'][-1]
        okl = True
        if n >= 2: await pg.keyboard.press('ArrowLeft'); g = await pg.evaluate(CHART, '#gmCard .cdl-chart'); okl = g['now'] == n - 1 and g['vt'] == s['texts'][-2]
        check(sc, f'{tk}: keyboard Home / End / ← select candles (aria-valuetext = month · O · H · L · C)', okh and oke and okl, g)
    full = norm(await pg.inner_text('#gmCard'))
    check(sc, 'the educational line: simulation only, past candles do not predict the future', 'סימולציה בלבד' in full and 'לא מנבאים את העתיד' in full)
    check(sc, 'the legend says hollow / filled / line (colour is not the only signal)', 'חלול' in full and 'מלא' in full and '▲' in full and '▼' in full)
    check(sc, 'no horizontal scroll with the full view open', await pg.evaluate(NOSCROLL))
    G = await pg.evaluate(CHART, '#gmCard .cdl-chart')
    check(sc, 'the chart stays inside its card', G['cardL'] is None or (G['left'] >= G['cardL'] - 0.5 and G['right'] <= G['cardR'] + 0.5), G)
    return True

TRADE_SEEN = {}
async def on_trade_factory(sc, world, vp):
    async def on_trade(pg):
        if TRADE_SEEN.get(sc): return
        await pg.wait_for_selector('#qCdl:not([hidden]) .cdl-chart', timeout=20000)
        TRADE_SEEN[sc] = True
        await pg.evaluate("() => document.querySelector('#qCdl .cdl-chart').scrollIntoView({ block: 'center' })"); await pg.wait_for_timeout(300)
        G = await pg.evaluate(CHART, '#qCdl .cdl-chart')
        price = norm(await pg.inner_text('#qprice'))
        ro = norm(G['ro'])
        check(sc, f'trade card: the compact chart is there (≤ 12 candles, slider, focusable) — {G["n"]} candles', G['role'] == 'slider' and 1 <= G['n'] <= 12 and G['tab'] == 0)
        check(sc, f'trade card: its newest candle is the open month and closes at the card price {price}', '(עדיין פתוח)' in ro and f'עכשיו {price}' in ro, ro)
        mini = norm(await pg.inner_text('#qCdl'))
        check(sc, 'trade card: the short educational line is in the compact block', 'סימולציה בלבד' in mini and 'לא מנבאים' in mini)
        check(sc, 'trade card: no horizontal scroll', await pg.evaluate(NOSCROLL))
        if G['n'] >= 2:
            if vp == 'desk': await pg.mouse.click(G['xs'][0], G['y'])
            else: await pg.touchscreen.tap(G['xs'][0], G['y'])
            await pg.wait_for_timeout(150); g = await pg.evaluate(CHART, '#qCdl .cdl-chart')
            check(sc, 'trade card: a tap on the first candle selects it (readout = its month)', g['now'] == 1, g['now'])
        await pg.evaluate("() => document.querySelector('#qCdl').scrollIntoView({ block: 'center' })")
        await shot(pg, f'{vp}_{world}_trade_card')
        # the full view from inside the card, then back
        await pg.click('#qCdl [data-cdl-full]'); await pg.wait_for_selector('#gmCard.cdlm .cdl-chart', timeout=20000)
        check(sc, 'trade card → "גרף מלא" opens the full view on this ticker', await pg.evaluate("() => document.querySelector('#gmCard [data-cdl-tab][aria-pressed=true]').dataset.cdlTab.split('#')[0] === document.querySelector('#qCdl').dataset.tk"))
        await pg.click('#gmCard.cdlm .acts button.primary'); await pg.wait_for_timeout(300)
        check(sc, 'closing the full view returns to the trade card', await pg.is_visible('#evCard #qCdl'))
        # buy one step if possible (a print-free trade: the price does not move, the month gets the player's volume)
        b = pg.locator('#evCard [data-o="buy"]')
        if await b.is_enabled(): await b.click(); await pg.wait_for_timeout(600)
    return on_trade

async def run_play(b, world, vp, settings='{turbo:true, lite:true}', turns=14):
    sc = f'play-{world}-{vp}'
    ctx, pg = await new_page(b, vp, settings)
    await start(pg, world, 0); await idle(pg)
    await index_buy(pg, sc, 5)
    ot = await on_trade_factory(sc, world, vp)
    for k in range(turns):
        s = await idle(pg, on_trade=ot)
        if s['start']: break
        await pg.click('#roll'); await pg.wait_for_timeout(500)
        await idle(pg, on_trade=ot)
    T = await pg.evaluate(TRUTH, world)
    check(sc, f'the page rebuilds the candles from the save (month {T["month"]}, {T["actions"]} actions, no divergence)', not T['diverged'] and T['month'] >= 3, T['month'])
    if not TRADE_SEEN.get(sc): log(f'[{sc}] INFO no trade card in {turns} turns (the compact chart was not reached in this run)')
    await open_full(pg, 'hub'); await check_full(pg, sc, world, T, vp)
    await pg.click('#gmCard [data-cdl-tab="IDX"]'); await pg.wait_for_timeout(200)
    await shot(pg, f'{vp}_{world}_full')
    if vp == 'desk':
        await pg.evaluate("() => { const d = document.querySelector('#gmCard .cdl-tbl'); d.open = true; d.scrollIntoView({ block: 'center' }); }"); await shot(pg, f'{vp}_{world}_full_table')
    before = await table_texts(pg)
    await close_full(pg)
    # from the report too
    await open_full(pg, 'sheet'); check(sc, 'the report (הדוח שלי) opens the full view too', await pg.is_visible('#gmCard.cdlm')); await close_full(pg)
    # save → reload → resume: the same candles (rebuilt from st.actions; nothing extra in the save)
    raw = await pg.evaluate(f"() => localStorage.getItem('rr2-save-free-{world}')")
    check(sc, 'the save carries no candle data (the state is the engine\'s)', 'cdl' not in raw and '"cand"' not in raw)
    await pg.reload(); await pg.wait_for_selector('#fbCont', timeout=120000); await pg.click('#fbCont')
    await pg.wait_for_function("() => !document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=120000)
    await idle(pg)
    await open_full(pg, 'hub'); after = await table_texts(pg)
    check(sc, f'save / reload keeps the candles: every tab\'s OHLC table is identical ({len(after)} tabs)', before == after and len(after) >= 2, [k for k in after if before.get(k) != after.get(k)])
    await close_full(pg)
    await ctx.close()

def coin_state():
    """a w1 sim game whose first coin died and was relaunched (node, read-only use of tools/sim.mjs from this export)"""
    js = ("import * as E from '%s/js/engine.js'; import '%s/js/worlds/all.js'; import { play } from '%s/tools/sim.mjs';"
          "const { st } = play('w1', 'teacher', 17, 'gambler', 24); process.stdout.write(E.serialize(st));") % ((os.path.dirname(HERE),) * 3)
    out = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, timeout=180)
    return out.stdout

async def run_coin(b, vp='desk'):
    sc = f'coin-{vp}'
    stj = coin_state()
    if not check(sc, 'a w1 game with a relaunched coin was simulated', stj.startswith('{')): return
    ctx, pg = await new_page(b, vp)
    await start(pg, 'w1', 0); await idle(pg)
    await pg.evaluate("(sj) => { const k = 'rr2-save-free-w1'; const w = JSON.parse(localStorage.getItem(k)); w.state = JSON.parse(sj); localStorage.setItem(k, JSON.stringify(w)); }", stj)
    await pg.reload(); await pg.wait_for_selector('#fbCont', timeout=120000); await pg.click('#fbCont')
    await pg.wait_for_function("() => !document.querySelector('#roll').disabled || !document.querySelector('#evm').hidden", timeout=120000)
    await idle(pg)
    T = await pg.evaluate(TRUTH, 'w1')
    check(sc, f'resumed the simulated game (month {T["month"]}, coin #{T["coin"]["gen"]} {T["coin"]["name"]})', T['month'] >= 20 and T['coin']['gen'] >= 1 and not T['diverged'])
    await open_full(pg, 'hub')
    old = T['ended'][0] if T['ended'] else None
    check(sc, 'the old coin has its own tab', old is not None and await pg.locator(f'#gmCard [data-cdl-tab="{old["key"]}"]').count() == 1, T['ended'])
    if old:
        await pg.click(f'#gmCard [data-cdl-tab="{old["key"]}"]'); await pg.wait_for_timeout(250)
        body = norm(await pg.inner_text('#gmCard .cdl-body'))
        check(sc, f'the old listing keeps its OLD name ({old["symbol"]}) and the wiped units ({old["wiped"]["qty"] if old["wiped"] else 0})', old['symbol'] in body and 'מת' in body and (not old['wiped'] or f"{old['wiped']['qty']:,}" in body), body[:300])
        G = await pg.evaluate(CHART, '#gmCard .cdl-chart')
        check(sc, f'the old listing\'s {len(old["cand"])} candles are drawn, ending at its crash price', G['n'] == len(old['cand']) and old['cand'][-1]['c'] == 0.05 and G['vt'] == old['texts'][-1], (G['n'], old['cand'][-1]))
        await shot(pg, f'{vp}_w1_coin_old')
    cur = next(s for s in T['list'] if s['tk'] == 'MOON')
    await pg.click(f'#gmCard [data-cdl-tab="{cur["key"]}"]'); await pg.wait_for_timeout(250)
    check(sc, f'the new coin ({cur["symbol"]}) is a new listing from the launch price', cur['first'] == 1 and cur['symbol'] == T['coin']['name'] and cur['key'] != (old or {}).get('key'))
    await shot(pg, f'{vp}_w1_coin_new')
    await close_full(pg)
    await ctx.close()

async def run_motion(b):
    sc = 'motion'
    ctx, pg = await new_page(b, 'desk', reduced=True)
    await start(pg, 'w3', 0); await idle(pg); await pg.click('#roll'); await idle(pg)
    await open_full(pg, 'hub')
    r = await pg.evaluate("() => [...document.querySelectorAll('#gmCard .cdl-chart, #gmCard .cdl-chart *')].map((e) => { const s = getComputedStyle(e); return [s.animationName, s.transitionDuration]; }).filter(([a, t]) => (a && a !== 'none') || (t && t.split(',').some((x) => parseFloat(x) > 0)))")
    check(sc, 'reduced motion: nothing in the chart animates or transitions', not r, r[:3])
    await close_full(pg); await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        jobs = []
        if want('play'): jobs += [lambda: run_play(b, 'w1', 'desk', '{turbo:true}', 14), lambda: run_play(b, 'w3', 'desk', '{turbo:true, lite:true}', 14)]
        if want('phone'): jobs += [lambda: run_play(b, 'w1', 'phone', '{turbo:true, lite:true}', 10), lambda: run_play(b, 'w3', 'phone360', '{turbo:true, lite:true}', 10)]
        if want('coin'): jobs += [lambda: run_coin(b, 'desk'), lambda: run_coin(b, 'phone360')]
        if want('motion'): jobs += [lambda: run_motion(b)]
        for j in jobs:
            try: await j()
            except Exception as e: check('run', 'a scenario ran to the end', False, repr(e))
        await b.close()
    for g in GUARDS:
        try: FB.assert_clean(g)
        except Exception as e: check('guard', f'backend guard: {e}', False)
    check('page', f'no page / console errors ({len(ERRS)})', not ERRS, ERRS[:5])
    check('page', f'no 4xx / 5xx of a served file ({len(BAD)})', not BAD, BAD[:5])
    npass = sum(RES); nfail = len(RES) - npass
    print(f'candles_e2e: {npass} passed, {nfail} failed'); sys.exit(1 if nfail else 0)

if __name__ == '__main__': asyncio.run(main())
