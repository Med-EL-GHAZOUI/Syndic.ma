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
- Access token in memory only. The refresh token is an **HttpOnly, SameSite=Strict cookie scoped to `/api/auth`** (`Secure` in production): JavaScript cannot read it, so an XSS can no longer steal a long-lived session. The browser keeps only a non-secret hint (`syndicma.session=1`) to know whether to try a silent refresh. Refresh/logout also require a custom `X-Requested-With: syndicma` header (CSRF defence in depth); the token is never accepted from a request body or returned in a response body (tested).
- Refresh is single-flight (tested): parallel 401s share one rotation, otherwise the API would flag token reuse and revoke the session.
- UI permission checks are cosmetic; the API re-checks everything.

## Known gaps (do before production)
- ⬜ **Row-level security** in PostgreSQL as defence in depth (policy on `org_id` with `SET LOCAL app.org_id`).
- 🟡 **Uploads**: implemented and tested — 10 MB cap, extension allow-list that must match the file's magic bytes (client MIME/name never trusted), random storage keys, sanitized display names, always `attachment` + `nosniff`, access-controlled and audited downloads. **Still missing:** antivirus scan, zip-bomb/OOXML deep inspection, private object storage with signed URLs (local disk today), per-tenant quotas.
- ✅ Password change (current password required, ≥ 12 chars, **all sessions revoked**) and **password reset by e-mail**: identical 202 answer for existing/unknown addresses (no enumeration), 30-minute single-use link carried in the URL *fragment* (never in logs/Referer), only a SHA-256 hash stored, a new request invalidates the previous link, max 3 reset e-mails per account per hour, nothing sent for disabled users or suspended organizations, reset revokes every session, mail failures never change the response (10 tests). ⬜ E-mail address verification, breach-password check, password-step account lockout.
- ✅ **Two-factor authentication (TOTP, RFC 6238)**, optional per user: secret AES-256-GCM encrypted at rest (key from `MFA_ENCRYPTION_KEY`, ciphertext bound to the user id), login becomes password → 5-minute challenge token (signed with a separate key, so it is never an access token) → code; a code works once (replay protection, atomic), 5 wrong codes lock the second step 15 minutes, 10 single-use recovery codes stored only as hashes, disabling needs password + code, an organization admin can reset a colleague (sessions revoked, audited). No endpoint returns the secret after enrolment (tested). RFC test vectors, 15 API tests, 5 browser tests. ⬜ Not done: mandatory MFA for admin roles (it is optional for everyone), QR code (the key and an otpauth link are shown), WebAuthn/passkeys, trusted-device memory.
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

## Incidents #3 and #4 — found while verifying the cookie flow
- **Interceptor logged users out on any business 401.** `catchError` wrapped both the token refresh and the replayed request, so a legitimate 401 on the replay (wrong current password) was treated as an expired session. Fixed (only a failed refresh ends the session), regression test added; the API now answers **403** for a wrong current password (the caller is authenticated, only the re-confirmation failed).
- **Malformed cookie → HTTP 500.** `decodeURIComponent` threw on bad percent-encoding. Now treated as "no cookie" (401); covered by a test.
Both were caught by driving the real UI/API, not by the original tests — which is why the e2e suite keeps a test for each.

## Incidents #5–#7 — found while building reconciliation and monitoring
- **Closed accounting periods were not enforced for raw reads.** `node-postgres` parses SQL `date` into a JavaScript `Date` (server time zone); raw queries then compared a `Date` with an ISO string and the comparison was silently false, so a payment inside a closed period could be reversed. Fixed at the root (`src/pg-types.ts`: `date` stays a `YYYY-MM-DD` string everywhere), plus a test that reverses a payment inside a closed period.
- **A migration depended on mutable code.** `RepairIntegrity` imported the shared constraint list; when that list grew (new tables) a *fresh* database failed at that old migration. Migrations are immutable: the list is now a frozen snapshot inside the migration. `migration:generate` is also wrapped (`backend/scripts/generate-migration.js`) so it automatically strips the `DROP/ADD CONSTRAINT "chk_*"` statements TypeORM wants to emit.
- **Metrics were blind to the most important responses.** The first version used a Nest interceptor, which never sees what *guards* reject (401/403/429). Replaced by an HTTP-layer middleware; a test asserts that a guard-issued 403 is counted.

## Incident #2 — timestamps without time zone
Audit and business timestamps were `timestamp WITHOUT time zone`, so the driver read database-clock values as local time and every date (including the audit trail) was shifted by the server's UTC offset. Spotted while checking the new audit page in the browser. Fixed with the hand-written `TimestampsWithTimeZone` migration (`ALTER … TYPE timestamptz USING … AT TIME ZONE 'UTC'`, data-preserving; a generated migration would have dropped the columns) and guarded by two tests (no time-zone-less column; recent audit entries are within seconds of "now").

## Security testing in the repo
`backend/test/e2e/*.e2e-spec.ts` and `backend/test/unit/*` — 132 tests (auth, isolation, finance, community/uploads, schema guard) against real PostgreSQL covering authentication, refresh rotation/reuse, immediate revocation, RBAC per role, cross-tenant IDOR attempts, scope, input hardening, SQL-injection strings, concurrency and database-level guarantees.
