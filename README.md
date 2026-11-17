# Syndic.ma

Moroccan multi-tenant SaaS for condominium management (syndic companies, managers, accountants, residents, providers). French + Arabic (RTL/LTR), amounts in MAD.

> **Status: Phase 1 prototype.** Vanilla HTML/CSS/JS with fictitious data in `localStorage`.
> Authentication and payments are **simulated and not secure**. See [docs/PRODUCT.md](docs/PRODUCT.md).

## Run

ES modules need an HTTP server (opening the file directly will not work):

```bash
python -m http.server 5173
```

Then open <http://localhost:5173/> (landing) or <http://localhost:5173/app.html> (app).
Demo accounts are listed on the login screen; the password is `demo1234`.
*Settings → Réinitialiser* restores the initial dataset.

## Stack (Phases 4+)
`backend/` NestJS + PostgreSQL API · `frontend/` Angular 20 app (partial: login/reset, dashboard, residences, units, finance, payments, bank reconciliation, expenses, complaints, announcements, documents, maintenance, providers, users, audit, settings — assemblies, reports and platform admin still only in the prototype) · root `docker-compose.yml` for the full stack. See `backend/README.md`, `docs/DEPLOYMENT.md`, `docs/PRODUCT.md`. The vanilla prototype below remains the reference UI for modules not yet ported.

Browser end-to-end tests: `e2e/` (Playwright, system Chrome) — see `e2e/README.md`.

## Layout (vanilla prototype)

```
index.html            public landing page (FR/AR)
app.html              application shell (hash router)
assets/css            tokens, base, components, layout, landing
assets/js/core        store (localStorage repo), auth (simulated), permissions, finance rules, i18n, format
assets/js/ui          modal, forms, list view, charts, shell, icons, toasts
assets/js/pages       one module per business area
assets/js/data        seed dataset + plans
assets/js/i18n        fr.js / ar.js
docs/                 product vision, architecture & UML (Mermaid)
```

Pages only use `db.all/get/insert/update/remove`, which maps onto a future REST API / TypeORM repositories.

## Verified so far

Checked in a browser (Chromium pane): all routes for all 8 demo accounts render without JS errors in FR and AR; RTL; no horizontal overflow at 375 px on all main pages; form validation; payment → receipt flow; finance invariants (calls sum to totals, tantièmes = 1000, no overpayment, reversal restores balance).
**Not yet done:** automated tests, a full keyboard/screen-reader audit, real-device testing.
