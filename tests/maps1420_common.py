# The shared end-to-end run of the five CATALOG-25 maps w14 רובע הבנקים / w17 גבעת המעבדות / w18 חוף הסערות / w19 פעמון הבורסה /
# w20 רחוב הקרנות in the real page (lobby + game), offline fake backend + guard. Each map's file (tests/w14_e2e.py …) passes its own MAP
# dict (ids, words, the engine paths and the per-map checks) to run(MAP):
#   map    P.worldMap(): once every map before it in the order of the worlds is finished (linear unlocks, groupsV 1 — the test's unlock), the
#          map is a playable card (button, what it teaches, generated art + motif); locked without the map before it, and it names that map
#   pick   the card → its rules load lazily → the picker (3 characters, their icons — never the 🙂 fallback) → a game in the map
#          (body[data-world], the sky, the HUD chip with its full accessible name; no failed model, no wNN .glb; the still decor drawn)
#   play   a fixed-seed game: rolls through paydays to the map's tile — its card (every field, every option with its money / months / risk IN
#          WORDS); a check / due diligence (where the card has one) keeps the SAME card open and redraws it in place (its fee, the
#          ghost-tap guard); a purchase (or pass = safe); the panel from the chip (gauges in their units, the accessible table, a row per
#          engine row), one action through E.worldAction, a two-tap action (the first tap says what happens and changes nothing; the
#          second does it); 💼 row → the panel; the goal in the right units (never ₪ for a ratio / multiple / count / months); cityAudit
#          = scene levels (the stand-in's painted state = the engine); save → reload → resume: the same city
#   2d     the 2D board on desk / 390 / 360: the map's colours + motif, its level card (corner, the bar = the engine); phones: the tile card
#          and the panel fit the width, every panel button ≥ 44 px
#   3d     the 3D board on 390 / 360: the chip inside the HUD, the panel fits
#   motion the decor is still under reduced motion (the idle scene renders < 60 frames in 2.5 s)
# Copies: SRC=<export> COPY_DIR=/tmp/ui1420 PORT_BASE=12100 bash tests/serve_copies.sh
# Usage: python3 tests/wNN_e2e.py [--real=http://localhost:12102/] [--shots=DIR] [--only=map,pick,play,2d,3d,motion]
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB

ORDER = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w15', 'w13', 'w16', 'w11', 'w17', 'w14', 'w12', 'w18', 'w19', 'w20', 'w21']
VP = {'desk': {'width': 1300, 'height': 820}, 'phone': {'width': 390, 'height': 844}, 'small': {'width': 360, 'height': 740}}
AXE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vendor', 'axe-core', 'axe.min.js')
STATE = """() => ({ roll: !document.querySelector('#roll').disabled, card: !document.querySelector('#evm').hidden, gm: !document.querySelector('#gm').hidden,
  gmCls: document.querySelector('#gmCard').className, start: !document.querySelector('#start').hidden, type: (document.querySelector('#evCard').className.match(/ev-(\\w+)/)||[])[1]||null,
  month: (document.querySelector('#hMonth')||{}).textContent || '' })"""
CARD = """() => { const c = document.querySelector('#evCard'); return { title: (c.querySelector('h2') || {}).textContent || '', opts: [...c.querySelectorAll('button[data-o]')].map((b) => b.dataset.o),
  en: [...c.querySelectorAll('button[data-o]:not([disabled])')].map((b) => b.dataset.o), text: c.textContent, head: !!c.querySelector('.div-h'),
  risks: [...c.querySelectorAll('button[data-o]')].map((b) => [b.dataset.o, b.dataset.risk || '', [...b.querySelectorAll('small.sub')].map((x) => x.textContent).join(' · ')]) }; }"""
PANEL = """() => { const c = document.querySelector('#gmCard'); return { gauges: [...c.querySelectorAll('.wp-g')].map((g) => g.dataset.g), gtext: [...c.querySelectorAll('.wp-g')].map((g) => g.textContent),
  rows: [...c.querySelectorAll('.wp-rows > li')].map((r) => ({ t: r.textContent, acts: [...r.querySelectorAll('button[data-wact]')].map((b) => b.dataset.aid), data: { ...r.dataset } })),
  tables: [...c.querySelectorAll('table')].map((t) => ({ cap: !!t.querySelector('caption'), th: t.querySelectorAll('thead th[scope=col]').length, rows: t.querySelectorAll('tbody tr').length, rowh: t.querySelectorAll('tbody th[scope=row]').length })),
  segs: [...c.querySelectorAll('.wp-seg')].map((s) => s.getAttribute('aria-label')), aids: [...c.querySelectorAll('button[data-wact]')].map((b) => b.dataset.aid),
  title: (c.querySelector('h2') || {}).textContent || '', now: [...c.querySelectorAll('.wp-now')].map((x) => x.textContent).join(' | '), text: c.textContent }; }"""

class Run:
    def __init__(self, M):
        self.M = M; self.wid = M['wid']
        self.MODE = FB.mode_from_argv()
        self.OPT = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
        PB = int(os.environ.get('PORT_BASE', '12100'))
        self.REAL = self.OPT.get('real') or f'http://localhost:{PB + 2}/'
        self.SHOTS = self.OPT.get('shots'); self.ONLY = set(self.OPT['only'].split(',')) if self.OPT.get('only') else None
        self.ARGS = FB.chrome_args(self.MODE, ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        before = ORDER[:ORDER.index(self.wid)]
        self.STARS = {w: 1 for w in before}; self.PREV = before[-1]
        coach = {w: True for w in ORDER}
        self.SEED = ("localStorage.setItem('rr2-onboarded','1'); localStorage.setItem('rr2-tips-off','1'); localStorage.setItem('rr2-reveal', 'all');"
                     f"localStorage.setItem('rr2-coach', JSON.stringify({json.dumps(coach)}));")
        self.UNLOCK = ("(() => { if (localStorage.getItem('rr2-progress')) return; localStorage.setItem('rr2-progress', JSON.stringify({ v: 1, groupsV: 1, stars: %s, best: {}, achievements: [], pawn: 'classic',"
                       " seenWorlds: %s, onboarded: true, tutorialDone: true, gamesPlayed: 12, wins: 12 })); })();" % (json.dumps(self.STARS), json.dumps(before)))
        self.START = ("async ({ seed, ch }) => { const E = await import('./js/engine.js'); await E.ensureWorld('%s'); const G = await import('./js/game.js'); await G.initGame();"
                      " G.startGame({ worldId: '%s', charId: ch, mode: 'free', seed, pawn: 'classic', pawnColor: '#e2483d', tutorial: false, bailout: true, resume: false }); return true; }") % (self.wid, self.wid)
        self.SAVED = "() => { const r = JSON.parse(localStorage.getItem('rr2-save-free-%s') || 'null'); return r && (typeof r.state === 'string' ? JSON.parse(r.state) : r.state); }" % self.wid
        self.RESULTS = []; self.ERRS = []; self.SINKS = []; self.BAD = []
        if self.SHOTS: os.makedirs(self.SHOTS, exist_ok=True)
    want = lambda self, s: self.ONLY is None or s in self.ONLY
    def log(self, *a): print(time.strftime('%H:%M:%S'), *a, flush=True)
    def check(self, sc, name, cond, detail=''):
        self.RESULTS.append((sc, name, bool(cond))); self.log(('PASS' if cond else 'FAIL'), f'[{self.wid} {sc}]', name, '' if cond else str(detail)[:900]); return bool(cond)

    async def axe_bad(self, pg, sel):
        await pg.evaluate("() => Promise.race([Promise.all(document.getAnimations().filter((a) => { const t = a.effect && a.effect.getTiming(); return t && t.iterations !== Infinity && a.playState === 'running'; }).map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 3000))])")
        await pg.evaluate("""async (sel) => { for (let i = 0; i < 40; i++) { const bs = [...document.querySelectorAll(sel + ' button')].filter((b) => b.offsetParent);
          if (bs.every((b) => { const r = b.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return true; const e = document.elementFromPoint(r.left + r.width / 2, Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))); return !e || b.contains(e) || e.closest(sel); })) return; await new Promise((r) => setTimeout(r, 200)); } }""", sel)
        if not await pg.evaluate("typeof axe !== 'undefined'"): await pg.add_script_tag(path=AXE)
        return await pg.evaluate("""async (sel) => { const tr = [...document.querySelectorAll('#toast, #paper')]; tr.forEach((e) => { e.dataset.vis = e.style.visibility; e.style.visibility = 'hidden'; });
          const r = await axe.run({ include: [sel] }, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'] }, resultTypes: ['violations'] });
          tr.forEach((e) => { e.style.visibility = e.dataset.vis || ''; }); return r.violations.filter((x) => x.impact === 'critical' || x.impact === 'serious').map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.map((n) => n.target.join(' ')).slice(0, 4) })); }""", sel)

    async def page(self, b, vp, flags='', unlock=True, reduced=False):
        kw = FB.new_context_kwargs()
        if reduced: kw['reduced_motion'] = 'reduce'
        ctx = await b.new_context(viewport=VP[vp], device_scale_factor=1, has_touch=vp != 'desk', is_mobile=vp != 'desk', **kw)
        self.SINKS.append(await FB.install_mode(ctx, FB.FakeBackend() if self.MODE == 'offline' else None, self.MODE))
        await ctx.add_init_script(self.SEED + (self.UNLOCK if unlock else ''))
        pg = await ctx.new_page(); pg.set_default_timeout(120000)
        pg.on('pageerror', lambda e: (self.ERRS.append(f'{vp} pageerror: {e}'), self.log('PAGEERR', e)))
        pg.on('response', lambda r: self.BAD.append(f'{r.status} {r.url}') if r.status >= 400 and r.url.startswith(self.REAL) else None)
        await pg.goto(self.REAL + 'index.html' + flags)
        await pg.wait_for_selector('.lb-home, .lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
        return ctx, pg

    async def shot(self, pg, name):
        if not self.SHOTS: return
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{self.SHOTS}/{name}.jpg', type='jpeg', quality=80)

    async def quiet(self, pg):
        for _ in range(6):
            if await pg.locator('#coach:not([hidden]) button').count():
                await pg.locator('#coach:not([hidden]) button').first.click(); await pg.wait_for_timeout(250)
            else: break

    async def idle(self, pg, timeout=150, stop_on=None):
        t0 = time.time()
        while time.time() - t0 < timeout:
            await self.quiet(pg)
            s = await pg.evaluate(STATE)
            if stop_on and s['card'] and s['type'] == stop_on: return s
            if s['gm']:
                b = pg.locator('#gm .acts button.primary:not([disabled])')
                if await b.count(): await b.first.click(); await pg.wait_for_timeout(300); continue
            if s['card']:
                if s['type'] == 'mech' and await pg.locator('#evCard button[data-o="pass"]:not([disabled]), #evCard button[data-o="decline"]:not([disabled])').count():
                    await pg.locator('#evCard button[data-o="pass"]:not([disabled]), #evCard button[data-o="decline"]:not([disabled])').first.click(); await pg.wait_for_timeout(500); continue
                ok = pg.locator('#evCard .acts button.primary[data-o]:not([disabled]), #evCard button.primary[data-o]:not([disabled])')
                if not await ok.count(): ok = pg.locator('#evCard button[data-o="ok"]:not([disabled]), #evCard button[data-o="pass"]:not([disabled]), #evCard button[data-o="skip"]:not([disabled]), #evCard button[data-o="decline"]:not([disabled])')
                btn = ok.first if await ok.count() else pg.locator('#evCard button[data-o]:not([disabled])').first
                try: await btn.click(timeout=5000)
                except Exception: await pg.evaluate("() => document.querySelector('#evCard button[data-o]:not([disabled])')?.click()")
                await pg.wait_for_timeout(500)
                d = pg.locator('#evCard button[data-o="done"]')
                if await d.count() and await d.first.is_visible(): await d.first.click()
                continue
            if s['roll'] or s['start']: return s
            if await pg.evaluate("() => { const x = document.querySelector('#story'); return !!x && !x.hidden && !!document.querySelector('#stGo'); }"):
                await pg.click('#stGo'); await pg.wait_for_timeout(300); continue
            await pg.wait_for_timeout(250)
        raise Exception('stuck: ' + json.dumps(await pg.evaluate(STATE)))

    async def close_gm(self, pg, n=8):
        for _ in range(n):
            if await pg.evaluate("() => document.querySelector('#gm').hidden"): return
            b = pg.locator('#gm .acts button.primary:not([disabled])')
            if await b.count(): await b.first.click()
            else: await pg.keyboard.press('Escape')
            await pg.wait_for_timeout(400)

    async def roll_to(self, pg, title, n=70, need=None):
        st0 = await pg.evaluate(self.SAVED); m0 = st0['month'] if st0 else 1; paid = False
        for i in range(n):
            await pg.click('#roll'); await pg.wait_for_timeout(600)
            s = await self.idle(pg, stop_on='mech')
            st = await pg.evaluate(self.SAVED)
            if st and st['month'] > m0: paid = True
            if s['card'] and s['type'] == 'mech':
                c = await pg.evaluate(CARD)
                if title in c['text'] and (not need or need in c['en']): return c, paid
                await self.idle(pg)
        return None, paid

    async def start(self, pg, ch):
        await pg.evaluate(self.START, {'seed': self.M.get('seed', 7), 'ch': ch})
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await self.quiet(pg); await self.idle(pg)

    async def panel(self, pg):
        await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(500)
        return await pg.evaluate(PANEL)

    async def tap(self, pg, aid, pred=None):
        """the index of the first enabled panel button for action `aid` (optionally whose text matches pred), or -1"""
        return await pg.evaluate("""([aid, re]) => { const bs = [...document.querySelectorAll(`#gmCard button[data-aid="${aid}"]:not([disabled])`)].filter((b) => !re || new RegExp(re).test(b.textContent));
          return bs.length ? +bs[0].dataset.wact : -1; }""", [aid, pred])

    # ------------------------------------------------------------------ the runs
    async def run_map(self, b):
        sc = 'map-desk'; ctx, pg = await self.page(b, 'desk'); M = self.M
        cards = await pg.evaluate("""() => [...document.querySelectorAll('.map-grid .map-card')].map((c) => ({ id: c.dataset.id, tag: c.tagName, act: c.dataset.act || null, soon: c.classList.contains('is-soon'), locked: c.classList.contains('is-locked'),
          learn: (c.querySelector('.map-learn') || {}).textContent || '', diff: !!c.querySelector('.map-diff'), gen: !!c.querySelector('.gen-art'), motif: (c.querySelector('.gen-motif') || {}).textContent || '' }))""")
        c = next((x for x in cards if x['id'] == self.wid), None)
        self.check(sc, f'after every map before it, {self.wid} is a playable map card (button, what it teaches, difficulty, generated art {M["motif"]})',
                   c and c['tag'] == 'BUTTON' and c['act'] == 'world' and not c['soon'] and not c['locked'] and c['learn'] and c['diff'] and c['gen'] and c['motif'] == M['motif'], c)
        stars = {k: v for k, v in self.STARS.items() if k != self.PREV}
        r = await pg.evaluate("""async ([stars, wid, back]) => { const P = await import('./js/progress.js'); P._reset && P._reset({ ...P.getProgress(), stars });
          const m = P.worldMap().filter((x) => x.id === wid).map((x) => ({ id: x.id, unlocked: x.unlocked, lock: x.lockText })); P._reset && P._reset({ ...P.getProgress(), stars: back }); return m; }""", [stars, self.wid, self.STARS])
        self.check(sc, f'{self.wid} stays locked without the map before it ({self.PREV}), and its lock names that map', r and r[0]['unlocked'] is False and M['prevName'] in (r[0]['lock'] or ''), r)
        await self.shot(pg, 'map_desk')
        await ctx.close()

    async def run_pick(self, b):
        sc = 'pick-desk'; ctx, pg = await self.page(b, 'desk'); M = self.M
        pre = await pg.evaluate(f"import('./js/engine.js').then((E) => E.isLoaded('{self.wid}'))")
        self.check(sc, f'{self.wid} rules are not loaded at boot (lazy)', pre is False, pre)
        await pg.click(f'.map-card[data-id="{self.wid}"]')
        await pg.wait_for_selector(f'.wv-char[data-w="{self.wid}"]', timeout=60000)
        info = await pg.evaluate("""() => ({ chars: [...document.querySelectorAll('.wv-char')].map((c) => c.dataset.c), h1: document.querySelector('.wv-hero h1').textContent,
          icons: [...document.querySelectorAll('.wv-char .wv-ic')].map((x) => x.textContent), goal: (document.querySelector('.wv-goal') || {}).textContent || '',
          pros: document.querySelectorAll('.wv-char .wv-str').length, cons: document.querySelectorAll('.wv-char .wv-weak').length })""")
        info['loaded'] = await pg.evaluate(f"import('./js/engine.js').then((E) => E.isLoaded('{self.wid}'))")
        self.check(sc, f'the picker waits for the rules, then lists the 3 {self.wid} characters', info['loaded'] and info['chars'] == M['chars'] and info['h1'] == M['name'], info)
        self.check(sc, f'character icons {" / ".join(M["icons"])} (never the 🙂 fallback); pros / cons; the goal', info['icons'] == M['icons'] and '🙂' not in info['icons'] and info['pros'] >= 3 and info['cons'] >= 3 and M['goalWord'] in info['goal'], info)
        await self.shot(pg, 'picker_desk')
        await pg.click(f'.wv-go[data-c="{M["chars"][0]}"]')
        await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500); await self.quiet(pg)
        await self.idle(pg)
        g = await pg.evaluate("""() => ({ world: document.body.dataset.world, chip: (document.querySelector('#worldPanelBtn') || {}).textContent || '', sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(),
          label: (document.querySelector('#worldPanelBtn') || { getAttribute: () => '' }).getAttribute('aria-label'), ink: getComputedStyle(document.body).getPropertyValue('--accent-ink').trim() })""")
        g['cfg'] = await pg.evaluate("import('./js/game.js').then((G) => G.activeConfig())")
        self.check(sc, f'a {self.wid} game started from the picker ({M["chars"][0]}, free), the map\'s sky', g['world'] == self.wid and g['cfg'] and g['cfg']['worldId'] == self.wid and g['sky'].lower() == M['sky1'], g)
        self.check(sc, f'the HUD shows the {M["chipEmoji"]} chip with a full accessible name ({", ".join(M["chipWords"])})', M['chipEmoji'] in g['chip'] and all(w in (g['label'] or '') for w in M['chipWords']) and all(x not in g['chip'] for x in M.get('chipNever', [])), g)
        fails = await pg.evaluate("import('./js/scene.js').then((S) => S.failedModels ? S.failedModels() : [])")
        self.check(sc, f'no model failed (the {self.wid} models are stand-ins)', not fails, fails)
        glb = await pg.evaluate("import('./js/scene.js').then((S) => S.perfStats().glb)")
        self.check(sc, f'no {self.wid} .glb was ever requested', not any(f'/{self.wid}/' in u for u in glb), glb)
        dc = await pg.evaluate(f"import('./js/scene.js').then((S) => S.perfStats().decor['{M['decor']}'])")
        self.check(sc, f'the still decor \'{M["decor"]}\' is drawn ({M["decorWhat"]})', dc and M['decorOk'](dc), dc)
        await ctx.close()

    async def run_play(self, b):
        sc = 'play-desk'; ctx, pg = await self.page(b, 'desk'); M = self.M
        await self.start(pg, M.get('playChar', M['chars'][0]))
        await self.shot(pg, 'board3d_desk')
        card, paid = await self.roll_to(pg, M['cardTitle'], need=(M.get('check') or {}).get('opt'))
        self.check(sc, f"landed on the map's tile: the card ({', '.join(M['cardWords'][:6])}…)", card and all(w in card['text'] for w in M['cardWords']) and set(M['cardOpts']) <= set(card['opts']) and card['head'],
                   card and ([w for w in M['cardWords'] if w not in card['text']], card['opts'], card['text'][:600]))
        if card:
            rk = {o: (r, t) for o, r, t in card['risks']}
            self.check(sc, 'every option says its money / months and its risk in words; pass = nothing', M['riskOk'](rk) and rk.get('pass', ('', ''))[1] == 'בלי לשלם כלום', rk)
            bad = await self.axe_bad(pg, '#evm'); self.check(sc, 'axe: the card has no critical / serious violation', not bad, bad)
            await self.shot(pg, 'card_desk')
            if M.get('check'):
                C = M['check']; st0 = await pg.evaluate(self.SAVED)
                r = await pg.evaluate("""async ([oid, marker]) => { const c = document.querySelector('#evCard'); const t0 = c.querySelector('h2').textContent; const b = c.querySelector(`button[data-o="${oid}"]`);
                  if (!b || b.disabled) return { skip: true }; b.click();
                  for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 25)); if (document.querySelector('#evm').hidden || c.textContent.includes(marker)) break; }
                  const open = !document.querySelector('#evm').hidden; const upd = open && c.textContent.includes(marker);
                  let ghost = null; if (upd) { const w = c.querySelector('button[data-o="pass"]'); w.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); await new Promise((r) => setTimeout(r, 60)); ghost = !document.querySelector('#evm').hidden; }
                  return { open, upd, ghost, same: open && c.querySelector('h2').textContent === t0, gone: !c.querySelector(`button[data-o="${oid}"]`), text: c.textContent }; }""", [C['opt'], C['marker']])
                st1 = await pg.evaluate(self.SAVED)
                self.check(sc, f'the check keeps the SAME card open and redraws it in place ("{C["marker"]}", the check button gone, the band narrower)', r.get('same') and r.get('upd') and r.get('gone') and C['narrow'](st0, st1), ({k: v for k, v in r.items() if k != 'text'}, (r.get('text') or '')[:300]))
                self.check(sc, f'the check cost exactly its fee ({C["feeWhat"]})', C['fee'](st0, st1), (C['feeWhat'],))
                self.check(sc, 'a tap right after the card changed is ignored (the ghost-tap guard): the card is still open', r.get('ghost') is True, r.get('ghost'))
                await self.shot(pg, 'card_checked_desk')
                await pg.wait_for_timeout(400)
            st1 = await pg.evaluate(self.SAVED)
            buy = pg.locator(', '.join(f'#evCard button[data-o="{o}"]:not([disabled])' for o in M['buyOpts']))
            bought = await buy.count() > 0
            if bought: await buy.first.click()
            else: await pg.locator('#evCard button[data-o="pass"]').click()
            await pg.wait_for_timeout(900); await self.idle(pg)
            st2 = await pg.evaluate(self.SAVED)
            self.check(sc, f'{M["buyWhat"]} — or pass, the safe choice', M['bought'](st1, st2) if bought else True, (bought,))
        for _ in range(4):
            await pg.click('#roll'); await pg.wait_for_timeout(500); await self.idle(pg)
        st = await pg.evaluate(self.SAVED)
        self.check(sc, 'rolled through a payday', paid or st['month'] > 1, st['month'])
        if self.SHOTS:
            await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('overview'))"); await pg.wait_for_timeout(2500); await self.shot(pg, 'board3d_overview_desk')
            await pg.evaluate("import('./js/scene.js').then((S) => S.setCameraMode('follow'))"); await pg.wait_for_timeout(1500)
        P = await self.panel(pg); st = await pg.evaluate(self.SAVED)
        self.check(sc, f'panel "{M["panelTitle"]}": gauges {M["gauges"]} in their units, the map line', P['gauges'] == M['gauges'] and M['panelTitle'] in P['title'] and M['gaugesOk'](P['gtext']) and all(w in P['now'] for w in M['nowWords']), (P['gauges'], P['gtext'], P['now'][:400]))
        if M.get('table'):
            T = P['tables'][0] if P['tables'] else None
            self.check(sc, f'an accessible table ({M["table"]["what"]}): caption, column headers, a row header per {M["table"]["n"]} rows', T and T['cap'] and T['th'] >= 4 and T['rows'] == M['table']['n'] and T['rowh'] == T['rows'], P['tables'])
        self.check(sc, f'a row per engine row ({M["rowsWhat"]}), each with its own actions', M['rowsOk'](P['rows'], st), [(r['data'], r['acts']) for r in P['rows']])
        bad = await self.axe_bad(pg, '#gm'); self.check(sc, 'axe: the panel has no critical / serious violation', not bad, bad)
        if self.SHOTS: await pg.wait_for_timeout(1500); await pg.add_style_tag(content='#toast{visibility:hidden !important}')
        await self.shot(pg, 'panel_desk')
        if self.SHOTS and M.get('rowsSel'):
            await pg.evaluate(f"() => document.querySelector('#gmCard {M['rowsSel']}')?.scrollIntoView({{ block: 'start' }})"); await pg.wait_for_timeout(500); await self.shot(pg, 'panel_rows_desk')
        # one action through E.worldAction (one tap)
        O = M['one']; i = await self.tap(pg, O['aid'], O.get('re'))
        self.check(sc, f'{O["what"]} is offered', i >= 0, i)
        if i >= 0:
            st0 = await pg.evaluate(self.SAVED); z0 = sum(1 for a in st0.get('actions', []) if a[0] == 'Z')
            await pg.locator(f'#gmCard button[data-wact="{i}"]').click(); await pg.wait_for_timeout(900)
            msg = await pg.evaluate("() => { const m = document.querySelector('#gmCard .wp-msg'); return { t: m.textContent, c: m.className }; }")
            st1 = await pg.evaluate(self.SAVED)
            self.check(sc, f'{O["what"]} went through E.worldAction (one tap: the engine changed, one more Z action, the panel redrawn with its toast)', O['ok'](st0, st1) and sum(1 for a in st1.get('actions', []) if a[0] == 'Z') == z0 + 1 and 'pos' in msg['c'], msg)
        T2 = M['two']; i = await self.tap(pg, T2['aid'], T2.get('re'))
        self.check(sc, f'{T2["what"]} is offered', i >= 0, i)
        if i >= 0:
            st0 = await pg.evaluate(self.SAVED)
            await pg.locator(f'#gmCard button[data-wact="{i}"]').click(); await pg.wait_for_timeout(500)
            r = await pg.evaluate("() => ({ arm: !!document.querySelector('#gmCard button[data-arm=\"1\"]'), msg: document.querySelector('#gmCard .wp-msg').textContent, note: (document.querySelector('#gmCard .wp-armnote') || {}).textContent || '' })")
            st1 = await pg.evaluate(self.SAVED)
            self.check(sc, f'{T2["what"]} needs a second tap: the first says {T2["sayWhat"]} and "לחיצה נוספת מאשרת" (also under its buttons), changes nothing', r['arm'] and all(w in r['msg'] for w in T2['say']) and 'לחיצה נוספת מאשרת' in r['msg'] and r['note'] == r['msg'] and not T2['done'](st0, st1), r)
            await self.shot(pg, 'panel_armed_desk')
            await pg.locator(f'#gmCard button[data-wact="{i}"]').click(); await pg.wait_for_timeout(1000)
            st2 = await pg.evaluate(self.SAVED)
            self.check(sc, f'the second tap does it ({T2["doneWhat"]})', T2['done'](st0, st2), T2['doneWhat'])
        await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
        await self.close_gm(pg)
        await pg.click('#hubBtn'); await pg.wait_for_selector('#gmCard.mhub', timeout=5000)
        row = await pg.evaluate("() => { const r = document.querySelector('#gmCard .mh-row[data-row=\"world\"]'); return r ? r.textContent : null; }")
        self.check(sc, f'💼 has the "{M["panelTitle"]}" row ({", ".join(M["hubWords"])})', row and M['panelTitle'] in row and all(w in row for w in M['hubWords']), row)
        if row:
            await pg.click('#gmCard .mh-row[data-row="world"] button[data-hub="world"]'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000)
            self.check(sc, '💼 → the panel opens', await pg.locator('#gmCard.wpanel').count() == 1)
            await pg.locator('#gmCard .acts button.primary').click(); await pg.wait_for_timeout(400)
        await self.close_gm(pg)
        await pg.click('#hGoalBtn'); await pg.wait_for_selector('#goalPanel:not([hidden])', timeout=5000)
        gp = await pg.evaluate("() => document.querySelector('#goalPanel').textContent")
        hud = await pg.evaluate("() => ({ sub: document.querySelector('#hGoal .gsub').textContent.replace(/[\u2066-\u2069]/g, ''), tags: [...document.querySelectorAll('#hGoal .gbar em')].map((e) => e.textContent), label: document.querySelector('#hGoal .gl span').textContent, zero: /₪0 \\/ ₪0/.test(document.body.innerText.replace(/[\u2066-\u2069]/g, '')) })")
        self.check(sc, f'goal: {", ".join(M["goalWords"])} in their units (never "fixed costs", never "₪0 / ₪0" on the HUD line or the sheet); the HUD: {" / ".join(M["tags"])}',
                   all(w in gp for w in M['goalWords']) and 'עלויות קבועות' not in gp and 'הדרך ליעד' in gp and hud['tags'] == M['tags'] and hud['label'] == M['meter'] and all(x not in gp for x in M.get('goalNever', [])) and all(w in hud['sub'] for w in M.get('subWords', [])) and not hud['zero'], (gp[:600], hud))
        await pg.click('#hGoalBtn'); await pg.wait_for_timeout(300)
        a0 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        K = M['audit']; ent = a0.get(K) or {}
        lv_ok = ent and all(a0['levels'].get(k, {}).get('kind') == M['level'] for k in ent)
        self.check(sc, f'3D: the city equals cityModels and the {M["level"]} level is on its piece', a0['want'] == a0['scene'] and lv_ok, a0)
        ms = {}
        for k in ent: ms[k] = ((await pg.evaluate("(k) => import('./js/scene.js').then((S) => S.levelOf ? S.levelOf(k) : null)", k)) or {}).get('model') or {}
        self.check(sc, f'3D: the stand-in drew the engine ({M["modelWhat"]}; scene.levelOf model)', ent and all(M['modelOk'](ms[k], v) for k, v in ent.items()), (ms, ent))
        await pg.reload(); await pg.wait_for_selector('.lb-shell', timeout=120000); await pg.wait_for_timeout(1500)
        await pg.click(f'.map-card[data-id="{self.wid}"]'); await pg.wait_for_selector(f'[data-act="continue-free"][data-id="{self.wid}"]', timeout=60000)
        await pg.click(f'[data-act="continue-free"][data-id="{self.wid}"]'); await pg.wait_for_selector('#start', state='hidden', timeout=120000); await pg.wait_for_timeout(2500)
        await self.idle(pg)
        a1 = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
        self.check(sc, 'after reload + resume: the same city and the same level (engine = scene)', a1['want'] == a0['want'] and a1['want'] == a1['scene'] and a1.get(K) == a0.get(K), (a0.get(K), a1.get(K)))
        await ctx.close()

    async def run_2d(self, b):
        M = self.M
        for vp in ('desk', 'phone', 'small'):
            sc = f'2d-{vp}'; ctx, pg = await self.page(b, vp, flags='?ff=board2d:on')
            await self.start(pg, M['chars'][1] if vp == 'desk' else M['chars'][2])
            if vp != 'desk':
                card, _ = await self.roll_to(pg, M['cardTitle'])
                self.check(sc, "reached the map's tile on the 2D board", card is not None)
                if card:
                    await pg.wait_for_timeout(900)
                    over = await pg.evaluate("() => [...document.querySelectorAll('#evCard .grid .row, #evCard .div-h')].filter((r) => r.scrollWidth > r.clientWidth + 1).map((r) => [r.textContent, r.scrollWidth, r.clientWidth])")
                    fit = await pg.evaluate("() => { const c = document.querySelector('#evCard').getBoundingClientRect(); return c.width <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#evCard button[data-o]')].every((x) => x.getBoundingClientRect().height >= 43.5); }")
                    self.check(sc, 'the card fits the phone width (no row overflows, every button ≥ 44 px)', fit and not over, over)
                    await self.shot(pg, f'card_{vp}')
                    await pg.locator('#evCard button[data-o="pass"]').click(); await pg.wait_for_timeout(600)
                    await self.idle(pg)
            else:
                for _ in range(3): await pg.click('#roll'); await pg.wait_for_timeout(400); await self.idle(pg)
            a = await pg.evaluate("import('./js/game.js').then((g) => g.cityAudit())")
            cards = await pg.evaluate("""(kind) => [...document.querySelectorAll('.b2d-card')].filter((x) => x.dataset.kind === kind).map((c) => ({ key: c.dataset.key, label: c.getAttribute('aria-label'),
              corner: (c.querySelector('.b2d-corner-b') || {}).textContent || '', light: c.dataset.light, run: c.dataset.run, pct: c.style.getPropertyValue('--b2d-pct') }))""", M['level'])
            ent = a.get(M['audit']) or {}
            self.check(sc, f'2D: the {M["level"]} card shows its corner ({" / ".join(M["corners"])}), its words in the name and its bar = the engine', cards and len(cards) == len(ent) and all(c['corner'] in M['corners'] and M['card2dOk'](c, ent.get(c['key']) or {}) for c in cards), (cards, ent))
            th = await pg.evaluate("() => ({ world: document.body.dataset.world, sky: getComputedStyle(document.documentElement).getPropertyValue('--sky1').trim(), board: ((document.querySelector('[class*=b2d-m-]') || {}).style || { getPropertyValue: () => '' }).getPropertyValue('--b2d-board').trim(), motif: [...(document.querySelector('[class*=b2d-m-]') || { classList: [] }).classList].find((x) => x.startsWith('b2d-m-')) || '' })")
            self.check(sc, f'2D: the {self.wid} look (data-world, the sky, the board, the {M["motif2d"]} motif)', th['world'] == self.wid and th['sky'].lower() == M['sky1'] and th['board'].lower() == M['board'] and th['motif'] == 'b2d-m-' + M['motif2d'], th)
            chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const h = document.querySelector('#hWorld').getBoundingClientRect(); const r = b.getBoundingClientRect(); return { chip: r.left >= h.left - 1 && r.right <= h.right + 1, over: document.documentElement.scrollWidth > innerWidth + 1, t: b.textContent }; }")
            self.check(sc, f'the {M["chipEmoji"]} chip stays inside the HUD card', chip and chip['chip'] and not chip['over'] and M['chipEmoji'] in chip['t'], chip)
            await self.shot(pg, f'board2d_{vp}')
            await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
            fit = await pg.evaluate("""() => { const c = document.querySelector('#gmCard'); const r = c.getBoundingClientRect(); return { w: r.width, vw: innerWidth, over: document.documentElement.scrollWidth > innerWidth + 1,
              acts: [...c.querySelectorAll('button[data-wact]')].every((b) => b.getBoundingClientRect().height >= 43.5), touch: [...c.querySelectorAll('button[data-wact]')].every((b) => getComputedStyle(b).touchAction === 'manipulation'),
              rows: [...c.querySelectorAll('.wp-g, .wp-now, .wp-rows > li')].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.className + ' ' + x.textContent.slice(0, 60)) }; }""")
            self.check(sc, 'panel fits the width (gauges, the map line, the rows; a table scrolls inside its own box), every action button ≥ 44 px with touch-action manipulation', fit['w'] <= fit['vw'] and not fit['over'] and fit['acts'] and fit['touch'] and not fit['rows'], fit)
            if vp != 'desk':
                if self.SHOTS: await pg.add_style_tag(content='#toast{visibility:hidden !important}')
                await self.shot(pg, f'panel_{vp}')
            await pg.locator('#gmCard .acts button.primary').click()
            await ctx.close()

    async def run_3dphone(self, b):
        M = self.M
        for vp in ('phone', 'small'):
            sc = f'3d-{vp}'; ctx, pg = await self.page(b, vp)
            await self.start(pg, M['chars'][0])
            k = await pg.evaluate("import('./js/scene.js').then((S) => S.kind)")
            chip = await pg.evaluate("() => { const b = document.querySelector('#worldPanelBtn'); if (!b) return null; const h = document.querySelector('#hWorld').getBoundingClientRect(); const r = b.getBoundingClientRect(); return { chip: r.left >= h.left - 1 && r.right <= h.right + 1, t: b.textContent }; }")
            self.check(sc, f'3D board on a phone; the {M["chipEmoji"]} chip stays inside the HUD card', k == '3d' and chip and chip['chip'] and M['chipEmoji'] in chip['t'], (k, chip))
            await self.shot(pg, f'board3d_{vp}')
            await pg.click('#worldPanelBtn'); await pg.wait_for_selector('#gmCard.wpanel', timeout=10000); await pg.wait_for_timeout(900)
            g = await pg.evaluate("() => { const c = document.querySelector('#gmCard'); return { over: document.documentElement.scrollWidth > innerWidth + 1, rows: [...c.querySelectorAll('.wp-rows > li')].every((x) => x.getBoundingClientRect().right <= innerWidth + 1 && x.getBoundingClientRect().left >= -1), gauges: [...c.querySelectorAll('.wp-g')].every((x) => x.scrollWidth <= x.clientWidth + 1) }; }")
            self.check(sc, 'the rows and the gauges fit the phone width', g['rows'] and not g['over'] and g['gauges'], g)
            if self.SHOTS and M.get('rowsSel'):
                await pg.add_style_tag(content='#toast{visibility:hidden !important}')
                await pg.evaluate(f"() => document.querySelector('#gmCard {M['rowsSel']}')?.scrollIntoView({{ block: 'start' }})"); await pg.wait_for_timeout(500)
            await self.shot(pg, f'panel_rows_{vp}')
            await pg.locator('#gmCard .acts button.primary').click()
            await ctx.close()

    async def run_motion(self, b):
        sc = 'motion-reduced'; ctx, pg = await self.page(b, 'desk', reduced=True); M = self.M
        await self.start(pg, M['chars'][0])
        q = f"import('./js/scene.js').then((S) => ({{ red: S.perfStats().reduced, dc: S.perfStats().decor['{M['decor']}'], fps: S.perfStats().framesRendered }}))"
        s0 = await pg.evaluate(q); await pg.wait_for_timeout(2500); s1 = await pg.evaluate(q)
        self.check(sc, f'reduced motion: the {M["decor"]} decor is drawn and the idle scene does not animate (well under 60 frames in 2.5 s)', s0['red'] and s0['dc'] and M['decorOk'](s0['dc']) and s1['dc'] == s0['dc'] and s1['fps'] - s0['fps'] < 60, (s0, s1))
        await ctx.close()

    async def main(self):
        FB.banner(self.MODE)
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=self.ARGS)
            for name, fn in (('map', self.run_map), ('pick', self.run_pick), ('play', self.run_play), ('2d', self.run_2d), ('3d', self.run_3dphone), ('motion', self.run_motion)):
                if self.want(name):
                    try: await fn(b)
                    except Exception as e: self.check(name, f'the {name} run finished', False, repr(e)[:600])
            await b.close()
        for s in self.SINKS: FB.assert_clean(s)
        self.check('all', 'no same-origin request failed (no 404)', not self.BAD, self.BAD[:10])
        fails = [r for r in self.RESULTS if not r[2]]
        self.log(f'{self.wid}: {len(self.RESULTS) - len(fails)} passed, {len(fails)} failed, {len(self.ERRS)} page errors')
        for e in self.ERRS: self.log('ERR', e)
        sys.exit(1 if fails or self.ERRS else 0)

def run(M): asyncio.run(Run(M).main())
