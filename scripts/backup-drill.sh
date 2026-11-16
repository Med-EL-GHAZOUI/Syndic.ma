#!/usr/bin/env bash
# Backup & RESTORE DRILL. A backup that was never restored is not a backup.
#
# 1. dumps the live database (pg_dump custom format, compressed)
# 2. restores it into a scratch database
# 3. proves the restore is faithful: identical row counts and content checksums per table
# 4. runs the ledger/integrity invariants (scripts/ledger-invariants.sql) on the restored copy
# 5. proves protections survived (append-only audit trigger still rejects UPDATE)
# 6. drops the scratch database
#
# Usage (local compose DB):  scripts/backup-drill.sh
# Other targets:             PG_EXEC="docker exec -i <container>" PGUSER=... PGDATABASE=... scripts/backup-drill.sh
# Exit code 0 = restore verified, non-zero = DO NOT TRUST THE BACKUP.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"   # relative paths keep docker compose happy on Windows (Git Bash) too
PG_EXEC="${PG_EXEC:-docker compose -f backend/docker-compose.yml exec -T db}"
PGUSER="${PGUSER:-syndicma}"
SRC="${PGDATABASE:-syndicma}"
SCRATCH="drill_$(date +%s)"
DUMP_DIR="${DUMP_DIR:-$ROOT/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$DUMP_DIR/$SRC-$STAMP.dump"
mkdir -p "$DUMP_DIR"

psql_src() { $PG_EXEC psql -U "$PGUSER" -d "$SRC" -v ON_ERROR_STOP=1 -tA "$@"; }
psql_scr() { $PG_EXEC psql -U "$PGUSER" -d "$SCRATCH" -v ON_ERROR_STOP=1 -tA "$@"; }
cleanup() { $PG_EXEC psql -U "$PGUSER" -d postgres -qc "DROP DATABASE IF EXISTS $SCRATCH WITH (FORCE)" >/dev/null 2>&1 || true; }
trap cleanup EXIT

step() { printf '\n== %s\n' "$*"; }
fail() { printf '\nFAIL: %s\n' "$*" >&2; exit 1; }

step "1/6 dump $SRC -> $DUMP"
$PG_EXEC pg_dump -U "$PGUSER" -d "$SRC" -Fc --no-owner --no-privileges >"$DUMP"
[ -s "$DUMP" ] || fail "dump is empty"
echo "dump size: $(wc -c <"$DUMP") bytes (sha256 $(sha256sum "$DUMP" | cut -c1-16)...)"

step "2/6 restore into scratch database $SCRATCH"
$PG_EXEC psql -U "$PGUSER" -d postgres -qc "CREATE DATABASE $SCRATCH" >/dev/null
$PG_EXEC pg_restore -U "$PGUSER" -d "$SCRATCH" --no-owner --no-privileges --exit-on-error <"$DUMP"

step "3/6 compare every table: row count + content checksum"
TABLES="$(psql_src -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")"
# md5 over the whole table content in a stable order; works for any column types.
checksum_sql() { echo "SELECT COUNT(*) || ':' || COALESCE(md5(string_agg(t::text, '|' ORDER BY t::text)), '-') FROM \"$1\" t"; }
BAD=0
for t in $TABLES; do
  a="$(psql_src -c "$(checksum_sql "$t")")"
  b="$(psql_scr -c "$(checksum_sql "$t")")"
  if [ "$a" = "$b" ]; then printf '  ok   %-22s %s\n' "$t" "${a%%:*} rows"; else printf '  DIFF %-22s source=%s restored=%s\n' "$t" "$a" "$b"; BAD=1; fi
done
[ "$BAD" = 0 ] || fail "restored data differs from the source"

step "4/6 ledger & integrity invariants on the RESTORED copy"
OUT="$(psql_scr -f - <"$ROOT/scripts/ledger-invariants.sql")"
if [ -n "$OUT" ]; then echo "$OUT"; fail "invariant violations found in the restored database"; fi
echo "  no violations"

step "5/6 protections survived the restore"
if psql_scr -c "UPDATE audit_logs SET summary = 'tamper' WHERE ctid = (SELECT ctid FROM audit_logs LIMIT 1)" 2>/dev/null; then
  fail "audit_logs accepted an UPDATE after restore (append-only trigger missing)"
fi
echo "  audit_logs is still append-only"

step "6/6 cleanup"
cleanup; trap - EXIT
echo
echo "RESTORE VERIFIED: $DUMP"
