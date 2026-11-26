# In-room chat through the REAL lobby UI (js/rooms.js + js/roomchat.js + js/net.js) with separate browser contexts = separate identities,
# against the offline fake (tests/fakebackend.py + tests/fakeroom.mjs: room_core.js + chat_rules.js) or, with --local, the LOCAL staging
# stack (real PostgreSQL + PostgREST + the Edge Function; tests/online_localstack.py relays the page's calls). The production host is
# never contacted (FB.install guard; assert_clean at the end).
# Covers: send / receive between contexts (desk + phones 390 / 360), quick phrases, the server filter (a phone number, a link, a bad
# word → friendly Hebrew, never delivered), XSS as text, report ("דווח" → the owner's report list), mute (client-side, survives a
# reload, no badge), unread badge + collapsed panel on phones, the live region, the ghost-tap guard, touch-action, typing survives a
# repaint, chat during play does not touch the game (state_version unchanged), a stranger cannot read, rate limit (5 / 10 s).
# Usage: python3 tests/chat_e2e.py http://localhost:<lobby copy>/ [--local]   (RR_SHOTS=<dir> for screenshots)
import asyncio, json, os, sys, random
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
DESK = {'width': 1300, 'height': 820}; P390 = {'width': 390, 'height': 844}; P360 = {'width': 360, 'height': 740}
def log(*a): print(*a, flush=True)
def check(c, m): res.append((bool(c), m)); log(('PASS ' if c else 'FAIL ') + m)
async def rpc(fn, body): return await asyncio.to_thread(fb.handle, fn, body)
def au(p): return {'p_id': p['id'], 'p_secret': p['secret']}
async def make_admin(p):
    if LOCAL: await asyncio.to_thread(fb.make_admin, p)
    else: fb.admins.add(p['id'])

async def ident(b, nick, vp=DESK):
    p = fb.seed_player(nick)
    ctx = await b.new_context(**FB.new_context_kwargs(), viewport=vp, locale='he-IL', has_touch=vp['width'] < 600, is_mobile=vp['width'] < 600)
    SINKS.append(await (LS.install(ctx, fb) if LOCAL else FB.install(ctx, fb)))
    init = "localStorage.setItem('rr2-onboarded','1');localStorage.setItem('rr-player'," + json.dumps(json.dumps(p)) + ");localStorage.setItem('rr2-flags', JSON.stringify({rooms:true}));"
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
    await pg.wait_for_timeout(120)
async def poke(pg):
    try: await pg.evaluate(f"{DRV}.then((d) => d && d.refresh(true))")
    except Exception: pass
    await pg.wait_for_timeout(150)
async def texts(pg): return await pg.locator('.rm-chat-list .rm-chat-t').all_inner_texts()
async def status(pg): return (await pg.inner_text('.rm-chat-err')).strip()
async def open_chat(pg):
    if await pg.get_attribute('.rm-chat-tog', 'aria-expanded') != 'true': await pg.click('.rm-chat-tog')
    await pg.wait_for_selector('.rm-chat-body:not([hidden])'); await pg.wait_for_timeout(400)   # past the ghost-tap window
async def say(pg, text):
    await pg.fill('#rmChatIn', text); await pg.press('#rmChatIn', 'Enter'); await pg.wait_for_timeout(500)
async def pass10s():
    if LOCAL: await asyncio.sleep(10.5)
    else: fb._offset += __import__('datetime').timedelta(seconds=11)
async def seat_versions(room):
    d = await asyncio.to_thread(fb.rooms_dump); r = next((x for x in (d or {}).get('rooms', []) if x['id'] == room), None)
    return [s['state_version'] for s in r['seats']] if r else None

async def main():
    async with async_playwright() as pw:
        log(f"backend={'LOCAL staging ' + fb.url if LOCAL else 'fake'}")
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args('offline', ARGS))
        ADM = fb.seed_player('טסט־מנהל' + TAG); await make_admin(ADM)
        cA, A, pA = await ident(b, 'טסט־אורי' + TAG)
        cB, B, pB = await ident(b, 'טסט־נועה' + TAG, P390)
        cC, C, pC = await ident(b, 'טסט־דן' + TAG, P360)
        cD, D, pD = await ident(b, 'טסט־זר' + TAG)
        # ------------------------------------------------ room + panel
        await A.goto(BASE); await A.wait_for_selector('.rm-entry'); await A.click('.rm-entry'); await A.wait_for_selector('form[data-rform="rcreate"]')
        await A.select_option('form[data-rform="rcreate"] select[name="max_rounds"]', '24')
        await A.click('form[data-rform="rcreate"] button.primary'); await A.wait_for_selector('.rm-room.is-lobby')
        CODE = (await A.inner_text('.rm-code')).strip(); ROOM = await A.get_attribute('.rm-room', 'data-room')
        for pg in (B, C): await pg.goto(BASE + '?room=' + CODE); await pg.wait_for_selector('.rm-room.is-lobby')
        await A.wait_for_selector('.rm-chat')
        check(await A.get_attribute('.rm-chat-tog', 'aria-expanded') == 'true' and await A.is_visible('#rmChatIn'), 'desk: the chat panel is open in the waiting room')
        check(await B.get_attribute('.rm-chat-tog', 'aria-expanded') == 'false' and not await B.is_visible('#rmChatIn'), 'phone 390: the chat is collapsed behind "💬 צ\'אט החדר"')
        check(await A.get_attribute('.rm-chat-list', 'role') == 'log' and await A.get_attribute('.rm-chat-list', 'aria-live') == 'polite', 'the message list is a polite live region (role=log)')
        check(await A.locator('label[for="rmChatIn"]').count() == 1, 'the input has a label')
        ta = await B.evaluate("[...document.querySelectorAll('.rm-chat button, .rm-chat input')].every((e) => getComputedStyle(e).touchAction === 'manipulation')")
        check(ta, 'touch-action: manipulation on every chat control')
        qs = await A.locator('.rm-chat-q').all_inner_texts()
        check(qs == ['בהצלחה!', 'מהלך יפה 👏', 'רגע, אני חושב/ת', 'משחק טוב 🤝'], f'the 4 quick phrases (gender-neutral) {qs}')
        # ------------------------------------------------ send / receive + badge
        await say(A, 'שלום לכולם 👋')
        check('שלום לכולם 👋' in await texts(A), 'A sends → shown at once in A\'s list')
        await poll(B)
        badge = await B.inner_text('.rm-chat-badge') if await B.is_visible('.rm-chat-badge') else ''
        check(badge == '1', f'B (collapsed, phone) gets an unread badge "1" ({badge!r})')
        await shot(B, 'chat_badge_390')
        await open_chat(B)
        check(not await B.is_visible('.rm-chat-badge') and 'שלום לכולם 👋' in await texts(B), 'B opens the chat → badge gone, the message is there')
        who = await B.locator('.rm-chat-m:has-text("שלום לכולם") .rm-chat-who b').inner_text()
        check(who == 'טסט־אורי' + TAG, f'the sender\'s nickname is shown ({who})')
        await B.click('.rm-chat-q:has-text("בהצלחה!")'); await B.wait_for_timeout(500)
        await poll(A)
        check('בהצלחה!' in await texts(A), 'B taps a quick phrase → A receives "בהצלחה!"')
        await shot(A, 'chat_lobby_desk'); await shot(B, 'chat_open_390')
        # ------------------------------------------------ the server filter (friendly Hebrew, never delivered)
        await pass10s()
        await say(A, 'תתקשר אליי 054-1234567')
        st = await status(A); check('טלפון' in st, f'a phone number is refused with a friendly message: "{st}"')
        check(await A.input_value('#rmChatIn') == 'תתקשר אליי 054-1234567', 'the refused text stays in the input (to fix it)')
        await say(A, 'תיכנסו ל www.example.com')
        st = await status(A); check('קישורים' in st, f'a link is refused: "{st}"')
        await say(A, 'fuck')
        st = await status(A); check('שפה נעימה' in st, f'a bad word is refused: "{st}"')
        await pass10s()
        await poll(B)
        bt = await texts(B)
        check(not any('054' in t or 'example' in t or 'fuck' in t for t in bt), f'none of the refused messages reached B {bt}')
        await say(A, '<img src=x onerror=window.__x=1>')
        await poll(B)
        check(await B.evaluate('window.__x') is None and '<img src=x onerror=window.__x=1>' in await texts(B), 'HTML in a message is shown as text, never run')
        # ------------------------------------------------ typing survives repaints
        await C.click('.rm-chat-tog'); await C.wait_for_timeout(400)
        await C.fill('#rmChatIn', 'אני כותב')
        await C.focus('#rmChatIn')
        await C.evaluate(f"{DRV}.then((d) => d.refresh(true))"); await C.wait_for_timeout(300)
        check(await C.input_value('#rmChatIn') == 'אני כותב' and await C.evaluate("document.activeElement && document.activeElement.id === 'rmChatIn'"), 'phone 360: half-typed text and focus survive a room repaint')
        await C.press('#rmChatIn', 'Enter'); await C.wait_for_timeout(500)
        # ------------------------------------------------ ghost tap: a tap within 320 ms of the panel changing is ignored
        n0 = len(await texts(C))
        await C.evaluate("""() => { const t = document.querySelector('.rm-chat-tog'); t.click(); t.click();
            const q = document.querySelector('.rm-chat-q'); q.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); }""")
        await C.wait_for_timeout(700); await poll(C)
        check(len(await texts(C)) == n0, 'ghost tap: a quick phrase tapped right as the panel re-opens is not sent')
        # ------------------------------------------------ mute (C mutes A)
        await poll(C)
        await C.click('.rm-chat-m:has-text("שלום לכולם") [data-chat="mute"]'); await C.wait_for_timeout(300)
        check(await C.locator('.rm-chat-m:has-text("הודעה של שחקן מושתק")').count() >= 1 and 'שלום לכולם 👋' not in await texts(C), 'C mutes A: A\'s messages are hidden on C\'s screen only')
        await C.click('.rm-chat-tog'); await C.wait_for_timeout(200)          # collapse → new messages would raise the badge
        await pass10s(); await say(A, 'הודעה למושתק'); await poll(C)
        check(not await C.is_visible('.rm-chat-badge'), 'a muted player\'s new message raises no badge')
        await poll(B); check('הודעה למושתק' in await texts(B), '…while B still sees it')
        await C.goto(BASE + '?room=' + CODE); await C.wait_for_selector('.rm-room'); await C.wait_for_selector('.rm-chat'); await open_chat(C); await poll(C)
        check(await C.locator('[data-chat="mute"][aria-pressed="true"]').count() >= 1, 'the mute survives a reload (this device only)')
        await C.click('[data-chat="mute"][aria-pressed="true"] >> nth=0'); await C.wait_for_timeout(300)
        check('הודעה למושתק' in await texts(C), 'unmute → A\'s messages are back')
        # ------------------------------------------------ report
        await B.click('.rm-chat-m:has-text("הודעה למושתק") [data-chat="report"]'); await B.wait_for_timeout(500)
        check(await B.locator('.rm-chat-m:has-text("הודעה למושתק") .rm-chat-done').count() == 1, 'B taps "🚩 דווח" → "✓ דווח"')
        st, rep = await rpc('rr_admin_reports', au(ADM))
        check(st == 200 and any(x['text'] == 'הודעה למושתק' and x['reports'] == 1 for x in rep['reports']), 'the report reaches the owner (rr_admin_reports)')
        check(await A.locator('.rm-chat-m.me [data-chat="report"]').count() == 0, 'no "דווח" on your own messages')
        # ------------------------------------------------ a stranger cannot read; rate limit
        await D.goto(BASE); await D.wait_for_selector('.lb-home')
        r = await D.evaluate("import('./js/net.js').then(({net}) => net.roomChatList(%s).then(() => 'ok', (e) => e.code))" % json.dumps(ROOM))
        check(r == 'not_in_room', f'a stranger cannot read the room\'s chat ({r})')
        await pass10s()
        for i in range(5): await say(B, f'הודעה {i + 1}')
        await say(B, 'שישית')
        st = await status(B); check('יותר מדי הודעות' in st, f'5 messages per 10 s: the 6th waits ("{st}")')
        # ------------------------------------------------ during play: chat does not touch the game
        for pg in (A, B, C):
            await poke(pg); await pg.click('[data-ract="ready"]'); await pg.wait_for_selector('[data-ract="ready"][aria-pressed="true"]')
        await poke(A); await A.click('[data-ract="start"]'); await A.wait_for_selector('.rm-room.is-playing')
        for pg in (B, C): await poke(pg); await pg.wait_for_selector('.rm-room.is-playing')
        check(await A.locator('.rm-room.is-playing .rm-chat').count() == 1, 'the chat panel stays in the playing room')
        sv0 = await seat_versions(ROOM)
        await pass10s(); await say(A, 'מהלך יפה 👏'); await poll(B)
        sv1 = await seat_versions(ROOM)
        check(sv0 == sv1 and 'מהלך יפה 👏' in await texts(B), f'a chat message mid-game changes no seat state ({sv0} → {sv1})')
        await A.click('[data-ract="roll"]'); await A.wait_for_timeout(800)
        check((await seat_versions(ROOM))[0] == sv0[0] + 1, 'the game itself goes on (A rolls: +1 state version)')
        await shot(A, 'chat_playing_desk'); await shot(B, 'chat_playing_390'); await shot(C, 'chat_playing_360')
        for pg, w in ((B, 390), (C, 360)):
            ov = await pg.evaluate("document.querySelector('#start').scrollWidth <= document.querySelector('#start').clientWidth + 1")
            check(ov, f'phone {w}: no horizontal overflow with the chat open')
        for c in (cA, cB, cC, cD): await c.close()
        await b.close()
    try: [FB.assert_clean(s) for s in SINKS]; check(True, 'guard clean (no request left the machine)')
    except AssertionError as e: check(False, f'guard: {e}')
    ok = sum(1 for c, _ in res if c); log(f'\n{ok}/{len(res)} checks passed'); sys.exit(0 if ok == len(res) else 1)
asyncio.run(main())
