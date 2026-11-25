# Wave 3b — live rooms + groups v2 + competitions through the REAL lobby UI (js/rooms.js, js/remote.js, js/net.js), with 2–5 SEPARATE
# browser contexts = separate identities (own localStorage credentials), against the offline fake backend (tests/fakebackend.py: rr_*
# RPCs in-process + the Edge Function `room` → tests/fakeroom.mjs = room_core.js + the pinned engine). BRIEF §30 list: room + join,
# permissions, start, turn, out of turn, double click, parallel actions, duplicate message, stale state, disconnect + return, host
# leaves, timeout, finish once, forged result, stranger, revoked invite, closed competition. The production host is never contacted
# (FB.install guard + chrome_args; assert_clean at the end).
# Run (private copies, one browser suite at a time):
#   SRC=<export> COPY_DIR=/tmp/w3b PORT_BASE=10100 bash tests/serve_copies.sh
#   python3 tests/rooms_e2e.py http://localhost:10101/ [--hook=http://localhost:10103/]   (RR_SHOTS=<dir> for screenshots)
# --hook: a copy of the real game whose game.js carries the wave-3b hook (/tmp/w3b/game_hook.patch) — plays a room on the game screen.
# --local: the same browser suite against the LOCAL staging stack instead of the fake (real PostgreSQL + PostgREST + the Edge Function
#   under Deno; tests/online_localstack.py relays the page's Supabase calls there). Start it with RR_STAGING_FAKETIME=1
#   tools/staging/start.sh, then `. /tmp/rr-staging/target.env`. The groups v2 / competitions part is skipped (not rooms; it also
#   needs verify-result and the fake's daily/weekly model).
import asyncio, json, os, sys, random
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
import online_localstack as LS
LOCAL = '--local' in sys.argv
BASE = FB.base_url('http://localhost:10101/')
HOOK = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--hook=')), None)
SHOT = os.environ.get('RR_SHOTS', '/tmp/w3b/shots') + '/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
fb = LS.LocalStack.from_env() if LOCAL else FB.FakeBackend(verify='accept'); fb.set_daily('w1', 0)
TAG = str(random.randint(100, 999))
results = []
SINKS = []
DESK = {'width': 1300, 'height': 820}; PHONE = {'width': 390, 'height': 844}
def log(*a): print(*a, flush=True)
def check(cond, msg):
    results.append((bool(cond), msg)); log(('PASS ' if cond else 'FAIL ') + msg)

XSS = '<svg onload=__xss=1>'      # 20 chars: survives the room's 20-char nickname cut
async def ident(b, nick, vp=DESK, flag=True, scheme='light', player=None):
    p = player or fb.seed_player(nick)
    ctx = await b.new_context(**FB.new_context_kwargs(), viewport=vp, color_scheme=scheme, locale='he-IL')
    SINKS.append(await (LS.install(ctx, fb) if LOCAL else FB.install(ctx, fb)))
    init = "localStorage.setItem('rr2-onboarded','1');localStorage.setItem('rr-player'," + json.dumps(json.dumps(p)) + ");"
    if flag: init += "localStorage.setItem('rr2-flags', JSON.stringify({rooms:true}));"
    await ctx.add_init_script(init)
    await ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: (log('PAGEERR', nick, e), results.append((False, f'page error in {nick}: {e}'))))
    pg.on('console', lambda m: log('CONSOLE', nick, m.text) if m.type == 'error' and '404' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    return ctx, pg, p

async def shot(pg, name):
    os.makedirs(SHOT, exist_ok=True); await pg.wait_for_timeout(450)
    await pg.screenshot(path=SHOT + name + '.jpg', type='jpeg', quality=80, full_page=False)

DRV = "import('./js/rooms.js').then((m) => m._debug.driver())"
async def poke(pg):
    """force a fresh snapshot + repaint (instead of waiting for the 3 s / 8 s poll)"""
    try: await pg.evaluate(f"{DRV}.then((d) => d && d.refresh(true)).catch(() => null)")
    except Exception: pass
    await pg.wait_for_timeout(150)
async def toast_text(pg):
    try: return await pg.inner_text('#lb-toast')
    except Exception: return ''
async def room_dump(room_id):
    d = await asyncio.to_thread(fb.rooms_dump)
    return next((r for r in (d or {}).get('rooms', []) if r['id'] == room_id), None)
async def seat_sv(room_id, seat):
    r = await room_dump(room_id); s = next(x for x in r['seats'] if x['seat'] == seat); return s['state_version']

BOT = """async (n) => { const m = await import('./js/rooms.js'); const d = m._debug.driver(); if (!d) return 'nodrv';
  const SAFE = ['pass', 'skip', 'ok', 'done', 'decline', 'no', 'later', 'stay', 'keep'];
  for (let i = 0; i < n; i++) {
    await d.refresh(true);
    if (d.status !== 'playing') return d.status; if (!d.active()) return 'inactive';
    if (d.event) { const o = d.event.options.find((x) => x.enabled && SAFE.includes(x.id)) || d.event.options.find((x) => x.enabled); if (!o) return 'nooption';
      try { await d.act('c', o.needsQty ? [o.id, 1] : [o.id]); } catch (e) { if (e.code === 'rate_limited') return 'rate'; if (e.code !== 'illegal_action' && e.code !== 'stale') return 'err:' + e.code; } continue; }
    if (d.canRoll()) { try { await d.act('r'); } catch (e) { if (e.code !== 'stale' && e.code !== 'not_your_roll') return 'err:' + e.code; } continue; }
    return 'waiting';
  } return 'n'; }"""

async def main():
    async with async_playwright() as pw:
        FB.banner('offline', 'accept') if not LOCAL else log(f'backend=LOCAL STAGING {fb.url} (real PostgreSQL + PostgREST + Deno room function; clock={fb.clock})')
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args('offline', ARGS))
        # ------------------------------------------------ flag OFF: nothing of wave 3b is visible or called
        cO, O, _ = await ident(b, 'טסט־כבוי' + TAG, flag=False)
        n0 = sum(v for k, v in fb.calls.items() if k.startswith('rr_room') or k == 'room' or k == 'rr_my_rooms')
        await O.goto(BASE + '?room=ABCDEF'); await O.wait_for_selector('.lb-home')
        await O.wait_for_timeout(800)
        check(await O.locator('.rm-entry').count() == 0, 'flag OFF: no live-room entry on the home screen')
        check(sum(v for k, v in fb.calls.items() if k.startswith('rr_room') or k == 'room' or k == 'rr_my_rooms') == n0, 'flag OFF: ?room= link ignored, no room RPC / Edge call')
        check(await O.evaluate("!document.querySelector('link[data-rooms-css]')"), 'flag OFF: rooms.css / rooms.js never loaded')
        await cO.close()

        # ------------------------------------------------ identities
        cA, A, pA = await ident(b, 'טסט־מארח' + TAG)
        cB, B, pB = await ident(b, 'טסט־בת' + TAG, vp=PHONE)
        cC, C, pC = await ident(b, XSS, vp={'width': 1000, 'height': 800}, scheme='dark')
        cD, D, pD = await ident(b, 'טסט־זר' + TAG)

        # ------------------------------------------------ create
        await A.goto(BASE); await A.wait_for_selector('.lb-home')
        await A.wait_for_selector('.rm-entry')
        check(True, 'flag ON: "חדר חי" entry on the home screen')
        await A.click('.rm-entry'); await A.wait_for_selector('form[data-rform="rcreate"]')
        await A.wait_for_selector('#rmMine .lb-empty, #rmMine .lb-glist')
        await shot(A, 'rooms_hub_desk')
        await A.select_option('form[data-rform="rcreate"] select[name="max_rounds"]', '24')
        await A.select_option('form[data-rform="rcreate"] select[name="turn_secs"]', '60')
        await A.click('form[data-rform="rcreate"] button.primary')
        await A.wait_for_selector('.rm-room.is-lobby')
        CODE = (await A.inner_text('.rm-code')).strip(); ROOM = await A.get_attribute('.rm-room', 'data-room')
        check(len(CODE) == 6 and ROOM, f'create room → waiting room with code {CODE}')
        check(await A.locator('.rm-seats li.me .rm-host').count() == 1, 'creator is the host (👑)')
        # ------------------------------------------------ join: link (phone), bad code, code form
        await B.goto(BASE + '?room=' + CODE); await B.wait_for_selector('.rm-room.is-lobby')
        check(await B.locator('.rm-seats li').filter(has_text='טסט־בת').count() == 1, 'join by link ?room=CODE (phone) → in the waiting room')
        check('room=' not in B.url, 'the ?room= parameter is removed from the address after joining')
        await D.goto(BASE); await D.wait_for_selector('.rm-entry'); await D.click('.rm-entry'); await D.wait_for_selector('form[data-rform="rjoin"]')
        await D.fill('#rmCode', 'ZZZZZ9'); await D.click('form[data-rform="rjoin"] button')
        await D.wait_for_function("document.querySelector('form[data-rform=\"rjoin\"] .err').textContent.length > 0")
        check('לא מצאנו חדר' in await D.inner_text('form[data-rform="rjoin"] .err'), 'bad code → clear Hebrew error (room_not_found, no oracle)')
        await D.fill('#rmCode', 'AB'); await D.click('form[data-rform="rjoin"] button'); await D.wait_for_timeout(300)
        check('6 תווים' in await D.inner_text('form[data-rform="rjoin"] .err'), 'malformed code → refused locally')
        await C.goto(BASE); await C.wait_for_selector('.rm-entry'); await C.click('.rm-entry'); await C.wait_for_selector('#rmCode')
        await C.fill('#rmCode', CODE.lower()); await C.click('form[data-rform="rjoin"] button'); await C.wait_for_selector('.rm-room.is-lobby')
        check(True, 'join by typing the code (lower case) → waiting room')
        await poke(A)
        check(await A.locator('.rm-seats li:not(.rm-empty)').count() == 3, 'host sees 3 players')
        check(await A.evaluate('window.__xss') is None and await B.evaluate('window.__xss') is None and XSS in await A.inner_text('.rm-seats'), 'malicious nickname shown as text, never executed')
        check(await A.locator('.rm-conn.on').count() >= 3, 'connection state shown (מחובר)')
        await shot(A, 'rooms_waiting_desk'); await shot(B, 'rooms_waiting_390')
        # ------------------------------------------------ permissions
        check(await B.locator('[data-ract="start"]').count() == 0 and await B.locator('[data-ract="kick"]').count() == 0, 'a non-host sees no start / kick')
        check(await A.locator('[data-ract="kick"]').count() == 2, 'the host can kick each other player')
        r = await B.evaluate("import('./js/net.js').then(({net}) => net.roomFn('start', %s).then(() => 'ok', (e) => e.status + ':' + e.code))" % json.dumps(ROOM))
        check(r == '403:not_host', f'forged start by a non-host (direct call) → 403 not_host ({r})')
        await A.evaluate("document.querySelector('[data-ract=\"start\"]').click()"); await A.wait_for_timeout(500)   # aria-disabled: still pressable
        check('עוד לא כולם מוכנים' in await toast_text(A), 'start before everyone is ready → server refuses, Hebrew toast')
        cK, K, pK = await ident(b, 'טסט־נבעט' + TAG)
        await K.goto(BASE + '?room=' + CODE); await K.wait_for_selector('.rm-room.is-lobby')
        await poke(A); await A.click('.rm-seats li:has-text("טסט־נבעט") [data-ract="kick"]')
        await poke(K); await K.wait_for_selector('form[data-rform="rjoin"]', timeout=8000)
        check('rm-hub' in (await K.get_attribute('.lb-shell', 'class') or ''), 'kicked player is sent back to the rooms hub')
        await K.fill('#rmCode', CODE); await K.click('form[data-rform="rjoin"] button')
        await K.wait_for_function("document.querySelector('form[data-rform=\"rjoin\"] .err').textContent.length > 0")
        check('לא מצאנו חדר' in await K.inner_text('form[data-rform="rjoin"] .err'), 'a kicked player cannot rejoin with the code')
        await cK.close()
        # ------------------------------------------------ ready + start
        for pg in (A, B, C):
            await poke(pg); await pg.click('[data-ract="ready"]'); await pg.wait_for_selector('[data-ract="ready"][aria-pressed="true"]')
        await poke(A)
        check(await A.locator('.rm-st.ok').count() == 3, 'everyone ready (✓) — seen by the host')
        await A.click('[data-ract="start"]'); await A.wait_for_selector('.rm-room.is-playing')
        for pg in (B, C): await poke(pg); await pg.wait_for_selector('.rm-room.is-playing')
        check(True, 'host starts → every identity sees round 1')
        check('סבב' in await B.inner_text('.rm-round') and '⏱' in await B.inner_text('#rmTimer'), 'round + server-clock countdown shown')
        await D.evaluate("1"); r = await D.evaluate("import('./js/net.js').then(({net}) => net.roomState(%s).then(() => 'ok', (e) => e.code))" % json.dumps(ROOM))
        check(r == 'not_in_room', f'a stranger cannot read the room ({r})')
        await D.goto(BASE + '?room=' + CODE); await D.wait_for_selector('form[data-rform="rjoin"] .err:not(:empty)')
        check('לא מצאנו חדר' in await D.inner_text('form[data-rform="rjoin"] .err'), 'a started room cannot be joined (same answer as an unknown code)')
        # ------------------------------------------------ turn + double click
        sv0 = await seat_sv(ROOM, 0)
        await A.evaluate("() => { const b = document.querySelector('[data-ract=\"roll\"]'); b.click(); b.click(); }")
        await A.wait_for_function("!document.querySelector('[data-ract=\"roll\"]') || document.querySelector('[data-ract=\"roll\"]').disabled", timeout=8000)
        await A.wait_for_timeout(600)
        check(await seat_sv(ROOM, 0) == sv0 + 1, 'double click on 🎲 → exactly one roll applied on the server')
        await shot(A, 'rooms_round_desk')
        r = await A.evaluate(f"{DRV}.then((d) => d.act('r').then(() => 'ok', (e) => e.code))")
        check(r == 'not_your_roll', f'out of turn: a second roll in the same round → not_your_roll ({r})')
        # ------------------------------------------------ forged fields + forged code
        r = await B.evaluate("""import('./js/net.js').then(async ({net}) => { const s = await net.roomState(%s); const sv = s.me.state_version;
            const a = await net.roomFn('act', %s, { action_id: 'forge-cash-0001', state_version: sv, code: 'L', args: [], cash: 99999999, result: { status: 'won' }, seat: 0 });
            const s2 = await net.roomState(%s);
            let x = null; try { await net.roomFn('act', %s, { action_id: 'forge-code-0001', state_version: s2.me.state_version, code: 'X', args: [] }); } catch (e) { x = e.status + ':' + e.code; }
            return { seat: s2.me.seat, cash: s2.me.view.state.cash, over: !!s2.me.view.state.over, x }; })""" % ((json.dumps(ROOM),) * 4))
        check(r['seat'] == 1 and r['cash'] < 1e6 and not r['over'] and r['x'] == '400:bad_action', f'forged result fields ignored; forged intent code → 400 bad_action ({r})')
        # ------------------------------------------------ stale (B's view one version behind)
        await poke(B)
        await B.evaluate(f"{DRV}.then((d) => {{ d.snap.me.state_version -= 1; }})")
        await B.click('[data-ract="tool"][data-c="R"]'); await B.wait_for_timeout(700)
        check('המצב התעדכן' in await toast_text(B), 'stale state version → 409 → "המצב התעדכן" and the server view is adopted')
        # ------------------------------------------------ duplicate message (the network delivers B's roll twice)
        dup = {'n': 0}
        async def dup_route(route):
            req = route.request
            try: body = json.loads(req.post_data or '{}')
            except ValueError: body = {}
            if req.method == 'POST' and body.get('op') == 'act' and dup['n'] > 0:
                dup['n'] -= 1
                st1, o1 = await asyncio.to_thread(fb.room_fn, body, len(req.post_data.encode()))
                st2, o2 = await asyncio.to_thread(fb.room_fn, body, len(req.post_data.encode()))
                dup['first'] = o1.get('replayed'); dup['second'] = o2.get('replayed')
                return await route.fulfill(status=st2, content_type='application/json', body=json.dumps(o2, ensure_ascii=False), headers=FB.CORS)
            return await route.fallback()
        await cB.route(FB.SB_PROD + '/functions/v1/room', dup_route)
        await poke(B); svB = await seat_sv(ROOM, 1); dup['n'] = 1
        await B.click('[data-ract="roll"]'); await B.wait_for_timeout(900)
        check(await seat_sv(ROOM, 1) == svB + 1 and dup.get('second') is True, f'duplicate message: the same action_id delivered twice → applied once, the copy gets the stored answer ({dup})')
        await shot(B, 'rooms_round_390')
        # ------------------------------------------------ parallel actions from two tabs of one identity + primary tab
        B2 = await cB.new_page(); await B2.goto(BASE); await B2.wait_for_selector('.lb-home')
        await B2.evaluate("import('./js/lobby.js').then(() => 1)")
        await B2.click('.rm-entry'); await B2.wait_for_selector('.rm-item'); await B2.click(f'.rm-item[data-id="{ROOM}"]'); await B2.wait_for_selector('.rm-room.is-playing')
        await B.evaluate(f"{DRV}.then((d) => d.heartbeat())"); await B2.evaluate(f"{DRV}.then((d) => d.heartbeat())"); await B.evaluate(f"{DRV}.then((d) => d.heartbeat())")
        await B.wait_for_selector('.rm-warn', timeout=5000)
        check(await B2.locator('.rm-warn').count() == 0, 'two tabs of one player: the older tab says "only watching here", the newer one plays')
        await poke(B); await poke(B2)
        r = await asyncio.gather(B.evaluate(f"{DRV}.then((d) => d.act('L').then(() => 200, (e) => e.code))"), B2.evaluate(f"{DRV}.then((d) => d.act('L').then(() => 200, (e) => e.code))"))
        check(sorted(map(str, r)) == ['200', 'stale'], f'parallel actions from two tabs (same version) → one applies, the other 409 stale ({r})')
        await B.click('[data-ract="takeover"]'); await B.wait_for_timeout(400)
        check(await B.locator('.rm-warn').count() == 0, '"להמשיך לשחק כאן" makes the old tab primary again')
        await B2.close()
        # ------------------------------------------------ disconnect + return: C's answer is lost, C reloads, the intent is resent once
        lose = {'n': 0}
        async def lose_route(route):
            req = route.request
            try: body = json.loads(req.post_data or '{}')
            except ValueError: body = {}
            if req.method == 'POST' and body.get('op') == 'act' and lose['n'] > 0:
                lose['n'] -= 1
                await asyncio.to_thread(fb.room_fn, body, len(req.post_data.encode()))
                return await route.abort('internetdisconnected')
            return await route.fallback()
        await cC.route(FB.SB_PROD + '/functions/v1/room', lose_route)
        await poke(C); svC = await seat_sv(ROOM, 2); lose['n'] = 4
        await C.click('[data-ract="roll"]'); await C.wait_for_timeout(5000)
        pend = await C.evaluate("JSON.parse(localStorage.getItem('rr2-room-pending') || '{}')")
        check(await seat_sv(ROOM, 2) == svC + 1 and ROOM in pend, f'connection lost after the server applied the roll: applied once, the intent waits in this device ({list(pend)})')
        await C.reload(); await C.wait_for_selector('.lb-shell')
        await C.evaluate("import('./js/lobby.js')"); await C.wait_for_selector('.rm-entry'); await C.click('.rm-entry'); await C.wait_for_selector(f'.rm-item[data-id="{ROOM}"]')
        await C.click(f'.rm-item[data-id="{ROOM}"]'); await C.wait_for_selector('.rm-room.is-playing')
        await C.wait_for_timeout(800)
        pend = await C.evaluate("JSON.parse(localStorage.getItem('rr2-room-pending') || '{}')")
        check(await seat_sv(ROOM, 2) == svC + 1 and ROOM not in pend, 'return: snapshot + the same action_id resent → nothing applied twice, pending cleared')
        check(await C.locator('[data-ract="roll"][disabled]').count() == 1 or await C.locator('.rm-card').count() == 1, 'after the return the seat shows the server state (rolled this round)')
        # ------------------------------------------------ reactions (fixed list, rate-limited)
        await A.click('[data-ract="react"][data-k="clap"]'); await A.wait_for_timeout(300)
        await A.click('[data-ract="react"][data-k="wow"]'); await A.wait_for_timeout(400)
        check('תגובה אחת' in await toast_text(A), 'reactions are rate-limited (one every few seconds)')
        await poke(B)
        check('👏' in await B.inner_text('.rm-rlast'), 'a reaction (👏) appears for the other players; no free-text chat anywhere')
        check(await A.locator('.rm-room textarea, .rm-room input[type="text"]').count() == 0, 'no free text input in a room')
        # ------------------------------------------------ timeout: nobody finishes round 1 → the deadline → safe autopilot
        await poke(A); rnd = int(await A.evaluate(f"{DRV}.then((d) => d.room.round)"))
        await asyncio.to_thread(fb.advance, 0, 0, 4)                  # 4 minutes > 60 s + 15 s grace
        await A.evaluate(f"{DRV}.then((d) => {{ d._lastTick = 0; d._lastPoll = 0; return d.pollOnce(); }})"); await poke(A)
        r2 = int(await A.evaluate(f"{DRV}.then((d) => d.room.round)"))
        check(r2 == rnd + 1, f'deadline passed → the client ticks, the server closes the round ({rnd} → {r2})')
        await A.click('.rm-log summary')
        check('הטייס הזהיר' in await A.inner_text('.rm-log'), 'the room log says the safe autopilot played for an idle seat')
        await shot(A, 'rooms_round2_desk')
        # ------------------------------------------------ a closed tab → shown as disconnected
        await C.evaluate(f"{DRV}.then((d) => d.stop())")                  # C's tab goes quiet (closed / phone asleep)
        await asyncio.to_thread(fb.advance, 0, 0, 1)
        for pg in (A, B): await pg.evaluate(f"{DRV}.then((d) => d.heartbeat())")
        await poke(B)
        check(await B.locator('.rm-opps li:has-text("svg") .rm-conn.off').count() == 1, 'a player whose tab is closed (no heartbeat > 45 s) is shown as disconnected')
        await C.evaluate(f"{DRV}.then((d) => {{ d.start(); return d.heartbeat(); }})"); await poke(B)
        check(await B.locator('.rm-opps li:has-text("svg") .rm-conn.on').count() == 1, '…and as connected again when the tab comes back')
        # ------------------------------------------------ host leaves (forfeit), the room goes on
        await A.click('[data-ract="leave"]'); await A.wait_for_selector('.rm-hub')
        await poke(B)
        check('פרש' in await B.inner_text('.rm-opps li:has-text("טסט־מארח")') and await B.locator('.rm-room.is-playing').count() == 1, 'the host leaves mid-game → forfeit; the room goes on without the host')
        # ------------------------------------------------ play to the end (B and C through the room screen's driver)
        for k in range(140):
            sb, sc = await asyncio.gather(B.evaluate(BOT, 40), C.evaluate(BOT, 40))
            if sb not in ('waiting', 'n', 'rate') and sc not in ('waiting', 'n', 'rate'): break
            if 'rate' in (sb, sc): await asyncio.to_thread(fb.advance, 0, 0, 1)
            if sb == sc == 'waiting' or (sb, sc) in (('waiting', 'inactive'), ('inactive', 'waiting')):
                await poke(B)
                if await B.evaluate(f"{DRV}.then((d) => d.status)") == 'playing' and await B.evaluate(f"{DRV}.then((d) => d.waiting() || !d.active())"):
                    await asyncio.to_thread(fb.advance, 0, 0, 2); await B.evaluate(f"{DRV}.then((d) => d.tick(true))")
            if k % 10 == 9: log('… bots', k, sb, sc)
        await poke(B); await poke(C)
        await B.wait_for_selector('.rm-room.is-finished', timeout=15000); await C.wait_for_selector('.rm-room.is-finished', timeout=15000)
        tb = await B.inner_text('.rm-board'); tc = await C.inner_text('.rm-board')
        rows = (await room_dump(ROOM))['results']
        norm = lambda t: ' '.join(t.replace('(אתה)', '').split())
        check(norm(tb) == norm(tc) and len(rows) == 3, 'finish: the same server-ranked table on every screen')
        if norm(tb) != norm(tc): log('B:', norm(tb)); log('C:', norm(tc))
        host = next(x for x in rows if x['seat'] == 0)
        check(host['forfeit'] and host['rank'] == 3, 'the forfeited host ranks last')
        check('לא לפי זמן' in await B.inner_text('.rm-res'), 'results explain the ranking (success / months / progress, never time); ties share a rank')
        await shot(B, 'rooms_results_390'); await shot(C, 'rooms_results_desk_dark')
        r = await B.evaluate(f"{DRV}.then((d) => d.act('r').then(() => 'ok', (e) => e.code))")
        check(r == 'room_not_playing', f'acting after the finish → room_not_playing ({r})')
        await asyncio.to_thread(fb.advance, 0, 3, 0); await B.evaluate(f"{DRV}.then((d) => d.tick(true))"); await poke(B)
        check(json.dumps((await room_dump(ROOM))['results']) == json.dumps(rows), 'finish exactly once: later ticks change nothing')

        # ------------------------------------------------ host leaves the WAITING room → the host role moves; cancel
        await A.click('form[data-rform="rcreate"] button.primary'); await A.wait_for_selector('.rm-room.is-lobby')
        CODE2 = (await A.inner_text('.rm-code')).strip()
        await B.goto(BASE + '?room=' + CODE2); await B.wait_for_selector('.rm-room.is-lobby')
        await poke(A); await A.click('[data-ract="leave"]'); await A.wait_for_selector('.rm-hub')
        await poke(B)
        check(await B.locator('.rm-seats li.me .rm-host').count() == 1 and await B.locator('[data-ract="start"]').count() == 1, 'the host leaves the waiting room → the next player becomes host')
        await B.click('[data-ract="cancel"]'); await B.wait_for_selector('.rm-room.is-cancelled')
        check('בוטל' in await B.inner_text('.rm-res'), 'the (new) host cancels the waiting room → "החדר בוטל", nobody ranked')

        if LOCAL: fb.reset_clock(); log('SKIP groups v2 / competitions part (--local: rooms only)')
        # ------------------------------------------------ groups v2: roles, description, invite rotation (revoked code), removal, history
        if not LOCAL:
            if not LOCAL: fb._offset = __import__('datetime').timedelta(0)   # the rooms part moved the fake clock hours ahead; competitions use the device clock for their end
            await A.goto(BASE); await A.wait_for_selector('#lbGname')
            await A.fill('#lbGname', 'טסט קבוצה ' + TAG); await A.click('form[data-form="newgroup"] button'); await A.wait_for_selector('.lb-group')
            await A.wait_for_selector('#gpV2 .gp-v2')
            check('בעלים' in await A.inner_text('#gpV2') and 'פרטית' in await A.inner_text('#gpV2'), 'group v2: my role (בעלים) + private by default')
            GCODE = (await A.inner_text('.gp-code')).strip()
            for pg in (B, C):
                await pg.goto(BASE + '?join=' + GCODE); await pg.wait_for_selector('.lb-group'); await pg.wait_for_selector('#gpV2 .gp-v2')
            check('חבר' in await B.inner_text('#gpV2 .gp-me-role') and await B.locator('#gpV2 [data-ract="g-remove"]').count() == 0 and await B.locator('#gpV2 [data-ract="g-rotate"]').count() == 0, 'a member sees no management buttons')
            await A.click('[data-act="group"]'); await A.wait_for_selector('#gpV2 .gp-mng')
            await A.click('#gpV2 .gp-edit summary'); await A.fill('form[data-rform="gupdate"] textarea', XSS + ' תיאור הקבוצה')
            await A.click('form[data-rform="gupdate"] button'); await A.wait_for_selector('#gpV2 .gp-desc')
            check(XSS in await A.inner_text('#gpV2 .gp-desc') and await A.evaluate('window.__xss') is None, 'description saved and shown as text (escaped)')
            await A.click(f'#gpV2 .gp-mng li:has-text("טסט־בת") [data-ract="g-role"]'); await A.wait_for_selector('#gpV2 .gp-mng li:has-text("טסט־בת") .gp-role.r-admin')
            check(True, 'owner makes B admin (role badge)')
            await B.click('[data-act="group"]'); await B.wait_for_selector('#gpV2 .gp-me-role')
            check('מנהל' in await B.inner_text('#gpV2 .gp-me-role') and await B.locator('#gpV2 [data-ract="g-rotate"]').count() == 1, 'B (admin) gets rotate / pause controls')
            await shot(B, 'groups_v2_admin_390')
            r = await C.evaluate("import('./js/net.js').then(async ({net}) => { const l = await net.myGroups(); const g = await net.group(l[0].id); const h = g.members.find((m) => m.role === 'owner').handle; return net.groupRemove(g.id, h).then(() => 'ok', (e) => e.code); })")
            check(r == 'not_allowed', f'a plain member trying to remove the owner (direct call) → not_allowed ({r})')
            await B.click('#gpV2 [data-ract="g-remove"]'); await B.wait_for_timeout(800)
            await B.wait_for_selector('#gpV2 .gp-mng')
            check(await B.locator('#gpV2 .gp-mng li:has-text("svg")').count() == 0, 'admin removes a member (C)')
            await C.goto(BASE + '?join=' + GCODE); await C.wait_for_timeout(1500)
            check('לא מצאנו קבוצה' in await toast_text(C) or 'לא מצאנו קבוצה' in await C.inner_text('#lbGErr'), 'a removed member cannot rejoin with the same code')
            await B.click('#gpV2 [data-ract="g-rotate"]'); await B.wait_for_timeout(800); await B.wait_for_selector('.gp-code')
            NEW = (await B.inner_text('.gp-code')).strip()
            check(NEW != GCODE, f'admin rotates the invite code ({GCODE} → {NEW})')
            await D.goto(BASE + '?join=' + GCODE); await D.wait_for_timeout(1500)
            check('לא מצאנו קבוצה' in await toast_text(D) or 'לא מצאנו קבוצה' in await D.inner_text('#lbGErr'), 'revoked (rotated) invite link → "לא מצאנו קבוצה"')
            await D.goto(BASE + '?join=' + NEW); await D.wait_for_selector('.lb-group')
            check(True, 'the new invite code works')
            await B.click('[data-act="group"]'); await B.wait_for_selector('#gpV2 [data-ract="g-pause"]'); await B.click('#gpV2 [data-ract="g-pause"]'); await B.wait_for_timeout(800)
            check('מושהות' in await B.inner_text('#gpV2 .gp-inv2'), 'admin pauses invites')
            await C.goto(BASE + '?join=' + NEW); await C.wait_for_timeout(1500)
            check('לא מצאנו קבוצה' in await toast_text(C) or 'לא מצאנו קבוצה' in await C.inner_text('#lbGErr'), 'paused invites: the code answers like an unknown one')
            await A.click('[data-act="group"]'); await A.wait_for_selector('#gpV2 [data-ract="g-history"]'); await A.click('#gpV2 [data-ract="g-history"]'); await A.wait_for_selector('.gp-hist')
            h = await A.inner_text('.gp-hist')
            check('החליף את קוד ההזמנה' in h and 'הסיר את' in h, 'history lists the rotation and the removal')
            await shot(A, 'groups_v2_owner_desk')
            # ------------------------------------------------ competitions: create (2 attempts), play, cancel, closed
            await A.click('#gpComps .gp-newcomp summary'); await A.fill('form[data-rform="newcomp"] input[name="title"]', 'טסט תחרות ' + TAG)
            await A.select_option('form[data-rform="newcomp"] select[name="attempts"]', '2'); await A.select_option('form[data-rform="newcomp"] select[name="hours"]', '2')
            await A.click('form[data-rform="newcomp"] button'); await A.wait_for_selector('#gpComps .gp-comp')
            await A.wait_for_selector('#gpComps .gp-rules')
            t = await A.inner_text('#gpComps .gp-comp')
            check('פתוחה' in t and 'ניסיונות' in t and '2' in t, 'competition created: status open, rules (2 attempts, metric, tiebreak, join policy)')
            await D.click('[data-act="group"]'); await D.wait_for_selector('#gpComps .gp-comp [data-act="chal"]')
            await D.click('#gpComps .gp-comp [data-act="chal"]'); await D.wait_for_function('(window.__cfgs || []).length > 0', timeout=10000)
            await D.evaluate('window.__stubEnd("won", 14)'); await D.wait_for_selector('.lb-end', timeout=8000); await D.wait_for_timeout(1500)
            await D.click('[data-act="group"]') if await D.locator('[data-act="group"]').count() else None
            await D.goto(BASE); await D.wait_for_selector('.lb-gitem'); await D.click('.lb-gitem'); await D.wait_for_selector('#gpComps .gp-comp')
            await D.wait_for_selector('#gpComps [data-ract="c-again"]', timeout=8000)
            check('ניסיון 2 מתוך 2' in await D.inner_text('#gpComps .gp-comp'), 'after a finished attempt: "ניסיון 2 מתוך 2"')
            check(await D.locator('#gpComps .gp-b2 li.me').count() == 1, 'the competition board shows my ranked attempt')
            await shot(D, 'competition_board_desk')
            # cancel: a plain member (D) has no cancel; the admin (B) cancels a second competition
            await A.click('#gpComps .gp-newcomp summary'); await A.fill('form[data-rform="newcomp"] input[name="title"]', 'טסט לביטול ' + TAG)
            await A.click('form[data-rform="newcomp"] button'); await A.wait_for_timeout(1200)
            await D.goto(BASE); await D.wait_for_selector('.lb-gitem'); await D.click('.lb-gitem'); await D.wait_for_selector('#gpComps .gp-comp >> nth=1')
            check(await D.locator('#gpComps [data-ract="c-cancel"]').count() == 0, 'a plain member sees no cancel button on others\' competitions')
            await B.click('[data-act="group"]'); await B.wait_for_selector('#gpComps .gp-comp:has-text("טסט לביטול") [data-ract="c-cancel"]')
            await B.click('#gpComps .gp-comp:has-text("טסט לביטול") [data-ract="c-cancel"]'); await B.wait_for_timeout(1200)
            await B.wait_for_selector('#gpComps .gp-comp.st-cancelled')
            check('בוטלה' in await B.inner_text('#gpComps .gp-comp.st-cancelled'), 'admin cancels a competition → status "בוטלה" (board kept)')
            # closed: D started attempt 2 and never finished it; the window ends
            await D.click('#gpComps [data-ract="c-again"]'); await D.wait_for_function('(window.__cfgs || []).length > 0', timeout=10000)
            await asyncio.to_thread(fb.advance, 0, 3, 0)
            await D.goto(BASE); await D.wait_for_selector('.lb-gitem'); await D.click('.lb-gitem'); await D.wait_for_selector('#gpComps .gp-comp.st-closed')
            t = await D.inner_text('#gpComps .gp-comp.st-closed')
            check('נסגרה' in t and '[data-act="chal"]' and await D.locator('#gpComps .gp-comp.st-closed [data-act="chal"], #gpComps .gp-comp.st-closed [data-ract="c-again"]').count() == 0, 'closed competition: status "נסגרה", no play buttons')
            r = await B.evaluate("import('./js/net.js').then(({net}) => net.myGroups()).then((l) => import('./js/net.js').then(({net}) => net.group(l[0].id))).then((g) => { const c = g.challenges.find((x) => x.status === 'closed'); return import('./js/net.js').then(({net}) => net.begin('challenge', c.id).then(() => 'ok', (e) => e.code)); })")
            check(r == 'challenge_closed', f'a member who never started: begin on a closed competition → challenge_closed ({r})')
            await shot(D, 'competition_closed_desk')
            await D.set_viewport_size(PHONE); await D.wait_for_timeout(300); await shot(D, 'competition_board_390')

        # ------------------------------------------------ the 3D game screen (optional: a copy whose game.js carries the hook)
        if HOOK:
            cH, Hh, pH = await ident(b, 'טסט־לוח' + TAG); cI, Ii, pI = await ident(b, 'טסט־שני' + TAG, vp=PHONE)
            await Hh.goto(HOOK); await Hh.wait_for_selector('.rm-entry', timeout=30000); await Hh.click('.rm-entry'); await Hh.wait_for_selector('form[data-rform="rcreate"]')
            await Hh.select_option('form[data-rform="rcreate"] select[name="max_rounds"]', '24')
            await Hh.click('form[data-rform="rcreate"] button.primary'); await Hh.wait_for_selector('.rm-room.is-lobby')
            HC = (await Hh.inner_text('.rm-code')).strip(); HR = await Hh.get_attribute('.rm-room', 'data-room')
            await Ii.goto(HOOK + '?room=' + HC); await Ii.wait_for_selector('.rm-room.is-lobby', timeout=30000)
            for pg in (Hh, Ii): await poke(pg); await pg.click('[data-ract="ready"]'); await pg.wait_for_selector('[data-ract="ready"][aria-pressed="true"]')
            await poke(Hh); await Hh.click('[data-ract="start"]'); await Hh.wait_for_selector('.rm-room.is-playing'); await poke(Hh)
            await Hh.wait_for_selector('[data-ract="game"]', timeout=20000)
            check(True, 'hooked game.js detected → "לשחק על לוח המשחק" offered')
            await Hh.click('[data-ract="game"]'); await Hh.wait_for_selector('#start', state='hidden', timeout=60000)
            await Hh.wait_for_function("document.querySelector('#roll') && !document.querySelector('#roll').disabled", timeout=60000)
            sv = await seat_sv(HR, 0)
            await Hh.click('#roll'); await Hh.wait_for_timeout(6000)
            for _ in range(8):
                if await Hh.locator('#evm:not([hidden]) button[data-o]:not([disabled])').count():
                    btns = Hh.locator('#evm:not([hidden]) button[data-o]:not([disabled])'); await btns.last.click(); await Hh.wait_for_timeout(1500)
                else: break
            sv2 = await seat_sv(HR, 0)
            check(sv2 >= sv + 1, f'game screen: the roll went to the server as an intent (state_version {sv} → {sv2})')
            check(await Hh.evaluate("!localStorage.getItem('rr2-save-free-w1') && !Object.keys(localStorage).some((k) => k.startsWith('rr2-save-challenge'))"), 'game screen in a room writes no local save')
            await shot(Hh, 'rooms_game_screen_desk')
            await cH.close(); await cI.close()

        for c in (cA, cB, cC, cD): await c.close()
        await b.close()
    for s in SINKS: FB.assert_clean(s)
    check(True, 'guard: no request left the machine (assert_clean)')
    fb.close()
    ok = sum(1 for r in results if r[0]); bad = [r for r in results if not r[0]]
    log(f'\n{ok}/{len(results)} passed')
    for r in bad: log('  FAILED:', r[1])
    sys.exit(1 if bad else 0)

asyncio.run(main())
