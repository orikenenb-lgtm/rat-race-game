# w14 רובע הבנקים end to end in the real page (lobby + game), offline fake backend + guard — the shared run (tests/maps1420_common.py) with
# the bank's own words and engine paths: the map after w17 (linear order); the picker riskChief / familyBanker / fintechFounder (🛡️ 🏛️ 📱);
# the 🏦 chip (the capital ratio in %, the depositors' confidence of 100); tile J "הצעה לבנק" — the book's size, price and discount (a credit
# provision, not a gain), the borrowers' quality as a range that the credit committee narrows in place (₪500,000 from the BANK's equity, the
# ghost-tap guard), the capital ratio now → after; the panel "הבנק" (capital ratio / confidence / equity / the policy rate, an accessible
# table of the 5 segments, a price group per segment), liquidity through E.worldAction, selling a quarter of a book on the second tap; the
# goal (₪700M of your equity, a 10 % capital ratio, 12 months without the regulator — % and months, never ₪); the bank hall in 3D (the
# book's stacks, the capital column, the queue) and its 2D card (🏦 / 🚶 / ⚠️, the ratio as the bar); the still colonnade decor.
# Usage: python3 tests/w14_e2e.py [--real=http://localhost:12102/] [--shots=DIR] [--only=map,pick,play,2d,3d,motion]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import maps1420_common as C

def books(st): return sum(s['book'] for s in st['world']['cr']['seg'].values())
r_ = lambda x: int(x + 0.5)
MAP = dict(
  wid='w14', name='רובע הבנקים', motif='🏛️', prevName='גבעת המעבדות', chars=['riskChief', 'familyBanker', 'fintechFounder'], icons=['🛡️', '🏛️', '📱'], goalWord='700 מיליון',
  sky1='#fde68a', board='#b8ab98', motif2d='columns', chipEmoji='🏦', chipWords=['יחס הון', 'אמון המפקידים', 'מתוך 100'], chipNever=['₪'],
  decor='columns', decorWhat='the colonnade, the bank hall, the vault door', decorOk=lambda d: d.get('columns', 0) > 0 and d.get('hall') and d.get('vault'),
  cardTitle='הצעה לבנק', cardWords=['היקף', 'המחיר', 'ההנחה', 'הפרשה להפסדי אשראי', 'איכות הלווים', 'שיעור הכשל', 'יחס ההון', 'אחרי', 'מי משלם', 'לא נבדק'], cardOpts=['check', 'buy', 'pass'],
  riskOk=lambda rk: rk['buy'][0] == 'sealed:pd' and 'איכות הלווים' in rk['buy'][1] and 'מההון של הבנק' in rk['check'][1] and 'הכרטיס נשאר פתוח' in rk['check'][1],
  check=dict(opt='check', marker='נבדק בוועדת אשראי', narrow=lambda a, b: (b.get('pending') or {}).get('checked') and not (a.get('pending') or {}).get('checked'),
             fee=lambda a, b: abs((a['world']['cr']['eq'] - b['world']['cr']['eq']) - 500000) < 2, feeWhat='₪500,000 out of the bank\'s equity, not your cash'),
  buyOpts=['buy', 'half'], buyWhat='buying adds the book to its segment (the engine\'s loans grow) or the depositors (retail grows)',
  bought=lambda a, b: books(b) > books(a) + 1e6 or b['world']['cr']['ret'] > a['world']['cr']['ret'] + 1e6,
  panelTitle='הבנק', gauges=['capRatio', 'conf', 'equity', 'rate'], nowWords=['ההון שלך', 'ספר הלוואות', 'פיקדונות', 'ריבית נטו'],
  gaugesOk=lambda g: '%' in g[0] and '₪' not in g[0] and 'מתוך 100' in g[1] and '₪' in g[2] and '%' in g[3],
  table=dict(what='the 5 loan segments', n=5), rowsWhat='a row per segment with its price group, stop lending and the book sale', rowsSel='.crs',
  rowsOk=lambda rows, st: [r['data'].get('seg') for r in rows] == ['mort', 'sme', 'dev', 'cons', 'corp'] and all({'price', 'tighten', 'sellBook'} <= set(r['acts']) for r in rows),
  one=dict(aid='liq', what='the liquidity level', ok=lambda a, b: a['world']['cr']['liq'] != b['world']['cr']['liq']),
  two=dict(aid='sellBook', what='selling a quarter of a book', say=['85%–95%', 'מההון'], sayWhat='the price (85–95 %) and the loss out of equity',
           done=lambda a, b: b['world']['cr']['sold'] == a['world']['cr']['sold'] + 1 and books(b) < books(a), doneWhat='one more sale in the engine, the book is smaller'),
  hubWords=['יחס הון', 'אמון', 'ההון שלך'], goalWords=['700 מיליון', 'יחס הון', '10%', 'בלי התערבות המפקח'], goalNever=['₪0.1'], tags=['הון', 'הון', 'רצף'], meter='יעד הבנק',
  subWords=['יחס הון', 'לפחות 10%'],
  audit='bank', level='bank', modelWhat='the capital column = the ratio, its colour, the queue, the stacks',
  modelOk=lambda m, v: abs(m.get('cap', -1) - v['capRatio']) < 1e-6 and m.get('capColor') == ('red' if v['capRatio'] < 0.08 else 'amber' if v['capRatio'] < 0.1 else 'green') and m.get('queue') == min(6, v['queue']) and len(m.get('stacks') or []) == 5,
  corners=['🏦', '🚶', '⚠️'], card2dOk=lambda c, v: c['pct'] == f"{r_(min(1, v['capRatio'] / 0.2) * 100)}%" and 'יחס הון' in (c['label'] or '') and 'אמון המפקידים' in (c['label'] or ''),
)
C.run(MAP)
