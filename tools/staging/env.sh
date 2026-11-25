# tools/staging/env.sh — shared settings of the LOCAL staging stack (sourced by setup.sh / start.sh / stop.sh / status.sh).
# Everything runs inside this machine on 127.0.0.1: PostgreSQL 17, PgBouncer (transaction mode, like Supavisor :6543), PostgREST,
# Deno (the Edge Functions `room` and `verify-result` from RR_SRC) and a small gateway that plays Supabase's API host
# (/rest/v1/* → PostgREST, /functions/v1/<fn> → Deno, apikey check). No hosted Supabase project is ever contacted.
# Override any value from the environment, e.g. RR_SRC=/tmp/rooms/export RR_STAGING_DIR=/tmp/rr-staging2 RR_STAGING_PORT=55321.
STAGING_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export RR_SRC="${RR_SRC:-$(cd "$STAGING_HERE/../.." && pwd)}"            # the checkout / git-archive export to serve
export RR_STAGING_DIR="${RR_STAGING_DIR:-/tmp/rr-staging}"                  # data, logs, pids, generated local-only keys
export RR_STAGING_BIN="${RR_STAGING_BIN:-/opt/staging-bin}"                 # deno + postgrest (tools/staging/install.sh)
export PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/17/bin 2>/dev/null || ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export RR_POSTGREST="${RR_POSTGREST:-$RR_STAGING_BIN/postgrest-v13.0.4}"    # also installed: v12.2.3, v14.2 (RR_POSTGREST=… to compare)
export RR_DENO="${RR_DENO:-$RR_STAGING_BIN/deno}"
BASEP="${RR_STAGING_PORT:-54321}"
export GW_PORT="$BASEP"                    # the "https://<ref>.supabase.co" of the stack: http://127.0.0.1:$GW_PORT
export PG_PORT=$((BASEP + 8))              # 54329 direct PostgreSQL (like db.<ref>.supabase.co:5432)
export PGB_PORT=$((BASEP + 9))             # 54330 PgBouncer transaction mode (like the Supavisor pooler :6543)
export PGRST_PORT=$((BASEP + 10))          # 54331 PostgREST
export ROOM_PORT=$((BASEP + 11))           # 54332 Deno: supabase/functions/room/index.ts
export VERIFY_PORT=$((BASEP + 12))         # 54333 Deno: supabase/functions/verify-result/index.ts
export RR_EDGE_DB="${RR_EDGE_DB:-pooler}"  # pooler (PgBouncer, transaction mode) | direct — what SUPABASE_DB_URL points at
export PGDATA="$RR_STAGING_DIR/pg/data"
export DENO_DIR="$RR_STAGING_DIR/deno-cache"
[ -f /root/.ccr/ca-bundle.crt ] && export DENO_CERT="${DENO_CERT:-/root/.ccr/ca-bundle.crt}"
# local-only random keys (generated once by setup.sh; never used anywhere but this stack)
[ -f "$RR_STAGING_DIR/keys.env" ] && . "$RR_STAGING_DIR/keys.env"
export PGHOST=127.0.0.1
# PostgreSQL refuses to run as root: server-side commands run as the OS user `postgres` (created by the postgresql package).
as_os_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
stg_psql() { "$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PG_PORT" "$@"; }
stg_log() { printf '[staging] %s\n' "$*"; }
