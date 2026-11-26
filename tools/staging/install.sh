#!/bin/bash
# tools/staging/install.sh — install the binaries of the local staging stack (idempotent; only allowed registries).
#   PostgreSQL 17 + PgBouncer: apt (Ubuntu noble + the PGDG apt repository, signed key from www.postgresql.org)
#   Deno: GitHub release (denoland/deno latest, x86_64-unknown-linux-gnu)
#   PostgREST: GitHub release assets v12.2.3, v13.0.4 (default), v14.2 (linux static)
# Nothing is configured or started here: setup.sh / start.sh do that. Needs root (apt).
set -euo pipefail
. "$(dirname "$0")/env.sh"
mkdir -p "$RR_STAGING_BIN"
if [ ! -x /usr/lib/postgresql/17/bin/postgres ] || ! command -v pgbouncer >/dev/null; then
  if [ ! -f /etc/apt/sources.list.d/pgdg.list ]; then
    install -d /usr/share/postgresql-common/pgdg
    curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release; echo "$VERSION_CODENAME")-pgdg main" > /etc/apt/sources.list.d/pgdg.list
  fi
  apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q postgresql-17 pgbouncer
  service pgbouncer stop >/dev/null 2>&1 || true          # the stack runs its own PgBouncer on its own port
fi
dl() { # url dest-dir: download into a fresh empty directory (untrusted archive), never execute from inside it
  local url="$1" d; d="$(mktemp -d)"; curl -fsSL -o "$d/a" "$url"; echo "$d"; }
if [ ! -x "$RR_STAGING_BIN/deno" ]; then
  d="$(dl https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip)"
  python3 -I -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extract('deno', sys.argv[2])" "$d/a" "$d"
  install -m755 "$d/deno" "$RR_STAGING_BIN/deno"; rm -rf "$d"
fi
for v in v12.2.3 v13.0.4 v14.2; do
  [ -x "$RR_STAGING_BIN/postgrest-$v" ] && continue
  for a in linux-static-x86-64 linux-static-x64; do
    if d="$(dl "https://github.com/PostgREST/postgrest/releases/download/$v/postgrest-$v-$a.tar.xz" 2>/dev/null)"; then
      tar -xJf "$d/a" -C "$d" postgrest && install -m755 "$d/postgrest" "$RR_STAGING_BIN/postgrest-$v"; rm -rf "$d"; break
    fi
  done
done
"$PG_BIN/postgres" --version; pgbouncer --version | head -1; "$RR_STAGING_BIN/deno" --version | head -1
for v in v12.2.3 v13.0.4 v14.2; do [ -x "$RR_STAGING_BIN/postgrest-$v" ] && "$RR_STAGING_BIN/postgrest-$v" --version; done
