#!/bin/bash
# tools/staging/run_live.sh — run the live room suites against the running LOCAL staging stack (start.sh first):
#   tests/backend_contract.mjs --live --local --only=rooms (RR_DRAFTS=1) · tests/online_smoke.mjs --live --local · tests/online_local.test.mjs ·
#   tests/admin_chat_contract.mjs --live --local (moderation + chat draft 20261126_admin_mod_chat.sql)
# RR_CONTRACT_FULL=1 also runs the whole contract (pre-draft RPCs + groups v2 + competitions; their baseline diffs are reported, not ours).
# Prints one summary line per suite; exit 1 if any suite failed. Logs: $RR_STAGING_DIR/log/run-*.log
set -uo pipefail
. "$(dirname "$0")/env.sh"
. "$RR_STAGING_DIR/target.env"
cd "$RR_SRC"; rc=0
run() { local name="$1"; shift; local log="$RR_STAGING_DIR/log/run-$name.log"
  if "$@" > "$log" 2>&1; then st=ok; else st=FAIL; rc=1; fi
  printf '%-16s %-4s %s\n' "$name" "$st" "$(grep -E 'passed' "$log" | tail -1)"; }
export RR_EDGE_DB
run contract-rooms env RR_DRAFTS=1 node tests/backend_contract.mjs --live --local --only=rooms
run smoke node tests/online_smoke.mjs --live --local
run online-local node tests/online_local.test.mjs
run admin-chat node tests/admin_chat_contract.mjs --live --local
[ "${RR_CONTRACT_FULL:-}" = 1 ] && run contract-full env RR_DRAFTS=1 node tests/backend_contract.mjs --live --local
exit $rc
