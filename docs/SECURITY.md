# Security & privacy (Phase 6 — partial)

Status legend: ✅ implemented and covered by tests · 🟡 implemented, not yet tested/hardened · ⬜ not done.

## Threat model (STRIDE, condensed)
| Threat | Mitigation | Status |
|---|---|---|
| **Spoofing** — stolen/guessed credentials | bcrypt (cost ≥ 10 enforced in prod), identical error for unknown user / bad password / disabled / suspended, dummy hash compare against timing leaks, per-IP throttling on `/auth/*` | ✅ (throttling configured; load behaviour untested) |
| Spoofing — stolen refresh token | opaque random token, only SHA-256 stored, single-use rotation, reuse ⇒ whole family revoked, atomic use-once (concurrent replay tested) | ✅ |
| Spoofing — forged JWT | HS256 only (algorithm pinned), secret ≥ 32 chars validated at boot, 15 min access TTL | ✅ |
| **Tampering** — mass assignment | global `ValidationPipe` `whitelist + forbidNonWhitelisted`; `orgId` never read from input | ✅ |
| Tampering — financial history | recorded payments never deleted (reverse with reason), DB trigger blocks DELETE, CHECK constraints, derived balances, all in transactions with row locks | ✅ |
| Tampering — audit log | append-only trigger (UPDATE/DELETE/TRUNCATE rejected), written in the same transaction as the change | ✅ (DB owner can still drop the trigger — restrict DB roles in prod) |
| **Repudiation** | audit trail with user, role, action, entity | ✅ |
| **Information disclosure** — cross-tenant (IDOR) | every query scoped by `orgId`; manager/resident scoping in `ScopeService`; out-of-scope ⇒ 404 not 403; tested with two orgs | ✅ |
| Disclosure — password hashes | never returned (tested) | ✅ |
| Disclosure — SQL injection | parameterized queries only (TypeORM + `$n` parameters); injection strings tested | ✅ |
| Disclosure — error detail / headers | Helmet; Swagger off in production; no stack traces to clients | ✅ |
| **DoS** | throttler (global + auth), pagination cap 200, body-size default | 🟡 (no WAF / per-tenant quotas) |
| **Elevation of privilege** | deny-by-default global guards; RBAC matrix identical to the UI; role/active re-read from DB each request (disable/suspend immediate); admins can't self-demote; `super_admin` not creatable via API | ✅ |

## Frontend notes
- Access token in memory only; refresh token in `sessionStorage` (readable by XSS). **Planned hardening:** httpOnly + SameSite cookie issued by the API, plus CSRF protection for the refresh endpoint. A strict CSP (`script-src 'self'`) in the nginx image limits XSS impact; Angular's template escaping is the first line of defence.
- Refresh is single-flight (tested): parallel 401s share one rotation, otherwise the API would flag token reuse and revoke the session.
- UI permission checks are cosmetic; the API re-checks everything.

## Known gaps (do before production)
- ⬜ **Row-level security** in PostgreSQL as defence in depth (policy on `org_id` with `SET LOCAL app.org_id`).
- 🟡 **Uploads**: implemented and tested — 10 MB cap, extension allow-list that must match the file's magic bytes (client MIME/name never trusted), random storage keys, sanitized display names, always `attachment` + `nosniff`, access-controlled and audited downloads. **Still missing:** antivirus scan, zip-bomb/OOXML deep inspection, private object storage with signed URLs (local disk today), per-tenant quotas.
- 🟡 Password change implemented (current password required, strength ≥ 12, **all sessions revoked**). ⬜ Password *reset* by e-mail, e-mail verification, **MFA** for admin roles, breach check, account lockout.
- ⬜ Secrets in a manager (Vault / cloud secrets), key rotation (JWT key id), separate DB roles (migrator vs app vs read-only) and TLS to the DB (`DATABASE_SSL=true`).
- ⬜ Structured logging with PII redaction, alerting, security headers review for the Angular app (CSP).
- ⬜ Backups: automated, encrypted, **restore tested** (see DEPLOYMENT.md).
- ⬜ Independent penetration test.

## Privacy & Moroccan legal framework — REQUIRES PROFESSIONAL VERIFICATION
This is engineering guidance, **not legal advice**. Have a Moroccan lawyer / the CNDP confirm every point below.

- **Law 09-08 (personal data) & CNDP** — the platform processes identity, phone, e-mail, occupancy and payment-behaviour data of residents. Likely obligations to verify: prior **declaration or authorization** to the CNDP by the data controller (who is the controller — the syndic company or Syndic.ma, and who is the processor?); information notice and, where required, consent; purpose limitation and retention periods; data-subject rights (access, rectification, objection); security measures; restrictions on **transfers outside Morocco** (relevant for hosting region and any foreign SaaS provider); breach handling.
  - Engineering hooks to plan: data export/erasure per resident, retention jobs, consent records, hosting in an approved region, processor agreements.
- **Law 18-00 on co-ownership (as amended by Law 106-12)** — governs the syndic, general assemblies, convocation, quorum and majority rules, voting and the keeping of accounts. The prototype's quorum/majority display is **indicative only**; thresholds, proxy limits and convocation deadlines must be taken from the law/lawyer before they are enforced in code. Likewise legal value of electronic minutes, receipts and signatures.
- **Payments** — recorded payments are bookkeeping entries, not proof of bank settlement. Using a payment provider requires checking licensing/PCI scope, KYC and tax/invoicing obligations (receipt wording and numbering requirements may apply).
- **Electronic communications** — e-mail/SMS/WhatsApp notifications need an opt-in basis and provider data-processing terms.

## Incident found by the tests (migration drift)
`typeorm migration:generate` emitted `DROP CONSTRAINT` for every hand-written CHECK (financial amounts, statuses, receipt/status coherence) because they are not declared in the entities. The e2e suite caught it (a raw `UPDATE charges SET amount = -1` succeeded). Fixed by removing the drops, adding the idempotent `RepairIntegrity` migration, centralising the rules in `src/migrations/integrity.ts` and adding `schema-guard.e2e-spec.ts`, which fails if any rule or trigger is missing. **Rule: never apply a generated migration without reading it.**

## Security testing in the repo
`backend/test/e2e/*.e2e-spec.ts` and `backend/test/unit/*` — 130 tests (auth, isolation, finance, community/uploads, schema guard) against real PostgreSQL covering authentication, refresh rotation/reuse, immediate revocation, RBAC per role, cross-tenant IDOR attempts, scope, input hardening, SQL-injection strings, concurrency and database-level guarantees.
