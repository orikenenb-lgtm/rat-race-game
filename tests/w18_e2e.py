# w18 חוף הסערות end to end in the real page (lobby + game), offline fake backend + guard — the shared run (tests/maps1420_common.py) with
# the insurer's own words and engine paths: the map after w12; the picker actuary / topBroker / mutualChair (📊 💼 🛡️); the ☂️ chip (solvency
# %, the 12-month combined ratio %); tile Z "תיק פוליסות למכירה" (played as topBroker — the actuary sees the truth and has no check) — the
# premium, the price out of the insurer's capital, the loss ratio as a band that due diligence (₪1.5M from the company) narrows in place
# (the ghost-tap guard), the underwriting result, solvency now → after, the storm exposure in words; the panel "חברת הביטוח" (net worth /
# solvency / combined, an accessible table of the 5 lines, a price group per line, XoL / quota share / cat bond, the float's risk) — the
# float's risk through E.worldAction, a cat bond on the second tap; the goal (₪1.2B, solvency ≥ 120 %, combined ≤ 100 % — %, never ₪); the
# insurer in 3D (umbrellas per line, XoL rings, the storm cloud) and its 2D card (☂️ / 🌀 / ⚠️); the still lighthouse decor.
# Usage: python3 tests/w18_e2e.py [--real=http://localhost:12102/] [--shots=DIR] [--only=map,pick,play,2d,3d,motion]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import maps1420_common as C

def I(st): return st['world']['ins']
r_ = lambda x: int(x + 0.5)
MAP = dict(
  wid='w18', name='חוף הסערות', motif='🌊', prevName='האימפריה', chars=['actuary', 'topBroker', 'mutualChair'], icons=['📊', '💼', '🛡️'], goalWord='1.2 מיליארד', playChar='topBroker',
  sky1='#94a3b8', board='#8fa3bd', motif2d='umbrella', chipEmoji='☂️', chipWords=['כושר פירעון', 'יחס משולב'], chipNever=['₪'],
  decor='lighthouse', decorWhat='the lighthouse, rocks, wave crests (storm clouds in the season)', decorOk=lambda d: d.get('lighthouse') and d.get('rocks', 0) > 0 and d.get('crests') == 36,
  cardTitle='תיק פוליסות למכירה', cardWords=['פרמיה שנתית', 'המחיר', 'מקופת החברה', 'יחס התביעות המשוער', 'הטווח', 'רווח חיתום משוער בשנה', 'כושר הפירעון', 'אחרי', 'לא נבדק'], cardOpts=['check', 'buy', 'pass'],
  riskOk=lambda rk: rk['buy'][0] == 'sealed:lr' and 'מקופת החברה' in rk['buy'][1] and 'יחס התביעות האמיתי' in rk['buy'][1] and 'מקופת החברה' in rk['check'][1] and 'הכרטיס נשאר פתוח' in rk['check'][1],
  check=dict(opt='check', marker='אחרי בדיקה', narrow=lambda a, b: (b.get('pending') or {}).get('checked') and not (a.get('pending') or {}).get('checked'),
             fee=lambda a, b: abs((I(a)['inv'] - I(b)['inv']) - 1500000) < 2, feeWhat='₪1.5M out of the company, not your cash'),
  buyOpts=['buy'], buyWhat='buying adds the book to its line (the engine bought + 1)', bought=lambda a, b: I(b)['bought'] == I(a)['bought'] + 1,
  panelTitle='חברת הביטוח', gauges=['nw', 'solvency', 'combined'], nowWords=['ההון שלך', 'פרמיות בשנה', 'עתודות לתביעות', 'החודש'],
  gaugesOk=lambda g: '₪' in g[0] and '%' in g[1] and '₪' not in g[1] and '%' in g[2] and '₪' not in g[2],
  table=dict(what='the 5 lines', n=5), rowsWhat='a row per line with its price group and run-off', rowsSel='.ins',
  rowsOk=lambda rows, st: [r['data'].get('line') for r in rows] == ['car', 'coast', 'inland', 'health', 'bi'] and all({'price', 'runoff'} <= set(r['acts']) for r in rows),
  one=dict(aid='risk', what='the float\'s risk', ok=lambda a, b: I(a)['risk'] != I(b)['risk']),
  two=dict(aid='catbond', what='a cat bond', say=['שלוש שנים', 'מההון'], sayWhat='three years at a fixed price, out of capital now',
           done=lambda a, b: (I(b).get('bondUntil') or 0) > b['month'] and not ((I(a).get('bondUntil') or 0) > a['month']), doneWhat='the engine has a cat bond until month + 36'),
  hubWords=['כושר פירעון', 'יחס משולב'], goalWords=['1.2 מיליארד', 'כושר פירעון', '120%', 'יחס משולב', '100%'], tags=['שווי', 'פירעון', 'משולב'], meter='יעד חברת הביטוח',
  subWords=['פירעון', 'משולב', 'לפחות 120%', 'עד 100%'],
  audit='ins', level='ins', modelWhat='the solvency column, the line umbrellas, the XoL rings, the storm cloud',
  modelOk=lambda m, v: abs(m.get('solvency', -1) - v['solvency']) < 1e-6 and len(m.get('lines') or []) == 5 and m.get('xol') == v['xol'] and m.get('cloud') == v['stormSeason'] and m.get('bond') == v['bond'],
  corners=['☂️', '🌀', '⚠️'], card2dOk=lambda c, v: c['pct'] == f"{r_(min(1, v['solvency'] / 2) * 100)}%" and 'כושר פירעון' in (c['label'] or ''),
)
C.run(MAP)
