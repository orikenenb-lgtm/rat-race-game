#!/bin/bash
# tools/staging/stop.sh [component …] — stop the LOCAL staging stack (data is kept; setup.sh --reset wipes it).
# Components: gateway room verify-result postgrest pgbouncer postgres (default: all). E.g. `stop.sh postgrest room verify-result`
# then `RR_POSTGREST=…/postgrest-v14.2 RR_EDGE_DB=direct start.sh` swaps PostgREST / the Edge DB URL without touching the data.
. "$(dirname "$0")/env.sh"
P="${RR_STAGING_DIR:?}/pids"
want="${*:-gateway room verify-result postgrest pgbouncer postgres}"
for n in gateway room verify-result postgrest pgbouncer; do
  case " $want " in *" $n "*) ;; *) continue ;; esac
  if [ -f "$P/$n.pid" ]; then pid="$(cat "$P/$n.pid")"; { kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null; } && stg_log "stopped $n ($pid)"; rm -f "${P:?}/${n:?}.pid"; fi
done
case " $want " in *" postgres "*) [ -f "$PGDATA/PG_VERSION" ] && as_os_pg "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 && stg_log "stopped postgres" ;; esac
true
