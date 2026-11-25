# w19 פעמון הבורסה end to end in the real page (lobby + game), offline fake backend + guard — the shared run (tests/maps1420_common.py) with
# the company's own words and engine paths: the map after w18; the picker founderCeo / familyBoard / turnaroundCeo (💼 🛡️ 📊); the 🔔 chip
# (private, then the price ▲ / ▼ vs the peers; net debt ÷ EBITDA ×); tile W "רכישה משלימה" — EBITDA, the price and its multiple vs the
# sector's, cash and debt (net debt ÷ EBITDA after) vs new shares, the quality band, every option's risk in words; the panel "החברה בבורסה"
# (your stake at the market — "no price" before the IPO — / net debt ÷ EBITDA × / credibility, the two divisions) — growth capex through
# E.worldAction, the IPO on the second tap (it cannot be undone); the goal (₪1.5B at the market and net debt ≤ ×3 — ×, never ₪); the
# exchange in 3D (the bell once listed, the ticker, the EBITDA bars) and its 2D card (🔔 / 🔻 / 🏢 / 🚩); the still bell decor.
# Usage: python3 tests/w19_e2e.py [--real=http://localhost:12102/] [--shots=DIR] [--only=map,pick,play,2d,3d,motion]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import maps1420_common as C

def B(st): return st['world']['bell']
def grows(st): return sum(len(d['grow']) for d in B(st)['div'].values() if d)
MAP = dict(
  wid='w19', name='פעמון הבורסה', motif='🔔', prevName='חוף הסערות', chars=['founderCeo', 'familyBoard', 'turnaroundCeo'], icons=['💼', '🛡️', '📊'], goalWord='1.5 מיליארד',
  sky1='#374151', board='#3d3426', motif2d='bell', chipEmoji='🔔', chipWords=['חוב נטו', 'מהרווח'],
  decor='bell', decorWhat='the brass bell on its frame, the ticker wall', decorOk=lambda d: d.get('bell') and d.get('panels', 0) > 0,
  cardTitle='רכישה משלימה', cardWords=['רווח תפעולי (EBITDA) בחודש', 'המחיר', 'המכפיל', 'פעמים הרווח השנתי', 'מכפיל הענף', 'במזומן ובחוב', 'חוב נטו אחרי', 'במניות', 'האיכות האמיתית'], cardOpts=['cash', 'shares', 'pass'],
  riskOk=lambda rk: rk['cash'][0] == 'sealed:q' and 'מקופת החברה' in rk['cash'][1] and '80%–120%' in rk['cash'][1] and 'מדלל' in rk['shares'][1],
  buyOpts=['cash'], buyWhat='buying with cash and debt adds the target to a division (the engine bought + 1)', bought=lambda a, b: B(b)['bought'] == B(a)['bought'] + 1,
  panelTitle='החברה בבורסה', gauges=['stake', 'nde', 'cred'], nowWords=['החלק שלך', 'רווח תפעולי', 'חוב'],
  gaugesOk=lambda g: ('אין מחיר' in g[0] or '₪' in g[0]) and ('×' in g[1] or 'אין רווח' in g[1]) and '₪' not in g[1] and '₪' not in g[2],
  rowsWhat='the two divisions with grow / sell', rowsSel='.bls',
  rowsOk=lambda rows, st: [r['data'].get('div') for r in rows] == [k for k in ('plant', 'chain') if B(st)['div'].get(k)] and all({'grow', 'sell'} <= set(r['acts']) for r in rows),
  one=dict(aid='grow', what='growth capex in a division', ok=lambda a, b: grows(b) == grows(a) + 1),
  two=dict(aid='ipo', re='30%', what='the IPO (30 % to the public)', say=['90%', 'אי אפשר לבטל'], sayWhat='the float at 90 % of the value, what it brings and that it cannot be undone',
           done=lambda a, b: B(b)['listed'] and not B(a)['listed'], doneWhat='the engine company is listed'),
  hubWords=['חוב נטו'], goalWords=['1.5 מיליארד', 'במחיר הבורסה', '×3'], tags=['בורסה', 'חוב'], meter='בורסה וחוב',
  subWords=['חוב ×', 'עד ×3'],
  audit='listco', level='listco', modelWhat='the bell = listed, the activist flag, six EBITDA bars, the divisions',
  modelOk=lambda m, v: m.get('bell') == v['listed'] and m.get('activist') == v['activist'] and len(m.get('bars') or []) == 6 and set((m.get('divs') or {}).keys()) == {'plant', 'chain'},
  corners=['🔔', '🔻', '🏢', '🚩'], card2dOk=lambda c, v: 'בבורסה' in (c['label'] or ''),
)
C.run(MAP)
