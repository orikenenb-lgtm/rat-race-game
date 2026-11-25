#!/bin/bash
# tools/staging/setup.sh [--reset] — create the LOCAL staging database (idempotent: a second run only reports what is there).
#   1. initdb (PostgreSQL 17, superuser supabase_admin; TCP needs scram passwords like a hosted project) — once
#   2. bootstrap.sql: Supabase roles (postgres non-superuser, anon, authenticated, service_role, authenticator), schemas, pgcrypto
#      in `extensions`, Supabase default privileges — once
#   3. the production baseline (supabase/schema/production_baseline.sql via baseline.mjs), loaded AS postgres — once
#   4. migrations, each AS postgres, each once (RR_STAGING_MIGRATIONS, default: the rooms draft, then groups v2 + competitions so
#      backend_contract --live RR_DRAFTS=1 can run all its draft sections). Already applied ones are skipped (game.staging_applied).
# --reset wipes $RR_STAGING_DIR first (stop.sh first). Leaves PostgreSQL running; start.sh starts the rest.
set -euo pipefail
. "$(dirname "$0")/env.sh"
if [ "${1:-}" = "--reset" ]; then bash "$STAGING_HERE/stop.sh" >/dev/null 2>&1 || true; rm -rf "$RR_STAGING_DIR"; fi
mkdir -p "$RR_STAGING_DIR"/{run,log,pg}
chmod 711 "$RR_STAGING_DIR"; [ "$(id -u)" = 0 ] && chown postgres "$RR_STAGING_DIR"/{run,log,pg}
if [ ! -f "$RR_STAGING_DIR/keys.env" ]; then
  r() { python3 -I -c "import secrets,sys; print(secrets.token_hex(int(sys.argv[1])))" "$1"; }
  umask 077
  cat > "$RR_STAGING_DIR/keys.env" <<KEYS
# local-only random keys of the staging stack in $RR_STAGING_DIR (never valid anywhere else)
export STG_ADMIN_PW=$(r 16)
export STG_PG_PW=$(r 16)
export STG_AUTH_PW=$(r 16)
export STG_JWT_SECRET=$(r 32)
export STG_ANON=sb_publishable_local_$(r 12)
KEYS
  . "$RR_STAGING_DIR/keys.env"
fi
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  stg_log "initdb $PGDATA ($("$PG_BIN/postgres" --version))"
  pw="$RR_STAGING_DIR/pg/.pw"; printf '%s\n' "$STG_ADMIN_PW" > "$pw"; [ "$(id -u)" = 0 ] && chown postgres "$pw"; chmod 600 "$pw"
  as_os_pg "$PG_BIN/initdb" -D "$PGDATA" -U supabase_admin --pwfile="$pw" --auth-local=trust --auth-host=scram-sha-256 -E UTF8 --locale=C.UTF-8 >/dev/null
  rm -f "$pw"
  as_os_pg tee -a "$PGDATA/postgresql.conf" >/dev/null <<CONF
# --- tools/staging
listen_addresses = '127.0.0.1'
port = $PG_PORT
unix_socket_directories = '$RR_STAGING_DIR/run'
timezone = 'UTC'
max_connections = 120
password_encryption = 'scram-sha-256'
log_min_duration_statement = 2000
log_line_prefix = '%m [%p] %u@%d '
CONF
fi
if ! as_os_pg "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  as_os_pg "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$RR_STAGING_DIR/log/postgres.log" -w start >/dev/null
fi
adm() { "$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$RR_STAGING_DIR/run" -p "$PG_PORT" -U supabase_admin -d postgres "$@"; }
as_pg() { PGPASSWORD="$STG_PG_PW" "$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PG_PORT" -U postgres -d postgres "$@"; }
if [ "$(adm -tAc "select count(*) from pg_roles where rolname = 'authenticator'")" = 0 ]; then
  stg_log "bootstrap: Supabase roles, schemas, pgcrypto in extensions, default privileges"
  adm -v pg_pw="$STG_PG_PW" -v auth_pw="$STG_AUTH_PW" -f "$STAGING_HERE/bootstrap.sql"
fi
if [ "$(adm -tAc "select to_regclass('game.players') is null")" = t ]; then
  stg_log "production baseline (as postgres)"
  node "$STAGING_HERE/baseline.mjs" "$RR_SRC" | as_pg -f -
  as_pg -c "create table game.staging_applied (file text primary key, sha256 text not null, at timestamptz not null default now()); alter table game.staging_applied enable row level security;"
fi
for f in ${RR_STAGING_MIGRATIONS:-20261124_rooms.sql 20261124_groups_v2.sql 20261124_competitions.sql}; do
  p="$RR_SRC/supabase/migrations/$f"; sha="$(sha256sum "$p" | cut -c1-64)"
  old="$(as_pg -tAc "select sha256 from game.staging_applied where file = '$f'")"
  if [ -z "$old" ]; then
    stg_log "apply $f (as postgres)"; as_pg -f "$p"
    as_pg -c "insert into game.staging_applied (file, sha256) values ('$f', '$sha')"
  elif [ "$old" != "$sha" ]; then stg_log "WARNING $f changed since it was applied here (setup.sh --reset to re-create)"
  else stg_log "already applied: $f"; fi
done
stg_log "ready: postgres :$PG_PORT ($RR_STAGING_DIR) — next: tools/staging/start.sh"
