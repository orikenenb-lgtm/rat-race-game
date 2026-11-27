# Account deletion end to end (Google Play: in-app deletion + the public web page), OFFLINE against the fake backend
# (tests/fakebackend.py rr_delete_account = supabase/migrations/20261127_delete_account.sql). Lobby copy with the stub game.
#   desk 1300×820 + phone 390×800 (+ a 360 layout pass): the entry in the profile, wrong nickname refused (client + server),
#   offline / network failure → a clear message and nothing removed, Escape / keyboard, two-step confirmation, a successful delete
#   clears the identity (and this device's progress when the box is checked, keeps it when not), groups handed over on the server;
#   /delete-account.html with and without an identity (recovery code), the mailto link, /privacy.html links resolve.
# Run: SRC=. COPY_DIR=/tmp/del-copies PORT_BASE=13500 bash tests/serve_copies.sh
#      RR_SHOTS=docs/full-upgrade/shots/account-delete python3 tests/account_delete_e2e.py [http://localhost:13501/]
import asyncio, base64, json, os, sys, random
from urllib.parse import unquote
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
if MODE != 'offline': print('account_delete_e2e runs offline only (it inspects the fake)'); sys.exit(2)
BASE = FB.base_url('http://localhost:13501/')
SHOT = os.environ.get('RR_SHOTS', '/tmp/del-run/shots') + '/'
fb = FB.FakeBackend(verify='accept')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
TAG = str(random.randint(100, 999))
SINKS = []; results = []
def log(*a): print(*a, flush=True)
def check(cond, msg): results.append((bool(cond), msg)); log(('PASS ' if cond else 'FAIL ') + msg)
DESK = {'width': 1300, 'height': 820}; PHONE = {'width': 390, 'height': 800}; SMALL = {'width': 360, 'height': 740}
ERRS = []

async def page(b, vp, name, scheme='light'):
    ctx = await b.new_context(**FB.new_context_kwargs(), viewport=vp, color_scheme=scheme, locale='he-IL')
    SINKS.append(await FB.install_mode(ctx, fb, MODE))
    await ctx.add_init_script("localStorage.setItem('rr2-onboarded','1')")   # skip the welcome (like lobby_e2e); re-set after a device wipe too
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: (ERRS.append(f'{name}: {e}'), log('PAGEERR', name, e)))
    # the 400 (server refusal) and the aborted request (network failure) are provoked on purpose: not page errors
    pg.on('console', lambda m: (ERRS.append(f'{name}: {m.text}'), log('CONSOLE', name, m.text)) if m.type == 'error' and '404' not in m.text and not m.text.startswith('Failed to load resource') else None)
    return ctx, pg
def recovery(p): return base64.b64encode(json.dumps([p['id'], p['secret'], p['nickname']], ensure_ascii=False, separators=(',', ':')).encode('utf-8')).decode()
async def focused(pg, el_id):
    try: await pg.wait_for_function('(id) => document.activeElement && document.activeElement.id === id', arg=el_id, timeout=3000); return True
    except Exception: return False  # noqa: BLE001
async def ls(pg, k): return await pg.evaluate('(k) => localStorage.getItem(k)', k)
async def no_hscroll(pg):
    return await pg.evaluate("""() => { const o = document.getElementById('start'); const els = [document.scrollingElement, o].filter(Boolean);
      return els.every((e) => e.scrollWidth <= e.clientWidth + 1); }""")
async def with_identity(pg, p, extra=None):
    """this browser holds p's identity (+ some device progress); reload so every module reads it"""
    await pg.evaluate("""([p, extra]) => { localStorage.setItem('rr-player', JSON.stringify(p)); localStorage.setItem('rr2-onboarded', '1');
      for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(k, v); }""", [p, extra or {}])
    await pg.reload()
DEVICE = {'rr2-save-free-w1': '{"v":3,"state":{"v":3,"marker":"device"}}', 'rr2-settings': '{"muted":true}', 'rr2-ghosts': '[]',
          'rr2-pending-finish': '[]', 'rr2-seen-chal': '{"g":["c"]}', 'rr2-save-0b9c4a3e-1111-4222-8333-944455556666': '{"v":3,"state":{"v":3}}'}

async def lobby_case(b, vp, label, device):
    A = fb.seed_player(f'טסט־מוחק־{label}{TAG}', stars={'w1': 2}); B = fb.seed_player(f'טסט־חבר־{label}{TAG}')
    G = fb.seed_group(A, name=f'טסט קבוצה {label}', members=[B]); solo = fb.seed_group(A, name=f'טסט לבד {label}')
    ctx, pg = await page(b, vp, label)
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home')
    await with_identity(pg, A, DEVICE); await pg.wait_for_selector('.lb-home')
    await pg.wait_for_timeout(600)
    await pg.click('[data-act="profile"]'); await pg.wait_for_selector('.lb-profile')
    sec = pg.locator('#pfDelete')
    check(await sec.count() == 1 and 'מחיקת החשבון' in await sec.inner_text(), f'{label}: profile has the "מחיקת החשבון" card')
    legal = await pg.eval_on_selector_all('.pf-legal a', 'els => els.map((a) => a.getAttribute("href"))')
    check(legal == ['privacy.html', 'delete-account.html'], f'{label}: profile links to privacy.html + delete-account.html {legal}')
    await sec.scroll_into_view_if_needed()
    openb = pg.locator('#pfDelete [data-acct="open"]')
    check(await openb.get_attribute('aria-expanded') == 'false', f'{label}: entry collapsed (aria-expanded=false)')
    await openb.focus(); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(150)
    check(await pg.is_visible('#pfDeleteBox') and await pg.evaluate('document.activeElement.id') == 'pfDeleteNick', f'{label}: keyboard opens it, focus in the nickname field')
    txt = await pg.inner_text('#pfDeleteBox')
    check(all(s in txt for s in ('מה יימחק מהשרת', 'הכינוי שלך', 'התוצאות', 'קבוצה שאתה מנהל עוברת לחבר הוותיק', 'מה נשאר', 'לא נשאר שום מידע אישי')), f'{label}: explains what is deleted / groups / what is kept')
    check(A['nickname'] in await pg.inner_text('#pfDeleteBox label[for="pfDeleteNick"]'), f'{label}: the label shows the nickname to type')
    check(await pg.is_checked('#pfDeleteDev'), f'{label}: "למחוק גם את ההתקדמות במכשיר הזה" is on by default')
    check(await no_hscroll(pg), f'{label}: no horizontal scroll with the form open')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
    check(await pg.is_hidden('#pfDeleteBox') and await pg.evaluate('document.activeElement.dataset.acct') == 'open', f'{label}: Escape closes it, focus back on the entry')
    await openb.click(); await pg.wait_for_selector('#pfDeleteNick')
    if label == 'desk': await pg.screenshot(path=SHOT + 'profile_entry_open_desk.png')
    # wrong nickname: refused on the client (no call), and by the server when sent anyway
    n0 = fb.calls['rr_delete_account']
    await pg.fill('#pfDeleteNick', 'טסט־לא־נכון'); await pg.press('#pfDeleteNick', 'Enter'); await pg.wait_for_timeout(200)
    check('לא תואם' in await pg.inner_text('#pfDeleteErr1') and await pg.is_hidden('[data-step="2"]') and fb.calls['rr_delete_account'] == n0,
          f'{label}: wrong nickname → Hebrew error, no step 2, no server call')
    check(await pg.get_attribute('#pfDeleteNick', 'aria-invalid') == 'true', f'{label}: the field is marked aria-invalid')
    if label == 'phone': await pg.locator('#pfDelete').screenshot(path=SHOT + 'profile_wrong_nickname_phone.png')
    code = await pg.evaluate("import('./js/net.js').then((m) => m.net.deleteAccount('טסט־לא־נכון').then(() => 'ok', (e) => e.code))")
    check(code == 'confirm_mismatch' and await ls(pg, 'rr-player'), f'{label}: the server refuses a wrong confirmation too ({code}); identity kept')
    # offline → message, nothing removed
    await pg.fill('#pfDeleteNick', A['nickname']); await pg.press('#pfDeleteNick', 'Enter'); await pg.wait_for_selector('[data-step="2"]:not([hidden])')
    check(await focused(pg, 'pfDeleteSure'), f'{label}: step 2 (final confirmation) gets focus')
    check('לצמיתות' in await pg.inner_text('#pfDeleteSure') and A['nickname'] in await pg.inner_text('#pfDeleteSure'), f'{label}: step 2 names the account and says it is permanent')
    if label == 'desk': await pg.screenshot(path=SHOT + 'profile_confirm_desk.png')
    await ctx.set_offline(True)
    await pg.click('[data-acct="confirm"]'); await pg.wait_for_timeout(300)
    off = await pg.inner_text('#pfDeleteErr2')
    check('אין חיבור' in off and 'שום דבר לא נמחק' in off, f'{label}: offline → clear Hebrew message ({off[:40]}…)')
    await ctx.set_offline(False)
    fb.fail_network('rr_delete_account')
    await pg.click('[data-acct="confirm"]'); await pg.wait_for_function("document.querySelector('#pfDeleteErr2').textContent.includes('אין חיבור')", timeout=8000)
    check(await ls(pg, 'rr-player') and await ls(pg, 'rr2-save-free-w1') and A['id'] in fb.P, f'{label}: network failure → message; nothing removed locally or on the server')
    if label == 'phone': await pg.screenshot(path=SHOT + 'profile_offline_phone.png')
    # back, then (phone) uncheck the device box with the keyboard
    await pg.click('[data-acct="back"]'); await pg.wait_for_selector('[data-step="1"]:not([hidden])')
    check(await focused(pg, 'pfDeleteNick'), f'{label}: "לא, לחזור" → back to step 1, focus in the nickname field')
    if not device:
        await pg.focus('#pfDeleteDev'); await pg.keyboard.press('Space')
        check(not await pg.is_checked('#pfDeleteDev'), f'{label}: the device box toggles with the keyboard (Space)')
    await pg.fill('#pfDeleteNick', A['nickname']); await pg.press('#pfDeleteNick', 'Enter'); await pg.wait_for_selector('[data-step="2"]:not([hidden])')
    async with pg.expect_navigation(timeout=15000):
        await pg.click('[data-acct="confirm"]')
    await pg.wait_for_selector('.lb-home, .lb-welcome, #lobby-root *', timeout=15000)
    await pg.wait_for_function("document.getElementById('lb-toast') && document.getElementById('lb-toast').textContent.includes('נמחק')", timeout=8000)
    toast = await pg.inner_text('#lb-toast')
    await pg.wait_for_timeout(300); await pg.screenshot(path=SHOT + f'after_delete_{label}.png')
    check(await ls(pg, 'rr-player') is None and await pg.evaluate("import('./js/net.js').then((m) => m.net.hasMe())") is False, f'{label}: identity removed (rr-player gone, guest again)')
    check(await ls(pg, 'rr2-pending-finish') is None and await ls(pg, 'rr2-seen-chal') is None and await ls(pg, 'rr2-save-0b9c4a3e-1111-4222-8333-944455556666') is None,
          f'{label}: server-linked keys removed (pending results, seen challenges, ranked slot)')
    check(await ls(pg, 'rr2-settings') == '{"muted":true}', f'{label}: preferences kept (rr2-settings)')
    if device:
        prog = json.loads(await ls(pg, 'rr2-progress') or '{}')
        check(await ls(pg, 'rr2-save-free-w1') is None and await ls(pg, 'rr2-ghosts') is None and not (prog.get('stars') or {}).get('w1'),
              f'{label}: box on → device progress + saves removed (w1 stars now {(prog.get("stars") or {}).get("w1")})')
        check('ההתקדמות במכשיר נמחקו' in toast, f'{label}: notice after reload: {toast}')
    else:
        check(await ls(pg, 'rr2-save-free-w1') == DEVICE['rr2-save-free-w1'] and await ls(pg, 'rr2-ghosts') == '[]', f'{label}: box off → device progress + saves kept')
        check('אפשר להמשיך לשחק כאורח' in toast, f'{label}: notice after reload: {toast}')
    check(A['id'] not in fb.P and fb.G[G['id']]['owner'] == B['id'] and solo['id'] not in fb.G, f'{label}: server: account gone, group → {B["nickname"]}, solo group deleted')
    check(fb.deletions[-1]['groups_transferred'] == 1 and fb.deletions[-1]['groups_deleted'] == 1, f'{label}: audit {fb.deletions[-1]}')
    await ctx.close()

async def small_layout(b):
    A = fb.seed_player(f'טסט־קטן{TAG}־ארוך־מאוד'[:20])
    ctx, pg = await page(b, SMALL, 'small')
    await pg.goto(BASE); await pg.wait_for_selector('.lb-home'); await with_identity(pg, A); await pg.wait_for_selector('.lb-home')
    await pg.click('[data-act="profile"]'); await pg.wait_for_selector('#pfDelete')
    await pg.click('#pfDelete [data-acct="open"]'); await pg.fill('#pfDeleteNick', A['nickname']); await pg.press('#pfDeleteNick', 'Enter')
    await pg.wait_for_selector('[data-step="2"]:not([hidden])')
    bb = await pg.locator('#pfDelete [data-acct="confirm"]').bounding_box(); bk = await pg.locator('#pfDelete [data-acct="back"]').bounding_box()
    check(await no_hscroll(pg) and bb['height'] >= 44 and bk['height'] >= 44 and bb['x'] >= 0 and bb['x'] + bb['width'] <= 360, f'360: no horizontal scroll, 44px buttons inside the screen {bb}')
    await pg.locator('#pfDelete').screenshot(path=SHOT + 'profile_confirm_360.png')
    await ctx.close()

async def web_page(b):
    # 1. no identity in this browser → recovery code → the same flow; mailto; privacy links
    A = fb.seed_player(f'טסט־ווב{TAG}'); Bp = fb.seed_player(f'טסט־ווב־ב{TAG}'); G = fb.seed_group(A, name='טסט ווב', members=[Bp])
    ctx, pg = await page(b, PHONE, 'web-none')
    await pg.goto(BASE + 'delete-account.html'); await pg.wait_for_selector('#webNone:not([hidden])')
    check(await pg.locator('#webDel').count() == 0, 'page without identity: no delete form, recovery-code + e-mail options shown')
    href = await pg.get_attribute('#mailLink', 'href')
    await pg.fill('#mailNick', 'טסט־מייל'); href2 = await pg.get_attribute('#mailLink', 'href')
    sub = unquote(href2.split('subject=')[1].split('&')[0]); body = unquote(href2.split('body=')[1])
    check(href.startswith('mailto:orikenen.b@gmail.com?') and 'Account deletion request' in sub and 'בקשה למחיקת חשבון' in sub and 'הכינוי שלי במשחק: טסט־מייל' in body and 'My in-game nickname: טסט־מייל' in body,
          f'mailto: Hebrew + English subject and body with the nickname ({sub})')
    txt = await pg.inner_text('main')
    check(all(s in txt for s in ('30 יום', '30 days', 'סופית', 'permanent', 'מה נמחק', 'What is deleted', 'מה נשאר', 'What is kept', 'פרופיל')), 'page: what is deleted / kept, permanent, 30-day timeline, menu path — both languages')
    check(await no_hscroll(pg), 'page 390: no horizontal scroll')
    await pg.screenshot(path=SHOT + 'web_no_identity_phone.png', full_page=True)
    await pg.fill('#webCode', 'not-a-code'); await pg.press('#webCode', 'Enter'); await pg.wait_for_timeout(300)
    check('לא תקין' in await pg.inner_text('#webCodeErr'), 'bad recovery code → Hebrew error')
    await pg.fill('#webCode', recovery(A)); await pg.press('#webCode', 'Enter'); await pg.wait_for_selector('#webDel')
    check(A['nickname'] in await pg.inner_text('#webHas'), 'recovery code → this browser now shows the account and the delete form')
    await pg.click('#webDel [data-acct="open"]'); await pg.fill('#webDelNick', A['nickname']); await pg.press('#webDelNick', 'Enter')
    await pg.wait_for_selector('#webDel [data-step="2"]:not([hidden])'); await pg.click('#webDel [data-acct="confirm"]')
    await pg.wait_for_selector('#webDel [data-step="3"]:not([hidden])', timeout=10000)
    check('החשבון נמחק' in await pg.inner_text('#webDelDone') and await ls(pg, 'rr-player') is None and A['id'] not in fb.P and fb.G[G['id']]['owner'] == Bp['id'],
          'web (recovery code): deleted on the server, group handed over, identity removed from the browser')
    await pg.screenshot(path=SHOT + 'web_done_phone.png', full_page=True)
    # privacy.html: the deletion section links here, in both languages; every local link resolves
    await pg.goto(BASE + 'privacy.html')
    links = await pg.eval_on_selector_all('a[href="delete-account.html"]', 'els => els.map((a) => a.closest("section").id)')
    check(sorted(links) == ['en', 'he'], f'privacy.html links to delete-account.html from both languages {links}')
    ptxt = await pg.inner_text('main')
    check('מתוך המשחק' in ptxt and 'inside the game' in ptxt, 'privacy.html mentions in-app deletion (he + en)')
    for path in ('delete-account.html', 'privacy.html', 'js/delete-page.js', 'js/account.js'):
        st = await pg.evaluate('(u) => fetch(u).then((r) => r.status)', path); check(st == 200, f'{path} resolves ({st})')
    await pg.goto(BASE + 'delete-account.html')
    hrefs = await pg.eval_on_selector_all('a[href]', 'els => els.map((a) => a.getAttribute("href")).filter((h) => !h.startsWith("mailto:") && !h.startsWith("#"))')
    sts = [await pg.evaluate('(u) => fetch(u).then((r) => r.status)', h) for h in hrefs]
    check(all(s == 200 for s in sts) and 'privacy.html' in hrefs, f'delete-account.html local links resolve {list(zip(hrefs, sts))}')
    await ctx.close()
    # 2. this browser holds an identity → the flow right away (desk, dark), box off
    C = fb.seed_player(f'טסט־ווב־ג{TAG}')
    ctx, pg = await page(b, DESK, 'web-has', scheme='dark')
    await pg.goto(BASE + 'delete-account.html'); await with_identity(pg, C, {'rr2-progress': '{"v":1,"stars":{"w1":1}}'})
    await pg.wait_for_selector('#webDel')
    check(await pg.is_hidden('#webNone') and C['nickname'] in await pg.inner_text('#webHas'), 'page with identity: the delete form for this account')
    check(await pg.input_value('#mailNick') == C['nickname'], 'page with identity: the e-mail body is prefilled with the nickname')
    await pg.click('#webDel [data-acct="open"]'); await pg.uncheck('#webDelDev'); await pg.fill('#webDelNick', C['nickname']); await pg.press('#webDelNick', 'Enter')
    await pg.wait_for_selector('#webDel [data-step="2"]:not([hidden])'); await pg.screenshot(path=SHOT + 'web_confirm_desk_dark.png', full_page=True)
    await pg.click('#webDel [data-acct="confirm"]'); await pg.wait_for_selector('#webDel [data-step="3"]:not([hidden])', timeout=10000)
    check(await ls(pg, 'rr-player') is None and await ls(pg, 'rr2-progress') == '{"v":1,"stars":{"w1":1}}' and C['id'] not in fb.P, 'web (identity, box off): deleted, identity gone, device progress kept')
    check(await focused(pg, 'webDelDone'), 'web: focus moves to the done message')
    await ctx.close()

async def main():
    os.makedirs(SHOT, exist_ok=True); FB.banner(MODE, 'accept')
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        await lobby_case(b, DESK, 'desk', device=True)
        await lobby_case(b, PHONE, 'phone', device=False)
        await small_layout(b)
        await web_page(b)
        await b.close()
    try: [FB.assert_clean(s) for s in SINKS]; check(True, f'guard clean: no request left the fake (rr_delete_account calls {fb.calls["rr_delete_account"]})')
    except AssertionError as e: check(False, str(e))
    check(not ERRS, f'no page errors / console errors {ERRS[:3]}')
    fb.close()
    fails = [m for ok, m in results if not ok]
    log(f'\n{len(results) - len(fails)}/{len(results)} checks passed')
    for m in fails: log('  FAILED:', m)
    sys.exit(1 if fails else 0)
asyncio.run(main())
