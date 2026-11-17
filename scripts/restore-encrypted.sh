#!/usr/bin/env bash
# Restores an encrypted backup (scripts/backup-encrypted.sh) into a NEW database and proves it is sound.
#
# Usage:  BACKUP_PASSPHRASE_FILE=... scripts/restore-encrypted.sh <file.dump.gpg> [target_db]
#   target_db   database to create and restore into (default: restore_<timestamp>). It must NOT exist: this script never
#               overwrites a database. To replace production, restore here first, check it, then switch deliberately.
#   COMPARE_WITH=<db>   also compare every table (row count + content checksum) with that live database
#   KEEP=1              keep the restored database (default: it is dropped after the checks)
# Exit 0 = the backup is restorable and consistent. Anything else: DO NOT TRUST THAT BACKUP.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FILE="${1:-}"
[ -f "$FILE" ] || { echo "usage: $0 <file.dump.gpg> [target_db]" >&2; exit 2; }
PASS_FILE="${BACKUP_PASSPHRASE_FILE:-}"
[ -s "$PASS_FILE" ] || { echo "FAIL: set BACKUP_PASSPHRASE_FILE to the passphrase file" >&2; exit 2; }
PG_EXEC="${PG_EXEC:-docker compose -f backend/docker-compose.yml exec -T db}"
PGUSER="${PGUSER:-syndicma}"
TARGET="${2:-restore_$(date +%s)}"
[[ "$TARGET" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "FAIL: invalid database name '$TARGET'" >&2; exit 2; }
GPG=(gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$PASS_FILE")

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
step() { printf '== %s\n' "$*"; }
psql_t() { $PG_EXEC psql -U "$PGUSER" -d "$TARGET" -v ON_ERROR_STOP=1 -tA "$@"; }
cleanup() { [ "${KEEP:-0}" = 1 ] || $PG_EXEC psql -U "$PGUSER" -d postgres -qc "DROP DATABASE IF EXISTS $TARGET WITH (FORCE)" >/dev/null 2>&1 || true; }

if [ -f "$FILE.sha256" ]; then
  step "0/4 checksum of the encrypted file"
  [ "$(sha256sum "$FILE" | cut -d' ' -f1)" = "$(tr -d '[:space:]' <"$FILE.sha256")" ] || fail "checksum mismatch: the file was altered or corrupted"
  echo "  ok"
fi

step "1/4 create $TARGET (must not exist)"
[ "$($PG_EXEC psql -U "$PGUSER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$TARGET'")" = "1" ] && fail "database $TARGET already exists; refusing to overwrite it"
$PG_EXEC psql -U "$PGUSER" -d postgres -qc "CREATE DATABASE $TARGET" >/dev/null
trap cleanup EXIT

step "2/4 decrypt and restore (a wrong passphrase or a tampered file stops here)"
"${GPG[@]}" --decrypt "$FILE" | $PG_EXEC pg_restore -U "$PGUSER" -d "$TARGET" --no-owner --no-privileges --exit-on-error \
  || fail "decryption or restore failed"

step "3/4 integrity invariants on the restored copy"
OUT="$(psql_t -f - <"$ROOT/scripts/ledger-invariants.sql")"
[ -z "$OUT" ] || { echo "$OUT"; fail "invariant violations in the restored database"; }
echo "  no violations"

step "4/4 content check"
TABLES="$(psql_t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")"
[ -n "$TABLES" ] || fail "the restored database has no tables"
checksum_sql() { echo "SELECT COUNT(*) || ':' || COALESCE(md5(string_agg(t::text, '|' ORDER BY t::text)), '-') FROM \"$1\" t"; }
if [ -n "${COMPARE_WITH:-}" ]; then
  BAD=0
  for t in $TABLES; do
    a="$($PG_EXEC psql -U "$PGUSER" -d "$COMPARE_WITH" -v ON_ERROR_STOP=1 -tA -c "$(checksum_sql "$t")")"
    b="$(psql_t -c "$(checksum_sql "$t")")"
    if [ "$a" = "$b" ]; then printf '  ok   %-22s %s rows\n' "$t" "${a%%:*}"; else printf '  DIFF %-22s live=%s restored=%s\n' "$t" "$a" "$b"; BAD=1; fi
  done
  [ "$BAD" = 0 ] || fail "restored data differs from $COMPARE_WITH (expected only if data changed since the backup)"
else
  for t in $TABLES; do printf '  %-22s %s rows\n' "$t" "$(psql_t -c "SELECT COUNT(*) FROM \"$t\"")"; done
fi
if psql_t -c "UPDATE audit_logs SET summary = 'tamper' WHERE ctid = (SELECT ctid FROM audit_logs LIMIT 1)" 2>/dev/null; then
  fail "audit_logs accepted an UPDATE after restore (append-only trigger missing)"
fi
echo "  audit_logs is still append-only"
echo "RESTORE VERIFIED: $FILE"
