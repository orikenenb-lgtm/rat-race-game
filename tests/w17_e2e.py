# w17 גבעת המעבדות end to end in the real page (lobby + game), offline fake backend + guard — the shared run (tests/maps1420_common.py) with
# the lab's own words and engine paths: the map after w11; the picker scientist / pharmaVet / bioInvestor (🧪 💼 📊); the 🧪 chip (drugs that
# earn of 2, molecules in the pipeline); tile V "מולקולה למכירה" — the printed odds of every stage left, the sealed quality as a band that due
# diligence (₪2M of your cash) narrows in place (the ghost-tap guard), the chance to reach the shelf, the cost left, peak sales, the patent;
# the panel "המעבדה" (net worth / drugs that earn / the lab's month, a row per slot with what was spent — sunk — and the value of going on),
# "go" through E.worldAction, "stop" on the second tap (5 % back); the goal (₪1.2B and 2 drugs that earn — a count, never ₪); the lab in 3D
# (a flask per slot) and its 2D card (🧪 / 💊 / ✖); the still lab-hill decor (blocks, domes, the helix).
# Usage: python3 tests/w17_e2e.py [--real=http://localhost:12102/] [--shots=DIR] [--only=map,pick,play,2d,3d,motion]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import maps1420_common as C

def T(st): return st['world']['trials']
def slots(st, pred): return sum(1 for c in T(st)['slots'] if c and pred(c))
MAP = dict(
  wid='w17', name='גבעת המעבדות', motif='🧪', prevName='התאגיד הבינלאומי', chars=['scientist', 'pharmaVet', 'bioInvestor'], icons=['🧪', '💼', '📊'], goalWord='1.2 מיליארד',
  sky1='#ccfbf1', board='#a7e3d6', motif2d='flask', chipEmoji='🧪', chipWords=['תרופות מרוויחות', 'מולקולות בצינור'], chipNever=['₪'],
  decor='labs', decorWhat='lab blocks, greenhouse domes, the helix', decorOk=lambda d: d.get('blocks', 0) > 0 and d.get('domes', 0) > 0 and d.get('helix') == 48,
  cardTitle='מולקולה למכירה', cardWords=['הסיכויים המודפסים לכל שלב שנשאר', 'האיכות הסודית', 'לפני בדיקה', 'הסיכוי להגיע למדף', 'עלות השלבים שנשארו', 'מכירות בשיא', 'פטנט', 'המחיר', 'מקום במעבדה', 'לא נבדקה'], cardOpts=['check', 'buy', 'pass'],
  riskOk=lambda rk: rk['buy'][0] == 'sealed:odds' and 'הסיכוי האמיתי' in rk['buy'][1] and 'עכשיו' in rk['buy'][1] and 'הכרטיס נשאר פתוח' in rk['check'][1],
  check=dict(opt='check', marker='אחרי בדיקה', narrow=lambda a, b: (b.get('pending') or {}).get('checked') and not (a.get('pending') or {}).get('checked'),
             fee=lambda a, b: abs((a['cash'] - b['cash']) - 2000000) < 2, feeWhat='₪2M of your cash'),
  buyOpts=['buy'], buyWhat='buying puts the molecule into a free slot (the engine bought + 1)', bought=lambda a, b: T(b)['bought'] == T(a)['bought'] + 1,
  panelTitle='המעבדה', gauges=['nw', 'earning', 'inc'], nowWords=['שווי המעבדה', 'רווח המעבדה החודש'],
  gaugesOk=lambda g: '₪' in g[0] and 'מתוך 2' in g[1] and '₪' not in g[1],
  rowsWhat='8 slots: name, stage, odds, the spent money (sunk), the value of going on', rowsSel='.trs',
  rowsOk=lambda rows, st: [r['data'].get('slot') for r in rows] == [str(i) for i in range(8)] and all(('כבר הוצא' in r['t'] and 'לא משנה את ההחלטה' in r['t']) for r, c in zip(rows, T(st)['slots']) if c and c.get('s') in ('dec', 'run'))
    and all({'go', 'license', 'stop'} <= set(r['acts']) for r, c in zip(rows, T(st)['slots']) if c and c.get('s') == 'dec' and not c.get('lic')),
  one=dict(aid='go', what='going on to the next stage', ok=lambda a, b: slots(b, lambda c: c['s'] == 'run') == slots(a, lambda c: c['s'] == 'run') + 1),
  two=dict(aid='stop', what='stopping a molecule', say=['5%', 'לא היה חוזר'], sayWhat='only 5 % comes back, the rest would not have either',
           done=lambda a, b: T(b)['stops'] == T(a)['stops'] + 1, doneWhat='one more stop in the engine, the slot is free'),
  hubWords=['מרוויחות', 'המעבדה החודש'], goalWords=['1.2 מיליארד', 'תרופות שמרוויחות', '2 תרופות'], tags=['שווי', 'תרופות'], meter='שווי ותרופות',
  subWords=['💊', 'מתוך 2'],
  audit='lab', level='lab', modelWhat='a flask per engine slot, its state, the plant',
  modelOk=lambda m, v: len(m.get('flasks') or []) == 8 and all((a is None) == (b is None) for a, b in zip(m['flasks'], v['flasks'])) and all(a['cracked'] == b['cracked'] and a['lic'] == b['lic'] for a, b in zip(m['flasks'], v['flasks']) if a and b) and m.get('plant') == v['plant'],
  corners=['🧪', '💊', '✖'], card2dOk=lambda c, v: 'בצינור' in (c['label'] or '') and 'בשוק' in (c['label'] or ''),
)
C.run(MAP)
