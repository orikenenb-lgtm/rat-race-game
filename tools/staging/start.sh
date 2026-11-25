#!/bin/bash
# tools/staging/start.sh — start the LOCAL staging stack (idempotent: running parts are left alone). Needs setup.sh first.
#   PostgreSQL :$PG_PORT · PgBouncer :$PGB_PORT (transaction mode) · PostgREST :$PGRST_PORT · Deno room :$ROOM_PORT ·
#   Deno verify-result :$VERIFY_PORT · gateway :$GW_PORT (= the project URL). Prints the URL + local anon key for the tests.
# RR_EDGE_DB=direct points SUPABASE_DB_URL at PostgreSQL itself instead of PgBouncer. Logs: $RR_STAGING_DIR/log/*.log
set -euo pipefail
. "$(dirname "$0")/env.sh"
[ -f "$RR_STAGING_DIR/keys.env" ] && [ -f "$PGDATA/PG_VERSION" ] || { echo "run tools/staging/setup.sh first"; exit 2; }
P="$RR_STAGING_DIR/pids"; L="$RR_STAGING_DIR/log"; mkdir -p "$P" "$L"
alive() { [ -f "$P/$1.pid" ] && kill -0 "$(cat "$P/$1.pid")" 2>/dev/null; }
wait_http() { for _ in $(seq 1 150); do curl -s -o /dev/null "$1" && return 0; sleep 0.2; done; echo "timeout waiting for $1"; return 1; }
# 1. PostgreSQL. RR_STAGING_FAKETIME=1 (test-only): the server's clock = real time + the offset in $RR_STAGING_DIR/clock/offset
#    (libfaketime, re-read every second) — tests/online_localstack.py advance() moves it like the fake's /__fake/advance. Every
#    room clock is the DB's now() (SQL RPCs and the Edge Function alike), so the whole stack moves together. Needs a fresh start.
CLOCK="$RR_STAGING_DIR/clock"; FT=/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1
if ! as_os_pg "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  if [ "${RR_STAGING_FAKETIME:-}" = 1 ]; then
    [ -f "$FT" ] || { echo "RR_STAGING_FAKETIME=1 needs libfaketime (apt-get install libfaketime)"; exit 2; }
    mkdir -p "$CLOCK"; echo "+0" > "$CLOCK/offset"; [ "$(id -u)" = 0 ] && chown -R postgres "$CLOCK"; chmod 755 "$CLOCK"; chmod 666 "$CLOCK/offset"
    as_os_pg env LD_PRELOAD="$FT" FAKETIME_TIMESTAMP_FILE="$CLOCK/offset" FAKETIME_CACHE_DURATION=1 FAKETIME_DONT_FAKE_MONOTONIC=1 \
      "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$L/postgres.log" -w start >/dev/null
  else
    rm -f "${CLOCK:?}/offset"
    as_os_pg "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$L/postgres.log" -w start >/dev/null
  fi
fi
# 2. PgBouncer (transaction pooling, like Supavisor :6543 — postgres.js must run with prepare:false, as index.ts does)
B="$RR_STAGING_DIR/pg/pgbouncer"; mkdir -p "$B"
if ! alive pgbouncer; then
  printf '"postgres" "%s"\n' "$STG_PG_PW" > "$B/userlist.txt"
  cat > "$B/pgbouncer.ini" <<INI
[databases]
postgres = host=127.0.0.1 port=$PG_PORT dbname=postgres
[pgbouncer]
listen_addr = 127.0.0.1
listen_port = $PGB_PORT
unix_socket_dir =
auth_type = scram-sha-256
auth_file = $B/userlist.txt
pool_mode = transaction
max_client_conn = 400
default_pool_size = 15
ignore_startup_parameters = extra_float_digits,options,application_name
logfile = $L/pgbouncer.log
pidfile = $B/pgbouncer.pid
INI
  [ "$(id -u)" = 0 ] && chown -R postgres "$B"; chmod 600 "$B/userlist.txt"
  as_os_pg pgbouncer -d "$B/pgbouncer.ini" </dev/null >/dev/null 2>&1
  for _ in $(seq 1 50); do [ -f "$B/pgbouncer.pid" ] && break; sleep 0.1; done
  cp "$B/pgbouncer.pid" "$P/pgbouncer.pid"
fi
DB_DIRECT="postgresql://postgres:$STG_PG_PW@127.0.0.1:$PG_PORT/postgres"
DB_POOLER="postgresql://postgres:$STG_PG_PW@127.0.0.1:$PGB_PORT/postgres"
EDGE_DB="$DB_POOLER"; [ "$RR_EDGE_DB" = direct ] && EDGE_DB="$DB_DIRECT"
# 3. PostgREST (public schema, anon role; authenticator logs in, switches role per request — like a hosted project)
if ! alive postgrest; then
  umask 077
  cat > "$RR_STAGING_DIR/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:$STG_AUTH_PW@127.0.0.1:$PG_PORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
db-pool = 10
db-max-rows = 1000
jwt-secret = "$STG_JWT_SECRET"
server-host = "127.0.0.1"
server-port = $PGRST_PORT
log-level = "warn"
CONF
  umask 022
  setsid nohup "$RR_POSTGREST" "$RR_STAGING_DIR/postgrest.conf" < /dev/null > "$L/postgrest.log" 2>&1 & echo $! > "$P/postgrest.pid"
fi
# 4. Edge Functions under Deno (the runtime's env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_DB_URL)
edge() { # name port
  local n="$1" port="$2"; alive "$n" && return 0
  ( cd "$RR_SRC" || exit 1; RR_EDGE_PORT="$port" RR_EDGE_NAME="$n" SUPABASE_URL="http://127.0.0.1:$GW_PORT" SUPABASE_ANON_KEY="$STG_ANON" SUPABASE_DB_URL="$EDGE_DB" \
      RR_ENGINE_BASE_URL="http://127.0.0.1:$GW_PORT/site/js/" DENO_NO_UPDATE_CHECK=1 \
      setsid nohup "$RR_DENO" run --no-prompt --allow-net --allow-env --allow-read --allow-sys "$STAGING_HERE/edge_shim.ts" "supabase/functions/$n/index.ts" \
      < /dev/null > "$L/edge-$n.log" 2>&1 & echo $! > "$P/$n.pid" )
}
edge room "$ROOM_PORT"; edge verify-result "$VERIFY_PORT"
# 5. gateway
if ! alive gateway; then
  setsid nohup env GW_PORT="$GW_PORT" STG_ANON="$STG_ANON" STG_JWT_SECRET="$STG_JWT_SECRET" RR_SRC="$RR_SRC" PGRST_PORT="$PGRST_PORT" ROOM_PORT="$ROOM_PORT" \
    VERIFY_PORT="$VERIFY_PORT" RR_STAGING_VERIFY_JWT="${RR_STAGING_VERIFY_JWT:-}" node "$STAGING_HERE/gateway.mjs" < /dev/null > "$L/gateway.log" 2>&1 & echo $! > "$P/gateway.pid"
fi
wait_http "http://127.0.0.1:$PGRST_PORT/" && wait_http "http://127.0.0.1:$GW_PORT/__staging/health"
for _ in $(seq 1 300); do curl -s -o /dev/null "http://127.0.0.1:$ROOM_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$VERIFY_PORT/" && break; sleep 0.3; done
curl -s -o /dev/null "http://127.0.0.1:$ROOM_PORT/" || { echo "room function did not start:"; tail -20 "$L/edge-room.log"; exit 1; }
stg_log "up: $("$RR_POSTGREST" --version | head -1) · edge db=$RR_EDGE_DB · src=$RR_SRC"
cat > "$RR_STAGING_DIR/target.env" <<T
export RR_LOCAL_URL=http://127.0.0.1:$GW_PORT
export RR_LOCAL_ANON=$STG_ANON
export RR_LOCAL_DB=$DB_DIRECT
export RR_LOCAL_CLOCK=$([ -f "$CLOCK/offset" ] && echo "$CLOCK/offset")
T
chmod 600 "$RR_STAGING_DIR/target.env"
stg_log "tests: . $RR_STAGING_DIR/target.env   (RR_LOCAL_URL=http://127.0.0.1:$GW_PORT, RR_LOCAL_ANON, RR_LOCAL_DB)"
