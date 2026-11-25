# w20 רחוב הקרנות end to end in the real page (lobby + game), offline fake backend + guard — the shared run (tests/maps1420_common.py) with
# the fund's own words and engine paths: the map after w19; the picker quantAnalyst / starPicker / endowmentPm (📊 ⭐ 🛡️); the 📈 chip (money
# managed, the 12-month return vs the index); tile W "משקיע חדש" — the amount, the fee share, the lock's deeper cut, the patience in words (the
# true one is sealed) and the flight risk of taking it; the panel "הקרן" (money managed / net worth / vs the index / gross exposure, an
# accessible table of the 12 positions, long / short / close per company, hug / de-risk / the gate / the index product / your money) —
# de-risking through E.worldAction, a 5 % sale on the second tap; the goal (₪800M and ₪4B managed; ★★★ needs no redemption gate); the trading floor
# in 3D (12 position bars, the AUM ring, the gate) and its 2D card (📈 / 🏃 / 🚧); the still screens decor.
# Usage: python3 tests/w20_e2e.py [--real=http://localhost:12102/] [--shots=DIR] [--only=map,pick,play,2d,3d,motion]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import maps1420_common as C

def F(st): return st['world']['funds']
def ws(st): return [round(c['w'], 4) for c in F(st)['cos']]
r_ = lambda x: int(x + 0.5)
MAP = dict(
  wid='w20', name='רחוב הקרנות', motif='📈', prevName='פעמון הבורסה', chars=['quantAnalyst', 'starPicker', 'endowmentPm'], icons=['📊', '⭐', '🛡️'], goalWord='800 מיליון',
  sky1='#0b1020', board='#0b1020', motif2d='screens', chipEmoji='📈', chipWords=['בניהול', 'מול המדד'],
  decor='screens', decorWhat='dark towers with lit windows, the wall of screens', decorOk=lambda d: d.get('towers', 0) > 0 and d.get('screens') == 24,
  cardTitle='משקיע חדש', cardWords=['הסכום', 'הדמים שתגבה ממנו', 'עם נעילה לשנה', 'הסבלנות', 'הסבלנות האמיתית סודית'], cardOpts=['take', 'lock', 'pass'],
  riskOk=lambda rk: rk['take'][0] == 'sealed:h' and 'יברח' in rk['take'][1] and 'לא יכול למשוך שנה' in rk['lock'][1],
  buyOpts=['take', 'lock'], buyWhat='taking the mandate adds the money to the clients\' pool', bought=lambda a, b: F(b)['ext'] > F(a)['ext'] + 1e6,
  panelTitle='הקרן', gauges=['aum', 'nw', 'rel', 'gross'], nowWords=['בניהול', 'של הלקוחות', 'מול המדד', 'דמי ניהול'],
  gaugesOk=lambda g: '₪' in g[0] and '₪' in g[1] and '%' in g[2] and '₪' not in g[2] and '%' in g[3] and '₪' not in g[3],
  table=dict(what='the 12 positions', n=12), rowsWhat='a row per company with long / short (and close once held)', rowsSel='.fds',
  rowsOk=lambda rows, st: [r['data'].get('co') for r in rows] == [c['k'] for c in F(st)['cos']] and all({'buy', 'sell'} <= set(r['acts']) for r in rows),
  one=dict(aid='derisk', what='halving every position (the hugging book is at the 100 % long cap: no buy is open)', ok=lambda a, b: abs(sum(abs(w) for w in ws(b)) - sum(abs(w) for w in ws(a)) / 2) < 0.02),
  two=dict(aid='sell', re='למכור 5%', what='a 5 % sale', say=['למכור 5%'], sayWhat='the sale in words',
           done=lambda a, b: sum(max(0, w) for w in ws(b)) < sum(max(0, w) for w in ws(a)) - 0.01, doneWhat='the engine book holds less'),
  hubWords=['בניהול', 'מול המדד'], goalWords=['800 מיליון', '4 מיליארד', 'כסף בניהול', 'בלי לנעול פדיונות'], tags=['שווי', 'בניהול'], meter='שווי וכסף בניהול',
  subWords=[],
  audit='fund', level='fund', modelWhat='12 position bars, longs / shorts, the gate',
  modelOk=lambda m, v: len(m.get('book') or []) == 12 and m.get('gate') == v['gate'] and m.get('longs') == sum(1 for b in v['book'] if b['w'] > 0.001) and m.get('shorts') == sum(1 for b in v['book'] if b['w'] < -0.001),
  corners=['📈', '🏃', '🚧'], card2dOk=lambda c, v: 'בניהול' in (c['label'] or '') and c['pct'] == f"{r_((v['aum'] / max(v['aum'], v['peak'])) * 100)}%",
)
C.run(MAP)
