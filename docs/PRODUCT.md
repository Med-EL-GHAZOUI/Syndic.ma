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
- [~] **Phase 4** backend done: auth (JWT + refresh rotation, password change), RBAC, tenant isolation, properties, finance, expenses, providers, complaints, announcements, **maintenance, assemblies, documents with secure uploads**, users/orgs/audit, Swagger, migrations, 136 tests. **Angular frontend (`frontend/`, Angular 20): vertical slice wired to the API** — login with silent refresh (HttpOnly-cookie session), settings with password change, shell/RBAC nav, FR/AR + RTL, dashboard, residences, units, finance (calls/charges/statement), payments (record/declare/confirm/reject/reverse), expenses (approve/pay/cancel), complaints (thread + status), announcements (audiences), users, audit, **bank reconciliation + period closing, documents (real upload/download), maintenance (provider-scoped lifecycle), providers, password reset pages**; 24 unit tests, every flow verified in the browser per role. **Also done: assemblies (attendance weighted by tantièmes, votes, minutes), reports (finance/arrears/expenses/complaints, capped at 200 rows per list with a visible warning), platform admin (organizations), in-app notifications (bell, FR/AR, polling every 60 s) and background jobs** (overdue digest, assembly reminders, token/notification purge; pg advisory lock, idempotent). 157 backend e2e + 35 unit, 29 frontend unit. **Two-factor authentication (TOTP) with recovery codes and admin reset** done (optional, not enforced for admins). **Not done:** object storage (local disk for now), push/e-mail/SMS notification channels, user notification preferences, no test of the platform page in a browser (no super admin in the e2e seed)
- [~] **Phase 5** done in the API: auditable ledger (allocations, partial payments, reversals, receipts, statements), **bank reconciliation** (strict CSV import, idempotent, conservative auto-match, bank-verified payments cannot be reversed until un-matched) and **period closing** (forward-only, append-only, enforced on payments and expenses). 179 backend tests. UI done. **Not done:** bank-format adapters (CAMT/MT940/bank-specific CSV), tax/invoice rules
- [~] **Phase 6** threat model + legal flags written ([SECURITY.md](SECURITY.md)); throttling, input hardening, upload validation, password change, tenant-isolation and schema-guard tests done. password reset by e-mail done. **Done: optional TOTP two-factor authentication** (recovery codes, admin reset). **Not done:** RLS, antivirus/object storage for uploads, mandatory MFA for admins, e-mail verification, privacy tooling (export/erasure/retention), pen test. **Legal review required** (Law 09-08 / CNDP, Law 18-00 as amended by 106-12)
- [~] **Phase 7** Dockerfiles for API and web (nginx, CSP), full-stack `docker-compose.yml` tested from a clean database, CI workflow (runs on GitHub, green), **restore drill script (verified, incl. a failing case)**, **Prometheus metrics**, [DEPLOYMENT.md](DEPLOYMENT.md). **Browser E2E (Playwright, 29 tests, mutation-checked) done locally.** **Not done:** staging/prod environments, alerting rules **written and validated with promtool/amtool** (`ops/prometheus/`) but not yet running against a live Prometheus/Alertmanager, scheduled encrypted off-site backups, HTTPS/HSTS in front
- [ ] **Phase 8** payment gateway (needs provider + compliance verification first), e-mail/SMS/WhatsApp, PWA, AI assistant — not started

## Decisions log
- D1 Hash router + ES modules, no build step, to stay runnable with any static server.
- D2 Repository-style store (`db.*`) so pages migrate to HTTP calls untouched.
- D3 Seed uses fixed PRNG and dates relative to today; all identities are fictitious (`example.com`, `+2126000…`).
- D4 Documents store metadata only; no file content in the browser store.
- D5 Votes in assemblies are weighted by tantièmes; majority shown is **indicative** — legal thresholds to be confirmed.
