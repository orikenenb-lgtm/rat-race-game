#!/bin/bash
# Regression matrix runner (T7 §6.3–6.5).
#   bash tests/run_all.sh [--tier=0|1|2|3] [--lane=engine,shell,rendering,ui,lobby,backend,tests] [--only=a,b] [--skip=a,b]
#                         [--strict] [--keep-going] [--dry-run] [--no-serve]
# Env: PORT_BASE (default 8770; the copies are served on PORT_BASE..+2), COPY_DIR (default /tmp), RR_RUN_DIR (default /tmp/t7run).
# Every result line carries status ∈ {PASS, FAIL, FAIL(timeout), NOT RUN, MISSING(<lane>), SKIPPED(<reason>), INCONCLUSIVE(noisy), STALE}
# and backend / verify / renderer columns. A suite file that does not exist yet is MISSING(<lane>) — never PASS; MISSING suites are
# listed at the top and do not change the exit code (they are not required until their lane lands). Exit 0 only when every
# selected suite that exists is PASS (REPORT-only suites excepted). Browser suites run strictly one at a time; the perf probe last.
# --live is NOT accepted here: live runs need a staging project (CR-22) and are started by hand, suite by suite.
set -u
cd "$(dirname "$0")/.."
ROOT=$(pwd)
TIER=1; LANES=""; ONLY=""; SKIP=""; STRICT=0; KEEP=0; DRY=0; SERVE=1
for a in "$@"; do case "$a" in
  --tier=*) TIER=${a#*=};; --lane=*) LANES=${a#*=};; --only=*) ONLY=${a#*=};; --skip=*) SKIP=${a#*=};;
  --strict) STRICT=1;; --keep-going) KEEP=1;; --dry-run) DRY=1;; --no-serve) SERVE=0;;
  --live) echo "run_all.sh does not run live suites (staging only, CR-22). Run a suite with --live by hand."; exit 2;;
  *) echo "unknown option $a"; exit 2;; esac; done
PORT_BASE=${PORT_BASE:-8770}; COPY_DIR=${COPY_DIR:-/tmp}
P0=$PORT_BASE; P1=$((PORT_BASE + 1)); P2=$((PORT_BASE + 2))
TS=$(date +%Y%m%d-%H%M%S); OUT=${RR_RUN_DIR:-/tmp/t7run}/$TS; mkdir -p "$OUT"
export PYTHONDONTWRITEBYTECODE=1 RR_LOBBY_DIR="$COPY_DIR/rr2lobby" RR_SHOTS="$OUT/shots" RR_FAKE_STATE="$OUT/fake_state.json"
L="http://localhost:$P1/"; RL="http://localhost:$P2/"; G="http://localhost:$P0/index.html"
STRICTA=""; [ $STRICT = 1 ] && STRICTA="--strict --strict-allowlist"

# name | tier | lanes (● or ○ in §6.2) | kind | file that must exist (owner lane) | backend | verify | renderer | timeout s | command
TABLE=$(cat <<EOF
guard_lint|0|all|static|tests/guard_lint.py:T7|none|n/a|n/a|60|python3 tests/guard_lint.py
finance|0|all|node|tests/finance.test.mjs:engine|none|n/a|n/a|300|node tests/finance.test.mjs
business|0|all|node|tests/business.test.mjs:engine|none|n/a|n/a|300|node tests/business.test.mjs
progress|0|all|node|tests/progress.test.mjs:lobby|none|n/a|n/a|300|node tests/progress.test.mjs
energy|0|all|node|tests/energy.test.mjs:lobby|none|n/a|n/a|300|node tests/energy.test.mjs
library|0|all|node|tests/library.test.mjs:lobby|none|n/a|n/a|300|node tests/library.test.mjs
saves|0|all|node|tests/saves.test.mjs:T1|none|n/a|n/a|300|node tests/saves.test.mjs
flags|0|all|node|tests/flags.test.mjs:T1|none|n/a|n/a|300|node tests/flags.test.mjs
render_api|0|all|node|tests/render_api.test.mjs:T1|none|n/a|n/a|300|node tests/render_api.test.mjs
contrast|0|all|node|tests/contrast.test.mjs:T5|none|n/a|n/a|300|node tests/contrast.test.mjs
build_edge_check|0|all|node|tools/build-edge.mjs:engine|none|n/a|n/a|120|node tools/build-edge.mjs --check
fakebackend_test|0|all|python|tests/fakebackend_test.py:T7|fake|replay|swiftshader|900|python3 tests/fakebackend_test.py
backend_contract|0|all|node|tests/backend_contract.mjs:T7|fake|replay|n/a|900|node tests/backend_contract.mjs
verify|1|engine,backend,tests|node|tests/verify.test.mjs:engine|none|n/a|n/a|1200|node tests/verify.test.mjs
determinism|1|engine,backend,tests|node|tests/determinism.test.mjs:engine|none|n/a|n/a|1800|node tests/determinism.test.mjs
engine|1|engine,backend,tests|node|tests/engine.test.mjs:engine|none|n/a|n/a|2400|node tests/engine.test.mjs
t2|1|engine,backend,tests|node|tests/t2.test.mjs:engine (T2)|none|n/a|n/a|1800|node tests/t2.test.mjs
stories|1|engine,backend,tests|node|tests/stories.test.mjs:stories (T3)|none|n/a|n/a|1800|node tests/stories.test.mjs
t4_engine|1|engine,backend,tests|node|tests/t4_engine.test.mjs:onboarding (T4)|none|n/a|n/a|1200|node tests/t4_engine.test.mjs
t4_meta|1|engine,ui,lobby,tests|node|tests/t4_meta.test.mjs:onboarding (T4)|none|n/a|n/a|1200|node tests/t4_meta.test.mjs
t5_tokens|1|rendering,ui,lobby,tests|node|tests/t5_tokens.test.mjs:rendering (T5)|none|n/a|n/a|600|node tests/t5_tokens.test.mjs
t5_vocab|1|rendering,ui,lobby,tests|node|tests/t5_vocab.test.mjs:rendering (T5)|none|n/a|n/a|600|node tests/t5_vocab.test.mjs
balance_gates|1|engine|node|tests/balance_gates.mjs:T7|none|n/a|n/a|120|node tests/balance_gates.mjs
lobby_smoke|1|all|browser|tests/lobby_smoke.py:T7|fake|n/a|swiftshader|900|python3 tests/lobby_smoke.py $L
game_e2e_w1|1|engine,shell,rendering,ui,lobby,tests|browser|tests/game_e2e.py:game|none|n/a|swiftshader|2400|python3 tests/game_e2e.py w1 8 --base=$G --prefix=run_
lobby_e2e|2|lobby,backend,tests,engine,shell|browser|tests/lobby_e2e.py:T7|fake|accept|swiftshader|2400|python3 tests/lobby_e2e.py $L
lobby_v21|2|lobby,backend,tests,engine,shell|browser|tests/lobby_v21.py:T7|fake|accept|swiftshader|2400|python3 tests/lobby_v21.py $L
lobby_v3|2|lobby,backend,tests,engine,shell|browser|tests/lobby_v3.py:T7|fake|replay|swiftshader|3000|python3 tests/lobby_v3.py $L
lobby_v3b|2|lobby,backend,tests,engine,shell|browser|tests/lobby_v3b.py:T7|fake|scripted|swiftshader|3600|python3 tests/lobby_v3b.py $L
lobby_real|2|lobby,backend,tests,engine,shell|browser|tests/lobby_real.py:T7|fake|replay|swiftshader|3600|python3 tests/lobby_real.py $RL
balance_gates_run|2|engine|node|tests/balance_gates.mjs:T7|none|n/a|n/a|10800|node tests/balance_gates.mjs --run
game_e2e_all|2|engine,shell,rendering,ui|browser|tests/game_e2e.py:game|none|n/a|swiftshader|7200|python3 tests/game_e2e.py w1,w2,w3,w4 16 --base=$G --prefix=run_
game_e2e_phone|2|engine,shell,rendering,ui|browser|tests/game_e2e.py:game|none|n/a|swiftshader|3600|python3 tests/game_e2e.py w1 12 --phone --base=$G --prefix=run_
game_e2e_2d|2|shell,rendering|browser|tests/game_e2e.py:game|none|n/a|2d|3600|python3 tests/game_e2e.py w1 12 --base=$G?ff=board2d:on --prefix=run2d_
stability_e2e|2|shell,rendering|browser|tests/stability_e2e.py:T1|none|n/a|mixed|3600|python3 tests/stability_e2e.py --base=${RL}index.html
t4_onboarding|2|ui,lobby|browser|tests/t4_onboarding.py:onboarding (T4)|fake|n/a|swiftshader|1800|python3 tests/t4_onboarding.py
t4_a11y|2|ui,lobby|browser|tests/t4_a11y.py:onboarding (T4)|fake|n/a|swiftshader|1800|python3 tests/t4_a11y.py
t5_perf|2|rendering,ui|browser|tests/t5_perf.py:rendering (T5)|none|n/a|swiftshader|1800|python3 tests/t5_perf.py
t5_city|2|rendering,ui|browser|tests/t5_city.py:rendering (T5)|none|n/a|swiftshader|1800|python3 tests/t5_city.py
t5_ui|2|rendering,ui|browser|tests/t5_ui.py:rendering (T5)|none|n/a|swiftshader|1800|python3 tests/t5_ui.py
t5_lobby|2|rendering,lobby|browser|tests/t5_lobby.py:rendering (T5)|none|n/a|swiftshader|1800|python3 tests/t5_lobby.py
journey_e2e|2|engine,shell,lobby,backend,tests|browser|tests/journey_e2e.py:T7 (P1)|fake|replay|swiftshader|1800|python3 tests/journey_e2e.py $RL
a11y_e2e|2|shell,ui,lobby,tests|browser|tests/a11y_e2e.py:T7|fake|accept|swiftshader|3600|python3 tests/a11y_e2e.py $RL $STRICTA --out=$OUT/a11y.json
a11y_strict|3||browser|tests/a11y_e2e.py:T7|fake|accept|swiftshader|3600|python3 tests/a11y_e2e.py $RL --strict --strict-allowlist --out=$OUT/a11y_strict.json
lobby_shots|3||browser|tests/lobby_shots.py:T7|fake|accept|swiftshader|2400|python3 tests/lobby_shots.py $L
perf_phone|3||perf|tests/perf_probe.py:T7|none|n/a|swiftshader|3600|python3 tests/perf_probe.py --base=$RL --cond=phone --runs=1 --out=$OUT/perf-phone.json
perf_gate|2|shell,rendering,lobby|perf|tests/perf_probe.py:T7|none|n/a|swiftshader|7200|python3 tests/perf_probe.py --base=$RL --cond=desk --runs=3 --leak --gate --out=$OUT/perf-desk.json
perf_gate_3g|2|shell,rendering,lobby|perf|tests/perf_probe.py:T7|none|n/a|swiftshader|7200|python3 tests/perf_probe.py --base=$RL --cond=3g --runs=3 --twod --gate --out=$OUT/perf-3g.json
EOF
)
MANUAL="manual device run (§3.10)|screen-reader pass (§4.4)|agent + human playtests (§5.4)|live contract vs staging (§2.8, needs CR-22)|perf --long=60 (PF-19, not implemented in part A)"

in_list() { local x=$1 l=$2; [ -n "$l" ] && [[ ",$l," == *",$x,"* ]]; }
selected() { # name tier lanes
  local n=$1 t=$2 ln=$3
  if [ -n "$ONLY" ]; then in_list "$n" "$ONLY"; return; fi
  in_list "$n" "$SKIP" && return 1
  [ "$t" -le "$TIER" ] && return 0
  if [ -n "$LANES" ] && [ "$t" -le 2 ]; then for x in ${LANES//,/ }; do [[ ",$ln," == *",$x,"* || "$ln" == all ]] && return 0; done; fi
  return 1
}

# ---------------------------------------------------------------- preflight
HEAD=$(git rev-parse HEAD 2>/dev/null); DIRTY=$([ -n "$(git status --porcelain -- js css index.html assets supabase 2>/dev/null)" ] && echo dirty || echo clean)
if [ $DRY = 0 ]; then
  miss=""
  command -v node >/dev/null || miss+=" node"; command -v python3 >/dev/null || miss+=" python3"
  python3 -c "import playwright" 2>/dev/null || miss+=" python-playwright"
  [ -x /usr/bin/google-chrome ] || miss+=" /usr/bin/google-chrome"
  [ -d /tmp/t/node_modules/three ] || miss+=" three.js at /tmp/t/node_modules/three (see serve_copies.sh; run_all never installs)"
  [ -f tests/vendor/axe-core/axe.min.js ] || miss+=" tests/vendor/axe-core/axe.min.js"
  if [ -n "$miss" ]; then echo "PREFLIGHT FAILED, missing:$miss"; exit 2; fi
  if [ $SERVE = 1 ] && [ "$TIER" -ge 1 -o -n "$LANES$ONLY" ]; then
    for p in $P0 $P1 $P2 8779; do
      if (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null && ! pgrep -f "http.server $p .*$COPY_DIR/rr2" >/dev/null; then echo "PREFLIGHT: port $p is busy with something else (set PORT_BASE)"; exit 2; fi
    done
    SRC="$ROOT" COPY_DIR="$COPY_DIR" PORT_BASE="$PORT_BASE" bash tests/serve_copies.sh > "$OUT/serve.log" 2>&1 || { echo "serve_copies failed (see $OUT/serve.log)"; exit 2; }
  fi
fi
echo "run_all · tier $TIER · lanes '${LANES}' · HEAD ${HEAD:0:12} ($DIRTY) · copies ${COPY_DIR} ports $P0-$P2 · logs $OUT"

# ---------------------------------------------------------------- run
declare -a ROWS; FAILED=0; T0=$(date +%s)
perf_rows=""; while IFS='|' read -r n t ln kind need be vf rd to cmd; do
  [ -z "$n" ] && continue
  selected "$n" "$t" "$ln" || continue
  if [ "$kind" = perf ]; then perf_rows+="$n|$t|$ln|$kind|$need|$be|$vf|$rd|$to|$cmd"$'\n'; continue; fi
  ROWS+=("$n|$t|$ln|$kind|$need|$be|$vf|$rd|$to|$cmd")
done <<< "$TABLE"
while IFS= read -r r; do [ -n "$r" ] && ROWS+=("$r"); done <<< "$perf_rows"     # perf last and alone

RES="$OUT/results.tsv"; : > "$RES"
for row in "${ROWS[@]}"; do
  IFS='|' read -r n t ln kind need be vf rd to cmd <<< "$row"
  file=${need%%:*}; lane=${need#*:}
  if [ ! -f "$file" ]; then st="MISSING($lane)"; rc=-; dur=0
  elif [ $DRY = 1 ]; then st="NOT RUN"; rc=-; dur=0
  elif [ $FAILED = 1 ] && [ $KEEP = 0 ]; then st="NOT RUN"; rc=-; dur=0
  else
    s=$(date +%s); timeout "$to" bash -c "$cmd" > "$OUT/$n.log" 2>&1; rc=$?; dur=$(( $(date +%s) - s ))
    if [ $rc = 0 ]; then st=PASS; grep -q "INCONCLUSIVE" "$OUT/$n.log" && st="INCONCLUSIVE(noisy)"
    elif [ $rc = 124 ]; then st="FAIL(timeout)"
    elif [ $rc = 3 ] && [[ $n == balance_gates* ]]; then st=STALE
    else st=FAIL; fi
    grep -q "^SKIPPED" "$OUT/$n.log" && [ $rc = 0 ] && st="SKIPPED($(head -c 60 "$OUT/$n.log" | tr -d '\n'))"
    [[ $st == FAIL* || $st == STALE ]] && FAILED=1
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$n" "$st" "$be" "$vf" "$rd" "$dur" "$rc" "$t" >> "$RES"
  printf '%-18s %-26s backend=%-6s verify=%-8s renderer=%-11s %5ss rc=%s\n' "$n" "$st" "$be" "$vf" "$rd" "$dur" "$rc"
done
TOTAL=$(( $(date +%s) - T0 ))

# ---------------------------------------------------------------- summary
python3 - "$RES" "$OUT" "$TIER" "$HEAD" "$DIRTY" "$TOTAL" "$MANUAL" <<'PY'
import json, sys
res, out, tier, head, dirty, total, manual = sys.argv[1:8]
rows = [dict(zip(['suite', 'status', 'backend', 'verify', 'renderer', 'seconds', 'rc', 'tier'], l.rstrip('\n').split('\t'))) for l in open(res) if l.strip()]
missing = [r for r in rows if r['status'].startswith('MISSING')]
json.dump({'tier': tier, 'head': head, 'tree': dirty, 'seconds': int(total), 'suites': rows, 'manual_not_done': manual.split('|') if tier == '3' else []}, open(f'{out}/summary.json', 'w'), indent=1)
md = [f'# run_all tier {tier} · HEAD {head[:12]} ({dirty}) · {int(total) // 60} min {int(total) % 60} s', '']
if missing: md += ['**Not yet landed (MISSING):** ' + ', '.join(f"{r['suite']} {r['status']}" for r in missing), '']
md += ['| suite | status | backend | verify | renderer | duration | rc |', '|---|---|---|---|---|---|---|']
md += [f"| {r['suite']} | {r['status']} | {r['backend']} | {r['verify']} | {r['renderer']} | {r['seconds']} s | {r['rc']} |" for r in rows]
if tier == '3': md += ['', 'Manual items (each must be done with results, or listed): ' + '; '.join(m + ' — NOT DONE' for m in manual.split('|'))]
md += ['', 'All browser results above ran headless with software WebGL (swiftshader) on a 2-core machine. Backend results ran against the offline fake backend unless the backend column says live-staging. No result here was obtained on a real phone, with a screen reader, or against production.']
open(f'{out}/summary.md', 'w').write('\n'.join(md) + '\n'); print('\n'.join(md))
PY
echo "summary: $OUT/summary.md"
[ $FAILED = 0 ]
