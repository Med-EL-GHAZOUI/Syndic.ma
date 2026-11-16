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

Required env: `DATABASE_URL`, `JWT_ACCESS_SECRET`. For password-reset e-mails in production (`MAIL_TRANSPORT` is forced to `smtp`): `MAIL_HOST`, `MAIL_PORT` (587 STARTTLS / 465 TLS), `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`, `APP_URL` (public base URL of the web app, used in the links). Provider choice, SPF/DKIM and data-processing terms are a business/compliance decision. Optional: `COOKIE_SECURE` (default: `true` in production — the refresh cookie is then only sent over HTTPS, except to `localhost`; set `false` ONLY for plain-HTTP internal tests), `STORAGE_DIR` (uploads; mount a persistent, access-restricted volume or switch to object storage), `ACCESS_TTL_SECONDS` (900), `REFRESH_TTL_DAYS` (14), `CORS_ORIGIN`, `PORT`, `DATABASE_SSL=true`, `THROTTLE_AUTH_LIMIT`, `THROTTLE_LIMIT`, `BCRYPT_COST` (≥ 10 in prod).

## Full stack with Docker Compose
```bash
export POSTGRES_PASSWORD=...  JWT_ACCESS_SECRET=...      # required, no defaults
docker compose up -d --build                              # db + api (runs migrations first) + web (nginx, port 8080)
SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=...   docker compose run --rm -e SUPERADMIN_EMAIL -e SUPERADMIN_PASSWORD api node dist/create-super-admin.js
```
Tested locally from an empty database: 4 migrations applied, health through nginx, super-admin login, tenant data denied to the platform admin. The web container serves the Angular build with a strict CSP (no inline scripts), `X-Frame-Options: DENY`, `nosniff`, and proxies `/api/` to the API. **Enable HSTS and terminate TLS in front of it before exposing it** (see the commented header in `frontend/nginx.conf.template`); nginx's resolver is `127.0.0.11` (Docker DNS) — adjust on other orchestrators.

## CI
`.github/workflows/ci.yml`: type-check → build → unit tests → e2e tests (PostgreSQL service) → `npm audit --omit=dev --audit-level=high` → frontend build + unit tests (headless Chrome) → Docker builds of API and web. **The workflow has not been run on GitHub yet** — it mirrors the local commands that pass.

## Migrations
Generated with `npm run migration:generate -- src/migrations/Name`, reviewed by hand, applied once per deploy before the new version starts. `IntegrityRules` adds the append-only audit trigger, payment-delete protection and CHECK constraints. Rollback = `typeorm migration:revert` (write `down()` carefully; financial tables are never dropped in down-migrations without a backup).

## Backup & restore drill — implemented and run
```bash
scripts/backup-drill.sh      # dump -> restore into a scratch DB -> verify -> drop
```
The drill (1) dumps the live database, (2) restores it into a scratch database, (3) proves the copy is faithful (row count **and content checksum** for every table), (4) runs `scripts/ledger-invariants.sql` on the restored copy (no over-allocated charge, every recorded payment fully allocated, receipt numbers unique and gap-free, call totals exact, tantièmes = 1000, tenant consistency, verified ⇔ matched to exactly one bank line, CHECK constraints and triggers still present), (5) proves the append-only audit trigger still rejects updates, (6) cleans up. Exit code ≠ 0 means **do not trust the backup**. It was verified against the dev database, and verified to *fail* on a deliberately corrupted copy (missing allocation, dropped constraint, dropped trigger, differing checksum). Point it at another database with `PG_EXEC`, `PGUSER`, `PGDATABASE`. Run it after every migration and on a schedule; `backups/` is git-ignored — real dumps contain personal data and must be stored encrypted, off-site.

## Backups & recovery (still to automate)
- Automated daily full backup + WAL archiving (point-in-time recovery), encrypted, stored in a different region/account.
- Target RPO ≤ 5 min, RTO ≤ 1 h (to be validated).
- Quarterly **restore drill** into a scratch environment, then run `npm run test:e2e` invariants queries (see `finance.e2e-spec.ts` "global ledger invariants") against the restored DB.
- Procedure: stop writes → restore snapshot / PITR to target time → run pending migrations → verify invariants → switch traffic.

## Monitoring
`GET /api/metrics` (Prometheus text format) exists **only when `METRICS_TOKEN` is set**, and requires `Authorization: Bearer <METRICS_TOKEN>` (constant-time comparison; a user JWT does not work). Series: `syndicma_http_requests_total{method,route,status}` and `syndicma_http_request_duration_seconds` (route **templates**, so no ids), `syndicma_login_total{result}`, `syndicma_refresh_reuse_total`, `syndicma_password_reset_requests_total`, process uptime/memory. No identifiers, e-mails or tokens ever appear in labels (tested). Suggested alerts: any increase of `syndicma_refresh_reuse_total` (possible token theft); failed-login ratio spike; 5xx rate > 1 %; p95 latency; 429 spike. Do not expose `/api/metrics` through the public nginx; scrape it from inside the network.

## Still missing in monitoring
Health endpoint exists. Still to do: metrics (latency, error rate, DB pool), structured JSON logs with PII redaction, alerts (5xx rate, failed-login spikes, refresh-reuse events, DB lag), uptime probe.

## Sessions behind a reverse proxy
The refresh token is an HttpOnly cookie on `/api/auth`. Serve the web app and `/api` from the **same origin** (the provided nginx does) so `SameSite=Strict` works and no CORS is needed. Terminate TLS in front and enable HSTS. Never expose the API on a different site without revisiting the cookie/CSRF settings.
