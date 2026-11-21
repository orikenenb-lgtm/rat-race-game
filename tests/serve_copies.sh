#!/bin/bash
# Rebuild the three local test copies from this checkout and (re)start their static servers.
#   8770  /tmp/rr2test   game-only copy (no lobby.js/progress.js) — tests/game_e2e.py
#   8771  /tmp/rr2lobby  lobby + stub in-game files            — tests/lobby_e2e.py, lobby_v21/v3/v3b.py
#   8772  /tmp/rr2real   lobby + REAL in-game files              — tests/lobby_real.py, perf/a11y probes
# three.js is served locally from /tmp/t/node_modules/three (npm i three@0.170.0 there if missing).
set -e
SRC="${SRC:-$(cd "$(dirname "$0")/.." && pwd)}"
[ -d /tmp/t/node_modules/three ] || (mkdir -p /tmp/t && cd /tmp/t && npm i -s three@0.170.0 >/dev/null)
SRC="$SRC" bash "$SRC/tests/make_testcopy.sh" >/dev/null
SRC="$SRC" bash "$SRC/tests/make_realcopy.sh" >/dev/null
rm -rf /tmp/rr2test && cp -r /tmp/rr2real /tmp/rr2test && rm -f /tmp/rr2test/js/lobby.js /tmp/rr2test/js/progress.js
for p in 8770 8771 8772; do pkill -f "http.server $p" 2>/dev/null || true; done
nohup python3 -m http.server 8770 --directory /tmp/rr2test  >/dev/null 2>&1 &
nohup python3 -m http.server 8771 --directory /tmp/rr2lobby >/dev/null 2>&1 &
nohup python3 -m http.server 8772 --directory /tmp/rr2real  >/dev/null 2>&1 &
sleep 1; for p in 8770 8771 8772; do printf "%s " "$p:$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$p/index.html)"; done; echo
