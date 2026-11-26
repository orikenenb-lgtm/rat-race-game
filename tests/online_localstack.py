# The LOCAL staging stack (tools/staging: PostgreSQL 17 + PostgREST + Deno running supabase/functions/room) as a drop-in for the
# parts of tests/fakebackend.FakeBackend that tests/rooms_e2e.py uses, so the REAL lobby UI (rooms.js / remote.js / net.js, unchanged)
# plays live rooms against real SQL, real PostgREST and the real Edge Function — `python3 tests/rooms_e2e.py <site> --local`.
# Test-only override, not a change to net.js: the browser still calls the production URL compiled into net.js; Playwright routes
# those requests (rest/v1/rpc/* and functions/v1/room) to the local gateway and fulfils them; anything else to *.supabase.co is
# aborted by fakebackend.install's guard (assert_clean). Needs: tools/staging/start.sh with RR_STAGING_FAKETIME=1 (advance() moves
# the database clock — every room clock is the DB's now()), then `. /tmp/rr-staging/target.env`.
import collections, json, os, re, subprocess, time, urllib.request
import fakebackend as FB

class LocalStack:
    """FakeBackend-shaped facade over the local staging stack (only what rooms_e2e.py needs)."""
    def __init__(self, url, anon, db, clock=None):
        if not re.fullmatch(r'http://(127\.0\.0\.1|localhost):\d{2,5}', url or '') or not anon or not db:
            raise SystemExit('REFUSED --local: needs RR_LOCAL_URL=http://127.0.0.1:<port>, RR_LOCAL_ANON, RR_LOCAL_DB (. /tmp/rr-staging/target.env)')
        self.url, self.anon, self.db, self.clock = url.rstrip('/'), anon, db, clock
        self.calls = collections.Counter(); self.requests = []; self.blocked = []; self.unexpected = []
        self._offset = None                      # rooms_e2e resets the fake clock here; meaningless on the stack
        self._http = urllib.request.build_opener(urllib.request.ProxyHandler({}))   # 127.0.0.1 only, never through a proxy
    @classmethod
    def from_env(cls):
        return cls(os.environ.get('RR_LOCAL_URL'), os.environ.get('RR_LOCAL_ANON'), os.environ.get('RR_LOCAL_DB'), os.environ.get('RR_LOCAL_CLOCK') or None)
    # ---------------------------------------------------------------- HTTP to the gateway
    def http(self, path, body=b'', method='POST'):
        req = urllib.request.Request(self.url + path, data=body if method != 'GET' else None, method=method,
                                     headers={'apikey': self.anon, 'Content-Type': 'application/json'})
        try:
            with self._http.open(req, timeout=60) as r: return r.status, r.read()
        except urllib.error.HTTPError as e: return e.code, e.read()
    def rpc(self, fn, args):
        st, raw = self.http(f'/rest/v1/rpc/{fn}', json.dumps(args).encode()); return st, (json.loads(raw) if raw else None)
    def room_fn(self, body, raw_len=None):
        """POST /functions/v1/room on the stack → (status, json) — used by rooms_e2e's duplicate / lost-answer routes."""
        self.calls['room'] += 1
        st, raw = self.http('/functions/v1/room', json.dumps(body).encode()); return st, (json.loads(raw) if raw else None)
    # ---------------------------------------------------------------- the FakeBackend surface rooms_e2e uses
    def set_daily(self, *a, **k): pass
    def seed_player(self, nickname='טסט', **_):
        st, p = self.rpc('rr_register2', {'p_nickname': nickname, 'p_ref': None})
        if st != 200: raise RuntimeError(f'rr_register2 {st} {p}')
        return p
    def _sql(self, text):
        return subprocess.run(['psql', self.db, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', text], check=True, capture_output=True, text=True).stdout.strip()
    def make_admin(self, p):
        """the owner of the stack (test only): game.admins row through psql — the one-time code of 20261123_admin.sql is not known here"""
        if not re.fullmatch(r'[0-9a-f-]{36}', p['id']): raise ValueError('bad id')
        self._sql(f"insert into game.admins (player_id) values ('{p['id']}') on conflict do nothing")
    def handle(self, fn, body):
        """FakeBackend.handle-shaped: one PostgREST call → (status, json)"""
        return self.rpc(fn, body)
    def rooms_dump(self):
        out = self._sql("""select coalesce(json_agg(json_build_object('id', r.id, 'status', r.status, 'results', r.results,
            'round', r.round, 'end_reason', r.end_reason,
            'seats', (select json_agg(json_build_object('seat', s.seat, 'state_version', s.state_version, 'status', s.status, 'player_id', s.player_id) order by s.seat) from game.room_seats s where s.room_id = r.id))), '[]')
            from game.rooms r where r.status in ('lobby', 'playing') or r.finished_at > now() - interval '1 day'""")
        return {'rooms': json.loads(out)}
    def advance(self, days=0, hours=0, minutes=0, seconds=0):
        """Move the DATABASE clock forward (libfaketime offset file, re-read every second) — like the fake's advance()."""
        if not self.clock: raise RuntimeError('advance() needs the stack started with RR_STAGING_FAKETIME=1 (RR_LOCAL_CLOCK)')
        cur = int(open(self.clock).read().strip() or '+0')
        with open(self.clock, 'w') as f: f.write(f'+{cur + int(days * 86400 + hours * 3600 + minutes * 60 + seconds)}\n')
        time.sleep(1.3)
    def reset_clock(self):
        if self.clock:
            with open(self.clock, 'w') as f: f.write('+0\n')
            time.sleep(1.3)
    def close(self): pass

ROOM_PATHS = re.compile(r'/(rest/v1/rpc/[a-z0-9_]+|functions/v1/room)$')

async def install(ctx, ls):
    """guard + fonts (fakebackend.install with no fake) + the relay of the production URL's rpc / room calls to the local stack."""
    import asyncio
    sink = await FB.install(ctx, None)
    async def relay(route):
        req = route.request
        if req.method == 'OPTIONS': return await route.fulfill(status=204, headers=FB.CORS)
        path = req.url[len(FB.SB_PROD):].split('?')[0]
        if not ROOM_PATHS.search(path): sink.blocked.append('NOT RELAYED ' + req.url); return await route.abort('blockedbyclient')
        fn = path.rsplit('/', 1)[1]
        ls.calls['room' if path.endswith('functions/v1/room') else fn] += 1
        st, raw = await asyncio.to_thread(ls.http, path, (req.post_data or '').encode('utf-8'), req.method)
        await route.fulfill(status=st, content_type='application/json', body=raw, headers=FB.CORS)
    await ctx.route(FB.SB_PROD + '/rest/v1/rpc/**', relay)
    await ctx.route(FB.SB_PROD + '/functions/v1/room', relay)
    return sink
