#!/usr/bin/env python3
# Groups v2 permission matrix on the offline fake (tests/fakebackend.py, in-process — no network, no browser). The SQL twin of these
# rules is supabase/migrations/20261124_groups_v2.sql (NOT applied), executed for real by tests/sql_drafts.test.mjs (PGlite); the
# network contract is in tests/backend_contract.mjs. BRIEF §20: roles, transfer, removal by permission, rotate/revoke invite,
# wrong/revoked codes, long input, access by id, no personal data beyond nickname + pawn.
#   python3 tests/groups_v2.test.py
import datetime as dt, json, os, sys, tempfile, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fakebackend as FB

results = []
def test(fn):
    try: fn(); results.append(True); print('PASS', fn.__name__, flush=True)
    except Exception as e:  # noqa: BLE001
        results.append(False); print('FAIL', fn.__name__, '\n   ', ''.join(traceback.format_exception_only(type(e), e)).strip()[:600], flush=True)
    return fn
CH = {'w1': ['teacher', 'driver', 'dev', 'doctor'], 'w2': ['lawyer', 'chef', 'pm'], 'w3': ['importer', 'exporter', 'captain'], 'w4': ['founder', 'engineer', 'social']}
T0 = dt.datetime(2026, 12, 9, 9, 0, tzinfo=FB.UTC)
def mk(): return FB.FakeBackend(now=T0, characters=CH, verify='accept')
def A(p): return {'p_id': p['id'], 'p_secret': p['secret']}
def call(fb, fn, **b):
    st, out = fb.handle(fn, b); return (out, None) if st == 200 else (None, out.get('message') or out.get('code'))
def ok(fb, fn, **b):
    out, err = call(fb, fn, **b); assert err is None, f'{fn} → {err}'; return out
def err(fb, fn, code, **b):
    out, e = call(fb, fn, **b); assert e == code, f'{fn} expected {code}, got {e or out}'

def world():
    """owner O, admin D, members M and N, outsider X, all in one group."""
    fb = mk(); P = {k: ok(fb, 'rr_register2', p_nickname=f'טסט־{k}', p_ref=None) for k in 'ODMNX'}
    g = ok(fb, 'rr_create_group', **A(P['O']), p_name='טסט')
    for k in 'DMN': ok(fb, 'rr_join_group', **A(P[k]), p_code=g['code'])
    h = {m['nickname'][-1]: m['handle'] for m in ok(fb, 'rr_group', **A(P['O']), p_group=g['id'])['members']}
    ok(fb, 'rr_group_set_role', **A(P['O']), p_group=g['id'], p_member=h['D'], p_role='admin')
    return fb, P, g, h

@test
def permission_matrix():
    # (actor, action, target) → expected error (None = allowed). Fresh world per row so earlier rows cannot leak state.
    rows = [
        ('O', 'set_role', 'M', None), ('D', 'set_role', 'M', 'not_allowed'), ('M', 'set_role', 'N', 'not_allowed'), ('X', 'set_role', 'M', 'not_member'),
        ('O', 'set_role', 'O', 'not_allowed'),
        ('O', 'remove', 'D', None), ('O', 'remove', 'M', None), ('O', 'remove', 'O', 'not_allowed'),
        ('D', 'remove', 'M', None), ('D', 'remove', 'O', 'not_allowed'), ('D', 'remove', 'D', 'not_allowed'),
        ('M', 'remove', 'N', 'not_allowed'), ('M', 'remove', 'D', 'not_allowed'), ('X', 'remove', 'M', 'not_member'),
        ('O', 'transfer', 'M', None), ('D', 'transfer', 'M', 'not_allowed'), ('M', 'transfer', 'N', 'not_allowed'), ('O', 'transfer', 'O', 'not_allowed'),
        ('O', 'rotate', None, None), ('D', 'rotate', None, None), ('M', 'rotate', None, 'not_allowed'), ('X', 'rotate', None, 'not_member'),
        ('O', 'update', None, None), ('D', 'update', None, None), ('M', 'update', None, 'not_allowed'), ('X', 'update', None, 'not_member'),
        ('O', 'settings', None, None), ('D', 'settings', None, None), ('M', 'settings', None, 'not_allowed'),
        ('M', 'history', None, None), ('X', 'history', None, 'not_member'), ('X', 'group', None, 'not_member'),
    ]
    for actor, action, target, want in rows:
        fb, P, g, h = world(); a = A(P[actor]); gid = g['id']
        if action == 'set_role': out, e = call(fb, 'rr_group_set_role', **a, p_group=gid, p_member=h[target], p_role='admin')
        elif action == 'remove': out, e = call(fb, 'rr_group_remove', **a, p_group=gid, p_member=h[target])
        elif action == 'transfer': out, e = call(fb, 'rr_group_transfer', **a, p_group=gid, p_member=h[target])
        elif action == 'rotate': out, e = call(fb, 'rr_group_rotate_code', **a, p_group=gid)
        elif action == 'update': out, e = call(fb, 'rr_group_update', **a, p_group=gid, p_name='טסט חדש', p_description='תיאור')
        elif action == 'settings': out, e = call(fb, 'rr_group_settings', **a, p_group=gid, p_invite_open=False, p_member_challenges=None)
        elif action == 'history': out, e = call(fb, 'rr_group_history', **a, p_group=gid, p_before=None)
        else: out, e = call(fb, 'rr_group', **a, p_group=gid)
        assert e == want, f'{actor} {action} {target}: expected {want}, got {e}'
    print('   ', len(rows), 'permission cells')

@test
def ids_are_never_exposed_and_handles_are_per_membership():
    fb, P, g, h = world()
    j = json.dumps(ok(fb, 'rr_group', **A(P['M']), p_group=g['id']), ensure_ascii=False)
    for k in 'ODN': assert P[k]['id'] not in j, 'another member\'s player id leaked'
    err(fb, 'rr_group_remove', 'member_not_found', **A(P['O']), p_group=g['id'], p_member=P['M']['id'])   # a player id is not a handle
    err(fb, 'rr_group_remove', 'member_not_found', **A(P['O']), p_group=g['id'], p_member='טסט־M')         # neither is a nickname
    ok(fb, 'rr_leave_group', **A(P['N']), p_group=g['id']); ok(fb, 'rr_join_group', **A(P['N']), p_code=g['code'])
    h2 = {m['nickname'][-1]: m['handle'] for m in ok(fb, 'rr_group', **A(P['O']), p_group=g['id'])['members']}
    assert h2['N'] != h['N'], 'a new membership gets a new handle'
    err(fb, 'rr_group_remove', 'member_not_found', **A(P['O']), p_group=g['id'], p_member=h['N'])

@test
def removed_member_and_revoked_codes():
    fb, P, g, h = world()
    ok(fb, 'rr_group_remove', **A(P['D']), p_group=g['id'], p_member=h['M'])
    err(fb, 'rr_group', 'not_member', **A(P['M']), p_group=g['id'])
    err(fb, 'rr_join_group', 'group_not_found', **A(P['M']), p_code=g['code'])        # same answer as an unknown code
    err(fb, 'rr_join_group', 'group_not_found', **A(P['M']), p_code='ZZZZZZ')
    new = ok(fb, 'rr_group_rotate_code', **A(P['O']), p_group=g['id'])['code']
    assert new != g['code']
    err(fb, 'rr_join_group', 'group_not_found', **A(P['X']), p_code=g['code'])        # the old link is revoked
    ok(fb, 'rr_join_group', **A(P['M']), p_code=new)                                  # rotation lifts the ban
    ok(fb, 'rr_group_settings', **A(P['O']), p_group=g['id'], p_invite_open=False, p_member_challenges=None)
    err(fb, 'rr_join_group', 'group_not_found', **A(P['X']), p_code=new)              # paused invite
    ok(fb, 'rr_join_group', **A(P['M']), p_code=new)                                  # members stay idempotent

@test
def throttle_long_input_and_bad_types():
    fb, P, g, h = world()
    for i in range(20): err(fb, 'rr_join_group', 'group_not_found', **A(P['X']), p_code='Z' * 5 + str(i % 8 + 2))
    err(fb, 'rr_join_group', 'rate_limited', **A(P['X']), p_code=g['code'])
    fb.advance(hours=1, minutes=1); ok(fb, 'rr_join_group', **A(P['X']), p_code=g['code'])
    err(fb, 'rr_join_group', 'group_not_found', **A(P['N']), p_code='A' * 10000)     # long input is cut, never an error 500
    err(fb, 'rr_group_update', 'bad_description', **A(P['O']), p_group=g['id'], p_name='טסט', p_description='x' * 201)
    err(fb, 'rr_group_update', 'bad_name', **A(P['O']), p_group=g['id'], p_name='x' * 41, p_description=None)
    err(fb, 'rr_group_set_role', 'bad_role', **A(P['O']), p_group=g['id'], p_member=h['M'], p_role='owner')
    err(fb, 'rr_group_settings', 'bad_settings', **A(P['O']), p_group=g['id'], p_invite_open='yes', p_member_challenges=None)
    err(fb, 'rr_group', 'not_member', **A(P['X']), p_group='00000000-0000-0000-0000-000000000000')
    err(fb, 'rr_group_rotate_code', 'not_member', **A(P['O']), p_group="1' or '1'='1")

@test
def ownership_moves_and_the_last_member_deletes():
    fb, P, g, h = world()
    ok(fb, 'rr_leave_group', **A(P['O']), p_group=g['id'])
    gr = ok(fb, 'rr_group', **A(P['D']), p_group=g['id']); assert gr['my_role'] == 'owner' and gr['is_owner'], 'the admin inherits'
    assert sum(1 for m in gr['members'] if m['role'] == 'owner') == 1
    ok(fb, 'rr_group_transfer', **A(P['D']), p_group=g['id'], p_member=gr['members'][-1]['handle'])
    assert ok(fb, 'rr_group', **A(P['D']), p_group=g['id'])['my_role'] == 'admin'
    for k in 'DMN': ok(fb, 'rr_leave_group', **A(P[k]), p_group=g['id'])
    assert g['id'] not in fb.G, 'the last member leaving deletes the group'

@test
def member_challenges_switch_and_history():
    fb, P, g, h = world()
    ok(fb, 'rr_create_challenge2', **A(P['M']), p_group=g['id'], p_title='טסט', p_world='w1', p_char='teacher', p_days=1)   # default: as today
    ok(fb, 'rr_group_settings', **A(P['D']), p_group=g['id'], p_invite_open=None, p_member_challenges=False)
    err(fb, 'rr_create_challenge2', 'not_allowed', **A(P['M']), p_group=g['id'], p_title='טסט', p_world='w1', p_char='teacher', p_days=1)
    ok(fb, 'rr_create_challenge2', **A(P['D']), p_group=g['id'], p_title='טסט', p_world='w1', p_char='teacher', p_days=1)
    hist = ok(fb, 'rr_group_history', **A(P['N']), p_group=g['id'], p_before=None)
    kinds = [x['kind'] for x in hist['log']]
    assert {'joined', 'role', 'settings', 'created'} <= set(kinds), kinds
    assert all(set(x) == {'kind', 'actor', 'target', 'data', 'at'} for x in hist['log'])
    assert len(hist['challenges']) == 2

@test
def old_clients_keep_working():
    fb, P, g, h = world()
    mine = ok(fb, 'rr_my_groups', **A(P['M']))
    assert {'id', 'code', 'name', 'is_owner', 'members', 'active'} <= set(mine[0])
    created = ok(fb, 'rr_create_group', **A(P['X']), p_name='טסט ישן')
    assert set(created) >= {'id', 'code', 'name', 'is_owner', 'members', 'active'}
    gr = ok(fb, 'rr_group', **A(P['O']), p_group=g['id'])
    assert all({'nickname', 'owner', 'me', 'stars', 'pawn'} <= set(m) for m in gr['members'])
    assert sum(1 for m in gr['members'] if m['owner']) == 1

@test
def dump_load_keeps_v2_fields():
    fb, P, g, h = world()
    ok(fb, 'rr_group_update', **A(P['O']), p_group=g['id'], p_name='טסט', p_description='שמור')
    path = os.path.join(tempfile.mkdtemp(), 's.json'); fb.dump(path)
    fb2 = FB.FakeBackend.load(path, now=T0, characters=CH, verify='accept')
    gr = ok(fb2, 'rr_group', **A(P['M']), p_group=g['id'])
    assert gr['description'] == 'שמור' and any(m['role'] == 'admin' for m in gr['members'])
    fb.close(); fb2.close()

print(f'\n{sum(results)}/{len(results)} passed (groups v2 on the fake)')
sys.exit(0 if all(results) else 1)
