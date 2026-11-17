#!/usr/bin/env bash
# Encrypted database backup, meant to run on a schedule (cron / systemd timer, see docs/DEPLOYMENT.md).
#
#  - the dump is piped straight into gpg: the PLAINTEXT NEVER TOUCHES THE DISK;
#  - AES-256, passphrase read from a file (never from the command line or the environment);
#  - the result is VERIFIED before it is trusted: decrypted again and listed with pg_restore, checksum recorded;
#  - optional off-site copy through a command you choose (rclone, aws s3, scp...);
#  - old local copies are pruned.
# A backup that was never restored is not a backup: run scripts/restore-encrypted.sh on a schedule too.
#
# Required:  BACKUP_PASSPHRASE_FILE   file containing the passphrase (chmod 600). Keep a copy OFF the server: without it the
#                                     backups are unreadable, by design.
# Optional:  PG_EXEC (default: the dev compose db)  PGUSER  PGDATABASE  DUMP_DIR (default ./backups)
#            RETENTION_DAYS (default 14)
#            BACKUP_UPLOAD_CMD  command run per file, "{file}" is replaced by its path, e.g.
#                               'rclone copyto {file} offsite:syndicma/$(basename {file})'
#                               If it fails the whole run fails (a backup that is not off-site is reported, not ignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PG_EXEC="${PG_EXEC:-docker compose -f backend/docker-compose.yml exec -T db}"
PGUSER="${PGUSER:-syndicma}"
SRC="${PGDATABASE:-syndicma}"
DUMP_DIR="${DUMP_DIR:-$ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
PASS_FILE="${BACKUP_PASSPHRASE_FILE:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DUMP_DIR/$SRC-$STAMP.dump.gpg"

fail() { printf 'FAIL: %s\n' "$*" >&2; rm -f "$OUT" "$OUT.sha256"; exit 1; }
step() { printf '== %s\n' "$*"; }

[ -n "$PASS_FILE" ] || { echo "FAIL: set BACKUP_PASSPHRASE_FILE" >&2; exit 2; }
[ -s "$PASS_FILE" ] || { echo "FAIL: passphrase file '$PASS_FILE' is missing or empty" >&2; exit 2; }
[ "$(wc -c <"$PASS_FILE")" -ge 16 ] || { echo "FAIL: passphrase must be at least 16 characters" >&2; exit 2; }
command -v gpg >/dev/null || { echo "FAIL: gpg is not installed" >&2; exit 2; }
mkdir -p "$DUMP_DIR"

GPG=(gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$PASS_FILE")

step "1/4 dump $SRC and encrypt (AES-256), nothing readable is written to disk"
$PG_EXEC pg_dump -U "$PGUSER" -d "$SRC" -Fc --no-owner --no-privileges \
  | "${GPG[@]}" --symmetric --cipher-algo AES256 --compress-algo none -o "$OUT" \
  || fail "dump or encryption failed"
[ -s "$OUT" ] || fail "encrypted file is empty"
if head -c 5 "$OUT" | grep -q "PGDMP"; then fail "the file is NOT encrypted (plain dump header found)"; fi
SIZE="$(wc -c <"$OUT")"

step "2/4 verify: decrypt again and list the archive (proves the passphrase works and the dump is readable)"
ENTRIES="$("${GPG[@]}" --decrypt "$OUT" | $PG_EXEC pg_restore -l 2>/dev/null | grep -c 'TABLE DATA' || true)"
[ "$ENTRIES" -ge 1 ] || fail "decrypted archive lists no table data"
sha256sum "$OUT" | cut -d' ' -f1 >"$OUT.sha256"
echo "  $OUT ($SIZE bytes, $ENTRIES tables with data, sha256 $(cut -c1-16 "$OUT.sha256")...)"

step "3/4 off-site copy"
if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  for f in "$OUT" "$OUT.sha256"; do
    cmd="${BACKUP_UPLOAD_CMD//\{file\}/$f}"
    bash -c "$cmd" || { echo "FAIL: off-site copy failed for $f (the local backup is kept)" >&2; exit 3; }
  done
  echo "  uploaded"
else
  echo "  SKIPPED: BACKUP_UPLOAD_CMD is not set, so this backup exists ONLY on this machine"
fi

step "4/4 prune local copies older than $RETENTION_DAYS days"
find "$DUMP_DIR" -maxdepth 1 -name "$SRC-*.dump.gpg*" -mtime "+$RETENTION_DAYS" -print -delete | sed 's/^/  removed /' || true

echo "BACKUP OK: $OUT"
