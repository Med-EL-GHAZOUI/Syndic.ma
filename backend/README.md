# Syndic.ma API (NestJS + PostgreSQL + TypeORM)

Modular monolith. Modules: `community` (maintenance, assemblies, documents/uploads), `auth`, `properties` (residences, buildings, units, residents), `finance` (calls for funds, charges, payments, allocations, statements), `ops` (providers, expenses, complaints, announcements), `admin` (users, organizations, audit), `common` (RBAC, scope/tenant isolation, audit).

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

## First platform admin (works in production; `seed` does not)
```bash
SUPERADMIN_EMAIL=root@example.com SUPERADMIN_PASSWORD='at-least-12-chars' node dist/create-super-admin.js
```

## Test
```bash
docker compose exec -T db psql -U syndicma -d syndicma -c "CREATE DATABASE syndicma_test"   # once
npm test            # unit (no DB)
npm run test:e2e    # integration against PostgreSQL (DATABASE_URL_TEST overrides the default)
```
Last local run: **179 tests passed** (unit + e2e, fresh database).

## Design rules
- Every tenant table has `org_id`; all access goes through `ScopeService`; out-of-scope ⇒ 404.
- Money is `numeric(14,2)`, computed in integer centimes. A charge's paid amount is derived from allocations of `recorded` payments.
- Recorded payments are never deleted — reversed with a reason. Receipts are numbered atomically per organization/year.
- Authorization is re-read from the DB on every request; schema changes only via migrations.

Also: bank reconciliation + period closing (`/api/reconciliation/*`, `/api/finance/closures`), password reset by e-mail, `/api/metrics`. Not implemented yet: in-app notifications/background jobs, object storage (uploads use local disk under `STORAGE_DIR`), MFA / password reset by e-mail, row-level security, bank reconciliation.

⚠️ Never apply a `migration:generate` output unreviewed: it drops hand-written CHECK constraints (see `docs/SECURITY.md`). `test/e2e/schema-guard.e2e-spec.ts` guards this. See `../docs/SECURITY.md` and `../docs/PRODUCT.md`.
