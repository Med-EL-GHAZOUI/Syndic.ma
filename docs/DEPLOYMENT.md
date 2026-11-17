# Deployment (Phase 7 — partial)

## Environments
| | Local | Staging | Production |
|---|---|---|---|
| DB | `docker compose up -d` (backend/) | managed PostgreSQL 16 | managed PostgreSQL 16, HA + PITR |
| Config | `backend/.env` (never committed) | secret manager | secret manager |
| Swagger | on | on (restricted) | **off** (automatic when `NODE_ENV=production`) |
| `JWT_ACCESS_SECRET` | example value allowed | unique | unique, ≥ 32 random chars (example value rejected at boot) |

## Build & run
```bash
cd backend
npm ci
npm run build
npm run migration:run:prod     # node dist/migrate.js  (explicit step; the app never synchronizes the schema)
npm start
```
Docker: `docker build -t syndicma-api backend`. The image runs as a non-root user, has a `/api/health` healthcheck and was smoke-tested against PostgreSQL (health 200, `/docs` 404 in production, migrations runner OK).

Required env: `DATABASE_URL`, `JWT_ACCESS_SECRET`, and in production `MFA_ENCRYPTION_KEY` (≥ 32 random chars, separate from the JWT secret; it encrypts the two-factor secrets, so back it up with the other secrets — if it is lost every enrolled authenticator becomes unusable and an admin must reset each user's second factor). For password-reset e-mails in production (`MAIL_TRANSPORT` is forced to `smtp`): `MAIL_HOST`, `MAIL_PORT` (587 STARTTLS / 465 TLS), `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`, `APP_URL` (public base URL of the web app, used in the links). Provider choice, SPF/DKIM and data-processing terms are a business/compliance decision. Optional: `COOKIE_SECURE` (default: `true` in production — the refresh cookie is then only sent over HTTPS, except to `localhost`; set `false` ONLY for plain-HTTP internal tests), `STORAGE_DIR` (uploads; mount a persistent, access-restricted volume or switch to object storage), `ACCESS_TTL_SECONDS` (900), `REFRESH_TTL_DAYS` (14), `CORS_ORIGIN`, `PORT`, `DATABASE_SSL=true`, `THROTTLE_AUTH_LIMIT`, `THROTTLE_LIMIT`, `BCRYPT_COST` (≥ 10 in prod).

## Full stack with Docker Compose
```bash
export POSTGRES_PASSWORD=...  JWT_ACCESS_SECRET=...  MFA_ENCRYPTION_KEY=...      # required, no defaults
docker compose up -d --build                              # db + api (runs migrations first) + web (nginx, port 8080)
SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=...   docker compose run --rm -e SUPERADMIN_EMAIL -e SUPERADMIN_PASSWORD api node dist/create-super-admin.js
```
Tested locally from an empty database: 4 migrations applied, health through nginx, super-admin login, tenant data denied to the platform admin. The web container serves the Angular build with a strict CSP (no inline scripts), `X-Frame-Options: DENY`, `nosniff`, and proxies `/api/` to the API. **Enable HSTS and terminate TLS in front of it before exposing it** (see the commented header in `frontend/nginx.conf.template`); nginx's resolver is `127.0.0.11` (Docker DNS) — adjust on other orchestrators.

## CI
`.github/workflows/ci.yml`: type-check → build → unit tests → e2e tests (PostgreSQL service) → `npm audit --omit=dev --audit-level=high` → frontend build + unit tests (headless Chrome) → Docker builds of API and web. The workflow **runs on GitHub on every push and passed** for the last commits (backend: type-check, build, unit + e2e tests against PostgreSQL, dependency audit; frontend: build, unit tests in headless Chrome, audit; Docker builds). The new `e2e` job runs the Playwright browser suite (see `e2e/README.md`); it was validated locally, its first CI run is pending.

## Migrations
Generated with `npm run migration:generate -- src/migrations/Name`, reviewed by hand, applied once per deploy before the new version starts. `IntegrityRules` adds the append-only audit trigger, payment-delete protection and CHECK constraints. Rollback = `typeorm migration:revert` (write `down()` carefully; financial tables are never dropped in down-migrations without a backup).

## Backup & restore drill — implemented and run (unencrypted dump, see also the encrypted scripts below)
```bash
scripts/backup-drill.sh      # dump -> restore into a scratch DB -> verify -> drop
```
The drill (1) dumps the live database, (2) restores it into a scratch database, (3) proves the copy is faithful (row count **and content checksum** for every table), (4) runs `scripts/ledger-invariants.sql` on the restored copy (no over-allocated charge, every recorded payment fully allocated, receipt numbers unique and gap-free, call totals exact, tantièmes = 1000, tenant consistency, verified ⇔ matched to exactly one bank line, CHECK constraints and triggers still present), (5) proves the append-only audit trigger still rejects updates, (6) cleans up. Exit code ≠ 0 means **do not trust the backup**. It was verified against the dev database, and verified to *fail* on a deliberately corrupted copy (missing allocation, dropped constraint, dropped trigger, differing checksum). Point it at another database with `PG_EXEC`, `PGUSER`, `PGDATABASE`. Run it after every migration and on a schedule; `backups/` is git-ignored — real dumps contain personal data and must be stored encrypted, off-site.

## Encrypted backups — scripts written and run locally, NOT scheduled anywhere
`scripts/backup-encrypted.sh` dumps the database **straight into gpg** (AES-256, passphrase read from `BACKUP_PASSPHRASE_FILE`; the plaintext never touches the disk), then re-decrypts the result and lists the archive to prove it is readable, writes a SHA-256, optionally copies it off-site (`BACKUP_UPLOAD_CMD`, e.g. `rclone copyto {file} offsite:syndicma/$(basename {file})`; a failing copy fails the run with exit 3) and prunes local copies older than `RETENTION_DAYS` (14). `scripts/restore-encrypted.sh <file.dump.gpg> [target_db]` restores into a **new** database (it refuses to overwrite an existing one), checks the checksum, runs the ledger invariants and the append-only audit protection, and with `COMPARE_WITH=<db>` compares every table with a live database. Tested locally: backup → restore reproduces all 25 tables exactly; a wrong passphrase, a tampered file (with and without checksum), an existing target database, a short passphrase and a failing off-site command are all refused.

Schedule it yourself, for example with cron on the host (daily 02:30, weekly restore test):
```
30 2 * * *  BACKUP_PASSPHRASE_FILE=/etc/syndicma/backup.pass BACKUP_UPLOAD_CMD='rclone copyto {file} offsite:syndicma/$(basename {file})' PG_EXEC='docker exec -i syndicma-db-1' /opt/syndicma/scripts/backup-encrypted.sh >>/var/log/syndicma-backup.log 2>&1
15 4 * * 0  BACKUP_PASSPHRASE_FILE=/etc/syndicma/backup.pass PG_EXEC='docker exec -i syndicma-db-1' /opt/syndicma/scripts/restore-encrypted.sh "$(ls -t /var/backups/syndicma/*.gpg | head -1)" >>/var/log/syndicma-restore.log 2>&1
```
**Still your job (nothing here can do it for you):** keep the passphrase in a place that is NOT the same server — without it every backup is unreadable by design; choose the off-site target and its credentials; alert when the cron run fails or no new file appears; point-in-time recovery (WAL archiving) is not set up, so the recovery point is the last daily dump (RPO up to 24 h; target RPO ≤ 5 min and RTO ≤ 1 h are NOT validated). Procedure: stop writes → restore into a new database → run pending migrations → verify → switch traffic.

## HTTPS and HSTS
The web container only speaks HTTP; TLS is terminated by a proxy in front. `ops/tls/` has a Caddy example (automatic Let's Encrypt certificates): `DOMAIN=syndic.example.com docker compose -f docker-compose.yml -f ops/tls/docker-compose.tls.yml up -d` — it needs a real public domain pointing at the server, so it was **only validated syntactically** (`caddy validate`, `docker compose config`), never run with a certificate. nginx sends `Strict-Transport-Security` **only for requests that arrived over HTTPS** (`X-Forwarded-Proto: https`), verified against the real nginx image (header present behind the proxy, absent over plain HTTP). The API's refresh cookie is `Secure` in production, so a deployment without HTTPS cannot keep a session (except on localhost): that is intentional. Not done: HSTS preload, certificate-expiry monitoring.

## Installable app (PWA)
The production build ships a web manifest (name, icons incl. a maskable one, `standalone`, theme colour) and an Angular service worker that caches **the application shell only** (`frontend/ngsw-config.json`: scripts, styles, icons; `dataGroups` is empty and `/api/**` is excluded from navigation). **No API response is ever cached**, so private data never lands in the browser cache (tested: after browsing finance and payments the cache holds no `/api/` URL). Offline, the login screen opens; anything needing data needs the network, by design. The worker is disabled under `ng serve` so it cannot serve stale code to developers. nginx revalidates (`no-cache`) `ngsw-worker.js`, `ngsw.json`, `manifest.webmanifest` and `index.html` (they decide which release runs) and caches hashed bundles as immutable; the manifest is served as `application/manifest+json` (nginx has no mime entry for it). New releases are picked up on the next load after the worker re-checks `ngsw.json`; there is no "update available" prompt yet. **Not done:** offline data, background sync, **push notifications** (they need a Web Push key pair and a decision on what may be pushed), install prompt UI, an App Store / Play Store package.

**A bug the PWA test found, now fixed:** Angular's default "inline critical CSS" injected an inline `onload` handler that the strict CSP (`script-src 'self'`) blocks, so **the production build served by nginx showed the whole app unstyled**. `optimization.styles.inlineCritical` is now `false`, and `e2e/tests/09-pwa.spec.ts` fails if the stylesheet does not apply or if the CSP blocks anything. The PWA spec needs the production build behind nginx (the service worker is off in dev), see `e2e/README.md`.

## Antivirus for uploads
Set `CLAMAV_HOST` (and `CLAMAV_PORT`, default 3310) to a ClamAV daemon; `docker compose --profile antivirus up -d` starts one (needs ~1–2 GB RAM, downloads signatures for a few minutes on first start). Files are scanned **after** the type/size checks and **before** anything is stored: infected → 422 and an audit entry, nothing written. **Fail closed:** if the scanner is unreachable the upload is refused (503); `CLAMAV_FAIL_OPEN=true` accepts unscanned files, as an explicit operator choice. With `CLAMAV_HOST` empty, uploads are not scanned (a warning is logged). Counters: `syndicma_upload_scan_total{result=clean|infected|error|disabled}`. Tested with a fake daemon that speaks the real clamd INSTREAM protocol (chunking, marker across a chunk boundary, garbage answer, hang, refused connection) and the standard EICAR test string; **never run against a real ClamAV**, so signature updates and real detection rates are unverified. Existing files uploaded before this was enabled are not rescanned.

## Background jobs
Run inside the API process (no separate worker yet). `JOBS_ENABLED` (`true`/`false`; default: on, except when `NODE_ENV=test`), `JOBS_INTERVAL_MS` (default 900000, minimum 60000; first run 30 s after boot). Each run takes a PostgreSQL advisory lock, so several API instances never run the jobs at the same time; a failing job is logged and does not stop the others. Jobs: overdue-charges digest to admin/accountant (once per residence and day), assembly reminders to owners (3 days before), purge of refresh tokens expired for 7+ days, reset tokens expired for 1+ day, read notifications older than 90 days and any older than 1 year. Each run is counted in Prometheus (see Alerting).

## Monitoring
`GET /api/metrics` (Prometheus text format) exists **only when `METRICS_TOKEN` is set**, and requires `Authorization: Bearer <METRICS_TOKEN>` (constant-time comparison; a user JWT does not work). Series: `syndicma_http_requests_total{method,route,status}` and `syndicma_http_request_duration_seconds` (route **templates**, so no ids), `syndicma_login_total{result}`, `syndicma_refresh_reuse_total`, `syndicma_password_reset_requests_total`, process uptime/memory. No identifiers, e-mails or tokens ever appear in labels (tested). Suggested alerts: any increase of `syndicma_refresh_reuse_total` (possible token theft); failed-login ratio spike; 5xx rate > 1 %; p95 latency; 429 spike. Do not expose `/api/metrics` through the public nginx; scrape it from inside the network.

## Alerting (rules written and validated, not yet wired to a real Prometheus)
`ops/prometheus/` holds `alerts.yml` (10 rules), an example `prometheus.yml` (scrape with the bearer token read from a file, rule files, Alertmanager target) and an example `alertmanager.yml` whose receiver is a **placeholder** (choosing the channel — e-mail, chat, pager — is an operational decision). Rules: refresh-token reuse (critical), failed-login spike, repeated wrong second-factor codes, password-reset burst, API not scrapable, 5xx > 1 %, p95 latency > 1 s, memory > 1.5 GB, background job failed, background jobs stale (no success for 2 h; silence it if you run with `JOBS_ENABLED=false`). The jobs export `syndicma_job_runs_total{job,result}` and `syndicma_job_last_success_timestamp_seconds{job}`. **Validated with `promtool check rules/config` and `amtool check-config` (Prometheus 2.55.1 / Alertmanager 0.27.0 in Docker), and a test fails if a rule mentions a metric the code does not export.** What has NOT been done: running them against a live Prometheus with real traffic, so the thresholds are starting points to tune, and nothing has proven yet that a firing alert reaches a human.

## Still missing in monitoring
DB pool metrics, structured JSON logs with PII redaction, uptime probe from outside, a dashboard.

## Sessions behind a reverse proxy
The refresh token is an HttpOnly cookie on `/api/auth`. Serve the web app and `/api` from the **same origin** (the provided nginx does) so `SameSite=Strict` works and no CORS is needed. Terminate TLS in front (see HTTPS and HSTS above). Never expose the API on a different site without revisiting the cookie/CSRF settings.
