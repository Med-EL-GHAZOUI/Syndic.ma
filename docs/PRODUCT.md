# Syndic.ma — product, roadmap, decisions

## Roles & scope
| Role | Scope | Main rights |
|---|---|---|
| Super Admin | whole platform | organizations, subscriptions, platform audit |
| Syndic Admin | own organization | everything in the org, users, approve expenses, validate/reverse payments |
| Gestionnaire | assigned residences | day-to-day: lots, residents, tickets, announcements, assemblies, record payments |
| Comptable | org | charges, validate/reverse payments, approve/pay expenses, reports |
| Résident propriétaire | own lots | own charges/statement, declare payments, complaints, announcements, assemblies, documents |
| Résident locataire | own lots | complaints, announcements, documents |
| Prestataire | own work orders | view/update assigned interventions |

Tenant isolation: every row carries `orgId` or a `residenceId` belonging to one org; `core/permissions.js` scopes all reads. Phase 1 enforces this only in the UI.

## Modules → files
Auth `core/auth.js` · Organizations `pages/platform.js` · Residences/buildings `pages/residences.js` · Lots `pages/units.js` · Residents + history `pages/residents.js` · Finance `core/finance.js`, `pages/finance.js`, `pages/payments.js` · Expenses `pages/expenses.js` · Complaints `pages/complaints.js` · Maintenance `pages/maintenance.js` · Announcements · Documents · Assemblies · Reports · Audit · Providers.

## Financial rules (implemented in Phase 1)
1. Paid amount of a charge is **derived** from recorded payment allocations, never stored.
2. A call for funds issues one charge per lot; amounts sum exactly to the total (rounding remainder on the last lot).
3. Payments are manual records (`verified: false`). Residents *declare*; staff *validate*.
4. Confirmed payments are **reversed with a reason, never deleted**; receipts are numbered and never reused.
5. A payment cannot exceed what a lot owes; allocation is oldest-first.

## Roadmap & checklist
- [x] **Phase 1** vanilla frontend prototype
- [~] **Phase 2** quality — manual browser checks done (see README); automated tests, a11y audit, device testing pending
- [x] **Phase 3 (draft)** architecture & UML → [ARCHITECTURE.md](ARCHITECTURE.md) (needs review)
- [~] **Phase 4** backend done for: auth (JWT + refresh rotation), RBAC, tenant isolation, residences/buildings/units/residents, finance, expenses, providers, complaints, announcements, users/orgs/audit, Swagger, migrations, 73 tests. **Not done:** Angular frontend (the vanilla prototype is still the UI and is not wired to the API), assemblies/documents/maintenance endpoints, file storage, background jobs
- [~] **Phase 5** auditable finance implemented in the API (allocations, partial payments, reversals, receipts, statements, DB-level guarantees, concurrency tests). **Not done:** bank reconciliation / statement import, period closing, tax/invoice rules
- [~] **Phase 6** threat model + legal flags written ([SECURITY.md](SECURITY.md)); throttling, input hardening, tenant-isolation tests done. **Not done:** RLS, secure uploads, MFA/password reset, privacy tooling (export/erasure/retention), pen test. **Legal review required** (Law 09-08 / CNDP, Law 18-00 as amended by 106-12)
- [~] **Phase 7** Dockerfile (smoke-tested), CI workflow (not yet run on GitHub), [DEPLOYMENT.md](DEPLOYMENT.md). **Not done:** browser E2E, staging/prod environments, monitoring, tested backup/restore
- [ ] **Phase 8** payment gateway (needs provider + compliance verification first), e-mail/SMS/WhatsApp, PWA, AI assistant — not started

## Decisions log
- D1 Hash router + ES modules, no build step, to stay runnable with any static server.
- D2 Repository-style store (`db.*`) so pages migrate to HTTP calls untouched.
- D3 Seed uses fixed PRNG and dates relative to today; all identities are fictitious (`example.com`, `+2126000…`).
- D4 Documents store metadata only; no file content in the browser store.
- D5 Votes in assemblies are weighted by tantièmes; majority shown is **indicative** — legal thresholds to be confirmed.
