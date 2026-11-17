# Browser end-to-end tests (Playwright)

They drive the **real Angular app** against the **real API and PostgreSQL** in **system Google Chrome**
(no browser download). Each run seeds a fresh organization (one user per role), so runs never depend on leftovers.

## Run locally
```bash
docker compose -f ../backend/docker-compose.yml up -d     # PostgreSQL
cd ../backend && npm ci && npm run build && npm run migration:run && cd ../e2e
npm ci
npx playwright test            # starts the API (backend/dist, port 3000) and `ng serve` (port 4290) itself
npx playwright show-report     # after a failure: traces + screenshots in test-results/
```
`E2E_NO_SERVERS=1` lets you manage the servers yourself; `E2E_REUSE=1` reuses servers already running. Reuse is opt-in on purpose: port 4200 (every Angular project's default) may hold *another* app, and silently testing it gives confusing failures. The web port is `E2E_WEB_PORT` (default 4290).

## What is covered (29 tests + 5 PWA tests, run separately)
- **Auth/session:** redirect when logged out, generic wrong-password message, HttpOnly/SameSite=Strict refresh cookie and no token in browser storage, session restored after reload, logout, password change signs every session out, **expired access token refreshed transparently with exactly ONE refresh for parallel requests**.
- **RBAC:** menus and forbidden pages for owner, tenant, provider, manager, accountant.
- **Payments:** declare → validate (receipt) → reverse with a reason; over-payment refused.
- **Bank reconciliation:** invalid CSV refused with line numbers, idempotent import, match, *bank-verified payments cannot be reversed until un-matched*, forward-only period closing.
- **Documents:** content-based upload validation (executable renamed `.pdf` refused), authenticated download (same bytes), audience visibility.
- **Assemblies:** plan → convene → tantième-weighted attendance → vote (over-represented votes refused by the API) → hold; a held assembly is frozen and cannot be deleted; owners see results but not who attended; tenants are forbidden.
- **Reports:** finance / arrears / expenses / complaints tabs for staff; forbidden for tenants.
- **Notifications:** an owner is notified of an owners-only announcement, reads it (counter, link), sees it translated when the language changes; a tenant is not notified; the bell closes with Escape or an outside click.
- **Two-factor:** enrolment (wrong code refused), recovery codes shown once, password alone opens no session, wrong code refused, right code signs in and survives reload, a recovery code works once, an admin resets a colleague; the TOTP code is computed by an independent implementation in the test.
- **Language:** Arabic switches to RTL, translates, persists.

## PWA spec (production build behind nginx)
`tests/09-pwa.spec.ts` is skipped unless `E2E_PWA_BASE_URL` is set, because the service worker only exists in the production build. To run it (API on port 3000 as usual):
```bash
cd ../frontend && npx ng build --configuration production
docker run -d --name syndicma-pwa -p 18088:8080 -e API_UPSTREAM=<host-ip>:3000 \
  -v "$PWD/dist/frontend/browser:/usr/share/nginx/html:ro" \
  -v "$PWD/nginx.conf.template:/etc/nginx/templates/default.conf.template:ro" nginxinc/nginx-unprivileged:1.27-alpine
cd ../e2e && E2E_NO_SERVERS=1 E2E_PWA_BASE_URL=http://localhost:18088 npx playwright test tests/09-pwa.spec.ts
```
(`<host-ip>` is how the container reaches the API, e.g. the IP `host.docker.internal` resolves to: nginx's own resolver does not know that name.) It checks the manifest and its icons, that the production build is styled with a strict CSP that blocks nothing, that the service worker takes control and the login screen opens offline, that nothing from `/api` is cached, and the cache headers. It is NOT part of the default run or of CI yet.

## Test-API settings (see `playwright.config.ts`)
`ACCESS_TTL_SECONDS=4` so access tokens expire constantly (every long test also exercises silent refresh), and
the auth rate limits are raised (the production limit is 10 logins/minute/IP and is covered by the API tests).

## Are these tests worth anything? (mutation checks)
Passing proves little on its own, so the important ones were verified to **fail when the code is broken**:
- removing the single-flight refresh in `AuthService` makes the "ONE refresh" test fail;
- re-introducing the interceptor bug (a business 401 after a refresh signs the user out) is caught by the **unit** test
  `auth.interceptor.spec.ts`, *not* by a browser test — the API answers 403 for a wrong current password, so no browser
  scenario reaches that path any more.

`manager2` is reserved for tests that change credentials; do not use it elsewhere.
