#!/usr/bin/env python3
# Unit tests of the offline fake backend (T7 FB-1, FB-2, FB-3). No network. Usage:
#   python3 tests/fakebackend_test.py [--no-browser] [--no-replay]
# --no-browser skips the guard negative test in Chrome (FB-2); --no-replay skips the node replay-sidecar round trip.
import datetime as dt, json, os, re, subprocess, sys, tempfile, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fakebackend as FB

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = FB.ROOT
results = []
def test(fn):
    try: fn(); results.append((True, fn.__name__)); print('PASS', fn.__name__, flush=True)
    except Exception as e:  # noqa: BLE001
        results.append((False, fn.__name__)); print('FAIL', fn.__name__, '\n   ', ''.join(traceback.format_exception_only(type(e), e)).strip()[:600], flush=True)
    return fn

T0 = dt.datetime(2026, 11, 25, 9, 0, tzinfo=FB.UTC)   # Wednesday, before RULES4_FROM
CH = {'w1': ['teacher', 'driver', 'dev', 'doctor'], 'w2': ['lawyer', 'chef', 'pm'], 'w3': ['importer', 'exporter', 'captain'], 'w4': ['founder', 'engineer', 'social']}
def mk(**kw): kw.setdefault('now', T0); kw.setdefault('characters', CH); kw.setdefault('verify', 'accept'); return FB.FakeBackend(**kw)
def A(p): return {'p_id': p['id'], 'p_secret': p['secret']}
def ok(fb, fn, **b):
    st, out = fb.handle(fn, b); assert st == 200, f'{fn} → {st} {out}'; return out
def err(fb, fn, code, **b):
    st, out = fb.handle(fn, b); assert st == 400 and out.get('message') == code, f'{fn} expected {code}, got {st} {out}'
def reg(fb, n='טסט־א', ref=None): return ok(fb, 'rr_register2', p_nickname=n, p_ref=ref)

# ---------------------------------------------------------------- parity / clock
@test
def hashtext_parity():
    assert abs(FB.hashtext('ratrace-2026-W48')) == 1382272518
    assert FB.hashtext('') == FB.hashtext('')
    for s in ('a', 'abcd', 'abcde', 'abcdefghi', 'abcdefghijk', 'abcdefghijkl', 'ratrace-daily-2026-11-21'):
        v = FB.hashtext(s); assert -2 ** 31 <= v < 2 ** 31

@test
def params_match_net_js():
    src = open(os.path.join(ROOT, 'js', 'net.js'), encoding='utf-8').read()
    got = {}
    for m in re.finditer(r"rpc\('(rr_[a-z0-9_]+)'\s*,?", src):
        i = m.end(); depth = 1; j = i
        while depth and j < len(src):
            depth += {'(': 1, ')': -1}.get(src[j], 0); j += 1
        arg = src[i:j - 1]
        keys = set(re.findall(r'\b(p_[a-z_]+)\s*:', arg))
        if 'auth()' in arg: keys |= {'p_id', 'p_secret'}
        got.setdefault(m.group(1), set()).update(keys)
    want = {k: set(v) for k, v in FB.PARAMS.items()}
    assert got == want, f'net.js drift: only in net.js {{{", ".join(f"{k}: {sorted(got[k] - want.get(k, set()))}" for k in got if got[k] != want.get(k))}}} / fake {{{", ".join(f"{k}: {sorted(want[k] - got.get(k, set()))}" for k in want if want[k] != got.get(k))}}}'

@test
def israel_day_rollover():
    fb = mk(now=dt.datetime(2026, 11, 25, 21, 59, 30, tzinfo=FB.UTC))   # 23:59:30 IST (UTC+2)
    assert fb.day_key() == '2026-11-25'
    fb.advance(minutes=1); assert fb.day_key() == '2026-11-26', fb.day_key()
    fb2 = mk(now=dt.datetime(2026, 7, 1, 20, 59, tzinfo=FB.UTC)); assert fb2.day_key() == '2026-07-01'   # 23:59 IDT (UTC+3)
    fb2.advance(minutes=1); assert fb2.day_key() == '2026-07-02'

@test
def iso_week_across_year_boundary():
    fb = mk(now=dt.datetime(2026, 12, 31, 12, tzinfo=FB.UTC)); assert fb.week_key() == '2026-W53', fb.week_key()
    fb.set_now(dt.datetime(2027, 1, 3, 12, tzinfo=FB.UTC)); assert fb.week_key() == '2026-W53'
    fb.set_now(dt.datetime(2027, 1, 4, 12, tzinfo=FB.UTC)); assert fb.week_key() == '2027-W01'
    fb.set_now(dt.datetime(2025, 12, 29, 12, tzinfo=FB.UTC)); assert fb.week_key() == '2026-W01'

# ---------------------------------------------------------------- RPCs
@test
def register_rename_profile():
    fb = mk(); p = reg(fb)
    assert set(p) == {'id', 'secret', 'nickname'} and FB.UUID_RE.match(p['id'])
    err(fb, 'rr_register2', 'bad_nickname', p_nickname=' a ', p_ref=None); err(fb, 'rr_register2', 'bad_nickname', p_nickname='x' * 21)
    ok(fb, 'rr_register2', p_nickname='ab'); ok(fb, 'rr_register2', p_nickname='x' * 20, p_ref=None)       # p_ref optional, 2/20 limits
    assert ok(fb, 'rr_rename', **A(p), p_nickname='<b>טסט</b>') == {'nickname': '<b>טסט</b>'}
    err(fb, 'rr_rename', 'bad_nickname', **A(p), p_nickname='x')
    pr = ok(fb, 'rr_profile', **A(p))
    assert set(pr) == {'id', 'nickname', 'stars', 'total_stars', 'achievements', 'pawn', 'daily_streak', 'best_streak', 'last_daily', 'meta'} and pr['nickname'] == '<b>טסט</b>'
    err(fb, 'rr_profile', 'unauthorized', p_id=p['id'], p_secret='nope'); err(fb, 'rr_profile', 'unauthorized', p_id='x', p_secret='y')

@test
def sync_progress_merge():
    fb = mk(); p = reg(fb)
    out = ok(fb, 'rr_sync_progress2', **A(p), p_stars={'w1': 2, 'w2': 9, '<x>': 3, 'h': 1}, p_achievements=['first_asset', '<img>'], p_pawn='car', p_meta={'games': 4, 'wins': 1, 'best': {'w1': 30}})
    assert out['stars'] == {'w1': 2, 'w2': 3, 'h': 1} and out['total_stars'] == 5 and out['achievements'] == ['first_asset'] and out['pawn'] == 'car'
    out = ok(fb, 'rr_sync_progress2', **A(p), p_stars={'w1': 1}, p_achievements=['no_trap'], p_pawn='<svg/onload=1>', p_meta={'games': 2, 'wins': 3, 'best': {'w1': 20, 'w2': 0}})
    assert out['stars']['w1'] == 2 and out['achievements'] == ['first_asset', 'no_trap'] and out['pawn'] == 'car'
    assert out['meta'] == {'games': 4, 'wins': 3, 'best': {'w1': 20}}, out['meta']
    ok(fb, 'rr_sync_progress2', **A(p), p_stars={}, p_achievements=[])               # p_pawn / p_meta optional

@test
def groups_limits_and_membership():
    fb = mk(); a = reg(fb); b = reg(fb, 'טסט־ב')
    g = ok(fb, 'rr_create_group', **A(a), p_name='טסט')
    assert set(g) == {'id', 'code', 'name', 'is_owner', 'members', 'active'} and re.fullmatch(r'[A-Z2-9]{6}', g['code']) and g['is_owner'] and g['members'] == 1
    err(fb, 'rr_create_group', 'bad_name', **A(a), p_name='x'); err(fb, 'rr_create_group', 'bad_name', **A(a), p_name='x' * 41); ok(fb, 'rr_create_group', **A(a), p_name='x' * 40)
    for i in range(18): ok(fb, 'rr_create_group', **A(a), p_name=f'טסט {i}')
    err(fb, 'rr_create_group', 'too_many_groups', **A(a), p_name='טסט 21')
    j = ok(fb, 'rr_join_group', **A(b), p_code=g['code'].lower()); assert j['members'] == 2 and not j['is_owner']
    ok(fb, 'rr_join_group', **A(b), p_code=g['code']); assert ok(fb, 'rr_group', **A(a), p_group=g['id'])['members'][1]['nickname'] == 'טסט־ב'
    err(fb, 'rr_join_group', 'group_not_found', **A(b), p_code='ZZZZZZ')
    big = fb.G[g['id']]
    for i in range(48): big['members'].append(fb._new_player(f'm{i}')['id'])
    c = reg(fb, 'טסט־ג'); err(fb, 'rr_join_group', 'group_full', **A(c), p_code=g['code'])
    err(fb, 'rr_group', 'not_member', **A(c), p_group=g['id']); err(fb, 'rr_group', 'not_member', **A(c), p_group='00000000-0000-0000-0000-000000000000')
    assert len(ok(fb, 'rr_my_groups', **A(b))) == 1
    assert ok(fb, 'rr_leave_group', **A(b), p_group=g['id']) is None; err(fb, 'rr_leave_group', 'not_member', **A(b), p_group=g['id'])
    g2 = ok(fb, 'rr_create_group', **A(c), p_name='טסט ריק'); ok(fb, 'rr_leave_group', **A(c), p_group=g2['id']); assert g2['id'] not in fb.G
    feed = ok(fb, 'rr_group_feed', **A(a), p_group=g['id'])['feed']; assert feed[-1]['kind'] == 'joined'

@test
def challenges_limits():
    fb = mk(); a = reg(fb); g = ok(fb, 'rr_create_group', **A(a), p_name='טסט')
    base = dict(**A(a), p_group=g['id'], p_title='טסט', p_world='w2', p_char='chef', p_days=1)
    c = ok(fb, 'rr_create_challenge2', **base); assert set(c) == {'id', 'title', 'world', 'profession', 'starts_at', 'ends_at'} and c['profession'] == 'chef'
    err(fb, 'rr_create_challenge2', 'bad_title', **{**base, 'p_title': 'x'}); ok(fb, 'rr_create_challenge2', **{**base, 'p_title': 'x' * 50})
    err(fb, 'rr_create_challenge2', 'bad_title', **{**base, 'p_title': 'x' * 51})
    err(fb, 'rr_create_challenge2', 'bad_world', **{**base, 'p_world': 'w9'}); err(fb, 'rr_create_challenge2', 'bad_world', **{**base, 'p_world': 'h'})
    err(fb, 'rr_create_challenge2', 'bad_profession', **{**base, 'p_char': 'teacher'})
    err(fb, 'rr_create_challenge2', 'bad_days', **{**base, 'p_days': 0}); err(fb, 'rr_create_challenge2', 'bad_days', **{**base, 'p_days': 31})
    ok(fb, 'rr_create_challenge2', **{**base, 'p_days': '30'})
    ok(fb, 'rr_create_challenge2', **base); ok(fb, 'rr_create_challenge2', **base)
    err(fb, 'rr_create_challenge2', 'too_many_challenges', **base)
    b = reg(fb, 'טסט־ב'); err(fb, 'rr_create_challenge2', 'not_member', **{**base, **A(b)})
    grp = ok(fb, 'rr_group', **A(a), p_group=g['id']); ch = grp['challenges'][0]
    assert set(ch) == {'id', 'title', 'profession', 'world', 'starts_at', 'ends_at', 'active', 'my_status', 'board'} and ch['active'] is True

@test
def begin_idempotent_streak_checkpoint_finish():
    fb = mk(); fb.set_daily('w1', 2); a = reg(fb)
    r = ok(fb, 'rr_begin', **A(a), p_mode='daily', p_challenge=None)
    assert r['seed'] == abs(FB.hashtext('ratrace-daily-2026-11-25')) and r['char_index'] == 2 and r['max_months'] == 24 and r['streak'] == 1 and 'char' not in r
    assert ok(fb, 'rr_begin', **A(a), p_mode='daily')['result_id'] == r['result_id']                     # unique per player per day
    assert ok(fb, 'rr_checkpoint', **A(a), p_result=r['result_id'], p_turn=5, p_state={'turn': 5}) is None
    ok(fb, 'rr_checkpoint', **A(a), p_result=r['result_id'], p_turn=5, p_state={'turn': 5})               # S-1: equal turn accepted
    err(fb, 'rr_checkpoint', 'stale_checkpoint', **A(a), p_result=r['result_id'], p_turn=4, p_state={})
    fb.stale_on_equal = True; err(fb, 'rr_checkpoint', 'stale_checkpoint', **A(a), p_result=r['result_id'], p_turn=5, p_state={}); fb.stale_on_equal = False
    err(fb, 'rr_checkpoint', 'state_too_big', **A(a), p_result=r['result_id'], p_turn=6, p_state={'pad': 'x' * 300000})
    r2 = ok(fb, 'rr_begin', **A(a), p_mode='daily'); assert r2['checkpoint_turn'] == 5 and r2['checkpoint'] == {'turn': 5}
    b = reg(fb, 'טסט־ב')
    err(fb, 'rr_checkpoint', 'result_not_found', **A(b), p_result=r['result_id'], p_turn=9, p_state={})
    err(fb, 'rr_finish', 'result_not_found', **A(b), p_result=r['result_id'], p_status='won', p_months=1, p_passive=1, p_expenses=0, p_net_worth=1, p_stats={})
    fin = dict(**A(a), p_result=r['result_id'], p_status='lost', p_months=999, p_passive=10, p_expenses=-5, p_net_worth=7, p_stats={'progress': 0.4, 'pad': 'y' * 17000})
    assert ok(fb, 'rr_finish', **fin) is None
    row = fb.R[r['result_id']]; assert row['months'] == 200 and row['expenses'] == 0 and row['stats'] == {}           # clamp + 16 KB stats dropped
    err(fb, 'rr_finish', 'already_finished', **fin); err(fb, 'rr_checkpoint', 'already_finished', **A(a), p_result=r['result_id'], p_turn=99, p_state={})
    d = ok(fb, 'rr_daily', **A(a)); assert d['my_status'] == 'lost' and d['board'][0]['me'] is True and set(d) == {'key', 'world', 'char_index', 'max_months', 'ends_at', 'my_status', 'streak', 'board'}
    fb.advance(days=1); ok(fb, 'rr_begin', **A(a), p_mode='daily'); assert fb.P[a['id']]['daily_streak'] == 2
    fb.advance(days=2); assert ok(fb, 'rr_begin', **A(a), p_mode='daily')['streak'] == 1 and fb.P[a['id']]['best_streak'] == 2
    w = ok(fb, 'rr_begin', **A(a), p_mode='weekly'); assert w['seed'] == abs(FB.hashtext('ratrace-' + fb.week_key())) and w['max_months'] is None
    wk = ok(fb, 'rr_weekly', **A(a)); assert set(wk) == {'key', 'world', 'char_index', 'profession', 'ends_at', 'my_status', 'board'} and wk['my_status'] == 'playing'

@test
def challenge_begin_closed_and_feed():
    fb = mk(); a = reg(fb); b = reg(fb, 'טסט־ב'); g = ok(fb, 'rr_create_group', **A(a), p_name='טסט')
    ok(fb, 'rr_join_group', **A(b), p_code=g['code'])
    c = ok(fb, 'rr_create_challenge2', **A(a), p_group=g['id'], p_title='טסט', p_world='w1', p_char='driver', p_days=1)
    ra = ok(fb, 'rr_begin', **A(a), p_mode='challenge', p_challenge=c['id']); rb = ok(fb, 'rr_begin', **A(b), p_mode='challenge', p_challenge=c['id'])
    assert ra['seed'] == rb['seed'] and ra['char'] == 'driver' and ra['group_id'] == g['id'] and ra['title'] == 'טסט'
    err(fb, 'rr_begin', 'challenge_not_found', **A(a), p_mode='challenge', p_challenge='00000000-0000-0000-0000-000000000000')
    x = reg(fb, 'טסט־ג'); err(fb, 'rr_begin', 'not_member', **A(x), p_mode='challenge', p_challenge=c['id'])
    ok(fb, 'rr_finish', **A(b), p_result=rb['result_id'], p_status='won', p_months=20, p_passive=9, p_expenses=5, p_net_worth=10, p_stats={'stars': 2, 'progress': 1})
    feed = ok(fb, 'rr_group_feed', **A(a), p_group=g['id'])['feed']
    assert feed[0]['kind'] == 'ranked_won' and feed[0]['data']['months'] == 20 and feed[0]['me'] is False
    fb.advance(days=2); y = reg(fb, 'טסט־ד'); ok(fb, 'rr_join_group', **A(y), p_code=g['code'])
    err(fb, 'rr_begin', 'challenge_closed', **A(y), p_mode='challenge', p_challenge=c['id'])
    assert ok(fb, 'rr_begin', **A(a), p_mode='challenge', p_challenge=c['id'])['result_id'] == ra['result_id']    # existing attempt still returned

@test
def referral_cap_and_eight_energy():
    fb = mk(); a = reg(fb)
    for i in range(6): reg(fb, f'טסט־ref{i}', a['id'])
    out = ok(fb, 'rr_claim_energy', **A(a)); assert out['total'] == 25 and len(out['from']) == 5 and out['from'][0]['kind'] == 'referral', out
    assert ok(fb, 'rr_claim_energy', **A(a))['total'] == 0
    fb.advance(days=1); reg(fb, 'טסט־ref7', a['id']); assert ok(fb, 'rr_claim_energy', **A(a))['total'] == 5
    fb2 = mk(); A2 = reg(fb2, 'טסט־אנ'); g = ok(fb2, 'rr_create_group', **A(A2), p_name='טסט')
    B2 = reg(fb2, 'טסט־אנב', A2['id']); ok(fb2, 'rr_join_group', **A(B2), p_code=g['code'])
    assert ok(fb2, 'rr_send_energy', **A(B2), p_group=g['id'], p_nickname='טסט־אנ') is None
    err(fb2, 'rr_send_energy', 'already_sent_today', **A(B2), p_group=g['id'], p_nickname='טסט־אנ')
    err(fb2, 'rr_send_energy', 'player_not_found', **A(B2), p_group=g['id'], p_nickname='אין')
    X = reg(fb2, 'טסט־x'); err(fb2, 'rr_send_energy', 'not_member', **A(X), p_group=g['id'], p_nickname='טסט־אנ')
    assert ok(fb2, 'rr_group_feed', **A(B2), p_group=g['id'])['gifted_today'] == ['טסט־אנ']
    assert ok(fb2, 'rr_claim_energy', **A(A2))['total'] == 8                                            # referral 5 + gift 3

@test
def log_event_rules():
    fb = mk(); a = reg(fb); g = ok(fb, 'rr_create_group', **A(a), p_name='טסט')
    ok(fb, 'rr_log_event', **A(a), p_kind='escaped', p_data={'months': '<i>x</i>'})
    assert ok(fb, 'rr_group_feed', **A(a), p_group=g['id'])['feed'][0]['data'] == {'months': '<i>x</i>'}     # stored verbatim
    err(fb, 'rr_log_event', 'bad_kind', **A(a), p_kind='<script>', p_data={})
    err(fb, 'rr_log_event', 'bad_data', **A(a), p_kind='escaped', p_data={'pad': 'y' * 2040})
    for _ in range(49): ok(fb, 'rr_log_event', **A(a), p_kind='k', p_data={})
    err(fb, 'rr_log_event', 'rate_limited', **A(a), p_kind='k', p_data={})
    assert len(ok(fb, 'rr_group_feed', **A(a), p_group=g['id'])['feed']) == 50                               # ≤ 50 newest

@test
def board_t15b_ordering_12_rows():
    fb = mk(); me = reg(fb, 'me'); k = fb.day_key()
    spec = [  # (nick, status, months, progress, net, passive, verified)
        ('lost_p08', 'lost', 24, 0.8, 5, 1, None), ('won20', 'won', 20, 1, 10, 9, None), ('won15_bad', 'won', 15, 1, 99, 9, False),
        ('won20_ver', 'won', 20, 1, 1, 1, True), ('won15', 'won', 15, 1, 10, 9, None), ('play', 'playing', None, None, None, None, None),
        ('lost_p05', 'lost', 24, 0.5, 9, 9, True), ('lost_ratio', 'lost', 24, None, 0, 6, None), ('won15_rich', 'won', 15, 1, 50, 9, None),
        ('lost_p08_rich', 'lost', 24, 0.8, 50, 1, None), ('lost_bad', 'lost', 24, 0.99, 0, 0, False), ('won10_ver', 'won', 10, 1, 0, 0, True)]
    for i, (n, s, m, pr, nw, pa, v) in enumerate(spec):
        p = fb._new_player(n); fb.R[str(i)] = {'id': str(i), 'player': p['id'], 'daily': k, 'status': s, 'months': m, 'net_worth': nw, 'passive': pa,
                                                'expenses': 10 if n == 'lost_ratio' else 5, 'stats': ({'progress': pr} if pr is not None else {}),
                                                'started_at': f'2026-11-25T0{i % 10}:00', 'finished_at': None, 'verified': v}
    order = [r['nickname'] for r in fb.board(lambda x: x.get('daily') == k, me['id'])]
    assert order == ['won10_ver', 'won20_ver', 'won15_rich', 'won15', 'won20', 'lost_p05', 'lost_p08_rich', 'lost_p08', 'lost_ratio', 'play', 'won15_bad', 'lost_bad'], order
    assert set(fb.board(lambda x: x.get('daily') == k, me['id'])[0]) == {'nickname', 'status', 'months', 'net_worth', 'passive', 'expenses', 'me', 'stars', 'pawn', 'progress', 'verified'}
    fb.board_mode = 'v2'; rows = fb.board(lambda x: x.get('daily') == k, me['id'])
    assert 'verified' not in rows[0] and [r['nickname'] for r in rows][:3] == ['won10_ver', 'won15_bad', 'won15_rich'], [r['nickname'] for r in rows]

@test
def protocol_errors_legacy_unknown_params():
    fb = mk(); a = reg(fb)
    st, out = fb.handle('rr_register', {'p_nickname': 'x'}); assert st == 404 and out['code'] == 'PGRST202'
    st, out = fb.handle('rr_profile', {**A(a), 'p_extra': 1}); assert st == 404 and out['code'] == 'PGRST202'
    st, out = fb.handle('rr_rename', A(a)); assert st == 404                                               # missing p_nickname
    assert [u[0] for u in fb.unexpected] == ['legacy', 'params', 'params'], fb.unexpected
    try: FB.assert_clean(fb); raise RuntimeError('assert_clean should raise')
    except AssertionError as e: assert 'unexpected' in str(e)
    FB.assert_clean(fb, allow_unexpected=('legacy', 'params'))
    fb.fail('rr_profile', 'unauthorized', times=1); err(fb, 'rr_profile', 'unauthorized', **A(a)); ok(fb, 'rr_profile', **A(a))
    fb.override('rr_daily', lambda f, b: FB.Raw(503, {'message': 'x'})); assert fb.handle('rr_daily', A(a))[0] == 503
    fb.fail_network('rr_my_groups', 1); assert fb.take_network_failure('rr_my_groups') and not fb.take_network_failure('rr_my_groups')
    assert all(e[2].get('p_secret') == '<redacted>' for e in fb.log if 'p_secret' in e[2])

@test
def verify_status_codes_scripted_accept():
    fb = mk(verify='accept'); a = reg(fb); b = reg(fb, 'טסט־ב'); fb.set_daily('w1', 0)
    r = ok(fb, 'rr_begin', **A(a), p_mode='daily')
    V = lambda **kw: fb.verify({'id': a['id'], 'secret': a['secret'], 'result_id': r['result_id'], 'actions': [['r']], **kw})
    assert fb.verify({'id': 'x', 'secret': a['secret'], 'result_id': r['result_id']})[0] == 401
    assert fb.verify({'id': a['id'], 'secret': 'short', 'result_id': r['result_id']})[0] == 401
    assert fb.verify({'id': a['id'], 'secret': 'x' * 32, 'result_id': r['result_id']})[0] == 401
    assert fb.verify({'id': a['id'], 'secret': a['secret'], 'result_id': "1' or '1'='1"})[0] == 404
    assert V(actions=[['r', {'$gt': 1}]])[1]['error'] == 'bad_actions'
    assert fb.verify({'id': b['id'], 'secret': b['secret'], 'result_id': r['result_id'], 'actions': [['r']]})[0] == 404
    assert V() == (409, {'ok': False, 'error': 'not_finished'})
    ok(fb, 'rr_finish', **A(a), p_result=r['result_id'], p_status='lost', p_months=24, p_passive=1, p_expenses=2, p_net_worth=3, p_stats={})
    assert V(actions=None)[0] == 422
    st, out = V(); assert st == 200 and out['verified'] is True
    st, out = V(); assert out.get('already') is True
    assert fb.verify({}, raw_len=1000001)[0] == 413
    fb2 = mk(verify='accept'); c = reg(fb2)
    for i in range(10): fb2.verify({'id': c['id'], 'secret': c['secret'], 'result_id': '00000000-0000-4000-8000-000000000000'})
    assert fb2.verify({'id': c['id'], 'secret': c['secret'], 'result_id': '00000000-0000-4000-8000-000000000000'})[0] == 429
    fb2.advance(minutes=2); assert fb2.verify({'id': c['id'], 'secret': c['secret'], 'result_id': '00000000-0000-4000-8000-000000000000'})[0] == 404
    fb3 = mk(verify='scripted'); fb3.verify_queue = [(503, {'error': 'engine_unavailable'})]
    assert fb3.verify({'anything': 1}) == (503, {'error': 'engine_unavailable'}) and fb3.verify({})[1]['verified'] is True

@test
def delete_account_mirrors_sql():
    # = supabase/migrations/20261127_delete_account.sql (the SQL itself: tests/account_delete_sql.test.mjs)
    fb = mk(); a = reg(fb, 'טסט־מוחק'); b = reg(fb, 'טסט־ב'); c = reg(fb, 'טסט־ג'); adm = reg(fb, 'טסט־מנהל'); fb.admins.add(adm['id'])
    g1 = ok(fb, 'rr_create_group', **A(a), p_name='טסט אחת'); ok(fb, 'rr_join_group', **A(b), p_code=g1['code']); ok(fb, 'rr_join_group', **A(c), p_code=g1['code'])
    g2 = ok(fb, 'rr_create_group', **A(a), p_name='טסט לבד')
    g3 = ok(fb, 'rr_create_group', **A(b), p_name='טסט של ב'); ok(fb, 'rr_join_group', **A(a), p_code=g3['code'])
    ok(fb, 'rr_send_energy', **A(a), p_group=g3['id'], p_nickname=b['nickname'])
    err(fb, 'rr_delete_account', 'unauthorized', p_id=a['id'], p_secret='x', p_confirm=a['nickname'])
    for bad in ('', 'טסט', b['nickname'], None): err(fb, 'rr_delete_account', 'confirm_mismatch', **A(a), p_confirm=bad)
    err(fb, 'rr_delete_account', 'admin_cannot_delete', **A(adm), p_confirm=adm['nickname'])
    out = ok(fb, 'rr_delete_account', **A(a), p_confirm=' ' + a['nickname'] + ' ')
    assert out == {'deleted': True, 'groups_transferred': 1, 'groups_deleted': 1}, out
    assert fb.G[g1['id']]['owner'] == b['id'] and fb.G[g1['id']]['members'] == [b['id'], c['id']]
    assert g2['id'] not in fb.G and fb.G[g3['id']]['members'] == [b['id']]
    cl = ok(fb, 'rr_claim_energy', **A(b)); assert cl['total'] == 3 and cl['from'][0]['nickname'] is None, cl
    err(fb, 'rr_delete_account', 'unauthorized', **A(a), p_confirm=a['nickname'])
    assert a['id'] not in json.dumps({k: getattr(fb, k) for k in ('P', 'G', 'R', 'gifts', 'feed')}, default=str)
    assert fb.deletions and set(fb.deletions[0]) == {'via', 'groups_transferred', 'groups_deleted', 'at'}

@test
def dump_load_roundtrip():
    fb = mk(); a = fb.seed_player('טסט־שמור', stars={'w1': 3}); g = fb.seed_group(a); c = fb.seed_challenge(g, world='w2', char='chef')
    path = os.path.join(tempfile.mkdtemp(), 'state.json'); fb.dump(path)
    fb2 = FB.FakeBackend.load(path, characters=CH, now=T0)
    grp = ok(fb2, 'rr_group', **A(a), p_group=g['id']); assert grp['challenges'][0]['id'] == c['id'] and grp['members'][0]['stars'] == 3

@test
def live_flag_refusals_exit_2():
    cases = [({}, 'RR_LIVE'), ({'RR_LIVE': '1', 'RR_SB_URL': FB.SB_PROD, 'RR_SB_ANON': 'k'}, 'PRODUCTION'),
             ({'RR_LIVE': '1', 'RR_SB_URL': 'https://abcdefghijklmnop.supabase.co'}, 'RR_SB_ANON'), ({'RR_LIVE': '1', 'RR_SB_URL': 'http://evil.example', 'RR_SB_ANON': 'k'}, 'STAGING')]
    for env, word in cases:
        e = {k: v for k, v in os.environ.items() if not k.startswith('RR_')}; e.update(env)
        p = subprocess.run([sys.executable, os.path.join(HERE, 'fakebackend.py'), '--check-live', '--live'], env=e, capture_output=True, text=True, timeout=30)
        assert p.returncode == 2 and word in p.stderr, (env, p.returncode, p.stderr)
    e = {k: v for k, v in os.environ.items() if not k.startswith('RR_')}
    p = subprocess.run([sys.executable, os.path.join(HERE, 'fakebackend.py'), '--check-live'], env=e, capture_output=True, text=True, timeout=30)
    assert p.returncode == 0 and p.stdout.strip() == 'offline'
    args = FB.chrome_args('offline', ['--x', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost'])
    assert any(a.endswith('MAP *.supabase.co ~NOTFOUND') for a in args) and sum(a.startswith('--host-resolver-rules') for a in args) == 1 and '--no-proxy-server' in args
    assert FB.chrome_args('live', [])[-1] == f'--host-resolver-rules=MAP {FB.PROD_REF}.supabase.co ~NOTFOUND'

@test
def security_live_skips_without_live_env():
    """RG-5: security_live.mjs prints SKIPPED and exits 0 with no live env; fetch is booby-trapped, so any request would crash it."""
    e = {k: v for k, v in os.environ.items() if not k.startswith('RR_')}
    for extra in ({}, {'RR_LIVE': '1', 'RR_SB_URL': FB.SB_PROD, 'RR_SB_ANON': 'k'}):
        p = subprocess.run(['node', '--import', 'data:text/javascript,globalThis.fetch=()=>{throw new Error("NETWORK")}', os.path.join(HERE, 'security_live.mjs')],
                           env={**e, **extra}, capture_output=True, text=True, timeout=120, cwd=ROOT)
        assert p.returncode == 0 and p.stdout.startswith('SKIPPED') and 'NETWORK' not in p.stdout + p.stderr, (extra, p.returncode, p.stdout[-300:], p.stderr[-300:])

RULES4 = dt.datetime(2026, 12, 9, 9, 0, tzinfo=FB.UTC)   # Wednesday; its ISO week starts 2026-12-07 ≥ RULES4_FROM (2026-12-01)
def replay_roundtrip():
    """Honest game → verified:true from the real engine sidecar; forged claim → claim_mismatch (FB-5 at unit level).
    Runs in both rules eras: a daily begun before RULES4_FROM replays with rules 3, after it with rules 4 (verify_core rulesFor)."""
    has_rules = 'RULES4_FROM' in open(os.path.join(ROOT, 'supabase', 'functions', 'verify-result', 'verify_core.js'), encoding='utf-8').read()
    for when, rules in ((T0, 3), (RULES4, 4)) if has_rules else ((T0, None),):
        _replay_once(when, rules)
def _replay_once(when, rules):
    fb = FB.FakeBackend(now=when, verify='replay'); a = reg(fb); fb.set_daily('w1', 1)
    r = ok(fb, 'rr_begin', **A(a), p_mode='daily')
    js = """const E = await import(%s); const { playOut, prng } = await import(%s);
const w = E.getWorld('w1'); const list = (w.daily && w.daily.chars) || w.characters.map((c) => c.id);
const st = playOut(E, { worldId: 'w1', charId: list[1 %% list.length], seed: %d, mode: 'daily', maxMonths: 24, tutorial: false, bailout: false%s }, prng(7));
const R = st.result; console.log(JSON.stringify({ actions: st.actions, status: R.status, months: Math.max(1, Math.min(200, Math.round(R.months))), passive: Math.round(R.passive),
  expenses: Math.max(0, Math.round(R.expenses)), netWorth: Math.round(R.netWorth), stars: R.stars || 0, progress: R.progress ?? null }));""" % (
        json.dumps('file://' + os.path.join(ROOT, 'js', 'engine.js')), json.dumps('file://' + os.path.join(HERE, 'lib', 'random-player.mjs')), r['seed'], (', rules: %d' % rules) if rules else '')
    out = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, timeout=180)
    g = json.loads(out.stdout.strip().splitlines()[-1])
    ok(fb, 'rr_finish', **A(a), p_result=r['result_id'], p_status=g['status'], p_months=g['months'], p_passive=g['passive'], p_expenses=g['expenses'],
       p_net_worth=g['netWorth'], p_stats={'stars': g['stars'], 'progress': g['progress']})
    st, v = fb.verify({'id': a['id'], 'secret': a['secret'], 'result_id': r['result_id'], 'actions': g['actions']})
    assert st == 200 and v['verified'] is True, (when.date(), rules, st, v)
    print(f'   replay ok: daily {fb.day_key()} rules {rules} · {len(g["actions"])} actions · verified:true', flush=True)
    assert ok(fb, 'rr_daily', **A(a))['board'][0]['verified'] is True
    b = reg(fb, 'טסט־זייפן'); rb = ok(fb, 'rr_begin', **A(b), p_mode='daily')
    ok(fb, 'rr_finish', **A(b), p_result=rb['result_id'], p_status=g['status'], p_months=g['months'], p_passive=g['passive'], p_expenses=g['expenses'],
       p_net_worth=g['netWorth'] + 100000, p_stats={'stars': g['stars'], 'progress': g['progress']})
    st, v = fb.verify({'id': b['id'], 'secret': b['secret'], 'result_id': rb['result_id'], 'actions': g['actions']})
    assert st == 200 and v['verified'] is False and v['error'] == 'claim_mismatch', v
    assert ok(fb, 'rr_daily', **A(b))['board'][-1]['verified'] is False
    fb.close()

def guard_negative_browser():
    """FB-2: a page that fetches an unhandled *.supabase.co URL → aborted, recorded in fb.blocked, assert_clean raises.
    Also: the production RPC host is answered by the fake (never contacted) and is unresolvable with chrome_args."""
    import asyncio, threading, http.server, functools
    d = tempfile.mkdtemp(); open(os.path.join(d, 'index.html'), 'w').write('<!doctype html><title>guard</title><p>guard test')
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=d))
    port = srv.server_address[1]; threading.Thread(target=srv.serve_forever, daemon=True).start()
    from playwright.async_api import async_playwright
    async def run():
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=FB.chrome_args('offline', []))
            ctx = await b.new_context(**FB.new_context_kwargs()); fb = mk(); await FB.install(ctx, fb)
            pg = await ctx.new_page(); await pg.goto(f'http://127.0.0.1:{port}/index.html')
            r1 = await pg.evaluate("fetch('https://x.supabase.co/rest/v1/foo').then(r => 'answered ' + r.status, e => 'failed ' + e.message)")
            r2 = await pg.evaluate("fetch('%s/rest/v1/players?select=*').then(r => 'answered ' + r.status, e => 'failed')" % FB.SB_PROD)
            r3 = await pg.evaluate("fetch('%s/rest/v1/rpc/rr_register2', {method:'POST', headers:{'Content-Type':'application/json', apikey:'k'}, body: JSON.stringify({p_nickname:'טסט', p_ref:null})}).then(r => r.json())" % FB.SB_PROD)
            assert r1.startswith('failed') and r2.startswith('failed'), (r1, r2)
            assert any('x.supabase.co/rest/v1/foo' in u for u in fb.blocked) and any('/rest/v1/players' in u for u in fb.blocked), fb.blocked
            assert r3.get('nickname') == 'טסט' and len(fb.P) == 1, r3
            raised = False
            try: FB.assert_clean(fb)
            except AssertionError as e: raised = 'x.supabase.co' in str(e); print('   guard evidence:', str(e).replace('\n', ' | ')[:300])
            assert raised, 'assert_clean must raise on a blocked request'
            # guard-only install (fb=None) records too
            ctx2 = await b.new_context(**FB.new_context_kwargs()); sink = await FB.install(ctx2, None); pg2 = await ctx2.new_page()
            await pg2.goto(f'http://127.0.0.1:{port}/index.html')
            await pg2.evaluate("fetch('%s/rest/v1/rpc/rr_profile', {method:'POST', body:'{}'}).catch(() => 0)" % FB.SB_PROD)
            assert len(sink.blocked) == 1, sink.blocked
            # defense in depth: with interception OFF the production host does not resolve under chrome_args('offline')
            # (probe a NON-production, non-existent ref: the production host is never used for an unintercepted request)
            assert '--no-proxy-server' in FB.chrome_args('offline', []) and any('MAP *.supabase.co ~NOTFOUND' in a for a in FB.chrome_args('offline', []))
            ctx3 = await b.new_context(); pg3 = await ctx3.new_page(); await pg3.goto(f'http://127.0.0.1:{port}/index.html')
            r4 = await pg3.evaluate("fetch('https://t7-dns-probe-nonexistent.supabase.co/').then(r => 'answered ' + r.status, e => 'failed ' + e.message)")
            assert r4.startswith('failed'), r4
            await b.close()
    try: asyncio.run(run())
    finally: srv.shutdown()

if '--no-replay' not in sys.argv: test(replay_roundtrip)
if '--no-browser' not in sys.argv: test(guard_negative_browser)
fails = [n for o, n in results if not o]
print(f'\n{len(results) - len(fails)}/{len(results)} passed (backend=fake, unit)')
for n in fails: print('  FAILED:', n)
sys.exit(1 if fails else 0)
