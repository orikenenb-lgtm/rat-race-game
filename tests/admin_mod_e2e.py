# Owner moderation through the REAL lobby UI (js/lobby.js profile → js/admin.js; js/rooms.js + js/roomchat.js for the players), separate
# browser contexts = separate identities, against the offline fake (tests/fakebackend.py + tests/fakeroom.mjs) or, with --local, the LOCAL
# staging stack (real PostgreSQL + PostgREST + the Edge Function; tests/online_localstack.py). The production host is never contacted.
# Covers: no admin tools for a normal player (UI + server not_admin); host kick in the lobby (before the start only); chat report →
# the owner sees it → hides it (second tap; a first tap or a double tap does nothing) → gone for the players; the owner kicks a seat
# MID-GAME from the live-rooms list → that seat is a forfeit and the game goes on (the others play, the round closes); the owner bans a
# player from the player card (reason + duration) → that player is out of the room, sees the ban message in the chat, the rooms hub
# shows "החשבון שלך מושעה" with create / join off, and a group join is refused; the mod log; unban; the owner closes a room; phones.
# Usage: python3 tests/admin_mod_e2e.py http://localhost:<lobby copy>/ [--local]   (RR_SHOTS=<dir> for screenshots)
import asyncio, datetime as dt, json, os, sys, random
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
import online_localstack as LS
LOCAL = '--local' in sys.argv
BASE = FB.base_url('http://localhost:12001/')
SHOT = os.environ.get('RR_SHOTS', '/tmp/admchat/shots') + '/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
fb = LS.LocalStack.from_env() if LOCAL else FB.FakeBackend(verify='accept')
TAG = str(random.randint(100, 999))
res = []; SINKS = []
DESK = {'width': 1300, 'height': 860}; P390 = {'width': 390, 'height': 844}; P360 = {'width': 360, 'height': 740}
def log(*a): print(*a, flush=True)
def check(c, m): res.append((bool(c), m)); log(('PASS ' if c else 'FAIL ') + m)
async def rpc(fn, body): return await asyncio.to_thread(fb.handle, fn, body)
def au(p): return {'p_id': p['id'], 'p_secret': p['secret']}
async def make_admin(p):
    if LOCAL: await asyncio.to_thread(fb.make_admin, p)
    else: fb.admins.add(p['id'])
async def pass10s():
    if LOCAL: await asyncio.sleep(10.5)
    else: fb._offset += dt.timedelta(seconds=11)

async def ident(b, nick, vp=DESK, player=None):
    p = player or fb.seed_player(nick)
    ctx = await b.new_context(**FB.new_context_kwargs(), viewport=vp, locale='he-IL', has_touch=vp['width'] < 600, is_mobile=vp['width'] < 600)
    SINKS.append(await (LS.install(ctx, fb) if LOCAL else FB.install(ctx, fb)))
    init = "localStorage.setItem('rr2-onboarded','1');localStorage.setItem('rr-player'," + json.dumps(json.dumps(p)) + ");localStorage.setItem('rr2-flags', JSON.stringify({rooms:true}));"
    init += "localStorage.setItem('rr2-progress', JSON.stringify({stars:{w1:1}, best:{w1:30}, tutorialDone:true, gamesPlayed:3, wins:1}));"
    await ctx.add_init_script("if(!sessionStorage.getItem('i')){sessionStorage.setItem('i','1');" + init + "}")
    pg = await ctx.new_page(); pg.set_default_timeout(30000)
    pg.on('pageerror', lambda e: (log('PAGEERR', nick, e), res.append((False, f'page error in {nick}: {e}'))))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    return ctx, pg, p
async def shot(pg, name):
    os.makedirs(SHOT, exist_ok=True); await pg.wait_for_timeout(400)
    await pg.screenshot(path=SHOT + name + '.jpg', type='jpeg', quality=80)
CH = "import('./js/rooms.js').then((m) => m._debug.chat())"
DRV = "import('./js/rooms.js').then((m) => m._debug.driver())"
async def poll(pg):
    try: await pg.evaluate(f"{CH}.then((c) => c && c.poll())")
    except Exception: pass
    await pg.wait_for_timeout(150)
async def poke(pg):
    try: await pg.evaluate(f"{DRV}.then((d) => d && d.refresh(true))")
    except Exception: pass
    await pg.wait_for_timeout(200)
async def texts(pg): return await pg.locator('.rm-chat-list .rm-chat-t').all_inner_texts()
async def room_row(room):
    d = await asyncio.to_thread(fb.rooms_dump); return next((x for x in (d or {}).get('rooms', []) if x['id'] == room), None)
async def say(pg, text):
    if await pg.get_attribute('.rm-chat-tog', 'aria-expanded') != 'true': await pg.click('.rm-chat-tog'); await pg.wait_for_timeout(400)
    if await pg.is_disabled('#rmChatIn'): return False          # the chat closed itself (e.g. the player is out of the room)
    await pg.fill('#rmChatIn', text); await pg.press('#rmChatIn', 'Enter'); await pg.wait_for_timeout(500)
BOT = """async (n) => { const m = await import('./js/rooms.js'); const d = m._debug.driver(); if (!d) return 'nodrv';
  const SAFE = ['pass', 'skip', 'ok', 'done', 'decline', 'no', 'later', 'stay', 'keep'];
  for (let i = 0; i < n; i++) {
    await d.refresh(true);
    if (d.status !== 'playing') return d.status; if (!d.active()) return 'inactive';
    if (d.event) { const o = d.event.options.find((x) => x.enabled && SAFE.includes(x.id)) || d.event.options.find((x) => x.enabled); if (!o) return 'nooption';
      try { await d.act('c', o.needsQty ? [o.id, 1] : [o.id]); } catch (e) { if (e.code !== 'illegal_action' && e.code !== 'stale') return 'err:' + e.code; } continue; }
    if (d.canRoll()) { try { await d.act('r'); } catch (e) { if (e.code !== 'stale' && e.code !== 'not_your_roll') return 'err:' + e.code; } continue; }
    return 'waiting';
  } return 'n'; }"""
async def admin_panel(pg):
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home'); await pg.wait_for_timeout(800)
    await pg.click('.lb-player'); await pg.wait_for_selector('.lb-profile'); await pg.wait_for_selector('.pf-mod-tabs')
async def tab(pg, k, wait):
    await pg.click(f'.pf-mod-tabs [data-k="{k}"]'); await pg.wait_for_selector(wait)
async def two_taps(pg, sel, server_unchanged=None):
    """first tap arms (nothing happens), a 2nd tap within 320 ms is a ghost (ignored), a real 2nd tap acts"""
    await pg.click(sel); await pg.wait_for_timeout(100)
    armed = 'לחץ שוב' in (await pg.locator('.pf-mod .armed').inner_text() if await pg.locator('.pf-mod .armed').count() else '')
    still = (await server_unchanged()) if server_unchanged else True
    await pg.evaluate("() => { const b = document.querySelector('.pf-mod .armed'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })); }")
    await pg.wait_for_timeout(150)
    ghost_ignored = await pg.locator('.pf-mod .armed').count() == 1 and ((await server_unchanged()) if server_unchanged else True)
    await pg.wait_for_timeout(250)
    await pg.click('.pf-mod .armed'); await pg.wait_for_timeout(900)
    return armed and still, ghost_ignored

async def main():
    async with async_playwright() as pw:
        log(f"backend={'LOCAL staging ' + fb.url if LOCAL else 'fake'}")
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args('offline', ARGS))
        OWN = fb.seed_player('טסט־בעלים' + TAG); await make_admin(OWN)
        cO, O, _ = await ident(b, '', player=OWN)
        cH, H, pH = await ident(b, 'טסט־מארח' + TAG)
        cK, K, pK = await ident(b, 'טסט־ילד' + TAG, P390)
        cL, L, pL = await ident(b, 'טסט־ילדה' + TAG, P360)
        cX, X, pX = await ident(b, 'טסט־נבעט' + TAG)
        # ------------------------------------------------ a normal player has no tools (UI) and the server refuses (not_admin)
        await H.goto(BASE); await H.wait_for_selector('.lb-home'); await H.click('.lb-player'); await H.wait_for_selector('.lb-profile'); await H.wait_for_timeout(600)
        check(await H.locator('.pf-mod, #pfMod, .pf-admin').count() == 0, 'a normal player sees no admin panel')
        r = await H.evaluate("import('./js/net.js').then(async ({net}) => [await net.adminRooms().catch((e) => e.code), await net.adminBan(%s, 'טסט', 1).catch((e) => e.code)])" % json.dumps(pK['id']))
        check(r == ['not_admin', 'not_admin'], f'…and calling the admin RPCs directly → not_admin ({r})')
        r = await H.evaluate("import('./js/admin.js').then(async (m) => { document.body.insertAdjacentHTML('beforeend', '<section class=\"pf-admin\"><div id=\"pfMod\"></div></section>'); await m.mount({ net: (await import('./js/net.js')).net, toast() {}, sfx() {} }); await new Promise((r) => setTimeout(r, 600)); return document.querySelector('#pfModPane').innerText; })")
        check('רק מנהל המשחק' in r, 'even loading js/admin.js by hand shows only the server\'s refusal')
        # ------------------------------------------------ the room: host kick in the lobby (before the start only)
        await H.goto(BASE); await H.wait_for_selector('.rm-entry'); await H.click('.rm-entry'); await H.wait_for_selector('form[data-rform="rcreate"]')
        await H.select_option('form[data-rform="rcreate"] select[name="max_rounds"]', '24')
        await H.click('form[data-rform="rcreate"] button.primary'); await H.wait_for_selector('.rm-room.is-lobby')
        CODE = (await H.inner_text('.rm-code')).strip(); ROOM = await H.get_attribute('.rm-room', 'data-room')
        for pg in (K, L, X): await pg.goto(BASE + '?room=' + CODE); await pg.wait_for_selector('.rm-room.is-lobby')
        await poke(H); await H.click(f'.rm-seats li:has-text("טסט־נבעט{TAG}") [data-ract="kick"]')
        await poke(X); await X.wait_for_selector('form[data-rform="rjoin"]', timeout=10000)
        check('rm-hub' in (await X.get_attribute('.lb-shell', 'class') or ''), 'the host kicks a player in the lobby → he is back at the rooms hub')
        for pg in (H, K, L):
            await poke(pg); await pg.click('[data-ract="ready"]'); await pg.wait_for_selector('[data-ract="ready"][aria-pressed="true"]')
        await poke(H); await H.click('[data-ract="start"]'); await H.wait_for_selector('.rm-room.is-playing')
        for pg in (K, L): await poke(pg); await pg.wait_for_selector('.rm-room.is-playing')
        check(await H.locator('[data-ract="kick"]').count() == 0, 'after the start the host has no kick button')
        r = await H.evaluate("import('./js/net.js').then(({net}) => net.roomKick(%s, 1).then(() => 'ok', (e) => e.code))" % json.dumps(ROOM))
        check(r == 'room_started', f'…and the server refuses a host kick after the start ({r})')
        # ------------------------------------------------ report → the owner sees it → hides it (second tap)
        BADMSG = f'אתה משחק גרוע {TAG}'
        await say(K, BADMSG)
        await poll(H)
        if await H.get_attribute('.rm-chat-tog', 'aria-expanded') != 'true': await H.click('.rm-chat-tog'); await H.wait_for_timeout(400)
        await H.wait_for_timeout(400)                 # past the ghost-tap window of the list that just changed
        await H.click(f'.rm-chat-m:has-text("{BADMSG}") [data-chat="report"]'); await H.wait_for_timeout(500)
        await admin_panel(O)
        check(await O.locator('.pf-mod-tabs [role="tab"]').count() == 4, 'the owner\'s panel: 4 tabs (rooms, reports, bans, log)')
        await tab(O, 'reports', '.pf-mod-pane h4')
        row = O.locator(f'.pf-mod-rows li:has-text("{BADMSG}")')
        check(await row.count() == 1 and f'טסט־ילד{TAG}' in await row.inner_text() and CODE in await row.inner_text(), 'the report is in the owner\'s list (text, sender, room code)')
        await shot(O, 'admin_reports_desk')
        msg = int(await row.get_attribute('data-msg'))
        async def visible_to_players():
            st, l = await rpc('rr_room_chat_list', {**au(pH), 'p_room': ROOM, 'p_since': None}); return any(m['id'] == msg for m in (l or {}).get('msgs', []))
        armed_ok, ghost_ok = await two_taps(O, f'.pf-mod-rows li[data-msg="{msg}"] [data-aact="hide"]', visible_to_players)
        check(armed_ok, 'hide: the first tap only arms the button ("לחץ שוב לאישור"), the message is still there')
        check(ghost_ok, 'hide: a second tap within 320 ms (a double tap) is ignored')
        check(not await visible_to_players(), 'hide: the real second tap hides it for everyone')
        await poll(H); check(BADMSG not in await texts(H), '…and it disappears from the players\' chat')
        # ------------------------------------------------ the owner kicks a seat MID-GAME → the game goes on
        await tab(O, 'rooms', '.pf-mod-rooms, .pf-mod-pane .lb-empty')
        rli = O.locator(f'.pf-mod-rooms > li[data-room="{ROOM}"]')
        check(await rli.count() == 1 and CODE in await rli.inner_text(), 'the live room is in the owner\'s list with its code and players')
        await shot(O, 'admin_rooms_desk')
        async def l_playing():
            r = await room_row(ROOM); return next(s for s in r['seats'] if s['seat'] == 2)['status'] == 'playing'
        armed_ok, ghost_ok = await two_taps(O, f'.pf-mod-rooms > li[data-room="{ROOM}"] .pf-mod-seats li:has-text("טסט־ילדה{TAG}") [data-aact="kick"]', l_playing)
        check(armed_ok and ghost_ok, 'kick: first tap arms, a double tap is ignored, the seat still plays')
        r = await room_row(ROOM)
        check(r['status'] == 'playing' and [s['status'] for s in r['seats']] == ['playing', 'playing', 'forfeit'], f'kick mid-game: that seat is a forfeit, the room keeps playing ({[s["status"] for s in r["seats"]]})')
        rnd0 = r.get('round') or 1
        for pg in (H, K):
            out = await pg.evaluate(BOT, 30); check(out in ('waiting', 'n', 'playing'), f'a remaining player plays on ({out})')
        await poke(H); r = await room_row(ROOM)
        if (r.get('round') or 1) <= rnd0:
            await H.evaluate("import('./js/net.js').then(({net}) => net.roomFn('tick', %s).catch(() => null))" % json.dumps(ROOM)); r = await room_row(ROOM)
        check(r['status'] == 'playing' and (r.get('round') or 0) > rnd0, f'the game continues: the round closed without the kicked seat (round {rnd0} → {r.get("round")})')
        await poke(L)
        check('פרש' in await L.inner_text('.rm-room') or 'הוצא' in await L.inner_text('.rm-room'), 'the kicked player\'s screen shows the forfeit')
        await poll(L)
        st = (await L.inner_text('.rm-chat-err')).strip() if await L.locator('.rm-chat-err').count() else ''
        check('לא בחדר' in st, f'…and the chat says it is closed for him ("{st}")')
        await shot(L, 'admin_kicked_360')
        # ------------------------------------------------ ban from the player card
        await O.fill('#pfAdminQ', 'טסט־ילד' + TAG); await O.click('form[data-form="admin-search"] button'); await O.wait_for_timeout(800)
        await O.click(f'.pf-admin-rows li:has-text("טסט־ילד{TAG}") [data-aact="player"] >> nth=0'); await O.wait_for_selector('.pf-mod-card')
        check(f'טסט־ילד{TAG}' in await O.inner_text('.pf-mod-card h3') and await O.locator('.pf-mod-card [data-aact="kick"]').count() == 1, 'the player card: name, his open room (kick), ban form')
        await O.fill('#pfBanR', 'טסט: מילים לא יפות'); await O.select_option('#pfBanD', '3')
        await O.click('.pf-mod-banf button.primary'); await O.wait_for_timeout(200)
        st1, s1 = await rpc('rr_ban_status', au(pK))
        check('לחץ שוב' in await O.inner_text('.pf-mod-banf button.primary') and s1['banned'] is False, 'ban: the first tap only arms')
        await O.wait_for_timeout(350); await O.click('.pf-mod-banf button.primary'); await O.wait_for_selector('.pf-mod-ban.on')
        st1, s1 = await rpc('rr_ban_status', au(pK))
        check(s1['banned'] is True and not s1['permanent'], 'ban: the second tap bans him (3 days)')
        check('מושעה' in await O.inner_text('.pf-mod-ban.on') and 'מילים לא יפות' in await O.inner_text('.pf-mod-ban.on'), 'the card shows the ban and the reason')
        await shot(O, 'admin_player_card_desk')
        r = await room_row(ROOM)
        check([s['status'] for s in r['seats']][1] == 'forfeit' and r['status'] == 'playing', 'the ban took him out of the running game (forfeit), the room plays on')
        await pass10s()
        await say(K, 'היי'); await poll(K)
        st = (await K.inner_text('.rm-chat-err')).strip()
        check(('הושעה' in st or 'לא בחדר' in st) and await K.is_disabled('#rmChatIn'), f'the banned player\'s chat is closed with a Hebrew message ("{st}")')
        r = await K.evaluate("import('./js/net.js').then(({net}) => net.roomChatSend(%s, 'היי').then(() => 'ok', (e) => e.code + '|' + e.message))" % json.dumps(ROOM))
        check(r.startswith('banned|') and 'הושעה' in r, f'…and any chat call answers banned with the Hebrew text ({r[:50]}…)')
        await K.goto(BASE); await K.wait_for_selector('.rm-entry'); await K.click('.rm-entry'); await K.wait_for_selector('.rm-banned')
        check('החשבון שלך מושעה' in await K.inner_text('.rm-banned') and await K.locator('form[data-rform="rcreate"] button.primary').is_disabled(), 'the rooms hub: "החשבון שלך מושעה" and create / join are off')
        await shot(K, 'banned_hub_390')
        st, g = await rpc('rr_create_group', {**au(pH), 'p_name': 'טסט קבוצה ' + TAG})
        r = await K.evaluate("import('./js/net.js').then(({net}) => net.joinGroup(%s).then(() => 'ok', (e) => e.message))" % json.dumps(g['code']))
        check('הושעה' in r, f'a group join is refused with the Hebrew ban message ({r[:40]}…)')
        r = await K.evaluate("import('./js/net.js').then(({net}) => net.roomCreate({}).then(() => 'ok', (e) => e.code))")
        check(r == 'banned', f'a forged create call → banned ({r})')
        # ------------------------------------------------ mod log, unban, close
        await tab(O, 'log', '.pf-mod-log')
        lg = await O.inner_text('.pf-mod-log')
        check(all(w in lg for w in ('השעה', 'הוציא מחדר', 'הסתיר הודעה')), 'the mod log lists the ban, the kick and the hide')
        await tab(O, 'bans', '.pf-mod-pane')
        await O.click(f'.pf-mod-rows li:has-text("טסט־ילד{TAG}") [data-aact="unban"]'); await O.wait_for_timeout(900)
        st, s1 = await rpc('rr_ban_status', au(pK)); check(s1['banned'] is False, 'unban from the bans tab')
        await K.goto(BASE); await K.wait_for_selector('.rm-entry'); await K.click('.rm-entry'); await K.wait_for_selector('form[data-rform="rcreate"]'); await K.wait_for_timeout(800)
        check(await K.locator('.rm-banned').count() == 0 and not await K.locator('form[data-rform="rcreate"] button.primary').is_disabled(), 'after the unban: no banner, create is on again')
        await tab(O, 'rooms', '.pf-mod-pane')
        await two_taps(O, f'.pf-mod-rooms > li[data-room="{ROOM}"] [data-aact="close-room"]')
        r = await room_row(ROOM); check(r is None or r['status'] == 'cancelled', 'the owner closes the room (second tap) → cancelled')
        await poke(H); await H.wait_for_selector('.rm-res', timeout=10000)
        check('מנהל המשחק סגר את החדר' in await H.inner_text('.rm-res'), 'the players see "מנהל המשחק סגר את החדר", nobody ranked')
        await shot(H, 'admin_closed_desk')
        await tab(O, 'log', '.pf-mod-log'); check('סגר חדר' in await O.inner_text('.pf-mod-log') and 'ביטל השעיה' in await O.inner_text('.pf-mod-log'), 'the log has the unban and the close too')
        # ------------------------------------------------ the owner's panel on a phone
        cO2, O2, _ = await ident(b, '', vp=P390, player=OWN)
        await admin_panel(O2); await tab(O2, 'log', '.pf-mod-log')
        ov = await O2.evaluate("document.querySelector('#start').scrollWidth <= document.querySelector('#start').clientWidth + 1")
        check(ov, 'phone 390: the owner\'s panel fits (no horizontal overflow)'); await O2.locator('.pf-admin').scroll_into_view_if_needed(); await shot(O2, 'admin_panel_390')
        for c in (cO, cH, cK, cL, cX, cO2): await c.close()
        await b.close()
    try: [FB.assert_clean(s) for s in SINKS]; check(True, 'guard clean (no request left the machine)')
    except AssertionError as e: check(False, f'guard: {e}')
    ok = sum(1 for c, _ in res if c); log(f'\n{ok}/{len(res)} checks passed'); sys.exit(0 if ok == len(res) else 1)
asyncio.run(main())
