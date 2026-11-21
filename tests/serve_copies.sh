#!/bin/bash
# Rebuild the three local test copies from this checkout and (re)start their static servers.
#   PORT_BASE+0 (8770)  $COPY_DIR/rr2test   game-only copy (no lobby.js/progress.js) — tests/game_e2e.py
#   PORT_BASE+1 (8771)  $COPY_DIR/rr2lobby  lobby + stub in-game files            — tests/lobby_e2e.py, lobby_v21/v3/v3b.py
#   PORT_BASE+2 (8772)  $COPY_DIR/rr2real   lobby + REAL in-game files              — tests/lobby_real.py, perf/a11y probes
# Env (defaults unchanged): SRC=<checkout to copy> COPY_DIR=/tmp PORT_BASE=8770 — e.g. a private set for T7 runs:
#   SRC=/tmp/t7/wt COPY_DIR=/tmp/t7 PORT_BASE=8790 bash tests/serve_copies.sh
# three.js is served locally from /tmp/t/node_modules/three (npm i three@0.170.0 there if missing).
set -e
SRC="${SRC:-$(cd "$(dirname "$0")/.." && pwd)}"
COPY_DIR="${COPY_DIR:-/tmp}"; PORT_BASE="${PORT_BASE:-8770}"
P0=$PORT_BASE; P1=$((PORT_BASE + 1)); P2=$((PORT_BASE + 2))
[ -d /tmp/t/node_modules/three ] || (mkdir -p /tmp/t && cd /tmp/t && npm i -s three@0.170.0 >/dev/null)
mkdir -p "$COPY_DIR"
SRC="$SRC" COPY_DIR="$COPY_DIR" bash "$SRC/tests/make_testcopy.sh" >/dev/null
SRC="$SRC" COPY_DIR="$COPY_DIR" bash "$SRC/tests/make_realcopy.sh" >/dev/null
rm -rf "$COPY_DIR/rr2test" && cp -r "$COPY_DIR/rr2real" "$COPY_DIR/rr2test" && rm -f "$COPY_DIR/rr2test/js/lobby.js" "$COPY_DIR/rr2test/js/progress.js"
for p in $P0 $P1 $P2; do pkill -f "http.server $p " 2>/dev/null || true; pkill -f "http.server $p\$" 2>/dev/null || true; done
nohup python3 -m http.server $P0 --directory "$COPY_DIR/rr2test"  >/dev/null 2>&1 &
nohup python3 -m http.server $P1 --directory "$COPY_DIR/rr2lobby" >/dev/null 2>&1 &
nohup python3 -m http.server $P2 --directory "$COPY_DIR/rr2real"  >/dev/null 2>&1 &
sleep 1; for p in $P0 $P1 $P2; do printf "%s " "$p:$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$p/index.html)"; done; echo
