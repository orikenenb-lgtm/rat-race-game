# T4 lobby/meta + shell browser checks (offline: every *.supabase.co request goes to the shared guard; nothing leaves the machine).
# Usage: COPY_DIR=/tmp/t4 PORT_BASE=8810 bash tests/serve_copies.sh
#        python3 tests/t4_lobby.py [--lobby=http://localhost:8811/] [--real=http://localhost:8812/] [--only=welcome,f1,...] [--shots=/tmp/t4]
# Scenarios (spec docs/next-level/specs/T4-opening-modes-library.md):
#   stub game copy (lobby + stub game.js): welcome, world, learn, dream, empty, library, settings, migrate, naming
#   real copy: f1 / f2 (first minute ≤ 60 s, ≤ 3 screens, phone 390×844 + desktop 1300×820, storyboard shots), learnreal (rolls cost no ⚡)
import asyncio, json, os, re, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fakebackend as FB
MODE = FB.mode_from_argv()
arg = lambda k, d: next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{k}=')), d)
LOBBY = arg('lobby', 'http://localhost:8811/'); REAL = arg('real', 'http://localhost:8812/')
SHOT = arg('shots', os.environ.get('RR_SHOTS', '/tmp/t4')).rstrip('/') + '/'
ONLY = (arg('only', '') or '').split(',') if arg('only', '') else None
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
RES = []; ERRS = []; SINKS = []; PENDING = []
def check(ok, msg): RES.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
def pending(msg): PENDING.append(msg); print('PENDING ' + msg, flush=True)
PHONE = {'width': 390, 'height': 844}; DESK = {'width': 1300, 'height': 820}
DREAMS = "window.__t4dreams=[{id:'biz',missions:[{id:'biz_seed',title:'הון התחלתי'}]},{id:'family',missions:[]},{id:'stable',missions:[{id:'st_fund1',title:'חודש הוצאות בקרן החירום'}]},{id:'free',missions:[]}];"

async def page(b, vp=PHONE, init=(), scheme='light', onboarded=True):
    ctx = await b.new_context(**FB.new_context_kwargs(), viewport=vp, color_scheme=scheme, device_scale_factor=1)
    SINKS.append(await FB.install_mode(ctx, None, MODE))
    if onboarded: await ctx.add_init_script("localStorage.setItem('rr2-onboarded','1')")
    for s in init: await ctx.add_init_script(s)
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: (ERRS.append(str(e)), print('PAGEERR', e, flush=True)))
    return ctx, pg
ls = lambda pg, k: pg.evaluate(f"JSON.parse(localStorage.getItem('{k}')||'null')")
async def goto_lobby(pg, sel='.lb-home', url=None):
    await pg.goto(url or LOBBY); await pg.wait_for_selector(sel, timeout=40000); await pg.wait_for_timeout(500)

# ---------------------------------------------------------------- stub copy
async def t_welcome(b):
    ctx, pg = await page(b, onboarded=False)
    await goto_lobby(pg, '.lb-welcome')
    txt = await pg.inner_text('.wl-card')
    head = (await pg.inner_text('.wl-card h1')) + ' ' + (await pg.inner_text('.wl-lead'))
    check(len(head.split()) <= 35 and '⚡' not in txt and '★★★' not in txt and 'תוכנית' not in txt, 'AC-O2 welcome: ≤ 35 words, no ⚡ / ★★★ / plan text')
    check(await pg.evaluate("document.activeElement && document.activeElement.dataset.act") == 'welcome-go', 'A11Y-3 initial focus on S-W3')
    check((await pg.inner_text('[data-act=welcome-go]')).strip() == 'יאללה, משחק ראשון ←', 'S-W3 text')
    await pg.screenshot(path=SHOT + 't4_01_welcome_phone.png')
    await pg.click('[data-act=welcome-pick]'); await pg.wait_for_selector('.lb-world', timeout=10000)
    tr = await pg.evaluate('(window.__t4trace||[]).map(x=>x.screen)')
    check(tr[:2] == ['welcome', 'world'], f'F2 trace welcome → world ({tr})')
    await ctx.close()

async def t_f1stub(b):
    ctx, pg = await page(b, onboarded=False)
    await goto_lobby(pg, '.lb-welcome')
    await pg.click('[data-act=welcome-go]'); await pg.wait_for_function('window.__lastCfg', timeout=15000)
    cfg = await pg.evaluate('window.__lastCfg')
    check(cfg['worldId'] == 'w1' and cfg['charId'] == 'teacher' and cfg['tutorial'] is True and not cfg.get('learn'), f'F1: S-W3 starts w1 teacher with the tutorial, normal mode ({ {k: cfg.get(k) for k in ("worldId","charId","tutorial","learn","mentor")} })')
    p = await ls(pg, 'rr2-progress')
    check(not p.get('tutorialDone'), '§4.6 tutorialDone is NOT set on launch')
    await pg.evaluate("import('./js/bus.js').then(m=>m.bus.emit('onboard:done',{reason:'done'}))"); await pg.wait_for_timeout(200)
    check((await ls(pg, 'rr2-progress')).get('tutorialDone') is True, "bus 'onboard:done' sets tutorialDone")
    await ctx.close()

async def t_world(b):
    ctx, pg = await page(b, vp={'width': 360, 'height': 760})
    await goto_lobby(pg)
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char', timeout=10000); await pg.wait_for_timeout(400)
    check(await pg.evaluate("document.activeElement && document.activeElement.name") == 't4mode', 'A11Y-3 world view focus on the mode radio')
    nested = await pg.evaluate("[...document.querySelectorAll('.wv-char')].some(c=>c.tagName==='BUTTON'||c.closest('button')) || [...document.querySelectorAll('.wv-char button')].some(x=>x.querySelector('button,a,input'))")
    check(not nested, 'AC-C2 character card is an article, no interactive element inside a button')
    info = await pg.evaluate("""[...document.querySelectorAll('.wv-char')].map(c=>({id:c.querySelector('.wv-id')?.textContent, str:!!c.querySelector('.wv-str'), weak:!!c.querySelector('.wv-weak'), cf:c.querySelector('.wv-cf b')?.textContent.replace(/[\\u2066-\\u2069]/g,''), lbl:c.querySelector('.wv-cf span')?.textContent, goal:c.querySelector('.wv-goalline')?.textContent, diff:c.querySelector('.wv-diff em')?.textContent, th:c.querySelectorAll('.wv-th').length, thVisible: c.querySelector('.wv-th')?.offsetParent!==null}))""")
    t = info[0]
    check(t['id'] == 'בת 26 · רווקה' and t['str'] and t['weak'] and t['cf'] == '+₪1,705' and t['lbl'] == 'בסוף כל חודש נשאר' and t['goal'] == '🎯 לצאת תוך 52 חודשים' and t['diff'], f'AC-C1 teacher card {t}')
    check(info[1]['id'] == 'בן 31 · נשוי + ילד', f'§5.3 identity line driver ({info[1]["id"]})')
    check(all(not x['thVisible'] for x in info), 'only the ★ condition on the face; all star conditions inside the details')
    more = pg.locator('.wv-char').first.locator('.wv-more')
    await more.click(); exp = await more.get_attribute('aria-expanded'); vis = await pg.evaluate("document.querySelector('.wv-char .wv-details').hidden")
    check(exp == 'true' and vis is False, 'AC-C2 עוד פרטים toggles aria-expanded and shows the details')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
    check(await more.get_attribute('aria-expanded') == 'false' and await pg.evaluate("location.hash")=='' and await pg.locator('.lb-world').count() == 1, 'A11Y-2 Escape collapses an open עוד פרטים (stays on the world view)')
    await pg.evaluate("document.getElementById('start').scrollTop=0; scrollTo(0,0)"); await pg.wait_for_timeout(200)
    bottom = await pg.evaluate("(()=>{const r=document.querySelector('.wv-char .wv-go').getBoundingClientRect(); return Math.round(r.bottom + (document.getElementById('start').scrollTop||0) + scrollY)})()")
    check(bottom <= 760, f'AC-C3 at 360×760 the first card play button is in the first viewport (bottom={bottom})')
    names = await pg.evaluate("[...document.querySelectorAll('.t4-mopt > span')].map(s=>s.childNodes[0].textContent.trim())")
    check(names == ['מתחיל', 'מתקדם', 'מומחה'], f'review m-3 mentor names match the engine (MN.LEVEL_TEXT) {names}')
    await pg.locator('.t4-mopt.is-locked > span').first.dispatch_event('click'); await pg.wait_for_timeout(200)   # a tap lands on the label's text
    t = await pg.evaluate("(document.getElementById('lb-toast')||{}).textContent || ''")
    check('אחרי' in t, f'review m-4 tapping a locked level on a phone explains why ({t!r})')
    sizes = await pg.evaluate("[...document.querySelectorAll('.t4-opt, .wv-more, .wv-go, .t4-mopt, .t4-dream-sum, .t4-dopt')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return [e.className, Math.round(r.width),Math.round(r.height)]})")
    small = [x for x in sizes if x[1] < 44 or x[2] < 44]
    check(not small, f'A11Y-5 new controls ≥ 44×44 at 360 px ({small[:3]})')
    await pg.screenshot(path=SHOT + 't4_02_character_cards_phone360.png', full_page=True)
    await ctx.close()
    ctx, pg = await page(b, vp=PHONE); await goto_lobby(pg)
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    await pg.screenshot(path=SHOT + 't4_03_character_cards_phone390.png', full_page=True)
    await ctx.close()

async def t_learn(b):
    ctx, pg = await page(b, vp=PHONE, init=["if(!localStorage.getItem('rr2-progress'))localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:1, tutorialDone:true, achievements:['first_asset'], stars:{w1:1}, best:{w1:40}, worldsPlayed:['w1']}))"])
    await goto_lobby(pg)
    p0 = await pg.evaluate("import('./js/progress.js').then(P=>P.getProgress())"); e0 = await ls(pg, 'rr2-energy') or {'e': 25}
    # a normal save first
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    await pg.click('.wv-char >> nth=0 >> .wv-go'); await pg.wait_for_function('window.__lastCfg'); await pg.wait_for_timeout(300)
    check(not (await pg.evaluate('window.__lastCfg')).get('learn'), 'normal game has no learn flag')
    await pg.click('#stubLobby'); await pg.wait_for_selector('.lb-home'); await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    await pg.check('input[name=t4mode][value=learn]'); await pg.wait_for_timeout(100)
    check(await pg.evaluate("document.querySelector('.lb-world').classList.contains('is-learn')"), 'mode group switches the world view to learning')
    await pg.screenshot(path=SHOT + 't4_04_learning_mode_selected_phone.png')
    await pg.click('.wv-char >> nth=1 >> .wv-go'); await pg.wait_for_function("window.__cfgs.length>=2")
    cfg = await pg.evaluate('window.__lastCfg')
    check(cfg.get('learn') is True and cfg.get('bailout') is True and cfg['mode'] == 'free', f'F5 learning cfg: learn + bailout, mode free ({cfg.get("learn")}, {cfg.get("bailout")})')
    keys = await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rr2-save-'))")
    check('rr2-save-learn-w1' in keys and 'rr2-save-free-w1' in keys, f'AC-L3 learning slot and normal slot coexist ({keys})')
    await pg.click('#stubLobby'); await pg.wait_for_selector('.lb-home'); await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    rows = await pg.evaluate("[...document.querySelectorAll('[data-act=continue-free]')].map(b=>[b.dataset.learn||'',b.textContent.trim()])")
    check(len(rows) == 2 and rows[1][0] == '1' and 'בתרגול 🎓' in rows[1][1] and rows[0][1].startswith('▶ להמשיך ·'), f'AC-L3 both continue rows (S-M5 / S-M6) {rows}')
    await pg.screenshot(path=SHOT + 't4_05_two_continue_rows_phone.png')
    await pg.click('[data-act=continue-free][data-learn="1"]'); await pg.wait_for_function("window.__cfgs.length>=3")
    c3 = await pg.evaluate('window.__lastCfg')
    check(c3.get('learn') is True and c3.get('resume') is True, 'AC-L3 continuing the learning save restores learn')
    # achievement + win inside the learning game
    await pg.evaluate("import('./js/bus.js').then(m=>{m.bus.emit('achievement',{ids:['golden']});m.bus.emit('reward',{kind:'lesson',right:true});})"); await pg.wait_for_timeout(300)
    await pg.evaluate("window.__stubEnd('won', 30, {achievements:['first_asset','golden'], lessons:['cashflow']})"); await pg.wait_for_selector('.lb-end', timeout=10000); await pg.wait_for_timeout(1200)
    p1 = await pg.evaluate("import('./js/progress.js').then(P=>P.getProgress())"); e1 = await ls(pg, 'rr2-energy') or {'e': 25}; lib = await ls(pg, 'rr2-library')
    same = all(p1.get(k) == p0.get(k) for k in ('stars', 'best', 'achievements', 'worldsPlayed', 'gamesPlayed', 'wins', 'hadBankruptcy'))
    diff = {k: (p0.get(k), p1.get(k)) for k in ('stars', 'best', 'achievements', 'worldsPlayed', 'gamesPlayed', 'wins', 'hadBankruptcy') if p1.get(k) != p0.get(k)}
    check(same, f'AC-L2 {diff} learning win changes no stars / best / achievements / worldsPlayed / gamesPlayed / wins / hadBankruptcy')
    check(p1.get('learnGames') == (p0.get('learnGames') or 0) + 1, f"AC-L2 learnGames +1 ({p1.get('learnGames')})")
    check(e1['e'] == e0['e'], f"AC-L2/AC-P5 rr2-energy unchanged ({e0['e']} → {e1['e']})")
    check('cashflow' in lib['ids'], 'AC-L2 the lesson went into the library')
    end = await pg.inner_text('.end-card')
    check('בתרגול 🎓' in end and 'במשחק רגיל' in end and 'במצב תרגול לא נאספים כוכבים' in end, 'AC-L4 S-L1 + S-L3 + S-L5 on the learning end screen')
    check(await pg.locator('#endShare').count() == 0 and await pg.locator('[data-act=end-normal]').count() == 1 and await pg.locator('[data-act=end-learn]').count() == 1, 'AC-L4 no duel/share button; S-L6 + S-L7 present')
    keys2 = await pg.evaluate("Object.keys(localStorage)")
    check('rr2-save-learn-w1' not in keys2 and 'rr2-save-free-w1' in keys2, 'learning save cleared at the end; the normal save is kept')
    check(await pg.locator('.end-near').count() == 0 and await pg.locator('.end-gate').count() == 0, 'review m-1 the learning end screen shows no engine star line (end-near ★ / ★★★ gate)')
    await pg.screenshot(path=SHOT + 't4_06_learning_end_phone.png', full_page=True)
    await pg.click('[data-act=end-learn]'); await pg.wait_for_function("window.__lastCfg && window.__lastCfg.learn===true && window.__cfgs.length>=4")
    check(True, 'S-L7 starts another learning game')
    await ctx.close()

async def t_dream(b):
    ctx, pg = await page(b, vp=PHONE, init=[DREAMS])
    await goto_lobby(pg)
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.t4-dreams')
    check(await pg.locator('.t4-dopt').count() == 5, 'S-D5 dream row: 4 dreams + "בלי חלום כרגע"')
    await pg.screenshot(path=SHOT + 't4_07_dream_picker_phone.png', full_page=True)
    await pg.locator('.t4-dopt', has_text='יציבות').click(); await pg.wait_for_timeout(300)
    check((await ls(pg, 'rr2-progress')).get('dream') == 'stable', 'picking a dream stores progress.dream')
    line = await pg.locator('.t4-dream-sum').inner_text() if await pg.locator('.t4-dream-sum').count() else ''
    check(line == 'החלום שלי: 🛟 יציבות · שינוי', f'S-D9 collapsed to one line ({line!r})')
    await pg.screenshot(path=SHOT + 't4_08_dream_collapsed_phone.png')
    await pg.set_viewport_size({'width': 360, 'height': 760}); await pg.evaluate("document.getElementById('start').scrollTop=0; scrollTo(0,0)"); await pg.wait_for_timeout(300)
    bottom = await pg.evaluate("(()=>{const r=document.querySelector('.wv-char .wv-go').getBoundingClientRect(); return Math.round(r.bottom + (document.getElementById('start').scrollTop||0) + scrollY)})()")
    check(bottom <= 760, f'AC-C3 at 360×760 the first card play button is in the first viewport with the dream row collapsed (bottom={bottom})')
    await pg.screenshot(path=SHOT + 't4_08b_first_viewport_360.png')
    await pg.set_viewport_size(PHONE)
    await pg.click('.wv-char >> nth=0 >> .wv-go'); await pg.wait_for_function('window.__lastCfg')
    check((await pg.evaluate('window.__lastCfg')).get('dream') == 'stable', 'cfg.dream passed to the free game')
    await pg.evaluate("window.__stubEnd('lost', 52, {dream:{id:'stable', missions:[{id:'st_fund1',title:'חודש הוצאות בקרן החירום',done:true},{id:'st_fund3',title:'שלושה חודשים בקרן',done:false}]}})")
    await pg.wait_for_selector('.lb-end'); await pg.wait_for_timeout(800)
    t = await pg.inner_text('.end-card')
    check('🛟 החלום שלך, יציבות: 1 מתוך 3 משימות' in t, 'S-D18 dream line on the free end screen')
    p = await ls(pg, 'rr2-progress')
    check(p['dreams'].get('stable', {}).get('done') == ['st_fund1'], f"§6.3 badges recorded for free normal games ({p['dreams']})")
    await pg.click('[data-act=end-lobby]'); await pg.wait_for_selector('.lb-home')
    await pg.evaluate("import('./js/progress.js').then(P=>P.setDream(null))")
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    await pg.click('.wv-char >> nth=0 >> .wv-go'); await pg.wait_for_function('window.__cfgs.length>=2')
    await pg.evaluate("window.__stubEnd('lost', 52, {})"); await pg.wait_for_selector('.end-dream.ask')
    check(True, 'S-D10 invitation when no dream is set')
    await pg.screenshot(path=SHOT + 't4_09_dream_invite_end_phone.png', full_page=True)
    await pg.click('.end-dream .t4-dbtn >> nth=0'); await pg.wait_for_timeout(200)
    check('נשמר. במשחק הבא תראה את המשימות של עסק משלי.' in await pg.inner_text('.end-dream') and (await ls(pg, 'rr2-progress'))['dream'] == 'biz', 'S-D11 saved + progress.dream')
    await ctx.close()
    # without engine DREAMS (no test hook) the row is not shown at all (§14.1)
    ctx, pg = await page(b); await goto_lobby(pg)
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    if await pg.locator('.t4-dreams, .t4-dream-sum').count() == 0: pending('dream row hidden: the engine does not export DREAMS yet (E-7)')
    else: check(True, 'engine exports DREAMS: dream row shown')
    await ctx.close()

async def t_empty(b):
    ctx, pg = await page(b, init=["localStorage.setItem('rr2-energy', JSON.stringify({e:0, at:Date.now(), granted:{}}))"])
    await goto_lobby(pg)
    t = await pg.inner_text('#lbEmpty')
    check('נגמרו הזריקות ⚡' in t and '🎓 לתרגל בלי הגבלה' in t and 'אנרגי' not in t, 'N3 + F6 empty card (S-M8 first)')
    await pg.screenshot(path=SHOT + 't4_10_empty_zr_phone.png')
    await pg.click('[data-act=learn-now]'); await pg.wait_for_selector('.wv-char')
    check(await pg.evaluate("document.querySelector('input[name=t4mode][value=learn]').checked"), 'AC-L5 S-M8 opens the world view with learning selected')
    await pg.evaluate("import('./js/bus.js').then(m=>m.bus.emit('lobby:open',{view:'world',id:'w1',learn:true}))"); await pg.wait_for_timeout(300)
    check(await pg.evaluate("document.querySelector('input[name=t4mode][value=learn]').checked"), "IR-T4-6 lobby:open {view:'world', id, learn} opens learning")
    await ctx.close()

async def t_library(b):
    lib_v1 = "localStorage.setItem('rr2-library', JSON.stringify({ids:['cashflow','gross_net'], read:['gross_net']}))"
    ctx, pg = await page(b, init=[lib_v1])
    await goto_lobby(pg)
    await pg.evaluate("document.querySelector('[data-act=library]').click()"); await pg.wait_for_selector('.lib-sec')
    heads = await pg.evaluate("[...document.querySelectorAll('.lib-sec h2')].map(h=>h.childNodes[0].textContent.trim())")
    check(heads and not any(re.search('[A-Za-z]', h) for h in heads) and '🏪 עסקים' in heads, f'AC-B1 Hebrew headers incl. 🏪 עסקים ({heads})')
    locked = await pg.evaluate("[...document.querySelectorAll('.lib-card.is-locked')].map(c=>({t:c.querySelector('b').textContent, h:c.querySelector('small').textContent, a:c.getAttribute('aria-label')}))")
    check(locked and all(x['t'] and x['h'] and x['a'].startswith('שיעור נעול: ') and 'איך פותחים:' in x['a'] for x in locked), f'AC-B2 every locked card: teaser + hint + S-B1 aria-label ({len(locked)})')
    check('שיעור נעול' not in await pg.inner_text('.lb-library'), 'AC-B2 no card says "שיעור נעול"')
    check(await pg.locator('.lib-card[data-act=lesson]').count() == 2, 'AC-B4 a v1 rr2-library loads without loss')
    await pg.screenshot(path=SHOT + 't4_11_library_locked_phone.png', full_page=False)
    await pg.locator('.lib-card[data-id=cashflow]').click(); await pg.wait_for_selector('#lbLesson')
    sheet = await pg.inner_text('#lbLesson')
    check('🔢 דוגמה:' in sheet, 'S-B3 worked example on the lesson sheet')
    for _ in range(3): await pg.keyboard.press('Tab')
    check(await pg.evaluate("document.querySelector('#lbLesson').contains(document.activeElement)"), 'A11Y-1 focus stays inside the lesson sheet')
    await pg.screenshot(path=SHOT + 't4_12_lesson_sheet_phone.png')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
    check(await pg.locator('#lbLesson').count() == 0 and await pg.locator('.lb-library').count() == 1, 'A11Y-2 Escape closes the sheet (stays in the library)')
    check(await pg.evaluate("document.activeElement && document.activeElement.dataset.id") == 'cashflow', 'A11Y-3 focus returns to the opener')
    # ctx line from an in-game unlock (E-6 shape)
    await pg.evaluate("import('./js/bus.js').then(m=>m.bus.emit('lesson',{ids:['inflation'], list:[{id:'inflation', ctx:{month:13, worldId:'w1', event:'סוף שנה', num:{label:'אינפלציה השנה', value:3.1}}}]}))")
    lib = await ls(pg, 'rr2-library')
    check(lib.get('v') == 2 and lib['ctx'].get('inflation', {}).get('m') == 13 and 'gross_net' in lib['read'], 'AC-B4 ctx stored (v2), v1 read list kept')
    await pg.evaluate("document.querySelector('[data-act=home]').click()"); await pg.wait_for_selector('.lb-home'); await pg.evaluate("document.querySelector('[data-act=library]').click()"); await pg.wait_for_selector('.lib-sec')
    await pg.locator('.lib-card[data-id=inflation]').click(); await pg.wait_for_selector('#lbLesson')
    t = await pg.inner_text('#lbLesson')
    check('📍 למדת את זה בחודש 13 בשכונה — "סוף שנה" · אינפלציה השנה 3.1%' in t.replace('⁦', '').replace('⁩', ''), f'S-B4 context line ({[l for l in t.splitlines() if "📍" in l]})')
    await ctx.close()

async def t_settings(b):
    ctx, pg = await page(b)
    await goto_lobby(pg)
    await pg.evaluate("document.querySelector('[data-act=profile]').click()"); await pg.wait_for_selector('#pfSettings')
    t = await pg.inner_text('#pfSettings')
    check('תצוגה ותנועה' in t and 'תנועה במשחק' in t and 'לפי המכשיר' in t, 'T5 §7.3 settings: "תצוגה ותנועה" + motion radios')
    await pg.check('input[name=motion][value=reduce]'); await pg.wait_for_timeout(100)
    check(await pg.evaluate("document.documentElement.dataset.motion") == 'reduce' and (await ls(pg, 'rr2-settings')).get('motion') == 'reduce', 'motion pref → <html data-motion=reduce> + rr2-settings')
    check(all(x in t for x in ('בפעם הבאה שתיכנס למשחק', 'מה כל סימן אומר', 'הדרכה מלאה במשחק הבא בשכונה', 'להציג שוב את מסך הפתיחה')), 'F4 help rows (S-H7, S-H4, S-H5, S-H8)')
    if 'איכות גרפיקה' in t: check(True, 'T5 quality group shown (js/render/quality.js present)')
    else: pending('quality group hidden: js/render/quality.js not loadable')
    await pg.locator('#pfSettings').scroll_into_view_if_needed()
    await pg.screenshot(path=SHOT + 't4_13_settings_phone.png', full_page=False)
    await pg.click('[data-act=help-legend]'); await pg.wait_for_selector('#lbLesson .t4-legend')
    check('🔋' in await pg.inner_text('#lbLesson') and 'לא ⚡ זריקות' in await pg.inner_text('#lbLesson'), 'S-H4 legend in the lobby (🔋 כוח ≠ ⚡ זריקות)')
    await pg.keyboard.press('Escape')
    await pg.click('[data-act=help-tour]')
    check((await ls(pg, 'rr2-reveal')).get('tourNext') is True, 'S-H7 sets rr2-reveal.tourNext')
    await pg.evaluate("import('./js/progress.js').then(P=>P.setTutorialDone())")
    await pg.click('[data-act=help-tutorial]'); await pg.wait_for_timeout(100)
    await pg.evaluate("document.querySelector('[data-act=home]').click()"); await pg.wait_for_selector('.lb-home')
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    await pg.click('.wv-char >> nth=0 >> .wv-go'); await pg.wait_for_function('window.__lastCfg')
    t1 = (await pg.evaluate('window.__lastCfg'))['tutorial']
    await pg.click('#stubLobby'); await pg.wait_for_selector('.lb-home'); await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    await pg.click('.wv-char >> nth=0 >> .wv-go')
    if await pg.locator('#gm:not([hidden]) button').count(): await pg.locator('#gm button').first.click()
    await pg.wait_for_function('window.__cfgs.length>=2')
    t2 = (await pg.evaluate('window.__lastCfg'))['tutorial']
    check(t1 is True and t2 is False, f'AC-T3 replay request gives the tutorial exactly once ({t1}, {t2})')
    await pg.click('#stubLobby'); await pg.wait_for_selector('.lb-home')
    await pg.evaluate("document.querySelector('[data-act=profile]').click()"); await pg.wait_for_selector('#pfSettings')
    await pg.click('[data-act=help-welcome]'); await pg.wait_for_selector('.lb-welcome')
    check(True, 'S-H8 shows the welcome again')
    await ctx.close()

async def t_migrate(b):
    ctx, pg = await page(b, init=["if(!localStorage.getItem('rr2-progress'))localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:3, wins:1, tutorialDone:true, stars:{w1:1}}))"])
    await goto_lobby(pg)
    r = await ls(pg, 'rr2-reveal')
    check(r and r.get('all') is True and len(r.get('coached', [])) >= 10, f'AC-T8 existing player → rr2-reveal.all ({r})')
    p = await pg.evaluate("import('./js/progress.js').then(P=>P.getProgress())")
    check(p.get('gamesPlayed') == 3 and p.get('stars', {}).get('w1') == 1 and p.get('learnGames') == 0 and p.get('dream') is None, 'AC-R4 old rr2-progress loads; T4 fields added with defaults')
    await ctx.close()
    ctx, pg = await page(b); await goto_lobby(pg)
    r = await ls(pg, 'rr2-reveal')
    check(r and r.get('all') is False, f'new player → rr2-reveal.all false ({r})')
    await ctx.close()
    # T4 verify D7: a pre-welcome player (games played, no rr2-onboarded, progress.onboarded false) lands on home, not the welcome
    for seed in ("{gamesPlayed:7, wins:2, tutorialDone:true, onboarded:false, stars:{w1:2}}", "{gamesPlayed:0, learnGames:2, onboarded:false}"):
        ctx, pg = await page(b, onboarded=False, init=[f"if(!localStorage.getItem('rr2-progress'))localStorage.setItem('rr2-progress', JSON.stringify({seed}))"])
        await pg.goto(LOBBY); await pg.wait_for_selector('.lb-home, .lb-welcome', timeout=40000); await pg.wait_for_timeout(400)
        home = await pg.locator('.lb-home').count(); onb = await pg.evaluate("localStorage.getItem('rr2-onboarded')")
        check(home == 1 and onb == '1', f'D7 old player {seed}: home (not the welcome), rr2-onboarded written ({home}, {onb!r})')
        await ctx.close()
    ctx, pg = await page(b, onboarded=False); await goto_lobby(pg, '.lb-welcome')
    check(await pg.evaluate("localStorage.getItem('rr2-onboarded')") is None, 'D7 a brand-new player still gets the welcome')
    await ctx.close()

async def t_naming(b):
    ctx, pg = await page(b, init=[DREAMS, "localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:2,lastDaily:'2020-01-01',streak:4}))"])
    await goto_lobby(pg)
    texts = []
    for sel, go in (('.lb-home', None), ('.lb-world', "document.querySelector('[data-act=world][data-id=w1]').click()"), ('.lb-library', "document.querySelector('[data-act=library]').click()"), ('.lb-profile', "document.querySelector('[data-act=profile]').click()")):
        if go: await pg.evaluate("document.querySelector('[data-act=home]') && document.querySelector('[data-act=home]').click()"); await pg.wait_for_timeout(200); await pg.evaluate(go); await pg.wait_for_selector(sel)
        texts.append(await pg.evaluate("document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label],[title]')].map(e=>(e.getAttribute('aria-label')||'')+' '+(e.title||'')).join(' ')"))
    allt = ' '.join(texts)
    check('אנרגי' not in allt, 'AC-N1 no "אנרגיה" in the lobby screens (text, aria-label, title)')
    check('אל תשבור' not in allt, '§11 no threatening streak copy')
    await ctx.close()

# ---------------------------------------------------------------- real copy
async def play_until_decision(pg, t0, shots, tag):
    """Wait for the first meaningful decision: the engine's intro beat 2 when it exists (E-3), else the enabled roll button."""
    deadline = time.time() + 90
    while time.time() < deadline:
        if await pg.locator('[data-intro-opt="fix:pay"]:not([disabled])').count():
            return 'intro', await pg.evaluate('performance.now()')
        if await pg.locator('[data-intro-opt="next"]:not([disabled])').count():   # §3 storyboard: beat 1 → "ממשיכים ←" → beat 2 (the first decision)
            await pg.click('[data-intro-opt="next"]'); await pg.wait_for_timeout(200); continue
        if await pg.locator('#evm:not([hidden]) #evCard').count() and await pg.evaluate("!!(window.__t4trace||[]).find(x=>x.screen==='game')") is False:
            pass
        if await pg.evaluate("(()=>{const r=document.getElementById('roll');return !!r && !r.disabled && document.getElementById('start').hidden})()"):
            return 'roll', await pg.evaluate('performance.now()')
        await pg.wait_for_timeout(250)
    return None, None

async def t_first_minute(b, path):
    for name, vp in (('phone', {'width': 390, 'height': 844}), ('desk', DESK)):
        ctx, pg = await page(b, vp=vp, onboarded=False, init=["if(!sessionStorage.getItem('t4e')){sessionStorage.setItem('t4e','1');localStorage.setItem('rr2-energy', JSON.stringify({e:7, at:Date.now(), granted:{}}))}"])
        await pg.goto(REAL); await pg.wait_for_selector('.lb-welcome', timeout=60000)
        await pg.wait_for_timeout(1500)
        if name == 'phone': await pg.screenshot(path=SHOT + f't4_20_{path}_1_welcome_phone.png')
        if path == 'f1': await pg.click('[data-act=welcome-go]')
        else:
            await pg.click('[data-act=welcome-pick]'); await pg.wait_for_selector('.wv-char'); await pg.wait_for_timeout(1500)
            if name == 'phone': await pg.screenshot(path=SHOT + f't4_21_{path}_2_world_phone.png')
            await pg.click('.wv-char >> nth=0 >> .wv-go')
        kind, t = await play_until_decision(pg, 0, True, name)
        tr = await pg.evaluate('(window.__t4trace||[]).map(x=>x.screen)')
        screens = [s for s in tr if s in ('welcome', 'world', 'game', 'home', 'library', 'profile')]
        if name == 'phone': await pg.screenshot(path=SHOT + f't4_22_{path}_3_game_phone.png')
        check(kind is not None and t is not None and t <= 60000, f'AC-O1 {path} {name}: first decision ({kind}) enabled at {t and round(t)} ms ≤ 60000')
        check(len(screens) <= (2 if path == 'f1' else 3), f'AC-O1/O2 {path} {name}: screens {screens} ≤ {2 if path == "f1" else 3}')
        if kind == 'roll': pending(f'{path} {name}: measured to the enabled roll button — the intro card (E-3) is not in the engine yet')
        if path == 'f1' and name == 'phone':
            # storyboard: the roll coach (C-roll), then the first roll
            if kind == 'intro':   # finish the intro card: a choice (beat 2) → result + next goal (beat 3) → the first roll
                await pg.click('[data-intro-opt="fix:pay"]'); await pg.wait_for_selector('[data-intro-opt="go"]', timeout=20000)
                await pg.wait_for_timeout(600); await pg.screenshot(path=SHOT + 't4_23a_f1_intro_result_phone.png')
                await pg.click('[data-intro-opt="go"]')
            await pg.wait_for_timeout(1500); await pg.screenshot(path=SHOT + 't4_23_f1_4_roll_coach_phone.png')
            if await pg.locator('#coach:not([hidden]) [data-c=next]').count(): await pg.click('#coach [data-c=next]')
            await pg.click('#roll'); await pg.wait_for_timeout(6000); await pg.screenshot(path=SHOT + 't4_24_f1_5_first_roll_phone.png')
            p = await ls(pg, 'rr2-progress'); e = await ls(pg, 'rr2-energy')
            turn = await pg.evaluate("import('./js/game.js').then(g=>g.activeConfig())")
            check(p.get('tutorialDone') is True, 'onboard:done → tutorialDone (the intro card closed with "go", or the game is on screen for an engine without the intro)')
            check(turn.get('tutorialFree') is True and e is not None and e.get('e') == 7, f'D-9 the first-ever game: its roll cost no ⚡ (seeded 7 → {e and e.get("e")}; tutorialFree={turn.get("tutorialFree")})')
        await ctx.close()

COACH_TXT = "(()=>{const c=document.getElementById('coach');return c&&!c.hidden?(c.querySelector('.bubble small')||{}).textContent+' · '+(c.querySelector('.bubble b')||{}).textContent:''})()"
async def t_skip(b):
    """AC-T1 (T4 verify D1): after intro beat 1 "דלג על ההדרכה" no tutorial coach opens — not after the start, not after rolls,
    not after a reload (3 independent runs, phone, brand-new player)."""
    for run in (1, 2, 3):
        ctx, pg = await page(b, vp=PHONE, onboarded=False)
        await pg.goto(REAL); await pg.wait_for_selector('.lb-welcome', timeout=60000)
        await pg.click('[data-act=welcome-go]')
        await pg.wait_for_selector('[data-intro-opt="skip"]:not([disabled])', timeout=90000)
        await pg.click('[data-intro-opt="skip"]')
        await pg.wait_for_function("(()=>{const r=document.getElementById('roll');return !!r && !r.disabled})()", timeout=30000)
        seen = []
        for _ in range(16):   # the roll coach used to open ~0.7–2 s after the skip: watch 4 s
            t = await pg.evaluate(COACH_TXT)
            if t: seen.append(t)
            await pg.wait_for_timeout(250)
        p = await ls(pg, 'rr2-progress'); sv = await ls(pg, 'rr2-save-free-w1') or {}
        ui = ((sv.get('state') or {}).get('ui') or {})
        check(not seen and p.get('tutorialDone') is True and (ui.get('coach') or {}).get('skip') is True,
              f'AC-T1 run {run}: no coach after the skip ({seen}); tutorialDone={p.get("tutorialDone")}; saved ui.coach.skip={(ui.get("coach") or {}).get("skip")}')
        for _ in range(3):   # rolls: no "הדרכה" coach (meter / ROI) and no tip in the skipped game
            await pg.click('#roll')
            for _ in range(40):
                t = await pg.evaluate(COACH_TXT)
                if t: seen.append(t); await pg.evaluate("document.querySelector('#coach [data-c=next]')?.click()")
                if await pg.locator('#evm:not([hidden])').count():
                    await pg.evaluate("(()=>{const b=[...document.querySelectorAll('#evCard button[data-o]:not([disabled])')];(b.find(x=>x.classList.contains('primary'))||b[0])?.click()})()")
                if await pg.locator('#gm:not([hidden])').count(): await pg.evaluate("document.querySelector('#gm .acts button')?.click()")
                if await pg.evaluate("(()=>{const r=document.getElementById('roll');return !!r && !r.disabled && document.getElementById('evm').hidden && document.getElementById('gm').hidden})()"): break
                await pg.wait_for_timeout(300)
            await pg.wait_for_timeout(900)
            t = await pg.evaluate(COACH_TXT)
            if t: seen.append(t)
        await pg.reload(); await pg.wait_for_selector('.lb-home', timeout=60000)
        await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()")
        await pg.wait_for_selector('[data-act=continue-free]', timeout=30000)
        if await pg.locator('[data-act=continue-free]').count():
            await pg.evaluate("document.querySelector('[data-act=continue-free]').click()")
            await pg.wait_for_function("document.getElementById('start').hidden", timeout=90000)
            for _ in range(12):
                t = await pg.evaluate(COACH_TXT)
                if t: seen.append(t)
                await pg.wait_for_timeout(250)
        check(not seen, f'AC-T1 run {run}: 3 rolls + a reload of the skipped game show no coach ({seen})')
        await ctx.close()

TIP_ID = {'🔋 כוח': 'C-power', 'הדוח שלי': 'C-sheet', '🛟 קרן חירום': 'C-fund', '😊 אושר': 'C-happy', '🏦 דירוג אשראי': 'C-credit', '🛒 אינפלציה': 'C-cpi',
          'התוכנית החודשית': 'C-plan', 'מוקד החודש': 'C-focus', 'מה הבחירה עושה': 'C-impact'}
COACH_FULL = "(()=>{const c=document.getElementById('coach');if(!c||c.hidden)return null;const q=(s)=>(c.querySelector(s)||{}).textContent||'';const t=document.getElementById('toast');return {small:q('.bubble small').trim(),title:q('.bubble b'),text:q('.bubble p'),skip:!!c.querySelector('[data-c=skip]'),toast:!!t&&/\\bon\\b/.test(t.className)}})()"
async def play_coached(pg, rolls, on_coach):
    """Roll `rolls` times; every coach goes to on_coach(info, n) → 'next' | 'skip'. Cards: the primary / first option. → [(n, info)]"""
    log = []; n = 0; last = None; stall = time.time()
    while n < rolls and time.time() - stall < 240:
        c = await pg.evaluate(COACH_FULL)
        if c:
            key = (c['small'], c['title'])
            if key != last: log.append((n, c)); last = key; stall = time.time()
            await pg.wait_for_timeout(300)
            await pg.evaluate(f"document.querySelector('#coach [data-c={await on_coach(c, n)}]')?.click()"); continue
        last = None
        if await pg.locator('#gm:not([hidden])').count(): await pg.evaluate("document.querySelector('#gm .acts button')?.click()"); await pg.wait_for_timeout(300); continue
        if await pg.locator('#evm:not([hidden])').count():
            await pg.wait_for_timeout(900)   # an in-card coach opens ~0.5 s after the card
            if await pg.evaluate(COACH_FULL): continue
            await pg.evaluate("(()=>{const b=[...document.querySelectorAll('#evCard button[data-o]:not([disabled])')];(b.find(x=>x.classList.contains('primary'))||b[0])?.click()})()"); await pg.wait_for_timeout(400); continue
        if await pg.evaluate("(()=>{const r=document.getElementById('roll');return !!r && !r.disabled})()"):
            await pg.wait_for_timeout(2500)   # a player reads the board: a tip between turns opens in this pause
            if await pg.evaluate(COACH_FULL): continue
            await pg.click('#roll'); n += 1; stall = time.time(); await pg.wait_for_timeout(800); continue
        await pg.wait_for_timeout(300)
    return log, n
async def t_hints(b):
    """§4.4 (T4 verify D2): core coaches use the spec texts ("הדרכה 1/2", "2/2", C-roi unnumbered); the "טיפ" one-liners appear once each
    when their system first shows, one coach per turn, never together with a toast on a phone, recorded in rr2-reveal.coached;
    "בלי טיפים" stops them; an existing player (rr2-reveal.all) never sees one."""
    init = ["localStorage.setItem('rr2-settings', JSON.stringify({turbo:true}))"]
    ctx, pg = await page(b, vp=PHONE, onboarded=False, init=init)
    await pg.goto(REAL); await pg.wait_for_selector('.lb-welcome', timeout=60000)
    await pg.click('[data-act=welcome-go]')
    for sel in ('[data-intro-opt="next"]', '[data-intro-opt="fix:diy"]', '[data-intro-opt="go"]'):   # diy: 🔋 is revealed at once → C-power on the first turn
        await pg.wait_for_selector(sel + ':not([disabled])', timeout=90000); await pg.click(sel)
    async def nxt(c, n): return 'next'
    log, n = await play_coached(pg, 14, nxt)
    for k, c in log: print('   coach', k, c['small'], '·', c['title'], '·', c['text'][:90], flush=True)
    core = [c for _, c in log if c['small'].startswith('הדרכה')]; tips = [c for _, c in log if c['small'] == 'טיפ']
    roll = next((c for c in core if c['title'] == 'מטילים קובייה'), None); meter = next((c for c in core if c['title'] == 'מד החופש'), None)
    check(roll and roll['small'] == 'הדרכה 1/2' and 'הטל קוביות' in roll['text'] and roll['skip'], f'S-C0/S-C1/S-C2 core 1/2 roll coach ({roll})')
    check(meter and meter['small'] == 'הדרכה 2/2' and re.search(r'הכנסה פסיבית .+ מתוך .+ הוצאות: \d+%', meter['text']), f'S-C5/S-C6 core 2/2 meter coach with live values ({meter})')
    check(all('/3' not in c['small'] for c in core) and all(c['small'] in ('הדרכה 1/2', 'הדרכה 2/2', 'הדרכה') for c in core), f'no "הדרכה i/3": {[c["small"] for c in core]}')
    roi = [c for c in core if c['title'] == 'כמה הכסף מרוויח?']
    check(all(c['small'] == 'הדרכה' and not c['skip'] and re.search(r'שמכניסים .+ בחודש = \d+% בשנה', c['text']) for c in roi), f'S-C3/S-C4 in-card ROI coach: unnumbered, only "הבנתי" ({roi or "not reached"})')
    titles = [c['title'] for c in tips]
    check(len(set(titles)) >= 3 and len(titles) == len(set(titles)) and all(t in TIP_ID for t in titles), f'≥ 3 different "טיפ" coaches in {n} rolls, each once ({titles})')
    check(all(c['skip'] for c in tips) and all('₪' in c['text'] or re.search(r'\d', c['text']) or c['title'] in ('מוקד החודש', 'מה הבחירה עושה') for c in tips), 'every tip carries live values (or is a T2 explainer) and a "בלי טיפים" link')
    per_turn = {}
    for k, c in log: per_turn[k] = per_turn.get(k, 0) + 1
    check(all(v == 1 for v in per_turn.values()), f'§4.1 at most one coach per turn ({per_turn})')
    check(not any(c['toast'] for _, c in log), f'§4.7 phone: no toast on screen while a coach is open ({[(k, c["title"]) for k, c in log if c["toast"]]})')
    r = await ls(pg, 'rr2-reveal') or {}
    want = {TIP_ID[t] for t in titles}
    check(want <= set(r.get('coached') or []) and r.get('all') is False, f'rr2-reveal.coached records the tips shown ({sorted(want)} ⊆ {r.get("coached")})')
    await ctx.close()
    # "בלי טיפים" on the first tip: no more tips (player level)
    ctx, pg = await page(b, vp=PHONE, onboarded=False, init=init)
    await pg.goto(REAL); await pg.wait_for_selector('.lb-welcome', timeout=60000)
    await pg.click('[data-act=welcome-go]')
    for sel in ('[data-intro-opt="next"]', '[data-intro-opt="fix:diy"]', '[data-intro-opt="go"]'):
        await pg.wait_for_selector(sel + ':not([disabled])', timeout=90000); await pg.click(sel)
    async def off(c, n): return 'skip' if c['small'] == 'טיפ' else 'next'
    log, n = await play_coached(pg, 10, off)
    tips = [(k, c['title']) for k, c in log if c['small'] == 'טיפ']
    r = await ls(pg, 'rr2-reveal') or {}
    check(len(tips) == 1 and r.get('hintsOff') is True, f'"בלי טיפים" → hintsOff, no tip after it in {n} rolls ({tips}, hintsOff={r.get("hintsOff")})')
    await ctx.close()
    # an existing player: no tip at all
    ctx, pg = await page(b, vp=PHONE, init=init + ["localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:3,tutorialDone:true,stars:{w1:1}}))", "localStorage.setItem('rr2-coach', JSON.stringify({w1:true}))"])
    await pg.goto(REAL); await pg.wait_for_selector('.lb-home', timeout=60000)
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    await pg.click('.wv-char >> nth=0 >> .wv-go'); await pg.wait_for_function("document.getElementById('start').hidden", timeout=90000)
    log, n = await play_coached(pg, 8, nxt)
    check(not log and (await ls(pg, 'rr2-reveal') or {}).get('all') is True, f'AC-T8 existing player: no coach / tip in {n} rolls ({[(k, c["small"], c["title"]) for k, c in log]})')
    await ctx.close()

PRACTICE_JS = """async () => {
  const E = await import('./js/engine.js'), OB = await import('./js/onboard.js'), ui = await import('./js/ui.js');
  if (typeof E.practiceDue !== 'function' || typeof ui.practiceChip !== 'function') return { skip: true };
  document.getElementById('start').hidden = true;   // the board is "on screen" for onboard's alive() (no game is started)
  const mk = () => { const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: 7, mode: 'free' }); st.ui = { seq: 0, coach: {}, firstPayday: true }; st.lessons = ['gross_net', 'emergency_fund']; st.turn = 5; return st; };
  const hooks = (S) => ({ S, CFG: { mode: 'free', worldId: 'w1' }, W: E.getWorld('w1'), my: 1, gen: () => 1, persist() {}, render() {}, isBusy: () => false });
  const chip = () => !!document.getElementById('practiceChip');
  const out = {};
  const S1 = mk(); await OB.afterTurn(hooks(S1));
  out.first = { chip: chip(), memo: JSON.parse(JSON.stringify(S1.ui.practice || null)) };
  OB.hidePractice();
  // "reload": the saved state comes back as a NEW object (JSON round trip of the slot, ui block included)
  const S2 = JSON.parse(JSON.stringify(S1)); await OB.afterTurn(hooks(S2));
  out.reload = { chip: chip() }; OB.hidePractice();
  S2.turn += 3; await OB.afterTurn(hooks(S2));
  out.later = { chip: chip(), memo: JSON.parse(JSON.stringify(S2.ui.practice || null)) }; OB.hidePractice();
  document.getElementById('start').hidden = false;
  return out;
}"""
async def t_practice(b):
    """T4 verify D6 / AC-P2: the practice dose survives a reload — the memo is in the save (S.ui.practice), so a resumed game does not
    offer again before 3 turns passed and never repeats an offered question."""
    ctx, pg = await page(b, vp=DESK, init=["localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:2,tutorialDone:true}))", "localStorage.setItem('rr2-reveal', JSON.stringify({v:1,all:true,coached:[]}))"])
    await pg.goto(REAL); await pg.wait_for_selector('.lb-home', timeout=60000)
    r = await pg.evaluate(PRACTICE_JS)
    if r.get('skip'): pending('practice: engine practiceDue / ui.practiceChip missing'); await ctx.close(); return
    f, rl, lt = r['first'], r['reload'], r['later']
    check(f['chip'] and f['memo'] and f['memo']['lastTurn'] == 5 and len(f['memo']['offered']) == 1, f'D6 the offer is recorded in S.ui.practice ({f})')
    check(not rl['chip'], f'D6 after a reload (a new state object at the same turn) no second offer: ≥ 3 turns apart holds per saved game ({rl})')
    check(lt['chip'] and lt['memo']['lastTurn'] == 8 and len(lt['memo']['offered']) == 2 and len(set(lt['memo']['offered'])) == 2, f'D6 3 turns later the next question, never a repeat ({lt})')
    await ctx.close()

TOAST_OBS = "window.__toasts=[]; new MutationObserver(()=>{const e=document.querySelector('#toast'); if(e&&/\\bon\\b/.test(e.className)&&e.innerText) window.__toasts.push(e.innerText.replace(/\\n/g,' '))}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true})"
async def t_dreamtut(b):
    """AC-D3 (T4 verify D3): in the tutorial game (F2 + dream 🗽 + developer) buying the tutorial coffee cart completes the dream's
    first mission — its "משימה הושלמה" toast is shown even though the buy emits a burst of other feedback (it is never dropped)."""
    ctx, pg = await page(b, vp=PHONE, onboarded=False)
    await pg.goto(REAL); await pg.wait_for_selector('.lb-welcome', timeout=90000)
    await pg.click('[data-act=welcome-pick]'); await pg.wait_for_selector('.wv-char'); await pg.wait_for_timeout(500)
    await pg.click('label.t4-dopt:has(input[value=free])', timeout=10000); await pg.wait_for_timeout(300)
    await pg.click('.wv-char[data-c=dev] .wv-go')
    for sel in ('[data-intro-opt="next"]', '[data-intro-opt="fix:pay"]', '[data-intro-opt="go"]'):
        await pg.wait_for_selector(sel + ':not([disabled])', timeout=90000); await pg.click(sel)
    await pg.wait_for_function("(()=>{const r=document.getElementById('roll');return !!r && !r.disabled})()", timeout=30000)
    await pg.evaluate(TOAST_OBS)
    await pg.click('#roll')
    for _ in range(80):
        if await pg.locator('#evm:not([hidden]) #evCard button[data-o=buy]:not([disabled])').count(): break
        if await pg.locator('#coach:not([hidden]) [data-c=next]').count(): await pg.click('#coach [data-c=next]')
        await pg.wait_for_timeout(400)
    for _ in range(6):
        if await pg.locator('#coach:not([hidden]) [data-c=next]').count(): await pg.click('#coach [data-c=next]'); await pg.wait_for_timeout(300)
    bought = await pg.evaluate("(()=>{const b=document.querySelector('#evCard button[data-o=buy]'); if(!b) return false; b.click(); return true})()")
    got = False
    for _ in range(100):   # ≤ 30 s: cards that follow the buy are answered; the toast queue drains on its own
        if any('משימה הושלמה' in t for t in await pg.evaluate('window.__toasts')): got = True; break
        if await pg.locator('#coach:not([hidden]) [data-c=next]').count(): await pg.click('#coach [data-c=next]')
        if await pg.locator('#evm:not([hidden])').count():
            await pg.evaluate("(()=>{const b=[...document.querySelectorAll('#evCard button[data-o]:not([disabled])')];(b.find(x=>x.classList.contains('primary'))||b[0])?.click()})()")
        await pg.wait_for_timeout(300)
    sv = await ls(pg, 'rr2-save-free-w1') or {}; dr = ((sv.get('state') or {}).get('dream') or {})
    ts = [t for t in await pg.evaluate('[...new Set(window.__toasts)]')]
    check(bought and (dr.get('done') or {}).get('fr_first') and got, f'AC-D3 tutorial game: bought={bought}, engine fr_first={(dr.get("done") or {}).get("fr_first")}, mission toast shown={got} (toasts {ts[:6]})')
    # the cap itself: a dream mission queued FIRST, then 8 ordinary toasts — the mission is still shown
    await pg.evaluate("window.__toasts=[]")
    await pg.evaluate("import('./js/ui.js').then(u=>{u.dreamToast([{id:'x',title:'בדיקת תור'}],{icon:'🗽',name:'חופש'}); for(let i=0;i<8;i++) u.toast('הודעה רגילה '+i);})")
    got2 = False
    for _ in range(120):
        if any('בדיקת תור' in t for t in await pg.evaluate('window.__toasts')): got2 = True; break
        await pg.wait_for_timeout(250)
    check(got2, f'T4 §4.7: a dream mission toast queued before 8 info toasts is never dropped by the cap of 6 ({(await pg.evaluate("window.__toasts"))[:4]})')
    await ctx.close()

OUTCOME_FIX = """async () => {
  const E = await import('./js/engine.js');
  // a teacher game played until a story card offers "לחפש עבודה חדשה" (interview) or "להתמקח" (negotiate) in the inbox
  for (let s = 1; s < 60; s++) {
    const st = E.createGame({ worldId: 'w1', charId: 'teacher', seed: s, mode: 'free' });
    let x = s * 7 + 3; const r = () => (x = (x * 16807) % 2147483647) / 2147483647;
    const resolve = (ev) => { let k = 0; while (ev && k++ < 10 && !st.over) { const en = ev.options.filter((o) => o.enabled); const o = en.find((o) => ['study', 'plan:study'].includes(o.id)) || (k > 3 ? en.find((o) => ['ok', 'done', 'pass', 'skip'].includes(o.id)) : null) || en[Math.floor(r() * en.length)]; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } };
    for (let g = 0; g < 200 && !st.over; g++) {
      const hit = E.inbox(st).find((it) => it.options.some((o) => o.enabled && (o.id === 'interview' || o.id === 'negotiate')));
      if (hit && !st.pending && st.phase === 'roll') {
        const cfg = { worldId: 'w1', charId: 'teacher', seed: st.seed, mode: 'free' };
        const state = JSON.parse(E.serialize(st)); state.ui = { seq: 0, coach: {}, firstPayday: true, ibSeen: E.inbox(st).map((c) => c.itemId) };
        localStorage.setItem('rr2-save-free-w1', JSON.stringify({ v: 3, app: 'nl1', sv: E.SAVE_VERSION, cfg, state, savedAt: Date.now() }));
        return { seed: s, month: st.month, opt: hit.options.find((o) => o.id === 'interview' || o.id === 'negotiate').id, title: hit.title };
      }
      for (const it of E.inbox(st)) { const o = it.options.find((o) => o.enabled && o.default) || it.options.find((o) => o.enabled); if (o) E.resolveStory(st, it.itemId, o.id); }
      if (st.pending) resolve(E.currentEvent(st)); if (st.over) break; E.rollDice(st); resolve(E.landing(st));
    }
  }
  return null;
}"""
async def t_nearmiss(b):
    """Playtest B1: the end-screen near miss never shows negative months — when the months already met the star line, it names what
    stopped ★★★ (fund / happiness). Same text in ui.js (built-in end screen) and the lobby end screen."""
    ctx, pg = await page(b, vp=DESK, init=["localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:2,tutorialDone:true}))"])
    await pg.goto(REAL); await pg.wait_for_selector('.lb-home', timeout=60000)
    r = await pg.evaluate("""() => import('./js/ui.js').then((u) => [
      u.nearMissText({ nearMiss: { text: 'עוד -5 חודשים פחות ו־★★★ היו שלך.', monthsToNext: -5 }, starsBlockedByFund: true }),
      u.nearMissText({ nearMiss: { text: 'עוד 0 חודשים פחות ו־★★★ היו שלך.', monthsToNext: 0 }, starsBlockedByHappiness: true }),
      u.nearMissText({ nearMiss: { text: 'עוד 3 חודשים פחות ו־★★ היו שלך.', monthsToNext: 3 } }),
      u.nearMissText({ nearMiss: { text: 'x', monthsToNext: -2 } })])""")
    check('-' not in ''.join(r[:2] + r[3:]) and 'קרן חירום' in r[0] and 'אושר' in r[1] and r[2] == 'עוד 3 חודשים פחות ו־★★ היו שלך.', f'B1 near-miss wording ({r})')
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'lobby.js'), encoding='utf8').read()
    check('const near = nearMissText(end);' in src, 'B1 the lobby end screen uses the same wording')
    await ctx.close()

async def t_outcome(b):
    """Playtest B4: the result of an odds choice on a story card ("לחפש עבודה חדשה" / "להתמקח") is shown — a 📖 toast that the queue
    never drops."""
    for vp in (DESK, PHONE): await t_outcome1(b, vp)
async def t_outcome1(b, vp):
    ctx, pg = await page(b, vp=vp, init=["localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:2,tutorialDone:true}))", "localStorage.setItem('rr2-coach', JSON.stringify({w1:true}))"])
    await pg.goto(REAL); await pg.wait_for_selector('.lb-home', timeout=60000)
    fx = await pg.evaluate(OUTCOME_FIX)
    if not fx: check(False, 'B4 fixture: no interview / negotiate story card found'); await ctx.close(); return
    await pg.reload(); await pg.wait_for_selector('.lb-home', timeout=60000)
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('[data-act=continue-free]', timeout=30000)
    await pg.evaluate("document.querySelector('[data-act=continue-free]').click()"); await pg.wait_for_function("document.getElementById('start').hidden", timeout=90000)
    await pg.wait_for_function("(()=>{const r=document.getElementById('roll');return !!r && !r.disabled})()", timeout=60000)
    for _ in range(10):
        if await pg.locator('#coach:not([hidden]) [data-c=next]').count(): await pg.click('#coach [data-c=next]')
        await pg.wait_for_timeout(300)
    await pg.evaluate(TOAST_OBS)
    await pg.evaluate("document.querySelector('#hLife [data-life=inbox]')?.click()")
    for _ in range(20):
        if await pg.locator(f"#evCard button[data-o={fx['opt']}]:not([disabled])").count(): break
        if await pg.locator('#gm:not([hidden]) [data-item], #gm:not([hidden]) .ib-row button').count(): await pg.evaluate("document.querySelector('#gm [data-item], #gm .ib-row button')?.click()")
        await pg.wait_for_timeout(400)
    await pg.evaluate(f"document.querySelector('#evCard button[data-o={fx['opt']}]')?.click()")
    want = 'מצאת' if fx['opt'] == 'interview' else 'בעל הבית'
    got = False
    for _ in range(60):
        if any(want in t for t in await pg.evaluate('window.__toasts')): got = True; break
        await pg.wait_for_timeout(250)
    check(got, f'B4 {vp["width"]}px: the outcome of "{fx["opt"]}" ({fx["title"]}, month {fx["month"]}) is shown as a toast ({[t for t in await pg.evaluate("[...new Set(window.__toasts)]")][:4]})')
    await ctx.close()

SAVE_TURN = "(k)=>{try{const s=JSON.parse(localStorage.getItem(k)).state;return [s.turn|0,(s.actions||[]).length,!!s.over]}catch(e){return [0,0,false]}}"
async def drive(pg, rolls, key=None, stall_s=240):
    """Roll `rolls` times, answering whatever opens (coach → next, card → first enabled option, modal → first button).
    key = the game's save slot: progress is the game's own turn counter (rolls the engine took), not clicks. T4 verify D4: no
    wall-clock budget — a slow / loaded machine only takes longer; it gives up only when the game state has not changed for
    stall_s seconds (a real hang). → rolls done"""
    t0 = (await pg.evaluate(SAVE_TURN, key))[0] if key else 0
    n = 0; sig = None; moved = time.time()
    while time.time() - moved < stall_s:
        if key:
            tr, na, over = await pg.evaluate(SAVE_TURN, key); n = tr - t0
            cur = (tr, na)
            if over: break
        else: cur = n
        if n >= rolls: break
        if cur != sig: sig = cur; moved = time.time()
        if await pg.locator('#coach:not([hidden]) [data-c=next]').count(): await pg.click('#coach [data-c=next]'); moved = time.time(); continue
        if await pg.locator('#gm:not([hidden])').count(): await pg.evaluate("document.querySelector('#gm .acts button')?.click()"); await pg.wait_for_timeout(300); moved = time.time(); continue
        if await pg.locator('#evm:not([hidden])').count():
            # real cards: options are button[data-o]; prefer the highlighted one, else the first enabled (JS click: no animation waits)
            await pg.evaluate("(()=>{const b=[...document.querySelectorAll('#evCard button[data-o]:not([disabled])')];(b.find(x=>x.classList.contains('primary'))||b[0])?.click()})()")
            await pg.wait_for_timeout(500); continue
        if await pg.evaluate("(()=>{const r=document.getElementById('roll');return !!r && !r.disabled})()"):
            await pg.click('#roll')
            if not key: n += 1
            try: await pg.wait_for_function("(()=>{const r=document.getElementById('roll');return !r || r.disabled})()", timeout=5000)   # the roll was taken
            except Exception: pass  # noqa: BLE001 — the stall clock decides
            continue
        await pg.wait_for_timeout(300)
    return n

async def t_learnreal(b):
    ctx, pg = await page(b, vp=DESK, init=["localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:1,tutorialDone:true,lastMode:'learn'}))", "localStorage.setItem('rr2-settings', JSON.stringify({turbo:true}))", "if(!sessionStorage.getItem('t4e')){sessionStorage.setItem('t4e','1');localStorage.setItem('rr2-energy', JSON.stringify({e:5, at:Date.now(), granted:{}}))}"])
    await pg.goto(REAL); await pg.wait_for_selector('.lb-home', timeout=60000)
    e0 = await ls(pg, 'rr2-energy')
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    check(await pg.evaluate("document.querySelector('input[name=t4mode][value=learn]').checked"), 'lastMode learn preselected for a returning player')
    await pg.click('.wv-char >> nth=0 >> .wv-go'); await pg.wait_for_function("document.getElementById('start').hidden", timeout=90000)
    n = await drive(pg, 40, key='rr2-save-learn-w1')
    e1 = await ls(pg, 'rr2-energy'); hid = await pg.evaluate("[document.getElementById('hEnergy').hidden, document.getElementById('rollEn').hidden]")
    check(n >= 40 and (e1 or {}).get('e', 25) == (e0 or {}).get('e', 25), f'AC-L1 {n} learning rolls (the engine turn counter) leave rr2-energy unchanged ({e0 and e0.get("e")} → {e1 and e1.get("e")})')
    check(all(hid), f'AC-L1 #hEnergy / #rollEn hidden in learning mode ({hid})')
    keys = await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rr2-save-'))")
    check('rr2-save-learn-w1' in keys and 'rr2-save-free-w1' not in keys, f'IR-T4-1 the real game saves into rr2-save-learn-w1 ({keys})')
    await pg.screenshot(path=SHOT + 't4_25_learning_game_desk.png')
    await ctx.close()

async def t_help(b):
    ctx, pg = await page(b, vp=PHONE, init=["localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:1,tutorialDone:true}))", "localStorage.setItem('rr2-reveal', JSON.stringify({v:1,all:true,coached:[],tourNext:true}))", "localStorage.setItem('rr2-coach', JSON.stringify({w1:true}))"])
    await pg.goto(REAL); await pg.wait_for_selector('.lb-home', timeout=60000)
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    await pg.click('.wv-char >> nth=0 >> .wv-go'); await pg.wait_for_function("document.getElementById('start').hidden", timeout=90000)
    await pg.wait_for_selector('#coach:not([hidden]) .bubble', timeout=30000)
    lbl = await pg.inner_text('#coach .bubble small')
    check('סיור 1/5' in lbl, f'S-H7 queued tour starts in the next game ({lbl!r}) and clears tourNext: {(await ls(pg, "rr2-reveal")).get("tourNext")}')
    await pg.screenshot(path=SHOT + 't4_26_tour_phone.png')
    await pg.click('#coach [data-c=skip]'); await pg.wait_for_timeout(300)
    await pg.evaluate("import('./js/bus.js').then(m=>m.bus.emit('onboard:help'))"); await pg.wait_for_selector('#gm:not([hidden]) .t4-help', timeout=10000)
    hs = await pg.evaluate("[...document.querySelectorAll('#gm .t4-help [data-h]')].map(b=>b.dataset.h)")
    check(all(x in hs for x in ('tour', 'legend', 'replay')), f'F4 help modal: tour / legend / tutorial replay ({hs}; the UI lane may add rows, e.g. the T2 mentor level)')
    await pg.screenshot(path=SHOT + 't4_27_help_modal_phone.png')
    await pg.click('#gm [data-h=legend]'); await pg.wait_for_selector('#gm:not([hidden]) .t4-legend', timeout=10000)
    t = await pg.inner_text('#gm')
    check('🔋' in t and 'לא ⚡ זריקות' in t and '₪' in t, 'S-H4 in-game legend with current values')
    await pg.screenshot(path=SHOT + 't4_28_legend_phone.png')
    await ctx.close()

async def t_review(b):
    # M-3: a restored player (server games > 0, tutorialDone false on this device) is not re-onboarded
    ctx, pg = await page(b, init=["if(!localStorage.getItem('rr2-progress'))localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:12, wins:4, tutorialDone:false}))"])
    await goto_lobby(pg)
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    await pg.click('.wv-char >> nth=0 >> .wv-go'); await pg.wait_for_function('window.__lastCfg')
    c = await pg.evaluate('window.__lastCfg')
    check(c['tutorial'] is False and not c.get('tutorialFree'), f'review M-3 restored player (gamesPlayed 12, tutorialDone false): no tutorial, no free rolls ({c["tutorial"]}, {c.get("tutorialFree")})')
    await ctx.close()
    # M-2: a replayed tutorial shows the coaches but its rolls cost ⚡ (stub cfg level; the real-game ⚡ check is in t_replayreal)
    ctx, pg = await page(b, init=["if(!localStorage.getItem('rr2-progress'))localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:3, tutorialDone:true, tutorialReplay:true, stars:{w1:3}}))"])
    await goto_lobby(pg)
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    await pg.click('.wv-char >> nth=0 >> .wv-go'); await pg.wait_for_function('window.__lastCfg')
    c = await pg.evaluate('window.__lastCfg')
    check(c['tutorial'] is True and not c.get('tutorialFree'), f'review M-2 replayed tutorial: coaches yes, free rolls no ({c["tutorial"]}, {c.get("tutorialFree")})')
    await ctx.close()
    # M-4: "יאללה, משחק ראשון" from a re-shown welcome never replaces a saved game silently
    ctx, pg = await page(b, onboarded=False)
    await goto_lobby(pg, '.lb-welcome')
    await pg.click('[data-act=welcome-pick]'); await pg.wait_for_selector('.wv-char')
    await pg.click('.wv-char >> nth=2 >> .wv-go'); await pg.wait_for_function('window.__lastCfg')
    await pg.click('#stubLobby'); await pg.wait_for_selector('.lb-home')
    await pg.evaluate("document.querySelector('[data-act=profile]').click()"); await pg.wait_for_selector('#pfSettings')
    await pg.click('[data-act=help-welcome]'); await pg.wait_for_selector('.lb-welcome')
    await pg.evaluate("window.__confirmAnswer = false")
    n0 = await pg.evaluate('window.__cfgs.length')
    await pg.click('[data-act=welcome-go]'); await pg.wait_for_timeout(800)
    asked = await pg.evaluate('window.__confirms || []'); n1 = await pg.evaluate('window.__cfgs.length')
    sv = await ls(pg, 'rr2-save-free-w1')
    check(len(asked) == 1 and n1 == n0 and sv and sv['cfg']['charId'] == 'dev', f'review M-4 welcome-go asks before replacing the save; "no" keeps it ({len(asked)} asked, {n1 - n0} started, save {sv and sv["cfg"]["charId"]})')
    await ctx.close()
    # m-4: the personal best stays visible on a phone (compact, in the hero)
    ctx, pg = await page(b, vp=PHONE, init=["if(!localStorage.getItem('rr2-progress'))localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:3, tutorialDone:true, stars:{w1:2}, best:{w1:40}}))"])
    await goto_lobby(pg)
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char'); await pg.wait_for_timeout(300)
    vis = await pg.evaluate("(()=>{const e=document.querySelector('.wv-best-sm');return !!e && e.offsetParent!==null && e.textContent})()")
    check(bool(vis) and '40' in vis, f'review m-4 personal best visible on a phone ({vis!r})')
    await pg.screenshot(path=SHOT + 't4_14_world_best_phone.png')
    await ctx.close()

async def t_replayreal(b):
    """M-2 in the real game: a replayed tutorial's rolls cost ⚡."""
    ctx, pg = await page(b, vp=DESK, init=["localStorage.setItem('rr2-progress', JSON.stringify({gamesPlayed:3,tutorialDone:true,tutorialReplay:true,stars:{w1:3}}))", "localStorage.setItem('rr2-settings', JSON.stringify({turbo:true}))", "if(!sessionStorage.getItem('t4e')){sessionStorage.setItem('t4e','1');localStorage.setItem('rr2-energy', JSON.stringify({e:9, at:Date.now(), granted:{}}))}", "localStorage.setItem('rr2-coach', JSON.stringify({w1:true}))"])
    await pg.goto(REAL); await pg.wait_for_selector('.lb-home', timeout=60000)
    # deterministic ⚡ accounting (the old "9 → 6" read raced with a random seed's achievement / quiz bonus, the 6-minute refill on a
    # slow run, and the last roll's spend): every change is an energy:change event, the refill is the stored clock's whole steps
    await pg.evaluate("import('./js/bus.js').then(m => { window.__en = []; m.bus.on('energy:change', (p) => window.__en.push({ d: p.delta, r: p.reason })); })")
    e0 = await ls(pg, 'rr2-energy')
    await pg.evaluate("document.querySelector('[data-act=world][data-id=w1]').click()"); await pg.wait_for_selector('.wv-char')
    await pg.click('.wv-char >> nth=0 >> .wv-go'); await pg.wait_for_function("document.getElementById('start').hidden", timeout=90000)
    cfg = await pg.evaluate("import('./js/game.js').then(g=>g.activeConfig())")
    n = await drive(pg, 3)
    try: await pg.wait_for_function("(window.__en || []).filter(x => x.r === 'roll').length >= 3", timeout=30000)
    except Exception: pass  # noqa: BLE001 — reported by the check below
    await pg.wait_for_timeout(500)
    ev = await pg.evaluate('window.__en || []'); e = await ls(pg, 'rr2-energy')
    rolls = [x['d'] for x in ev if x['r'] == 'roll']; bonus = sum(x['d'] for x in ev if x['r'] != 'roll' and x['d'] > 0)
    REFILL_MS = 6 * 60 * 1000; refill = (e['at'] - e0['at']) / REFILL_MS if e and e0 else -1
    ok = e0 and e0['e'] == 9 and rolls == [-1, -1, -1] and refill >= 0 and refill == int(refill) and e['e'] == 9 - 3 + bonus + int(refill)
    check(cfg.get('tutorial') is True and not cfg.get('tutorialFree') and n == 3 and bool(ok),
          f'review M-2 replayed tutorial in the real game: 3 rolls cost 3 ⚡ (9 → {e and e["e"]} = 9 − {-sum(rolls)} rolls + {bonus} bonus {[x for x in ev if x["r"] != "roll"]} + {refill} refill; rolls {n})')
    await ctx.close()

SCEN = [('welcome', t_welcome), ('f1stub', t_f1stub), ('world', t_world), ('learn', t_learn), ('dream', t_dream), ('empty', t_empty), ('library', t_library),
        ('settings', t_settings), ('migrate', t_migrate), ('naming', t_naming),
        ('f1', lambda b: t_first_minute(b, 'f1')), ('f2', lambda b: t_first_minute(b, 'f2')), ('skip', t_skip), ('hints', t_hints), ('dreamtut', t_dreamtut), ('practice', t_practice), ('outcome', t_outcome), ('nearmiss', t_nearmiss), ('learnreal', t_learnreal), ('help', t_help), ('review', t_review), ('replayreal', t_replayreal)]
async def main():
    os.makedirs(SHOT, exist_ok=True); FB.banner(MODE)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args(MODE, ARGS))
        for name, fn in SCEN:
            if ONLY and name not in ONLY: continue
            print(f'--- {name}', flush=True)
            try: await fn(b)
            except Exception as e: check(False, f'{name} crashed: {type(e).__name__}: {str(e)[:300]}')
        await b.close()
    try: [FB.assert_clean(s) for s in SINKS]; check(True, 'guard clean: no request left the machine')
    except AssertionError as e: check(False, f'guard: {e}')
    check(not ERRS, f'no page errors {ERRS[:3]}')
    print(f'\n{sum(RES)}/{len(RES)} checks passed' + (f' · {len(PENDING)} pending (engine part)' if PENDING else ''), flush=True)
    sys.exit(0 if all(RES) else 1)
asyncio.run(main())
