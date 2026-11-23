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
OPTIONAL = {'p_ref', 'p_challenge', 'p_pawn', 'p_meta'}
LEGACY = {'rr_register', 'rr_start', 'rr_create_challenge', 'rr_sync_progress'}
ROTATION = [('w1', 0), ('w2', 1), ('w3', 0), ('w4', 1), ('w1', 1), ('w2', 0), ('w3', 1)]   # by ISO weekday-1 [ASSUMED S-8]
VERIFY_CODES = set('rlcLRCPAIST')
MAX_ACTIONS, MAX_BODY = 6000, 1000000

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
    def __init__(self):
        self.proc = subprocess.Popen(['node', os.path.join(HERE, 'fakeverify.mjs')], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE, text=True, cwd=ROOT, env={**os.environ, 'RR_FAKE_ROOT': ROOT})
        self.q = queue.Queue(); self.rid = 0; self.lock = threading.Lock()
        threading.Thread(target=self._read, daemon=True).start()
        first = self.q.get(timeout=120)
        if not first.get('ready'): raise RuntimeError('fakeverify did not start: %r' % first)
    def _read(self):
        for line in self.proc.stdout:
            try: self.q.put(json.loads(line))
            except ValueError: pass
        self.q.put({'dead': True})
    def call(self, row, actions, timeout=30):
        with self.lock:
            self.rid += 1; rid = self.rid
            self.proc.stdin.write(json.dumps({'rid': rid, 'row': row, 'actions': actions}) + '\n'); self.proc.stdin.flush()
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
        self.meta = {}              # free-form data a suite stores with dump() (e.g. which seeded player is "A")
        self.verify_queue = []; self._fail = {}; self._fail_net = {}; self._over = {}
        # assumed semantics (§2.6) — each one has a switch
        self.stale_on_equal = False; self.streak_on = 'begin'; self.ranked_feed = 'all'; self.raise_status = 400
        self.daily_key_fmt = '%Y-%m-%d'; self.kind_re = re.compile(r'^[a-z0-9_]{1,30}$')
        self._side = None; self.lock = threading.RLock()
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
    def _new_group(self, owner, name):
        while True:
            code = ''.join(self.rng.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
            if not any(g['code'] == code for g in self.G.values()): break
        g = {'id': str(uuid.uuid4()), 'code': code, 'name': name, 'owner': owner['id'], 'members': [owner['id']]}
        self.G[g['id']] = g; return g
    def _total(self, p): return sum(int(v or 0) for k, v in p['stars'].items() if k in WORLDS4)
    def _profile(self, p):
        return {'id': p['id'], 'nickname': p['nickname'], 'stars': dict(p['stars']), 'total_stars': self._total(p), 'achievements': list(p['achievements']),
                'pawn': p['pawn'], 'daily_streak': p['daily_streak'], 'best_streak': p['best_streak'], 'last_daily': p['last_daily'], 'meta': copy.deepcopy(p['meta'])}
    def _groups_of(self, pid): return [g for g in self.G.values() if pid in g['members']]
    def _active(self, c, t=None): t = t or self.now(); return c['starts_at'] <= t < c['ends_at']
    def _group_out(self, g, pid):
        return {'id': g['id'], 'code': g['code'], 'name': g['name'], 'is_owner': g['owner'] == pid, 'members': len(g['members']),
                'active': sum(1 for c in self.C.values() if c['group'] == g['id'] and self._active(c))}
    def _mine(self, pid, **kw): return next((r for r in self.R.values() if r['player'] == pid and all(r.get(k) == v for k, v in kw.items())), None)
    def _chal_out(self, c, pid=None):
        r = self._mine(pid, challenge=c['id']) if pid else None
        out = {'id': c['id'], 'title': c['title'], 'profession': c['char'], 'world': c['world'], 'starts_at': self.iso(c['starts_at']), 'ends_at': self.iso(c['ends_at'])}
        if pid is not None:
            out.update(active=self._active(c), my_status=r and r['status'], board=self.board(lambda x: x.get('challenge') == c['id'], pid))
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
        for r in sorted((r for r in self.R.values() if pred(r)), key=key)[:100]:
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
            if fn in LEGACY or fn not in PARAMS:
                self.unexpected.append(('legacy' if fn in LEGACY else 'unknown_fn', fn))
                return done(404, {'code': 'PGRST202', 'message': f'Could not find the function public.{fn}', 'details': None, 'hint': None})
            want = set(PARAMS[fn]); got = set(body)
            if (got - want) or (want - OPTIONAL - got):
                self.unexpected.append(('params', fn, sorted(got - want), sorted(want - OPTIONAL - got)))
                return done(404, {'code': 'PGRST202', 'message': f'Could not find the function public.{fn}({",".join(sorted(got))})', 'details': None, 'hint': None})
            f = self._fail.get(fn)
            try:
                if f and f[2] > 0:
                    f[2] -= 1; raise FakeError(f[0], f[1])
                if fn in self._over:
                    out = self._over[fn](self, body)
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
        return self._group_out(self._new_group(p, n), p['id'])
    def _rr_join_group(self, b):
        p = self._auth(b); code = self._txt(b.get('p_code')).upper()
        g = next((g for g in self.G.values() if g['code'] == code), None)
        if not g: self._err('group_not_found')
        if p['id'] not in g['members']:
            if len(g['members']) >= 50: self._err('group_full')
            g['members'].append(p['id']); self._feed_add(g['id'], p['id'], 'joined', None)
        return self._group_out(g, p['id'])
    def _rr_leave_group(self, b):
        p = self._auth(b); g = self._member_group(b, p)
        g['members'].remove(p['id'])
        if not g['members']: del self.G[g['id']]
        return None
    def _rr_my_groups(self, b):
        p = self._auth(b); return [self._group_out(g, p['id']) for g in self._groups_of(p['id'])]
    def _rr_group(self, b):
        p = self._auth(b); g = self._member_group(b, p)
        return {'id': g['id'], 'code': g['code'], 'name': g['name'], 'is_owner': g['owner'] == p['id'],
                'members': [{'nickname': self.P[m]['nickname'], 'owner': m == g['owner'], 'me': m == p['id'], 'stars': self._total(self.P[m]), 'pawn': self.P[m]['pawn']} for m in g['members']],
                'challenges': [self._chal_out(c, p['id']) for c in sorted(self.C.values(), key=lambda c: c['starts_at'], reverse=True) if c['group'] == g['id']]}
    def _rr_create_challenge2(self, b):
        p = self._auth(b); g = self._member_group(b, p)
        t = self._txt(b.get('p_title'))
        if not 2 <= len(t) <= 50: self._err('bad_title')
        w = b.get('p_world')
        if w not in WORLDS4 or w not in self.characters: self._err('bad_world')
        if b.get('p_char') not in self.characters[w]: self._err('bad_profession')
        days = self._int(b.get('p_days'), 'bad_days')
        if not 1 <= days <= 30: self._err('bad_days')
        if sum(1 for c in self.C.values() if c['group'] == g['id'] and self._active(c)) >= 5: self._err('too_many_challenges')
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
            kw = {'challenge': c['id']}; w, ci, mm, seed, prof = c['world'], None, None, c['seed'], c['char']
        else: self._err('bad_mode')
        r = self._mine(p['id'], **kw)
        if not r:
            if c and not self._active(c): self._err('challenge_closed')
            r = {'id': str(uuid.uuid4()), 'player': p['id'], **kw, 'mode': mode, 'status': 'playing', 'seed': seed, 'world': w, 'profession': prof,
                 'char_index': ci, 'max_months': mm, 'months': None, 'net_worth': None, 'passive': None, 'expenses': None, 'stats': None,
                 'checkpoint': None, 'checkpoint_turn': 0, 'started_at': self.iso(), 'finished_at': None, 'title': c and c['title'],
                 'char': c and c['char'], 'group': c and c['group'], 'verified': None, 'verify_error': None, 'verify_attempts': 0,
                 'start_day': self.day_key(), 'start_week': self.week_key()}
            self.R[r['id']] = r
            if mode == 'daily' and self.streak_on == 'begin': self._bump_streak(p)
        out = {'result_id': r['id'], 'status': r['status'], 'seed': r['seed'], 'world': r['world'], 'max_months': r['max_months'], 'title': r['title'],
               'group_id': r['group'], 'streak': p['daily_streak'], 'checkpoint_turn': r['checkpoint_turn'], 'checkpoint': r['checkpoint']}
        if mode == 'challenge': out['char'] = r['char']
        else: out['char_index'] = r['char_index']
        return out
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
        self.admin_used = True; self.admins.add(p['id']); return {'admin': True}
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
        return {'ok': True}
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
        d = {k: getattr(self, k) for k in ('P', 'G', 'C', 'R', 'feed', 'gifts')}
        d['events_today'] = [[list(k), v] for k, v in self.events_today.items()]
        d['offset_s'] = self._offset.total_seconds(); d['meta'] = self.meta
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f: json.dump(d, f, ensure_ascii=False, default=enc)
    @classmethod
    def load(cls, path, **kw):
        fb = cls(**kw)
        with open(path, encoding='utf-8') as f:
            d = json.load(f, object_hook=lambda o: dt.datetime.fromisoformat(o['__dt']) if set(o) == {'__dt'} else o)
        for k in ('P', 'G', 'C', 'R', 'feed', 'gifts'): setattr(fb, k, d.get(k, getattr(fb, k)))
        fb.events_today = collections.Counter({tuple(k): v for k, v in d.get('events_today', [])})
        fb._offset = dt.timedelta(seconds=d.get('offset_s', 0)); fb.meta = d.get('meta') or {}
        return fb
    def close(self):
        if self._side: self._side.close(); self._side = None

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
        await ctx.route(SB_PROD + '/rest/v1/rpc/**', rpc)
        await ctx.route(SB_PROD + '/functions/v1/verify-result', verify)
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
            if self.path.startswith('/__fake/advance'):     # test-only clock control (HTTP mode only)
                b = json.loads(raw or '{}'); fb.advance(days=b.get('days', 0), hours=b.get('hours', 0), minutes=b.get('minutes', 0))
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
