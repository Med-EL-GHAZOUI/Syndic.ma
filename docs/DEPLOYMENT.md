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

Required env: `DATABASE_URL`, `JWT_ACCESS_SECRET`. Optional: `STORAGE_DIR` (uploads; mount a persistent, access-restricted volume or switch to object storage), `ACCESS_TTL_SECONDS` (900), `REFRESH_TTL_DAYS` (14), `CORS_ORIGIN`, `PORT`, `DATABASE_SSL=true`, `THROTTLE_AUTH_LIMIT`, `THROTTLE_LIMIT`, `BCRYPT_COST` (≥ 10 in prod).

## CI
`.github/workflows/ci.yml`: type-check → build → unit tests → e2e tests (PostgreSQL service) → `npm audit --omit=dev --audit-level=high` → Docker build. **The workflow has not been run on GitHub yet** — it mirrors the local commands that pass.

## Migrations
Generated with `npm run migration:generate -- src/migrations/Name`, reviewed by hand, applied once per deploy before the new version starts. `IntegrityRules` adds the append-only audit trigger, payment-delete protection and CHECK constraints. Rollback = `typeorm migration:revert` (write `down()` carefully; financial tables are never dropped in down-migrations without a backup).

## Backups & recovery (to implement and **test**)
- Automated daily full backup + WAL archiving (point-in-time recovery), encrypted, stored in a different region/account.
- Target RPO ≤ 5 min, RTO ≤ 1 h (to be validated).
- Quarterly **restore drill** into a scratch environment, then run `npm run test:e2e` invariants queries (see `finance.e2e-spec.ts` "global ledger invariants") against the restored DB.
- Procedure: stop writes → restore snapshot / PITR to target time → run pending migrations → verify invariants → switch traffic.

## Monitoring (not done)
Health endpoint exists. Still to do: metrics (latency, error rate, DB pool), structured JSON logs with PII redaction, alerts (5xx rate, failed-login spikes, refresh-reuse events, DB lag), uptime probe.
