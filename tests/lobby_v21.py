# v2.1 lobby tests (stub game, LIVE server, טסט nicknames):
#  1. ranked anti-replay: a daily with a server checkpoint resumes from that state on a fresh device (recovery code, no local save)
#  2. duel link round-trip (?duel=world.char.seed) + same-board replay + share back
#  3. loss screen: leaks, resisted toys, isolated negative numbers, collapsed achievements
import asyncio, json, sys, random, re, urllib.parse
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8771/'
SHOT = '/tmp/lbshots/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
TAG = str(random.randint(100, 999))
results = []
def log(*a): print(*a, flush=True)
def check(c, m): results.append((bool(c), m)); log(('PASS ' if c else 'FAIL ') + m)
async def started(pg, action, timeout=20000):
    n = await pg.evaluate('(window.__cfgs || []).length')
    await action()
    await pg.wait_for_function(f'(window.__cfgs || []).length > {n}', timeout=timeout)
    return await pg.evaluate('window.__lastCfg')
async def page(b, vp, scheme, name):
    ctx = await b.new_context(viewport=vp, color_scheme=scheme); pg = await ctx.new_page()
    pg.on('pageerror', lambda e: log('PAGEERR', name, e))
    pg.on('console', lambda m: log('CONSOLE', name, m.text) if m.type == 'error' and '404' not in m.text else None)
    return ctx, pg
# drive a real engine game to turn 5 and checkpoint it on the server
DRIVE = """async ([rid, world, charIdx, seed, maxM]) => {
  const E = await import('./js/engine.js'); const { net } = await import('./js/net.js');
  const w = E.getWorld(world); const list = (w.daily && w.daily.chars) || w.characters.map(c => c.id);
  const st = E.createGame({ worldId: world, charId: list[charIdx % list.length], seed, mode: 'daily', maxMonths: maxM });
  let guard = 0;
  while (st.turn < 5 && guard++ < 200) {
    E.rollDice(st); let ev = E.landing(st); let n = 0;
    while (ev && n++ < 40) {
      const pick = ev.options.find(o => o.enabled && ['pass', 'done', 'ok'].includes(o.id)) || ev.options.find(o => o.enabled);
      const r = E.choose(st, ev, pick.id); ev = r.event;
    }
  }
  await net.checkpoint(rid, st.turn, st);
  return { turn: st.turn, month: st.month, charId: st.charId };
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        DESK = {'width': 1300, 'height': 820}; PHONE = {'width': 390, 'height': 800}
        # ---------- 1. checkpoint resume on a fresh device
        cX, X = await page(b, DESK, 'light', 'X')
        await X.goto(BASE); await X.wait_for_selector('.lb-home')
        await X.fill('#lb-root-nick', 'טסט־צק' + TAG); await X.press('#lb-root-nick', 'Enter'); await X.wait_for_selector('#lbDaily .lb-dh-txt', timeout=20000)
        r = await X.evaluate("import('./js/net.js').then(m => m.net.begin('daily'))")
        drove = await X.evaluate(DRIVE, [r['result_id'], r['world'], r['char_index'] or 0, int(r['seed']), r['max_months'] or 24])
        log('checkpointed', drove)
        r2 = await X.evaluate("import('./js/net.js').then(m => m.net.begin('daily'))")
        check((r2.get('checkpoint_turn') or 0) >= 5 and r2.get('checkpoint'), f"server returns the checkpoint (turn {r2.get('checkpoint_turn')})")
        code = await X.evaluate("import('./js/net.js').then(m => m.net.recoveryCode())")
        cY, Y = await page(b, PHONE, 'dark', 'Y')
        await Y.goto(BASE); await Y.wait_for_selector('.lb-home'); await Y.click('.lb-player'); await Y.wait_for_selector('.pf-recover')
        await Y.fill('#pfRestore', code); await Y.press('#pfRestore', 'Enter')
        await Y.wait_for_function("document.querySelector('.pf-name h1') && document.querySelector('.pf-name h1').textContent.startsWith('טסט־צק')", timeout=20000)
        await Y.click('[data-act="home"]'); await Y.wait_for_selector('[data-act="daily"]', timeout=20000)
        check('להמשיך' in await Y.inner_text('[data-act="daily"]'), 'daily card offers "continue" on the new device')
        cfg = await started(Y, lambda: Y.click('[data-act="daily"]'))
        st = cfg.get('state') or {}
        check(st.get('turn') == drove['turn'] and st.get('month') == drove['month'] and cfg.get('resultId') == r['result_id'], f"fresh device resumes from the server checkpoint (turn {st.get('turn')}, month {st.get('month')})")
        check(cfg['charId'] == drove['charId'] and cfg['seed'] == int(r['seed']), 'same character + seed as the recorded attempt')
        # local save newer than the server → local wins
        await Y.click('#stubLobby'); await Y.wait_for_selector('.lb-home')
        await Y.evaluate("(k) => { const raw = JSON.parse(localStorage.getItem(k)); raw.state = { ...raw.state, turn: raw.state.turn + 3 }; localStorage.setItem(k, JSON.stringify(raw)); }", 'rr2-save-' + r['result_id'])
        cfg = await started(Y, lambda: Y.click('[data-act="daily"]'))
        check(cfg.get('resume') is True and not cfg.get('state'), 'a newer local save is preferred over the server checkpoint')
        await cX.close(); await cY.close()
        # ---------- 2. duel round-trip
        cA, A = await page(b, DESK, 'light', 'A')
        await A.goto(BASE); await A.wait_for_selector('.lb-home')
        await A.fill('#lb-root-nick', 'טסט־דו' + TAG); await A.press('#lb-root-nick', 'Enter'); await A.wait_for_selector('#lbDaily .lb-dh-txt', timeout=20000)
        await A.click('.map-card[data-id="w1"]'); await A.wait_for_selector('.wv-chars')
        cfgA = await started(A, lambda: A.click('.wv-char[data-c="teacher"]'))
        check(cfgA.get('bailout') is True, 'free game passes bailout (no bankruptcy yet)')
        await A.evaluate('window.__stubEnd("won", 19)'); await A.wait_for_selector('.lb-end'); await A.wait_for_timeout(3500)
        href = await A.get_attribute('#endShare', 'href'); text = urllib.parse.unquote(href.split('text=', 1)[1])
        log('share text:', text)
        check(re.search(r'🐭 השכונה · מורה · 19 חודשים ★★☆', text) is not None, 'Wordle-style share line')
        m = re.search(r'(https?://\S+\?duel=[^\s]+)', text); link = m.group(1) if m else ''
        q = urllib.parse.parse_qs(urllib.parse.urlparse(link).query)
        check(q.get('duel', [''])[0] == f"w1.teacher.{cfgA['seed']}" and q.get('r', [''])[0] == 'w19.2' and q.get('by', [''])[0].startswith('טסט־דו'), f'duel link {link}')
        await A.screenshot(path=SHOT + 'v21_end_win_share_desk.png')
        cB, B = await page(b, PHONE, 'dark', 'B')
        await B.goto(link); await B.wait_for_selector('.duel-card', timeout=30000)
        check('אתגר אותך' in await B.inner_text('.duel-title') and '19 חודשים' in await B.inner_text('.duel-score'), 'duel intro with the challenger and his result')
        await B.screenshot(path=SHOT + 'v21_duel_intro_phone_dark.png')
        cfgB = await started(B, lambda: B.click('[data-act="duel-go"]'))
        check(cfgB['seed'] == cfgA['seed'] and cfgB['worldId'] == 'w1' and cfgB['charId'] == 'teacher' and cfgB['mode'] == 'free' and cfgB.get('title') == 'דו־קרב' and cfgB.get('duel', {}).get('by', '').startswith('טסט־דו'), f'duel cfg {cfgB}')
        check('duel=' not in B.url, 'duel param removed from the URL')
        leaks = [{'key': 'interest', 'label': 'ריבית על הלוואות', 'amount': 18400}, {'key': 'toys', 'label': 'פיתויים שבחרת לקנות', 'amount': 9650}, {'key': 'autoLoan', 'label': 'הלוואות חירום', 'amount': 20000, 'note': 'הבנק הלווה כשנגמר המזומן'}, {'key': 'forced', 'label': 'הוצאות חובה ומשברים (לא באשמתך)', 'amount': 31000}]
        await B.evaluate("([l]) => window.__stubEnd('lost', 60, { leaks: l, netWorth: -79790, stats: { toysResisted: 4200 }, achievements: ['first_asset', 'no_trap', 'cushion', 'credit_free', 'three_apts'] })", [leaks])
        await B.wait_for_selector('.lb-end'); await B.wait_for_timeout(3500)
        check('הפעם הוא ניצח' in await B.inner_text('.end-duel'), 'duel verdict on the end screen')
        lk = await B.inner_text('.end-leaks'); log('leaks:', lk.replace('\n', ' | '))
        items = await B.eval_on_selector_all('.end-leaks li .lk-l', 'els => els.map(e => e.textContent)')
        check(items == ['הלוואות חירוםהבנק הלווה כשנגמר המזומן', 'ריבית על הלוואות', 'פיתויים שבחרת לקנות', 'הוצאות חובה ומשברים (לא באשמתך)'], f'avoidable leaks biggest first, forced last {items}')
        check(await B.locator('.end-leaks li.forced').count() == 1 and 'הלוואות חירום' in await B.inner_text('.lk-hint'), 'forced expenses never blamed; hint names the biggest avoidable leak')
        check('ויתרת על ₪4,200 פיתויים' in lk, 'resisted toys line')
        nw = await B.evaluate("[...document.querySelectorAll('.end-stats span')].map(s => s.querySelector('b').innerHTML).join(' | ')")
        check('<bdi dir="ltr" class="lb-num">−₪79,790</bdi>' in nw, f'negative net worth isolated ({nw[:160]})')
        check(await B.locator('.end-achs').count() == 1 and '+5 הישגים חדשים' in await B.inner_text('.end-achs summary'), 'achievements collapsed into one line')
        share = urllib.parse.unquote((await B.get_attribute('#endShare', 'href')).split('text=', 1)[1])
        check('r=l87' in share and f"duel=w1.teacher.{cfgA['seed']}" in share and 'הפסדתי' in share, f'share back {share}')
        await B.screenshot(path=SHOT + 'v21_end_loss_duel_phone_dark.png')
        await B.set_viewport_size({'width': 390, 'height': 2400}); await B.wait_for_timeout(300)
        await B.screenshot(path=SHOT + 'v21_end_loss_duel_phone_dark_full.png'); await B.set_viewport_size(PHONE)
        cfgB2 = await started(B, lambda: B.click('[data-act="end-same"]'))
        check(cfgB2['seed'] == cfgA['seed'] and cfgB2.get('title') == 'דו־קרב', '"עוד פעם — אותו לוח" replays the same seed')
        await b.close()
    fails = [m for ok, m in results if not ok]
    log(f'\n{len(results) - len(fails)}/{len(results)} checks passed'); [log('  FAILED:', m) for m in fails]
asyncio.run(main())
