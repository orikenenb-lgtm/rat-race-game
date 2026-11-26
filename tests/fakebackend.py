#!/usr/bin/env python3
# Offline fake backend for מירוץ העכברים (T7 §2). Replaces production Supabase in every browser suite.
#
#   * FakeBackend: the rr_* RPCs (PostgREST-like) + the verify-result Edge Function, state in memory. Param sets come from
#     js/net.js (fakebackend_test.py parses it and fails on drift). Semantics are "consistent with the client and the
#     documented evidence" (docs/next-level/research/qa.md §1.3) — NOT confirmed against production (assumptions §2.6, S-1…S-8).
#   * install(ctx, fb): the GUARD first (any *.supabase.co request that no handler answers is aborted and recorded in
#     fb.blocked), Google Fonts stubbed, then the RPC / verify handlers. assert_clean(fb) fails the suite on any blocked or
#     unexpected request. chrome_args() adds a DNS rule so the production host cannot even be resolved.
#   * mode_from_argv(): 'offline' (default) | 'live' (only with RR_LIVE=1, RR_SB_URL=<non-production https://<ref>.supabase.co>,
#     RR_SB_ANON) — anything else exits 2 before a browser starts. The production host is never contacted in any mode.
#
#   * Drafts (NOT applied in production, supabase/migrations/20261124_*.sql): groups v2, competitions and live rooms are modelled here
#     too (PARAMS_NEXT). Rooms are delegated to the Node sidecar tests/fakeroom.mjs, which runs supabase/functions/room/room_core.js
#     with the pinned engine — the same code the Edge Function `room` runs. /functions/v1/room is routed in install() and serve().
#
# CLI:  python3 tests/fakebackend.py --serve 8779 [--verify=replay|accept|scripted] [--state=in.json]   (HTTP mode, contract test)
#       python3 tests/fakebackend.py --check-live [--live]                                                (prints the mode or exits 2)
import atexit, collections, copy, datetime as dt, json, os, queue, random, re, secrets, subprocess, sys, threading, time, uuid
from zoneinfo import ZoneInfo

SB_PROD = 'https://xvqaxphyfqdzkddmoosu.supabase.co'      # the only place the production ref appears in tests/ (plus guard_lint's allowlist)
PROD_REF = SB_PROD.split('//')[1].split('.')[0]
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('RR_FAKE_ROOT') or os.path.dirname(HERE)   # repo (or worktree) whose js/ and supabase/ the fake reads
IL = ZoneInfo('Asia/Jerusalem')
UTC = dt.timezone.utc
UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS'}
WORLDS4 = ('w1', 'w2', 'w3', 'w4')

# ---------------------------------------------------------------- PostgreSQL hashtext() (src/common/hashfn.c, little-endian path)
_M = 0xffffffff
def _rot(x, k): return ((x << k) | (x >> (32 - k))) & _M
def _mix(a, b, c):
    a = (a - c) & _M; a ^= _rot(c, 4);  c = (c + b) & _M
    b = (b - a) & _M; b ^= _rot(a, 6);  a = (a + c) & _M
    c = (c - b) & _M; c ^= _rot(b, 8);  b = (b + a) & _M
    a = (a - c) & _M; a ^= _rot(c, 16); c = (c + b) & _M
    b = (b - a) & _M; b ^= _rot(a, 19); a = (a + c) & _M
    c = (c - b) & _M; c ^= _rot(b, 4);  b = (b + a) & _M
    return a, b, c
def _final(a, b, c):
    c ^= b; c = (c - _rot(b, 14)) & _M
    a ^= c; a = (a - _rot(c, 11)) & _M
    b ^= a; b = (b - _rot(a, 25)) & _M
    c ^= b; c = (c - _rot(b, 16)) & _M
    a ^= c; a = (a - _rot(c, 4)) & _M
    b ^= a; b = (b - _rot(a, 14)) & _M
    c ^= b; c = (c - _rot(b, 24)) & _M
    return a, b, c
def _hash_bytes(k):
    n = len(k); a = b = c = (0x9e3779b9 + n + 3923095) & _M; i = 0
    while n >= 12:
        a = (a + int.from_bytes(k[i:i + 4], 'little')) & _M
        b = (b + int.from_bytes(k[i + 4:i + 8], 'little')) & _M
        c = (c + int.from_bytes(k[i + 8:i + 12], 'little')) & _M
        a, b, c = _mix(a, b, c); i += 12; n -= 12
    t = k[i:]
    if n >= 9: c = (c + (int.from_bytes(t[8:n], 'little') << 8)) & _M
    if n >= 5: b = (b + int.from_bytes(t[4:min(n, 8)], 'little')) & _M
    if n >= 1: a = (a + int.from_bytes(t[0:min(n, 4)], 'little')) & _M
    return _final(a, b, c)[2]
def hashtext(s):
    h = _hash_bytes(s.encode('utf-8'))
    return h - (1 << 32) if h >= (1 << 31) else h

# ---------------------------------------------------------------- protocol tables
AUTH = ('p_id', 'p_secret')
PARAMS = {   # = the keys js/net.js sends (fakebackend_test.py asserts equality)
    'rr_register2': ('p_nickname', 'p_ref'),
    'rr_rename': AUTH + ('p_nickname',),
    'rr_profile': AUTH,
    'rr_sync_progress2': AUTH + ('p_stars', 'p_achievements', 'p_pawn', 'p_meta'),
    'rr_create_group': AUTH + ('p_name',),
    'rr_join_group': AUTH + ('p_code',),
    'rr_leave_group': AUTH + ('p_group',),
    'rr_my_groups': AUTH,
    'rr_group': AUTH + ('p_group',),
    'rr_create_challenge2': AUTH + ('p_group', 'p_title', 'p_world', 'p_char', 'p_days'),
    'rr_daily': AUTH,
    'rr_weekly': AUTH,
    'rr_begin': AUTH + ('p_mode', 'p_challenge'),
    'rr_checkpoint': AUTH + ('p_result', 'p_turn', 'p_state'),
    'rr_finish': AUTH + ('p_result', 'p_status', 'p_months', 'p_passive', 'p_expenses', 'p_net_worth', 'p_stats'),
    'rr_send_energy': AUTH + ('p_group', 'p_nickname'),
    'rr_claim_energy': AUTH,
    'rr_log_event': AUTH + ('p_kind', 'p_data'),
    'rr_group_feed': AUTH + ('p_group',),
    'rr_admin_status': AUTH,
    'rr_admin_claim': AUTH + ('p_code',),
    'rr_admin_players': AUTH + ('p_q',),
    'rr_admin_give': AUTH + ('p_to', 'p_amount'),
}
# Server contracts of the NOT-YET-APPLIED drafts (groups v2, competitions, rooms). Wave 3b: js/net.js now sends all of them (behind
# the `rooms` flag), so they live in PARAMS (fakebackend_test.py asserts PARAMS == net.js); PARAMS_NEXT stays for future drafts.
PARAMS.update({
    'rr_group_update': AUTH + ('p_group', 'p_name', 'p_description'),
    'rr_group_set_role': AUTH + ('p_group', 'p_member', 'p_role'),
    'rr_group_transfer': AUTH + ('p_group', 'p_member'),
    'rr_group_remove': AUTH + ('p_group', 'p_member'),
    'rr_group_rotate_code': AUTH + ('p_group',),
    'rr_group_settings': AUTH + ('p_group', 'p_invite_open', 'p_member_challenges'),
    'rr_group_history': AUTH + ('p_group', 'p_before'),
    'rr_create_competition': AUTH + ('p_group', 'p_title', 'p_world', 'p_char', 'p_starts_at', 'p_ends_at', 'p_rules'),
    'rr_cancel_competition': AUTH + ('p_challenge',),
    'rr_competition': AUTH + ('p_challenge',),
    'rr_begin_attempt': AUTH + ('p_challenge',),
    'rr_room_create': AUTH + ('p_settings', 'p_group'),
    'rr_room_join': AUTH + ('p_code',),
    'rr_room_ready': AUTH + ('p_room', 'p_ready', 'p_char'),
    'rr_room_leave': AUTH + ('p_room',),
    'rr_room_kick': AUTH + ('p_room', 'p_seat'),
    'rr_room_cancel': AUTH + ('p_room',),
    'rr_room_state': AUTH + ('p_room', 'p_since'),
    'rr_room_heartbeat': AUTH + ('p_room', 'p_conn'),
    'rr_room_react': AUTH + ('p_room', 'p_kind'),
    'rr_my_rooms': AUTH,
    # moderation + in-room chat (draft 20261126_admin_mod_chat.sql) — js/net.js sends all of them
    'rr_ban_status': AUTH,
    'rr_room_chat_send': AUTH + ('p_room', 'p_text'),
    'rr_room_chat_list': AUTH + ('p_room', 'p_since'),
    'rr_room_chat_report': AUTH + ('p_msg',),
    'rr_admin_ban': AUTH + ('p_target', 'p_reason', 'p_days'),
    'rr_admin_unban': AUTH + ('p_target',),
    'rr_admin_bans': AUTH,
    'rr_admin_player': AUTH + ('p_target',),
    'rr_admin_rooms': AUTH,
    'rr_admin_room_chat': AUTH + ('p_room',),
    'rr_admin_kick_room': AUTH + ('p_room', 'p_target'),
    'rr_admin_close_room': AUTH + ('p_room',),
    'rr_admin_remove_from_group': AUTH + ('p_group', 'p_target'),
    'rr_admin_delete_chat': AUTH + ('p_msg',),
    'rr_admin_reports': AUTH,
    'rr_admin_mod_log': AUTH + ('p_before',),
})
PARAMS_NEXT = {}
OPTIONAL = {'p_ref', 'p_challenge', 'p_pawn', 'p_meta', 'p_group', 'p_char', 'p_since', 'p_conn', 'p_before', 'p_description', 'p_rules',
            'p_invite_open', 'p_member_challenges', 'p_days'}
ROOM_RPC = {'rr_room_create': 'create', 'rr_room_join': 'join', 'rr_room_ready': 'ready', 'rr_room_leave': 'leave', 'rr_room_kick': 'kick',
            'rr_room_cancel': 'cancel', 'rr_room_state': 'state', 'rr_room_heartbeat': 'heartbeat', 'rr_room_react': 'react', 'rr_my_rooms': 'my_rooms'}
ROOM_MAX_BODY = 8192                      # Edge `room`: bodies are small intents (index.ts MAX_BODY)
GROUP_LIMITS = {'description': 200, 'failed_joins_per_hour': 20, 'history_page': 20}
COMP_DEFAULTS = {'attempts': 1, 'metric': 'escape', 'tiebreak': 'ratio', 'join_policy': 'members', 'late_join_until': None, 'grace_minutes': 120}
LEGACY = {'rr_register', 'rr_start', 'rr_create_challenge', 'rr_sync_progress'}
ROTATION = [('w1', 0), ('w2', 1), ('w3', 0), ('w4', 1), ('w1', 1), ('w2', 0), ('w3', 1)]   # by ISO weekday-1 [ASSUMED S-8]
VERIFY_CODES = set('rlcLRCPAIST')
MAX_ACTIONS, MAX_BODY = 6000, 1000000

def _engine_pin():
    try:
        m = re.search(r'ENGINE_SHA256 = "([0-9a-f]{64})"', open(os.path.join(ROOT, 'supabase', 'functions', 'verify-result', 'engine_pin.js'), encoding='utf-8').read())
        return m.group(1) if m else None
    except OSError: return None

class FakeError(Exception):
    def __init__(self, code, status=None):
        super().__init__(code); self.code = code; self.status = status

class Raw:
    """An override may return Raw(status, body) to answer an arbitrary HTTP response (payload injection)."""
    def __init__(self, status, body): self.status, self.body = status, body

def _chars_from_engine():
    try:
        js = ("import(%s).then(E => console.log(JSON.stringify(Object.fromEntries(E.WORLDS.map(w => [w.id, w.characters.map(c => c.id)])))))"
              % json.dumps('file://' + os.path.join(ROOT, 'js', 'engine.js')))
        out = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, timeout=60)
        return json.loads(out.stdout.strip().splitlines()[-1])
    except Exception as e:  # noqa: BLE001 — fail loudly but keep the fake usable for unit tests
        print(f'fakebackend: could not read characters from js/engine.js ({e}); using the v3 defaults', file=sys.stderr)
        return {'w1': ['teacher', 'driver', 'dev', 'doctor'], 'w2': ['lawyer', 'chef', 'pm'], 'w3': ['importer', 'exporter', 'captain'], 'w4': ['founder', 'engineer', 'social']}
_CHARS = None

# ---------------------------------------------------------------- verify sidecar (node tests/fakeverify.mjs)
class _Sidecar:
    def __init__(self, script='fakeverify.mjs'):
        self.proc = subprocess.Popen(['node', os.path.join(HERE, script)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE, text=True, cwd=ROOT, env={**os.environ, 'RR_FAKE_ROOT': ROOT})
        self.q = queue.Queue(); self.rid = 0; self.lock = threading.Lock()
        threading.Thread(target=self._read, daemon=True).start()
        first = self.q.get(timeout=120)
        if not first.get('ready'): raise RuntimeError('%s did not start: %r' % (script, first))
    def _read(self):
        for line in self.proc.stdout:
            try: self.q.put(json.loads(line))
            except ValueError: pass
        self.q.put({'dead': True})
    def call(self, row, actions, timeout=30): return self.ask({'row': row, 'actions': actions}, timeout)
    def ask(self, msg, timeout=30):
        with self.lock:
            self.rid += 1; rid = self.rid
            self.proc.stdin.write(json.dumps({'rid': rid, **msg}, ensure_ascii=False) + '\n'); self.proc.stdin.flush()
            end = time.time() + timeout
            while True:
                left = end - time.time()
                if left <= 0: raise TimeoutError('engine_unavailable')
                m = self.q.get(timeout=left)
                if m.get('dead'): raise RuntimeError('fakeverify died: ' + (self.proc.stderr.read() or '')[-500:])
                if m.get('rid') == rid: return m
    def close(self):
        try: self.proc.stdin.close(); self.proc.terminate(); self.proc.wait(5)
        except Exception: pass  # noqa: BLE001

# ---------------------------------------------------------------- the fake
class FakeBackend:
    def __init__(self, now=None, verify='replay', board='t15b', characters=None, rate_limits=True, seed=1):
        global _CHARS
        self._now_src = now; self._offset = dt.timedelta(0)
        self.verify_mode = verify; self.board_mode = board; self.rate_limits = rate_limits
        if characters is None:
            _CHARS = _CHARS or _chars_from_engine(); characters = _CHARS
        self.characters = characters
        self.rng = random.Random(seed)
        self.P, self.G, self.C, self.R, self.feed, self.gifts = {}, {}, {}, {}, [], []
        self.daily_tab, self.weekly_tab = {}, {}      # day/week key → (world, char_index[, max_months])
        self.daily_override = self.weekly_override = None
        self.events_today = collections.Counter(); self.verify_hits = collections.defaultdict(list)
        self.calls = collections.Counter(); self.log = []; self.blocked = []; self.unexpected = []
        self.requests = []          # (fn | 'verify', body) unredacted, in order — test-side inspection only
        self.admins = set(); self.admin_code = 'TEST-ADMN-CODE'; self.admin_used = False   # migration 20261123_admin
        self.bans = {}; self.mod_log = []                 # draft 20261126_admin_mod_chat: player → {reason, by, until (dt | None), at}; append-only log
        self.meta = {}              # free-form data a suite stores with dump() (e.g. which seeded player is "A")
        self.verify_queue = []; self._fail = {}; self._fail_net = {}; self._over = {}
        # assumed semantics (§2.6) — each one has a switch
        self.stale_on_equal = False; self.streak_on = 'begin'; self.ranked_feed = 'all'; self.raise_status = 400
        self.daily_key_fmt = '%Y-%m-%d'; self.kind_re = re.compile(r'^[a-z0-9_]{1,30}$')
        self._side = None; self._rooms = None; self.lock = threading.RLock()
        self.join_fails = collections.defaultdict(list)   # player → [epoch s] failed group codes (groups v2 throttle)
        self._room_state = None                           # rooms loaded from a dump, pushed to the sidecar on first use
        atexit.register(self.close)

    # -------------------------------------------------- clock
    def now(self):
        s = self._now_src
        t = s() if callable(s) else (s if s is not None else dt.datetime.now(UTC))
        if t.tzinfo is None: t = t.replace(tzinfo=UTC)
        return t + self._offset
    def set_now(self, t): self._now_src = t if (callable(t) or t.tzinfo) else t.replace(tzinfo=UTC); self._offset = dt.timedelta(0)
    def advance(self, days=0, hours=0, minutes=0): self._offset += dt.timedelta(days=days, hours=hours, minutes=minutes)
    def il_date(self, t=None): return (t or self.now()).astimezone(IL).date()
    def day_key(self, t=None): return self.il_date(t).strftime(self.daily_key_fmt)
    def week_key(self, t=None): y, w, _ = self.il_date(t).isocalendar(); return f'{y}-W{w:02d}'
    def iso(self, t=None): return (t or self.now()).astimezone(UTC).isoformat()
    def _il_midnight(self, days_ahead):
        d = self.il_date() + dt.timedelta(days=days_ahead)
        return dt.datetime(d.year, d.month, d.day, tzinfo=IL)

    # -------------------------------------------------- test helpers (never reachable from the page)
    def seed_player(self, nickname='טסט', stars=None, achievements=(), pawn=None, meta=None, streak=0):
        p = self._new_player(nickname)
        p.update(stars=dict(stars or {}), achievements=list(achievements), pawn=pawn, daily_streak=streak, best_streak=streak)
        if meta: p['meta'].update(meta)
        return {'id': p['id'], 'secret': p['secret'], 'nickname': p['nickname']}
    def seed_group(self, owner, name='טסט קבוצה', members=()):
        g = self._new_group(self.P[owner['id']], name)
        for m in members:
            if m['id'] not in g['members']: g['members'].append(m['id'])
        return {'id': g['id'], 'code': g['code'], 'name': g['name']}
    def seed_challenge(self, group, world='w1', char=None, days=3, title='טסט אתגר', seed=None):
        st = self.now(); c = {'id': str(uuid.uuid4()), 'group': group['id'], 'title': title, 'world': world, 'char': char or self.characters[world][0],
                              'seed': seed if seed is not None else self.rng.randint(1, 2 ** 31 - 1), 'starts_at': st, 'ends_at': st + dt.timedelta(days=days)}
        self.C[c['id']] = c
        return self._chal_out(c)
    def set_daily(self, world, char_index, max_months=24): self.daily_override = (world, char_index, max_months)
    def set_weekly(self, world, char_index): self.weekly_override = (world, char_index)
    def fail(self, fn, code, status=400, times=1): self._fail[fn] = [code, status, times]
    def fail_network(self, fn, times=1): self._fail_net[fn] = times
    def override(self, fn, callable_): self._over[fn] = callable_
    def take_network_failure(self, fn):
        n = self._fail_net.get(fn, 0)
        if n > 0: self._fail_net[fn] = n - 1; return True
        return False

    # -------------------------------------------------- state
    def _new_player(self, nickname):
        p = {'id': str(uuid.uuid4()), 'secret': secrets.token_hex(16), 'nickname': nickname, 'stars': {}, 'achievements': [], 'pawn': None,
             'meta': {'games': 0, 'wins': 0, 'best': {}}, 'daily_streak': 0, 'best_streak': 0, 'last_daily': None, 'created': self.iso()}
        self.P[p['id']] = p; return p
    def _code(self):
        while True:
            code = ''.join(self.rng.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
            if not any(g['code'] == code for g in self.G.values()): return code
    def _new_group(self, owner, name):
        g = {'id': str(uuid.uuid4()), 'code': self._code(), 'name': name, 'owner': owner['id'], 'members': [owner['id']],
             'description': '', 'invite_open': True, 'member_challenges': True, 'roles': {}, 'handles': {}, 'bans': {}, 'log': [], 'created': self.iso()}
        self.G[g['id']] = g; self._glog(g, 'created', owner['id']); return g
    # groups v2 (draft 20261124_groups_v2.sql): roles owner/admin/member, opaque per-membership handles, bans until the code rotates
    def _role(self, g, pid):
        if pid == g['owner']: return 'owner'
        return g.setdefault('roles', {}).get(pid, 'member') if pid in g['members'] else None
    def _handle(self, g, pid):
        hs = g.setdefault('handles', {})
        if pid not in hs: hs[pid] = str(uuid.uuid4())
        return hs[pid]
    def _by_handle(self, g, h):
        pid = next((p for p, x in g.setdefault('handles', {}).items() if x == h and p in g['members']), None) if isinstance(h, str) else None
        if not pid: self._err('member_not_found')
        return pid
    def _glog(self, g, kind, actor, target=None, data=None):
        g.setdefault('log', []).append({'kind': kind, 'actor': actor, 'target': target, 'data': data, 'at': self.iso()})
    def _need(self, g, pid, *roles):
        if self._role(g, pid) not in roles: self._err('not_allowed')
    def _drop_member(self, g, pid):
        g['members'].remove(pid); g.setdefault('roles', {}).pop(pid, None); g.setdefault('handles', {}).pop(pid, None)
        if not g['members']: del self.G[g['id']]; return
        if g['owner'] == pid:   # the oldest admin, else the oldest member, becomes owner (production rr_leave_group: oldest member)
            admins = [m for m in g['members'] if g['roles'].get(m) == 'admin']
            g['owner'] = (admins or g['members'])[0]; g['roles'].pop(g['owner'], None); self._glog(g, 'owner', pid, g['owner'], {'auto': True})
    def _total(self, p): return sum(int(v or 0) for k, v in p['stars'].items() if k in WORLDS4)
    def _profile(self, p):
        return {'id': p['id'], 'nickname': p['nickname'], 'stars': dict(p['stars']), 'total_stars': self._total(p), 'achievements': list(p['achievements']),
                'pawn': p['pawn'], 'daily_streak': p['daily_streak'], 'best_streak': p['best_streak'], 'last_daily': p['last_daily'], 'meta': copy.deepcopy(p['meta'])}
    def _groups_of(self, pid): return [g for g in self.G.values() if pid in g['members']]
    def _active(self, c, t=None): t = t or self.now(); return c['starts_at'] <= t < c['ends_at'] and c.get('status') != 'cancelled'
    def _group_out(self, g, pid):
        return {'id': g['id'], 'code': g['code'], 'name': g['name'], 'is_owner': g['owner'] == pid, 'members': len(g['members']),
                'active': sum(1 for c in self.C.values() if c['group'] == g['id'] and self._active(c))}
    def _mine(self, pid, **kw): return next((r for r in self.R.values() if r['player'] == pid and all(r.get(k) == v for k, v in kw.items())), None)
    def _chal_out(self, c, pid=None):
        r = self._mine(pid, challenge=c['id']) if pid else None
        out = {'id': c['id'], 'title': c['title'], 'profession': c['char'], 'world': c['world'], 'starts_at': self.iso(c['starts_at']), 'ends_at': self.iso(c['ends_at'])}
        if pid is not None:
            r = self._latest(pid, c['id'])
            out.update(active=self._active(c), my_status=r and r['status'],
                       board=self.board2(c, pid) if c.get('v2') else self.board(lambda x: x.get('challenge') == c['id'], pid))
            if c.get('v2'): out['status'] = 'cancelled' if c.get('status') == 'cancelled' else 'scheduled' if self.now() < c['starts_at'] else 'open' if self.now() < c['ends_at'] else 'closed'
        return out
    def _feed_add(self, gid, pid, kind, data): self.feed.append({'group': gid, 'player': pid, 'kind': kind, 'data': data, 'at': self.iso()})

    def board(self, pred, me):
        """game.board() of migration 20261120_t15b_board_verified.sql:12-29 ('t15b'), or the previous definition ('v2')."""
        def prog(r):
            v = (r.get('stats') or {}).get('progress')
            try: return float(v) if v is not None else None
            except (TypeError, ValueError): return None
        def key(r):
            if r['status'] == 'won': o2 = r['months'] if r['months'] is not None else float('inf')
            else:
                pr = prog(r)
                o2 = -(pr if pr is not None else ((r['passive'] or 0) / r['expenses'] if r['expenses'] else 0))
            o1 = {'won': 0, 'lost': 1}.get(r['status'], 2)
            tail = (o2, -(r['net_worth'] or 0), -(r['passive'] or 0), r.get('finished_at') or r['started_at'])
            if self.board_mode == 'v2': return (o1,) + tail
            return (1 if r.get('verified') is False else 0, o1, 0 if r.get('verified') is True else 1) + tail
        out = []
        for r in sorted((r for r in self.R.values() if pred(r) and not self.banned(r['player'])), key=key)[:100]:
            p = self.P[r['player']]
            row = {'nickname': p['nickname'], 'status': r['status'], 'months': r['months'], 'net_worth': r['net_worth'], 'passive': r['passive'],
                   'expenses': r['expenses'], 'me': r['player'] == me, 'stars': self._total(p), 'pawn': p['pawn'], 'progress': prog(r)}
            if self.board_mode != 'v2': row['verified'] = r.get('verified')
            out.append(row)
        return out

    # -------------------------------------------------- protocol
    def _err(self, code): raise FakeError(code, self.raise_status)
    def handle(self, fn, body):
        """→ (status, json). PostgREST-like: 200 JSON | 400 {code:'P0001', message} | 404 {code:'PGRST202'}."""
        with self.lock:
            body = body if isinstance(body, dict) else {}
            self.calls[fn] += 1; self.requests.append((fn, body))
            red = {k: ('<redacted>' if k in ('p_secret', 'secret') else v) for k, v in body.items()}
            def done(st, out):
                self.log.append((round(time.time(), 3), fn, red, st)); return st, out
            sig = PARAMS.get(fn) or PARAMS_NEXT.get(fn)
            if fn in LEGACY or sig is None:
                self.unexpected.append(('legacy' if fn in LEGACY else 'unknown_fn', fn))
                return done(404, {'code': 'PGRST202', 'message': f'Could not find the function public.{fn}', 'details': None, 'hint': None})
            want = set(sig); got = set(body)
            if (got - want) or (want - OPTIONAL - got):
                self.unexpected.append(('params', fn, sorted(got - want), sorted(want - OPTIONAL - got)))
                return done(404, {'code': 'PGRST202', 'message': f'Could not find the function public.{fn}({",".join(sorted(got))})', 'details': None, 'hint': None})
            f = self._fail.get(fn)
            try:
                if f and f[2] > 0:
                    f[2] -= 1; raise FakeError(f[0], f[1])
                if fn in self._over:
                    out = self._over[fn](self, body)
                elif fn in ROOM_RPC:
                    out = self._room_rpc(fn, body)
                else:
                    out = getattr(self, '_' + fn)(body)
                if isinstance(out, Raw): return done(out.status, out.body)
                return done(200, out)
            except FakeError as e:
                return done(e.status or self.raise_status, {'code': 'P0001', 'message': e.code, 'details': None, 'hint': None})

    def _auth(self, b):
        p = self.P.get(b.get('p_id')) if isinstance(b.get('p_id'), str) else None
        if not p or p['secret'] != b.get('p_secret'): self._err('unauthorized')
        return p
    def _member_group(self, b, p):
        g = self.G.get(b.get('p_group')) if isinstance(b.get('p_group'), str) else None
        if not g or p['id'] not in g['members']: self._err('not_member')
        return g
    @staticmethod
    def _int(v, code):
        try:
            if isinstance(v, bool): raise ValueError
            return int(str(v).strip()) if not isinstance(v, (int, float)) else int(v)
        except (TypeError, ValueError): raise FakeError(code)
    @staticmethod
    def _txt(v): return str(v if v is not None else '').strip()

    def _rr_register2(self, b):
        n = self._txt(b.get('p_nickname'))
        if not 2 <= len(n) <= 20: self._err('bad_nickname')
        p = self._new_player(n)
        ref = self.P.get(b.get('p_ref')) if isinstance(b.get('p_ref'), str) else None
        if ref and ref['id'] != p['id']:
            today = self.day_key()
            if sum(1 for x in self.gifts if x['to'] == ref['id'] and x['kind'] == 'referral' and x['day'] == today) < 5:
                self.gifts.append({'from': p['id'], 'to': ref['id'], 'kind': 'referral', 'amount': 5, 'day': today, 'group': None, 'claimed': False})
        return {'id': p['id'], 'secret': p['secret'], 'nickname': p['nickname']}
    def _rr_rename(self, b):
        p = self._auth(b); n = self._txt(b.get('p_nickname'))
        if not 2 <= len(n) <= 20: self._err('bad_nickname')
        p['nickname'] = n; return {'nickname': n}
    def _rr_profile(self, b): return self._profile(self._auth(b))
    def _rr_sync_progress2(self, b):
        p = self._auth(b)
        stars = b.get('p_stars') if isinstance(b.get('p_stars'), dict) else {}
        for w, v in stars.items():
            if w in WORLDS4 + ('h',):
                try: v = max(0, min(3, int(v or 0)))
                except (TypeError, ValueError): continue
                p['stars'][w] = max(int(p['stars'].get(w, 0)), v)
        ach = b.get('p_achievements') if isinstance(b.get('p_achievements'), list) else []
        ok = {a for a in ach if isinstance(a, str) and re.fullmatch(r'[a-z0-9_]{1,40}', a)}
        p['achievements'] = sorted(set(p['achievements']) | ok)
        pawn = b.get('p_pawn')
        if isinstance(pawn, str) and re.fullmatch(r'[a-z0-9_]{1,20}', pawn): p['pawn'] = pawn
        meta = b.get('p_meta') if isinstance(b.get('p_meta'), dict) else None
        if meta:
            m = p['meta']
            for k in ('games', 'wins'):
                try: m[k] = max(int(m.get(k) or 0), int(meta.get(k) or 0))
                except (TypeError, ValueError): pass
            for w, v in (meta.get('best') or {}).items() if isinstance(meta.get('best'), dict) else ():
                try: v = int(v)
                except (TypeError, ValueError): continue
                if v > 0 and w in WORLDS4 + ('h',): m['best'][w] = min(v, m['best'].get(w) or v)
        return self._profile(p)
    def _rr_create_group(self, b):
        p = self._auth(b); n = self._txt(b.get('p_name'))
        if not 2 <= len(n) <= 40: self._err('bad_name')
        if len(self._groups_of(p['id'])) >= 20: self._err('too_many_groups')
        if self.banned(p['id']): self._err('banned')          # = the ban guard on game.group_members (the insert of the owner)
        return self._group_out(self._new_group(p, n), p['id'])
    def _rr_join_group(self, b):
        p = self._auth(b); code = self._txt(b.get('p_code')).upper()[:32]
        t = self.now().timestamp(); fails = [x for x in self.join_fails[p['id']] if t - x < 3600]; self.join_fails[p['id']] = fails
        if self.rate_limits and len(fails) >= GROUP_LIMITS['failed_joins_per_hour']: self._err('rate_limited')
        g = next((g for g in self.G.values() if g['code'] == code), None)
        member = bool(g) and p['id'] in g['members']
        # revoked/rotated code, a closed invite, a removed member with the same code: all answer like an unknown code (no oracle)
        if not g or (not member and (not g.get('invite_open', True) or g.get('bans', {}).get(p['id']) == g['code'])):
            fails.append(t); self._err('group_not_found')
        if not member:
            if len(g['members']) >= 50: self._err('group_full')
            if self.banned(p['id']): self._err('banned')      # = the ban guard on game.group_members
            g['members'].append(p['id']); self._handle(g, p['id']); g.get('bans', {}).pop(p['id'], None)
            self._feed_add(g['id'], p['id'], 'joined', None); self._glog(g, 'joined', p['id'])
        return self._group_out(g, p['id'])
    def _rr_leave_group(self, b):
        p = self._auth(b); g = self._member_group(b, p)
        self._glog(g, 'left', p['id']); self._drop_member(g, p['id'])
        return None
    def _rr_my_groups(self, b):
        p = self._auth(b); return [self._group_out(g, p['id']) for g in self._groups_of(p['id'])]
    def _rr_group(self, b):
        p = self._auth(b); g = self._member_group(b, p)
        # v2 keys are additive: description, my_role, invite_open, member_challenges, members[].role / .handle (never a player id)
        return {'id': g['id'], 'code': g['code'], 'name': g['name'], 'is_owner': g['owner'] == p['id'],
                'description': g.get('description', ''), 'my_role': self._role(g, p['id']), 'invite_open': g.get('invite_open', True),
                'member_challenges': g.get('member_challenges', True),
                'members': [{'nickname': self.P[m]['nickname'], 'owner': m == g['owner'], 'me': m == p['id'], 'stars': self._total(self.P[m]), 'pawn': self.P[m]['pawn'],
                             'role': self._role(g, m), 'handle': self._handle(g, m)} for m in g['members']],
                'challenges': [self._chal_out(c, p['id']) for c in sorted(self.C.values(), key=lambda c: c['starts_at'], reverse=True) if c['group'] == g['id']][:20]}
    def _rr_create_challenge2(self, b):
        p = self._auth(b); g = self._member_group(b, p)
        if not g.get('member_challenges', True): self._need(g, p['id'], 'owner', 'admin')
        t = self._txt(b.get('p_title'))
        if not 2 <= len(t) <= 50: self._err('bad_title')
        w = b.get('p_world')
        if w not in WORLDS4 or w not in self.characters: self._err('bad_world')
        if b.get('p_char') not in self.characters[w]: self._err('bad_profession')
        days = self._int(b.get('p_days'), 'bad_days')
        if not 1 <= days <= 30: self._err('bad_days')
        if sum(1 for c in self.C.values() if c['group'] == g['id'] and self._active(c) and c.get('status') != 'cancelled') >= 5: self._err('too_many_challenges')
        st = self.now()
        c = {'id': str(uuid.uuid4()), 'group': g['id'], 'title': t, 'world': w, 'char': b['p_char'], 'seed': self.rng.randint(1, 2 ** 31 - 1),
             'starts_at': st, 'ends_at': st + dt.timedelta(days=days)}
        self.C[c['id']] = c; return self._chal_out(c)
    def _daily_def(self):
        if self.daily_override: return self.daily_override
        w, ci = ROTATION[self.il_date().isoweekday() - 1]; return (w, ci, 24)
    def _weekly_def(self):
        if self.weekly_override: return self.weekly_override
        w, ci = ROTATION[self.il_date().isocalendar()[1] % 7]; return (w, ci)
    def _rr_daily(self, b):
        p = self._auth(b); k = self.day_key(); w, ci, mm = self._daily_def(); r = self._mine(p['id'], daily=k)
        return {'key': k, 'world': w, 'char_index': ci, 'max_months': mm, 'ends_at': self.iso(self._il_midnight(1)), 'my_status': r and r['status'],
                'streak': p['daily_streak'], 'board': self.board(lambda x: x.get('daily') == k, p['id'])}
    def _rr_weekly(self, b):
        p = self._auth(b); k = self.week_key(); w, ci = self._weekly_def(); r = self._mine(p['id'], weekly=k)
        return {'key': k, 'world': w, 'char_index': ci, 'profession': None, 'ends_at': self.iso(self._il_midnight(8 - self.il_date().isoweekday())),
                'my_status': r and r['status'], 'board': self.board(lambda x: x.get('weekly') == k, p['id'])}
    def _bump_streak(self, p):
        today = self.il_date(); last = dt.date.fromisoformat(p['last_daily']) if p['last_daily'] else None
        if last == today: return
        p['daily_streak'] = p['daily_streak'] + 1 if last == today - dt.timedelta(days=1) else 1
        p['best_streak'] = max(p['best_streak'], p['daily_streak']); p['last_daily'] = today.isoformat()
    def _rr_begin(self, b):
        p = self._auth(b); mode = b.get('p_mode'); c = None
        if mode == 'daily':
            k = self.day_key(); kw = {'daily': k}; w, ci, mm = self._daily_def(); seed = abs(hashtext('ratrace-daily-' + k)); prof = f'idx:{ci}'
        elif mode == 'weekly':
            k = self.week_key(); kw = {'weekly': k}; w, ci = self._weekly_def(); mm = None; seed = abs(hashtext('ratrace-' + k)); prof = f'idx:{ci}'
        elif mode == 'challenge':
            c = self.C.get(b.get('p_challenge')) if isinstance(b.get('p_challenge'), str) else None
            if not c: self._err('challenge_not_found')
            if p['id'] not in self.G.get(c['group'], {}).get('members', []): self._err('not_member')
            if c.get('status') == 'cancelled': self._err('challenge_cancelled')
            kw = {'challenge': c['id']}; w, ci, mm, seed, prof = c['world'], None, None, c['seed'], c['char']
        else: self._err('bad_mode')
        r = self._latest(p['id'], c['id']) if c else self._mine(p['id'], **kw)
        if not r:
            if c: self._comp_gate(c, p['id'])
            r = {'id': str(uuid.uuid4()), 'player': p['id'], **kw, 'mode': mode, 'status': 'playing', 'seed': seed, 'world': w, 'profession': prof,
                 'char_index': ci, 'max_months': mm, 'months': None, 'net_worth': None, 'passive': None, 'expenses': None, 'stats': None,
                 'checkpoint': None, 'checkpoint_turn': 0, 'started_at': self.iso(), 'finished_at': None, 'title': c and c['title'],
                 'char': c and c['char'], 'group': c and c['group'], 'verified': None, 'verify_error': None, 'verify_attempts': 0,
                 'start_day': self.day_key(), 'start_week': self.week_key(), 'attempt': 1}
            self.R[r['id']] = r
            if mode == 'daily' and self.streak_on == 'begin': self._bump_streak(p)
        out = {'result_id': r['id'], 'status': r['status'], 'seed': r['seed'], 'world': r['world'], 'max_months': r['max_months'], 'title': r['title'],
               'group_id': r['group'], 'streak': p['daily_streak'], 'checkpoint_turn': r['checkpoint_turn'], 'checkpoint': r['checkpoint']}
        if mode == 'challenge':
            out['char'] = r['char']
            if c.get('v2'): out.update(attempt=r.get('attempt', 1), attempts=c['rules']['attempts'], rules=c.get('engine_rules'))
        else: out['char_index'] = r['char_index']
        return out

    # -------------------------------------------------- competitions (draft 20261124_competitions.sql) — extends challenges additively
    def _latest(self, pid, cid):
        rs = [r for r in self.R.values() if r['player'] == pid and r.get('challenge') == cid]
        return max(rs, key=lambda r: r.get('attempt', 1)) if rs else None
    def _comp_gate(self, c, pid):
        """Starting a NEW attempt: scheduled start, end, join policy / late join (old challenges: only the window)."""
        t = self.now()
        if c.get('status') == 'cancelled': self._err('challenge_cancelled')
        if t < c['starts_at']: self._err('not_started')
        if t >= c['ends_at']: self._err('challenge_closed')
        R = c.get('rules') or {}
        lj = R.get('late_join_until')
        if lj and t > dt.datetime.fromisoformat(lj): self._err('late_join')
        if R.get('join_policy') == 'members_before_start':
            g = self.G.get(c['group']) or {}; joined = next((x['at'] for x in g.get('log', []) if x['kind'] == 'joined' and x['actor'] == pid), None)
            if joined and dt.datetime.fromisoformat(joined) > c['starts_at']: self._err('late_join')
    @staticmethod
    def attempt_seed(seed, k): return seed if k <= 1 else (abs(hashtext(f'{seed}:{k}')) or 1)
    def _ts(self, v, code):
        if v is None: return None
        try:
            t = dt.datetime.fromisoformat(str(v).replace('Z', '+00:00'))
            return t if t.tzinfo else t.replace(tzinfo=UTC)
        except ValueError: self._err(code)
    def _rules_in(self, raw):
        r = dict(COMP_DEFAULTS)
        if raw is None: return r
        if not isinstance(raw, dict) or set(raw) - set(COMP_DEFAULTS): self._err('bad_rules')
        r.update(raw)
        ok = (isinstance(r['attempts'], int) and not isinstance(r['attempts'], bool) and 1 <= r['attempts'] <= 3 and r['metric'] in ('escape', 'networth')
              and r['tiebreak'] in ('ratio', 'networth') and r['join_policy'] in ('members', 'members_before_start')
              and isinstance(r['grace_minutes'], int) and not isinstance(r['grace_minutes'], bool) and 0 <= r['grace_minutes'] <= 360)
        if not ok: self._err('bad_rules')
        if r['late_join_until'] is not None: r['late_join_until'] = self._ts(r['late_join_until'], 'bad_rules').isoformat()
        return r
    def _comp_out(self, c, pid):
        out = self._chal_out(c, pid)
        R = c.get('rules') or COMP_DEFAULTS; t = self.now()
        status = 'cancelled' if c.get('status') == 'cancelled' else 'scheduled' if t < c['starts_at'] else 'open' if t < c['ends_at'] else 'closed'
        mine = [r for r in self.R.values() if r['player'] == pid and r.get('challenge') == c['id']]
        out.update(status=status, rules=dict(R), engine_rules=c.get('engine_rules'), engine_sha=c.get('engine_sha'), created_by_me=c.get('by') == pid,
                   cancelled_at=c.get('cancelled_at'), attempts_used=len(mine), board=self.board2(c, pid))
        return out
    def board2(self, c, me):
        """game.board2(): best attempt per player, dense shared rank by the competition metric (never time), unfinished / late /
        disqualified rows shown but not ranked."""
        R = c.get('rules') or COMP_DEFAULTS; grace = dt.timedelta(minutes=R.get('grace_minutes', 120)); closed = self.now() >= c['ends_at']
        def prog(r):
            v = (r.get('stats') or {}).get('progress')
            try: return float(v) if v is not None else ((r['passive'] or 0) / r['expenses'] if r['expenses'] else 0)
            except (TypeError, ValueError): return 0.0
        def key(r):
            won = r['status'] == 'won'; ratio = round((r['passive'] or 0) / max(1, r['expenses'] or 0), 3)
            main = (-(r['net_worth'] or 0),) if R.get('metric') == 'networth' else (0 if won else 1, (r['months'] or 0) if won else -round(prog(r), 3))
            tb = (-(r['net_worth'] or 0), -ratio) if R.get('tiebreak') == 'networth' else (-ratio, -(r['net_worth'] or 0))
            return main + tb
        def flag(r):
            if r.get('verified') is False: return 'disqualified'
            if r['status'] == 'playing': return 'unfinished' if closed else 'playing'
            fin = dt.datetime.fromisoformat(r['finished_at']) if r.get('finished_at') else None
            if fin and fin > c['ends_at'] + grace: return 'late'
            return 'ok'
        best = {}
        for r in (x for x in self.R.values() if x.get('challenge') == c['id']):
            f = flag(r); cur = best.get(r['player'])
            order = {'ok': 0, 'playing': 1, 'unfinished': 2, 'late': 3, 'disqualified': 4}
            if cur is None or (order[f], key(r) if f == 'ok' else ()) < (order[cur[1]], key(cur[0]) if cur[1] == 'ok' else ()): best[r['player']] = (r, f)
        ranked = sorted((x for x in best.values() if x[1] == 'ok'), key=lambda x: key(x[0]))
        rest = sorted((x for x in best.values() if x[1] != 'ok'), key=lambda x: ({'playing': 0, 'unfinished': 1, 'late': 2, 'disqualified': 3}[x[1]], self.P[x[0]['player']]['nickname']))
        out = []; prev = None
        for i, (r, f) in enumerate(ranked + rest):
            rank = None
            if f == 'ok':
                k = key(r); rank = out[-1]['rank'] if prev is not None and k == prev else i + 1; prev = k
            p = self.P[r['player']]
            out.append({'nickname': p['nickname'], 'status': r['status'], 'months': r['months'], 'net_worth': r['net_worth'], 'passive': r['passive'], 'expenses': r['expenses'],
                        'me': r['player'] == me, 'stars': self._total(p), 'pawn': p['pawn'], 'progress': None if r['status'] == 'playing' else round(prog(r), 3), 'verified': r.get('verified'),
                        'rank': rank, 'flag': f, 'attempt': r.get('attempt', 1),
                        'attempts': sum(1 for x in self.R.values() if x.get('challenge') == c['id'] and x['player'] == r['player'])})
        return out[:100]
    def _rr_create_competition(self, b):
        p = self._auth(b); g = self._member_group(b, p)
        if not g.get('member_challenges', True): self._need(g, p['id'], 'owner', 'admin')
        t = self._txt(b.get('p_title'))
        if not 2 <= len(t) <= 50: self._err('bad_title')
        w = b.get('p_world')
        if w not in WORLDS4 or w not in self.characters: self._err('bad_world')
        if b.get('p_char') not in self.characters[w]: self._err('bad_profession')
        now = self.now(); st = self._ts(b.get('p_starts_at'), 'bad_window') or now; en = self._ts(b.get('p_ends_at'), 'bad_window')
        if en is None or st < now - dt.timedelta(minutes=5) or en <= st + dt.timedelta(hours=1) or en - st > dt.timedelta(days=30) or st - now > dt.timedelta(days=30): self._err('bad_window')
        R = self._rules_in(b.get('p_rules'))
        if R['late_join_until'] and not st <= dt.datetime.fromisoformat(R['late_join_until']) <= en: self._err('bad_rules')
        if sum(1 for c in self.C.values() if c['group'] == g['id'] and c.get('status') != 'cancelled' and c['ends_at'] > now) >= 5: self._err('too_many_challenges')
        day = st.astimezone(IL).date().isoformat()
        c = {'id': str(uuid.uuid4()), 'group': g['id'], 'title': t, 'world': w, 'char': b['p_char'], 'seed': self.rng.randint(1, 2 ** 31 - 1),
             'starts_at': st, 'ends_at': en, 'v2': True, 'rules': R, 'status': 'scheduled', 'by': p['id'], 'created': now,
             'engine_rules': 3 if day < '2026-12-07' else 4, 'engine_sha': _engine_pin()}
        self.C[c['id']] = c; self._glog(g, 'competition', p['id'], None, {'title': t})
        return self._comp_out(c, p['id'])
    def _comp_member(self, b, p):
        c = self.C.get(b.get('p_challenge')) if isinstance(b.get('p_challenge'), str) else None
        if not c: self._err('challenge_not_found')
        g = self.G.get(c['group'])
        if not g or p['id'] not in g['members']: self._err('not_member')
        return c, g
    def _rr_competition(self, b):
        p = self._auth(b); c, _ = self._comp_member(b, p); return self._comp_out(c, p['id'])
    def _rr_cancel_competition(self, b):
        p = self._auth(b); c, g = self._comp_member(b, p)
        if c.get('by') != p['id'] and self._role(g, p['id']) not in ('owner', 'admin'): self._err('not_allowed')
        if c.get('status') == 'cancelled': self._err('already_cancelled')
        if self.now() >= c['ends_at']: self._err('challenge_closed')
        c['status'] = 'cancelled'; c['cancelled_at'] = self.iso(); self._glog(g, 'competition_cancelled', p['id'], None, {'title': c['title']})
        return self._comp_out(c, p['id'])
    def _rr_begin_attempt(self, b):
        p = self._auth(b); c, _ = self._comp_member(b, p)
        last = self._latest(p['id'], c['id']); n = (last or {}).get('attempt', 0)
        if last and last['status'] == 'playing': self._err('attempt_open')
        if n >= (c.get('rules') or COMP_DEFAULTS)['attempts']: self._err('attempts_used')
        self._comp_gate(c, p['id'])
        k = n + 1
        r = {'id': str(uuid.uuid4()), 'player': p['id'], 'challenge': c['id'], 'mode': 'challenge', 'status': 'playing', 'seed': self.attempt_seed(c['seed'], k),
             'world': c['world'], 'profession': c['char'], 'char_index': None, 'max_months': None, 'months': None, 'net_worth': None, 'passive': None, 'expenses': None,
             'stats': None, 'checkpoint': None, 'checkpoint_turn': 0, 'started_at': self.iso(), 'finished_at': None, 'title': c['title'], 'char': c['char'], 'group': c['group'],
             'verified': None, 'verify_error': None, 'verify_attempts': 0, 'start_day': self.day_key(), 'start_week': self.week_key(), 'attempt': k}
        self.R[r['id']] = r
        return {'result_id': r['id'], 'status': 'playing', 'seed': r['seed'], 'world': r['world'], 'max_months': None, 'title': c['title'], 'group_id': c['group'],
                'streak': p['daily_streak'], 'checkpoint_turn': 0, 'checkpoint': None, 'char': c['char'], 'attempt': k, 'attempts': (c.get('rules') or COMP_DEFAULTS)['attempts'],
                'rules': c.get('engine_rules')}

    # -------------------------------------------------- groups v2 RPCs
    def _group_v2_out(self, g, pid):
        return {**self._group_out(g, pid), 'description': g.get('description', ''), 'my_role': self._role(g, pid), 'invite_open': g.get('invite_open', True),
                'member_challenges': g.get('member_challenges', True)}
    def _rr_group_update(self, b):
        p = self._auth(b); g = self._member_group(b, p); self._need(g, p['id'], 'owner', 'admin')
        n = self._txt(b.get('p_name')); d = b.get('p_description')
        if not 2 <= len(n) <= 40: self._err('bad_name')
        if d is not None:
            d = self._txt(d)
            if len(d) > GROUP_LIMITS['description'] or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', d): self._err('bad_description')
            g['description'] = d
        g['name'] = n; self._glog(g, 'updated', p['id'])
        return self._group_v2_out(g, p['id'])
    def _rr_group_set_role(self, b):
        p = self._auth(b); g = self._member_group(b, p); self._need(g, p['id'], 'owner')
        tgt = self._by_handle(g, b.get('p_member')); role = b.get('p_role')
        if role not in ('admin', 'member'): self._err('bad_role')
        if tgt == g['owner']: self._err('not_allowed')
        g.setdefault('roles', {})[tgt] = role
        if role == 'member': g['roles'].pop(tgt, None)
        self._glog(g, 'role', p['id'], tgt, {'role': role}); return self._group_v2_out(g, p['id'])
    def _rr_group_transfer(self, b):
        p = self._auth(b); g = self._member_group(b, p); self._need(g, p['id'], 'owner')
        tgt = self._by_handle(g, b.get('p_member'))
        if tgt == p['id']: self._err('not_allowed')
        g['owner'] = tgt; g.setdefault('roles', {}).pop(tgt, None); g['roles'][p['id']] = 'admin'
        self._glog(g, 'owner', p['id'], tgt); return self._group_v2_out(g, p['id'])
    def _rr_group_remove(self, b):
        p = self._auth(b); g = self._member_group(b, p)
        tgt = self._by_handle(g, b.get('p_member')); me, them = self._role(g, p['id']), self._role(g, tgt)
        if tgt == p['id'] or not (me == 'owner' or (me == 'admin' and them == 'member')): self._err('not_allowed')
        g.setdefault('bans', {})[tgt] = g['code']        # blocked until the code is rotated; results stay on the boards
        self._glog(g, 'removed', p['id'], tgt); self._drop_member(g, tgt)
        return self._group_v2_out(g, p['id'])
    def _rr_group_rotate_code(self, b):
        p = self._auth(b); g = self._member_group(b, p); self._need(g, p['id'], 'owner', 'admin')
        g['code'] = self._code(); g['bans'] = {}; self._glog(g, 'code_rotated', p['id'])
        return self._group_v2_out(g, p['id'])
    def _rr_group_settings(self, b):
        p = self._auth(b); g = self._member_group(b, p); self._need(g, p['id'], 'owner', 'admin')
        for k, key in (('p_invite_open', 'invite_open'), ('p_member_challenges', 'member_challenges')):
            v = b.get(k)
            if v is None: continue
            if not isinstance(v, bool): self._err('bad_settings')
            g[key] = v
        self._glog(g, 'settings', p['id'], None, {'invite_open': g.get('invite_open', True), 'member_challenges': g.get('member_challenges', True)})
        return self._group_v2_out(g, p['id'])
    def _rr_group_history(self, b):
        p = self._auth(b); g = self._member_group(b, p)
        before = self._ts(b.get('p_before'), 'bad_before') if b.get('p_before') is not None else None
        cs = sorted((c for c in self.C.values() if c['group'] == g['id'] and (before is None or c.get('created', c['starts_at']) < before)),
                    key=lambda c: c.get('created', c['starts_at']), reverse=True)[:GROUP_LIMITS['history_page']]
        nick = lambda pid: self.P[pid]['nickname'] if pid in self.P else None
        log = [{'kind': x['kind'], 'actor': nick(x['actor']), 'target': nick(x['target']) if x.get('target') else None, 'data': x.get('data'), 'at': x['at']}
               for x in reversed(g.get('log', [])) if before is None or dt.datetime.fromisoformat(x['at']) < before][:50]
        return {'challenges': [self._comp_out(c, p['id']) if c.get('v2') else self._chal_out(c, p['id']) for c in cs], 'log': log,
                'next_before': self.iso(cs[-1].get('created', cs[-1]['starts_at'])) if len(cs) == GROUP_LIMITS['history_page'] else None}

    # -------------------------------------------------- live rooms (rr_room_* SQL draft + Edge `room`) → tests/fakeroom.mjs
    def _room_side(self):
        if self._rooms is None:
            self._rooms = _Sidecar('fakeroom.mjs')
            if self._room_state: self._rooms.ask({'op': 'load', 'args': self._room_state}, 60); self._room_state = None
        return self._rooms
    def _room_ask(self, op, p, args):
        who = {'id': p['id'], 'nickname': p['nickname'], 'pawn': p['pawn']}
        m = self._room_side().ask({'op': op, 'player': who, 'groups': [g['id'] for g in self._groups_of(p['id'])], 'args': args,
                                   'now': int(self.now().timestamp() * 1000), 'banned': self.banned(p['id']),
                                   'banned_ids': [k for k in self.bans if self.banned(k)]}, 60)
        return m['status'], m['body']
    def _room_rpc(self, fn, b):
        p = self._auth(b); op = ROOM_RPC[fn]
        args = {k[2:]: v for k, v in b.items() if k not in AUTH}
        if op == 'create': args = {'settings': b.get('p_settings') if b.get('p_settings') is not None else {}, 'group': b.get('p_group')}
        st, out = self._room_ask(op, p, args)
        if st != 200: raise FakeError(out.get('error', 'server_error'), self.raise_status)   # PL/pgSQL: raise exception '<code>' → 400 P0001
        if isinstance(out, dict): out.pop('ok', None)
        return out
    def room_fn(self, body, raw_len=None):
        """POST /functions/v1/room (Edge Function `room`): → (status, json)."""
        self.calls['room'] += 1; self.requests.append(('room', body))
        if raw_len is not None and raw_len > ROOM_MAX_BODY: return 413, {'ok': False, 'error': 'too_big'}
        if not isinstance(body, dict): return 400, {'ok': False, 'error': 'bad_json'}
        pid = body.get('id'); sec = body.get('secret')
        with self.lock:
            p = self.P.get(pid) if isinstance(pid, str) and UUID_RE.match(pid) else None
            if not p or not isinstance(sec, str) or p['secret'] != sec: return 401, {'ok': False, 'error': 'unauthorized'}
            op = body.get('op')
            if op not in ('start', 'act', 'tick'): return 400, {'ok': False, 'error': 'bad_op'}
            room = body.get('room')
            if not isinstance(room, str) or not UUID_RE.match(room): return 403, {'ok': False, 'error': 'not_in_room'}
            args = {'room': room}
            if op == 'act': args['intent'] = {k: body.get(k) for k in ('action_id', 'state_version', 'code', 'args', 'engine') if k in body}
            self.log.append((round(time.time(), 3), 'room', {'op': op, 'room': room, 'code': body.get('code')}, None))
            try: return self._room_ask(op, p, args)
            except (TimeoutError, queue.Empty): return 503, {'ok': False, 'error': 'engine_unavailable'}
    def set_room_pin(self, sha=None):
        """test-only: the engine pin of the fake's room server (None = the real pin) — simulates a deploy that changes it (S1)."""
        return self._room_side().ask({'op': 'pin', 'player': {}, 'args': {'sha': sha}}, 60)['body']
    def rooms_dump(self):
        return self._rooms.ask({'op': 'dump', 'player': {}, 'args': {}}, 60)['body'] if self._rooms else self._room_state

    def _own_result(self, b, p):
        r = self.R.get(b.get('p_result')) if isinstance(b.get('p_result'), str) else None
        if not r or r['player'] != p['id']: self._err('result_not_found')
        return r
    def _rr_checkpoint(self, b):
        p = self._auth(b); r = self._own_result(b, p)
        if r['status'] != 'playing': self._err('already_finished')
        turn = self._int(b.get('p_turn'), 'stale_checkpoint')
        if turn < r['checkpoint_turn'] or (self.stale_on_equal and turn == r['checkpoint_turn'] and r['checkpoint'] is not None): self._err('stale_checkpoint')
        if len(json.dumps(b.get('p_state'), ensure_ascii=False, separators=(', ', ': '))) > 300000: self._err('state_too_big')
        r['checkpoint'], r['checkpoint_turn'] = b.get('p_state'), turn
        return None
    def _rr_finish(self, b):
        p = self._auth(b); r = self._own_result(b, p)
        if r['status'] != 'playing': self._err('already_finished')
        st = b.get('p_stats') if isinstance(b.get('p_stats'), dict) else {}
        if len(json.dumps(st, ensure_ascii=False, separators=(', ', ': '))) >= 16384: st = {}
        status = b.get('p_status') if b.get('p_status') in ('won', 'lost') else 'lost'
        months = max(1, min(200, self._int(b.get('p_months'), 'bad_months')))
        r.update(status=status, months=months, passive=self._int(b.get('p_passive'), 'bad_passive'), expenses=max(0, self._int(b.get('p_expenses'), 'bad_expenses')),
                 net_worth=self._int(b.get('p_net_worth'), 'bad_net_worth'), stats=st, finished_at=self.iso())
        if r['mode'] == 'daily' and self.streak_on == 'finish': self._bump_streak(p)
        data = {'title': r['title'], 'mode': r['mode'], 'months': months, 'stars': st.get('stars'), 'progress': st.get('progress')}
        if r.get('group'): self._feed_add(r['group'], p['id'], 'ranked_' + status, data)
        elif self.ranked_feed == 'all':
            for g in self._groups_of(p['id']): self._feed_add(g['id'], p['id'], 'ranked_' + status, data)
        return None
    def _rr_send_energy(self, b):
        p = self._auth(b); g = self._member_group(b, p); n = self._txt(b.get('p_nickname'))
        to = next((self.P[m] for m in g['members'] if self.P[m]['nickname'] == n and m != p['id']), None)
        if not to: self._err('player_not_found')
        today = self.day_key()
        if any(x for x in self.gifts if x['kind'] == 'gift' and x['from'] == p['id'] and x['to'] == to['id'] and x['day'] == today): self._err('already_sent_today')
        self.gifts.append({'from': p['id'], 'to': to['id'], 'kind': 'gift', 'amount': 3, 'day': today, 'group': g['id'], 'claimed': False})
        self._feed_add(g['id'], p['id'], 'gift', {'to': to['nickname'], 'amount': 3})
        return None
    def _rr_claim_energy(self, b):
        p = self._auth(b); mine = [x for x in self.gifts if x['to'] == p['id'] and not x['claimed']]
        for x in mine: x['claimed'] = True
        return {'total': sum(x['amount'] for x in mine), 'from': [{'nickname': self.P[x['from']]['nickname'], 'kind': x['kind'], 'amount': x['amount']} for x in mine]}
    # ---- owner (admin) — supabase/migrations/20261123_admin.sql
    def _rr_admin_status(self, b):
        p = self._auth(b); return {'admin': p['id'] in self.admins}
    def _rr_admin_claim(self, b):
        p = self._auth(b)
        if p['id'] in self.admins: return {'admin': True}
        code = str(b.get('p_code') or '').strip().upper()
        if self.admin_used or self.admins or code != self.admin_code: self._err('bad_code')
        self.admin_used = True; self.admins.add(p['id']); self._mod(p['id'], 'claim', p['id']); return {'admin': True}
    def _rr_admin_players(self, b):
        p = self._auth(b)
        if p['id'] not in self.admins: self._err('not_admin')
        q = str(b.get('p_q') or '').replace('%', '').replace('_', '').lower()
        rows = [x for x in self.P.values() if not q or q in x['nickname'].lower()]
        rows.sort(key=lambda x: x.get('created') or '', reverse=True)
        return [{'id': x['id'], 'nickname': x['nickname'], 'stars': self._total(x), 'joined': (x.get('created') or '')[:10]} for x in rows[:60]]
    def _rr_admin_give(self, b):
        p = self._auth(b)
        if p['id'] not in self.admins: self._err('not_admin')
        n = b.get('p_amount')
        if not isinstance(n, int) or not 1 <= n <= 99: self._err('bad_amount')
        to = self.P.get(b.get('p_to'))
        if not to: self._err('player_not_found')
        self.gifts.append({'from': p['id'], 'to': to['id'], 'kind': 'admin', 'amount': n, 'day': self.day_key(), 'group': None, 'claimed': False})
        self._mod(p['id'], 'give', to['id'], data={'amount': n})
        return {'ok': True}
    # ---- moderation + in-room chat — draft supabase/migrations/20261126_admin_mod_chat.sql (rooms / chat live in tests/fakeroom.mjs)
    def banned(self, pid):
        b = self.bans.get(pid); return bool(b) and (b['until'] is None or b['until'] > self.now())
    def ban(self, pid, reason='טסט', days=None, by=None):
        """test helper: ban a player directly (like an admin would)."""
        self.bans[pid] = {'reason': reason, 'by': by, 'until': None if days is None else self.now() + dt.timedelta(days=days), 'at': self.now()}
    def _mod(self, admin, action, target=None, room=None, group=None, msg=None, data=None):
        self.mod_log.append({'id': len(self.mod_log) + 1, 'admin': admin, 'action': action, 'target': target, 'room': room, 'group': group, 'msg': msg,
                             'data': data or {}, 'at': self.now()})
    def _ms(self, t): return int(t.timestamp() * 1000) if t else None
    def _admin(self, b):
        p = self._auth(b)
        if p['id'] not in self.admins: self._err('not_admin')
        return p
    def _side_ok(self, op, p, args):
        st, out = self._room_ask(op, p, args)
        if st != 200: raise FakeError(out.get('error', 'server_error'), self.raise_status)
        if isinstance(out, dict): out.pop('ok', None)
        return out
    def _rr_ban_status(self, b):
        p = self._auth(b); x = self.bans.get(p['id']) if self.banned(p['id']) else None
        return {'banned': bool(x), 'until': self._ms(x['until']) if x else None, 'permanent': bool(x) and x['until'] is None}
    def _rr_room_chat_send(self, b):
        p = self._auth(b); return self._side_ok('chat_send', p, {'room': b.get('p_room'), 'text': b.get('p_text')})
    def _rr_room_chat_list(self, b):
        p = self._auth(b); since = b.get('p_since')
        return self._side_ok('chat_list', p, {'room': b.get('p_room'), 'since': since if isinstance(since, int) and not isinstance(since, bool) else None})
    def _rr_room_chat_report(self, b):
        p = self._auth(b); return self._side_ok('chat_report', p, {'msg': b.get('p_msg')})
    def _rr_admin_ban(self, b):
        p = self._admin(b); t = b.get('p_target')
        if t == p['id']: self._err('cannot_ban_self')
        if t not in self.P: self._err('player_not_found')
        if t in self.admins: self._err('cannot_ban_self')
        reason = str(b.get('p_reason') or '').strip(' ')
        if not 2 <= len(reason) <= 200 or re.search(r'[\x01-\x1f\x7f]', reason): self._err('bad_reason')
        days = b.get('p_days')
        if days is not None and (not isinstance(days, int) or isinstance(days, bool) or not 1 <= days <= 3650): self._err('bad_days')
        self.ban(t, reason, days, by=p['id'])
        n = self._side_ok('ban_sweep', p, {'target': t})['rooms']
        ng = 0
        for g in sorted([g for g in self.G.values() if t in g['members']], key=lambda g: g['id']):   # = SQL: out of every group too
            g.setdefault('bans', {})[t] = g['code']; self._glog(g, 'removed', p['id'], t, {'by': 'ban'}); self._drop_member(g, t); ng += 1
        self._mod(p['id'], 'ban', t, data={'reason': reason, 'days': days, 'rooms': n, 'groups': ng})
        return {'banned': True, 'until': self._ms(self.bans[t]['until']), 'rooms': n, 'groups': ng}
    def _rr_admin_unban(self, b):
        p = self._admin(b); t = b.get('p_target')
        if t not in self.bans: self._err('not_banned')
        del self.bans[t]; self._mod(p['id'], 'unban', t); return {'banned': False}
    def _rr_admin_bans(self, b):
        self._admin(b)
        rows = sorted(((k, v) for k, v in self.bans.items() if self.banned(k)), key=lambda kv: kv[1]['at'], reverse=True)[:100]
        return [{'player_id': k, 'nickname': self.P[k]['nickname'], 'reason': v['reason'], 'until': self._ms(v['until']), 'at': self._ms(v['at']),
                 'by': self.P[v['by']]['nickname'] if v.get('by') in self.P else None} for k, v in rows]
    def _rr_admin_player(self, b):
        p = self._admin(b); t = self.P.get(b.get('p_target')) if isinstance(b.get('p_target'), str) else None
        if not t: self._err('player_not_found')
        x = self.bans.get(t['id']) if self.banned(t['id']) else None
        info = self._side_ok('player_info', p, {'target': t['id']})
        return {'id': t['id'], 'nickname': t['nickname'], 'stars': self._total(t), 'joined': (t.get('created') or '')[:10], 'admin': t['id'] in self.admins,
                'ban': {'reason': x['reason'], 'until': self._ms(x['until']), 'at': self._ms(x['at'])} if x else None,
                'groups': sorted(({'id': g['id'], 'name': g['name'], 'owner': g['owner'] == t['id'], 'members': len(g['members'])} for g in self._groups_of(t['id'])), key=lambda g: g['name']),
                'rooms': info['rooms'], 'blocked_24h': info['blocked_24h'], 'reported_24h': info['reported_24h']}
    def _rr_admin_rooms(self, b):
        p = self._admin(b); return self._side_ok('admin_rooms', p, {})
    def _rr_admin_room_chat(self, b):
        p = self._admin(b); return self._side_ok('admin_room_chat', p, {'room': b.get('p_room')})
    def _rr_admin_kick_room(self, b):
        p = self._admin(b); t = b.get('p_target')
        if t == p['id']: self._err('cannot_kick_self')
        out = self._side_ok('admin_kick', p, {'room': b.get('p_room'), 'target': t})
        self._mod(p['id'], 'kick_room', t, room=b.get('p_room'), data={'result': out['result'], 'code': out.pop('code')})
        return out
    def _rr_admin_close_room(self, b):
        p = self._admin(b); out = self._side_ok('admin_close', p, {'room': b.get('p_room')})
        self._mod(p['id'], 'close_room', room=b.get('p_room'), data={'code': out.pop('code'), 'was': out.pop('was')})
        return out
    def _rr_admin_remove_from_group(self, b):
        p = self._admin(b); g = self.G.get(b.get('p_group')) if isinstance(b.get('p_group'), str) else None
        if not g: self._err('group_not_found')
        t = b.get('p_target')
        if t not in g['members']: self._err('member_not_found')
        name = g['name']; g.setdefault('bans', {})[t] = g['code']; self._glog(g, 'removed', p['id'], t, {'by': 'admin'}); self._drop_member(g, t)
        gone = g['id'] not in self.G
        self._mod(p['id'], 'remove_group', t, group=g['id'], data={'name': name, 'group_deleted': gone})
        return {'removed': True, 'group_deleted': gone}
    def _rr_admin_delete_chat(self, b):
        p = self._admin(b); out = self._side_ok('admin_hide', p, {'msg': b.get('p_msg')})
        if out.get('changed'): self._mod(p['id'], 'hide_chat', out['sender'], room=out['room'], msg=b.get('p_msg'))
        return {'hidden': True}
    def _rr_admin_reports(self, b):
        p = self._admin(b); return self._side_ok('admin_reports', p, {})
    def _rr_admin_mod_log(self, b):
        self._admin(b); before = b.get('p_before')
        rows = [x for x in reversed(self.mod_log) if before is None or x['id'] < before][:50]
        nick = lambda k: self.P[k]['nickname'] if k in self.P else None
        return {'log': [{'id': x['id'], 'action': x['action'], 'admin': nick(x['admin']), 'target_id': x['target'], 'target': nick(x['target']), 'room_id': x['room'],
                         'group_id': x['group'], 'msg_id': x['msg'], 'data': x['data'], 'at': self._ms(x['at'])} for x in rows],
                'next_before': rows[-1]['id'] if len(rows) == 50 else None}
    def _rr_log_event(self, b):
        p = self._auth(b); kind = b.get('p_kind')
        if not isinstance(kind, str) or not self.kind_re.fullmatch(kind): self._err('bad_kind')
        data = b.get('p_data') if b.get('p_data') is not None else {}
        if len(json.dumps(data, ensure_ascii=False, separators=(', ', ': '))) >= 2048: self._err('bad_data')   # [ASSUMED] code; production rejects oversized data (QA§1.3)
        k = (p['id'], self.day_key())
        if self.rate_limits and self.events_today[k] >= 50: self._err('rate_limited')
        self.events_today[k] += 1
        for g in self._groups_of(p['id']): self._feed_add(g['id'], p['id'], kind, data)
        return None
    def _rr_group_feed(self, b):
        p = self._auth(b); g = self._member_group(b, p); today = self.day_key()
        rows = [f for f in reversed(self.feed) if f['group'] == g['id']][:50]
        gifted = sorted({self.P[x['to']]['nickname'] for x in self.gifts if x['kind'] == 'gift' and x['from'] == p['id'] and x['group'] == g['id'] and x['day'] == today})
        return {'feed': [{'nickname': self.P[f['player']]['nickname'], 'kind': f['kind'], 'data': f['data'], 'at': f['at'], 'me': f['player'] == p['id']} for f in rows],
                'gifted_today': gifted}

    # -------------------------------------------------- verify-result (index.ts order)
    def verify(self, body, raw_len=None):
        """→ (status, json) like the Edge Function."""
        self.calls['verify'] += 1; self.requests.append(('verify', body))
        if raw_len is not None and raw_len > MAX_BODY: return 413, {'ok': False, 'error': 'too_big'}
        if self.verify_mode == 'scripted':
            with self.lock:
                self.log.append((round(time.time(), 3), 'verify', {k: v for k, v in (body or {}).items() if k not in ('secret', 'actions')}, 'scripted'))
                return self.verify_queue.pop(0) if self.verify_queue else (200, {'ok': True, 'verified': True, 'stored': False, 'result': {}})
        try:
            with self.lock:
                r, actions = self._verify_pre(body)
                if isinstance(r, tuple): return r
                if self.verify_mode == 'accept':
                    res = {'status': r['status'], 'months': r['months'], 'passive': r['passive'], 'expenses': r['expenses'], 'netWorth': r['net_worth'],
                           'stars': (r['stats'] or {}).get('stars') or 0, 'progress': (r['stats'] or {}).get('progress')}
                    r.update(verified=True, verify_attempts=r['verify_attempts'] + 1); return 200, {'ok': True, 'verified': True, 'stored': True, 'result': res}
                row = self._verify_row(r)
            if self._side is None:
                with self.lock:
                    if self._side is None: self._side = _Sidecar()
            try: out = self._side.call(row, actions)
            except (TimeoutError, queue.Empty): return 503, {'ok': False, 'error': 'engine_unavailable'}
            with self.lock:
                if out.get('status'): return out['status'], {'ok': False, 'error': out.get('error')}
                r['verify_attempts'] += 1
                if out['ok']:
                    res = out['result']
                    r.update(status=res['status'], months=res['months'], passive=res['passive'], expenses=res['expenses'], net_worth=res['netWorth'], verified=True, verify_error=None)
                    r['stats'] = {**(r['stats'] or {}), 'progress': res.get('progress'), 'stars': res.get('stars')}
                    return 200, {'ok': True, 'verified': True, 'stored': True, 'result': res}
                r.update(verified=False, verify_error=str(out.get('error'))[:500])
                return 200, {'ok': True, 'verified': False, 'stored': True, 'error': str(out.get('error')).split(':')[0], 'detail': out.get('error'), 'result': out.get('result')}
        except FakeError as e:
            return e.status or 400, {'ok': False, 'error': e.code}
    def _verify_pre(self, body):
        if not isinstance(body, dict): raise FakeError('bad_request', 400)
        pid = body.get('id', body.get('p_id')); sec = body.get('secret', body.get('p_secret')); rid = body.get('result_id', body.get('resultId'))
        if not isinstance(pid, str) or not UUID_RE.match(pid): raise FakeError('unauthorized', 401)
        if not isinstance(sec, str) or not 8 <= len(sec) <= 200: raise FakeError('unauthorized', 401)
        if not isinstance(rid, str) or not UUID_RE.match(rid): raise FakeError('result_not_found', 404)
        actions = body.get('actions')
        if actions is not None: self._validate_actions(actions)
        p = self.P.get(pid)
        if not p or p['secret'] != sec: raise FakeError('unauthorized', 401)
        if self.rate_limits:
            t = self.now().timestamp(); hits = [x for x in self.verify_hits[pid] if t - x < 60]
            if len(hits) >= 10: raise FakeError('rate_limited', 429)
            hits.append(t); self.verify_hits[pid] = hits
        r = self.R.get(rid)
        if not r or r['player'] != pid: raise FakeError('result_not_found', 404)
        if r['status'] == 'playing': raise FakeError('not_finished', 409)
        if r['verified'] is True:
            st = r['stats'] or {}
            return (200, {'ok': True, 'verified': True, 'already': True, 'stored': True, 'result': {'status': r['status'], 'months': r['months'], 'passive': r['passive'],
                    'expenses': r['expenses'], 'netWorth': r['net_worth'], 'stars': st.get('stars'), 'progress': st.get('progress')}}), None
        if r['verify_attempts'] >= 5: raise FakeError('rate_limited', 429)
        if actions is None:
            sa = (r['stats'] or {}).get('actions')
            actions = sa if isinstance(sa, list) else None
        if not actions: raise FakeError('no_actions', 422)
        return r, actions
    @staticmethod
    def _validate_actions(a):
        if not isinstance(a, list) or not 0 < len(a) <= MAX_ACTIONS: raise FakeError('bad_actions', 400)
        for x in a:
            if not isinstance(x, list) or not 1 <= len(x) <= 3 or x[0] not in VERIFY_CODES: raise FakeError('bad_actions', 400)
            for v in x[1:]:
                if v is None or isinstance(v, bool): continue
                if isinstance(v, (int, float)):
                    if v != v or v in (float('inf'), float('-inf')): raise FakeError('bad_actions', 400)
                elif not isinstance(v, str) or len(v) > 40: raise FakeError('bad_actions', 400)
    def _verify_row(self, r):
        st = r['stats'] or {}
        row = {'mode': r['mode'], 'world': r['world'], 'profession': r['profession'], 'seed': str(r['seed']), 'max_months': r['max_months'],
               'status': r['status'], 'months': r['months'], 'passive': r['passive'], 'expenses': r['expenses'], 'net_worth': r['net_worth'],
               'claim_stars': st.get('stars'), 'claim_progress': st.get('progress')}
        # rules era (verify_core rulesFor, RULES4_FROM): the same date fields index.ts ROW selects —
        # daily_key; weekly_start = Monday of the ISO week (to_date(weekly_key,'IYYY-"W"IW')); challenge_day = created_at (UTC date)
        if r['mode'] == 'daily': row['daily_key'] = r['daily']
        elif r['mode'] == 'weekly':
            y, w = r['weekly'].split('-W'); row['weekly_start'] = dt.date.fromisocalendar(int(y), int(w), 1).isoformat()
        else:
            c = self.C.get(r['challenge']); row['challenge_day'] = (c['starts_at'] if c else self.now()).astimezone(UTC).date().isoformat()
        return row

    # -------------------------------------------------- dump / load
    def dump(self, path):
        def enc(o):
            if isinstance(o, dt.datetime): return {'__dt': o.isoformat()}
            raise TypeError(type(o))
        d = {k: getattr(self, k) for k in ('P', 'G', 'C', 'R', 'feed', 'gifts', 'bans', 'mod_log')}
        d['admins'] = sorted(self.admins)
        d['events_today'] = [[list(k), v] for k, v in self.events_today.items()]
        d['offset_s'] = self._offset.total_seconds(); d['meta'] = self.meta; d['rooms'] = self.rooms_dump()
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f: json.dump(d, f, ensure_ascii=False, default=enc)
    @classmethod
    def load(cls, path, **kw):
        fb = cls(**kw)
        with open(path, encoding='utf-8') as f:
            d = json.load(f, object_hook=lambda o: dt.datetime.fromisoformat(o['__dt']) if set(o) == {'__dt'} else o)
        for k in ('P', 'G', 'C', 'R', 'feed', 'gifts', 'bans', 'mod_log'): setattr(fb, k, d.get(k, getattr(fb, k)))
        fb.admins = set(d.get('admins') or [])
        fb.events_today = collections.Counter({tuple(k): v for k, v in d.get('events_today', [])})
        fb._offset = dt.timedelta(seconds=d.get('offset_s', 0)); fb.meta = d.get('meta') or {}; fb._room_state = d.get('rooms')
        return fb
    def close(self):
        if self._side: self._side.close(); self._side = None
        if self._rooms: self._rooms.close(); self._rooms = None

# ---------------------------------------------------------------- guard-only sink (suites with no backend use)
class GuardOnly:
    def __init__(self): self.blocked = []; self.unexpected = []; self.calls = collections.Counter()

def clock_at(iso):
    """A ticking clock that starts at `iso` (UTC) and advances with real time — for FakeBackend(now=…) in ranked suites that
    must sit in a given rules era (verify_core RULES4_FROM) while minute windows (rate limits) still pass."""
    base = dt.datetime.fromisoformat(iso.replace('Z', '+00:00')); t0 = time.time()
    return lambda: base + dt.timedelta(seconds=time.time() - t0)

def new_context_kwargs(): return {'service_workers': 'block'}

def _host(url):
    m = re.match(r'^[a-z]+://([^/:?#]+)', url or '', re.I); return (m.group(1) if m else '').lower()

async def install(ctx, fb, *, fonts='stub', live=None):
    """Register guard → fonts → RPC → verify (Playwright runs the most recently registered matching route first).
    fb=None → guard (+fonts) only; returns the object whose .blocked/.unexpected assert_clean() checks."""
    sink = fb if fb is not None else GuardOnly()
    async def guard(route):
        sink.blocked.append(route.request.url)
        try: await route.abort('blockedbyclient')
        except Exception: pass  # noqa: BLE001
    await ctx.route(re.compile(r'^https?://[^/]*\.supabase\.co(/.*)?$'), guard)
    if fonts == 'stub':
        await ctx.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=''))
        await ctx.route('**/fonts.gstatic.com/**', lambda r: r.fulfill(status=404, body=''))
    elif fonts == 'abort':
        await ctx.route('**/fonts.googleapis.com/**', lambda r: r.abort()); await ctx.route('**/fonts.gstatic.com/**', lambda r: r.abort())
    if live:
        url, anon = live
        async def relay(route):   # production host → staging host, same path; the production host itself is never contacted
            req = route.request; new = url.rstrip('/') + req.url[len(SB_PROD):]
            await route.continue_(url=new, headers={**req.headers, 'apikey': anon})
        await ctx.route(SB_PROD + '/**', relay)
    elif fb is not None:
        import asyncio
        async def rpc(route):
            req = route.request
            if req.method == 'OPTIONS': return await route.fulfill(status=204, headers=CORS)
            fn = req.url.split('/rest/v1/rpc/', 1)[1].split('?')[0]
            if fb.take_network_failure(fn): return await route.abort('internetdisconnected')
            try: body = json.loads(req.post_data or '{}')
            except ValueError: body = {}
            st, out = fb.handle(fn, body)
            await route.fulfill(status=st, content_type='application/json', body=json.dumps(out, ensure_ascii=False), headers=CORS)
        async def verify(route):
            req = route.request
            if req.method == 'OPTIONS': return await route.fulfill(status=204, headers=CORS)
            if fb.take_network_failure('verify'): return await route.abort('internetdisconnected')
            raw = req.post_data or ''
            try: body = json.loads(raw)
            except ValueError: return await route.fulfill(status=400, content_type='application/json', body='{"ok":false,"error":"bad_json"}', headers=CORS)
            st, out = await asyncio.to_thread(fb.verify, body, len(raw))
            await route.fulfill(status=st, content_type='application/json', body=json.dumps(out, ensure_ascii=False), headers=CORS)
        async def room(route):
            req = route.request
            if req.method == 'OPTIONS': return await route.fulfill(status=204, headers=CORS)
            if fb.take_network_failure('room'): return await route.abort('internetdisconnected')
            raw = req.post_data or ''
            try: body = json.loads(raw)
            except ValueError: return await route.fulfill(status=400, content_type='application/json', body='{"ok":false,"error":"bad_json"}', headers=CORS)
            st, out = await asyncio.to_thread(fb.room_fn, body, len(raw.encode('utf-8')))
            await route.fulfill(status=st, content_type='application/json', body=json.dumps(out, ensure_ascii=False), headers=CORS)
        await ctx.route(SB_PROD + '/rest/v1/rpc/**', rpc)
        await ctx.route(SB_PROD + '/functions/v1/verify-result', verify)
        await ctx.route(SB_PROD + '/functions/v1/room', room)
    async def finished(req):   # a supabase request that got a response from a real server (not route.fulfill) = left the machine
        if not _host(req.url).endswith('.supabase.co'): return
        try:
            resp = await req.response()
            addr = await resp.server_addr() if resp else None
        except Exception: addr = None  # noqa: BLE001
        if addr and not live: sink.blocked.append('UNROUTED ' + req.url)
        if addr and live and _host(req.url).startswith(PROD_REF + '.'): sink.blocked.append('PRODUCTION ' + req.url)
    ctx.on('requestfinished', finished)
    if hasattr(ctx, 'route_web_socket'):
        async def ws(w):
            sink.blocked.append('WS ' + w.url)
            try: await w.close()
            except Exception: pass  # noqa: BLE001
        try: await ctx.route_web_socket(re.compile(r'^wss?://[^/]*\.supabase\.co/.*'), ws)
        except Exception: pass  # noqa: BLE001
    return sink

def mode_from_argv(argv=None):
    """'offline' (default) or 'live'. Exits 2 (before any browser starts) on an unsafe --live."""
    argv = sys.argv if argv is None else argv
    if '--live' not in argv:
        return 'offline'
    url = os.environ.get('RR_SB_URL', ''); m = re.fullmatch(r'https://([a-z0-9]{8,40})\.supabase\.co/?', url)
    why = None
    if os.environ.get('RR_LIVE') != '1': why = 'RR_LIVE=1 is not set'
    elif not m: why = 'RR_SB_URL must be https://<ref>.supabase.co of a STAGING project'
    elif m.group(1) == PROD_REF: why = 'RR_SB_URL points at the PRODUCTION project — refused'
    elif not os.environ.get('RR_SB_ANON'): why = 'RR_SB_ANON (the staging anon key) is not set'
    if why:
        print(f'REFUSED --live: {why}. Live runs need a staging schema (CR-22); default runs are offline.', file=sys.stderr, flush=True)
        sys.exit(2)
    return 'live'

async def install_mode(ctx, fb, mode, **kw):
    """offline → install(ctx, fb); live → the staging relay (fb unused). Returns the sink for assert_clean()."""
    if mode == 'live': return await install(ctx, None, live=live_target(), **kw)
    return await install(ctx, fb, **kw)

def base_url(default, argv=None):
    """First positional (non --flag) argument, else default."""
    a = [x for x in (sys.argv[1:] if argv is None else argv) if not x.startswith('--')]
    return a[0] if a else default

def live_target(): return (os.environ['RR_SB_URL'].rstrip('/'), os.environ['RR_SB_ANON'])

def chrome_args(mode, base_args):
    # NB: host-resolver rules do NOT apply to proxied requests (the proxy resolves the name), so offline mode also forces
    # --no-proxy-server. Observed 2026-11-21: without it, an unintercepted fetch to the production host was answered (401).
    rule = 'MAP *.supabase.co ~NOTFOUND' if mode == 'offline' else f'MAP {PROD_REF}.supabase.co ~NOTFOUND'
    base_args = list(base_args) + (['--no-proxy-server'] if mode == 'offline' and '--no-proxy-server' not in base_args else [])
    out = []; merged = False
    for a in base_args:
        if a.startswith('--host-resolver-rules='):
            out.append(a.rstrip('"') + ' , ' + rule); merged = True
        else: out.append(a)
    if not merged: out.append('--host-resolver-rules=' + rule)
    return out

def assert_clean(fb, allow_unexpected=()):
    blocked = list(getattr(fb, 'blocked', []))
    unexpected = [u for u in getattr(fb, 'unexpected', []) if not any(a in str(u) for a in allow_unexpected)]
    if blocked or unexpected:
        msg = ['fake backend NOT clean:']
        msg += ['  blocked (a request tried to reach *.supabase.co outside the fake): ' + b for b in blocked[:20]]
        msg += ['  unexpected (call the fake does not model): ' + repr(u) for u in unexpected[:20]]
        raise AssertionError('\n'.join(msg))

def banner(mode, verify='n/a'):
    print(f'backend={"fake" if mode == "offline" else "live-staging"} verify={verify}', flush=True)

# ---------------------------------------------------------------- HTTP mode (contract test target; never the page's path)
def serve(port, fb):
    from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def _send(self, st, obj):
            data = json.dumps(obj, ensure_ascii=False).encode() if obj is not None or st != 204 else b''
            self.send_response(st)
            for k, v in CORS.items(): self.send_header(k, v)
            if st != 204: self.send_header('content-type', 'application/json')
            self.send_header('content-length', str(len(data))); self.end_headers(); self.wfile.write(data)
        def do_OPTIONS(self): self._send(204, None)
        def do_GET(self):
            if self.path.startswith('/__fake/health'): return self._send(200, {'ok': True, 'fake': True})
            self._send(404, {'code': 'PGRST205', 'message': 'not found'})
        def do_POST(self):
            n = int(self.headers.get('content-length') or 0); raw = self.rfile.read(n).decode('utf-8', 'replace')
            if self.path.startswith('/rest/v1/rpc/'):
                fn = self.path.split('/rest/v1/rpc/', 1)[1].split('?')[0]
                try: body = json.loads(raw or '{}')
                except ValueError: return self._send(400, {'code': 'PGRST102', 'message': 'bad json'})
                return self._send(*fb.handle(fn, body))
            if self.path.startswith('/functions/v1/verify-result'):
                if len(raw) > MAX_BODY: return self._send(413, {'ok': False, 'error': 'too_big'})
                try: body = json.loads(raw)
                except ValueError: return self._send(400, {'ok': False, 'error': 'bad_json'})
                return self._send(*fb.verify(body, len(raw)))
            if self.path.startswith('/functions/v1/room'):
                if len(raw.encode('utf-8')) > ROOM_MAX_BODY: return self._send(413, {'ok': False, 'error': 'too_big'})
                try: body = json.loads(raw)
                except ValueError: return self._send(400, {'ok': False, 'error': 'bad_json'})
                return self._send(*fb.room_fn(body, len(raw.encode('utf-8'))))
            if self.path.startswith('/__fake/pin'):         # test-only: change the room server's engine pin (S1)
                b = json.loads(raw or '{}'); return self._send(200, fb.set_room_pin(b.get('sha')))
            if self.path.startswith('/__fake/advance'):     # test-only clock control (HTTP mode only)
                b = json.loads(raw or '{}'); fb.advance(days=b.get('days', 0), hours=b.get('hours', 0), minutes=b.get('minutes', 0)); fb._offset += dt.timedelta(seconds=b.get('seconds', 0))
                return self._send(200, {'now': fb.iso()})
            self._send(404, {'code': 'PGRST205', 'message': 'not found'})
    srv = ThreadingHTTPServer(('127.0.0.1', port), H)
    print(f'fakebackend serving on http://127.0.0.1:{port} verify={fb.verify_mode}', flush=True)
    try: srv.serve_forever()
    except KeyboardInterrupt: pass
    finally: fb.close()

if __name__ == '__main__':
    opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
    if '--serve' in sys.argv:
        i = sys.argv.index('--serve'); port = int(sys.argv[i + 1]) if i + 1 < len(sys.argv) and sys.argv[i + 1].isdigit() else 8779
        fb = FakeBackend.load(opt['state'], verify=opt.get('verify', 'replay')) if opt.get('state') else FakeBackend(verify=opt.get('verify', 'replay'))
        serve(port, fb)
    elif 'check-live' in opt:
        print(mode_from_argv())
    else:
        print(__doc__ or 'see the header of tests/fakebackend.py')
