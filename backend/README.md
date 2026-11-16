# Syndic.ma API (NestJS + PostgreSQL + TypeORM)

Modular monolith. Modules: `auth`, `properties` (residences, buildings, units, residents), `finance` (calls for funds, charges, payments, allocations, statements), `ops` (providers, expenses, complaints, announcements), `admin` (users, organizations, audit), `common` (RBAC, scope/tenant isolation, audit).

## Run locally
```bash
cd backend
docker compose up -d                 # PostgreSQL on localhost:55432
cp .env.example .env
npm ci
npm run migration:run
SEED_PASSWORD='choose-a-password' npm run seed   # optional demo org (prints accounts)
npm run start:dev                    # http://localhost:3000/api  — Swagger: /docs
```

## Test
```bash
docker compose exec -T db psql -U syndicma -d syndicma -c "CREATE DATABASE syndicma_test"   # once
npm test            # unit (no DB)
npm run test:e2e    # integration against PostgreSQL (DATABASE_URL_TEST overrides the default)
```
Last local run: **73 tests passed** (12 unit, 61 e2e).

## Design rules
- Every tenant table has `org_id`; all access goes through `ScopeService`; out-of-scope ⇒ 404.
- Money is `numeric(14,2)`, computed in integer centimes. A charge's paid amount is derived from allocations of `recorded` payments.
- Recorded payments are never deleted — reversed with a reason. Receipts are numbered atomically per organization/year.
- Authorization is re-read from the DB on every request; schema changes only via migrations.

Not implemented yet: assemblies, documents/uploads, maintenance work orders, notifications/jobs, MFA/password reset, row-level security. See `../docs/SECURITY.md` and `../docs/PRODUCT.md`.
