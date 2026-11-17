import { defineConfig } from '@playwright/test';

/**
 * Full-stack browser tests. They drive the real Angular app against the real API and PostgreSQL.
 *  - Uses the system Google Chrome (no browser download): `channel: 'chrome'`.
 *  - Each run seeds a FRESH organization (global-setup.ts), so runs never depend on leftovers.
 *  - Locally: starts the API (backend/dist, run `npm run build` once) and `ng serve`, and fails if the
 *    ports are taken (set E2E_REUSE=1 to reuse servers you started yourself). Set E2E_NO_SERVERS=1 to manage the servers yourself.
 */
// Dedicated port: 4200 is the default of every Angular project, so another app may already be there.
const WEB_PORT = process.env.E2E_WEB_PORT ?? '4290';
// Reusing a running server is opt-in (E2E_REUSE=1): silently testing some other app is worse than failing.
const reuse = !!process.env.E2E_REUSE;

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1, // tests share one seeded organization and change its state in a meaningful order
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`,
    channel: 'chrome',
    headless: true,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.E2E_NO_SERVERS
    ? undefined
    : [
        {
          command: 'node dist/main.js',
          cwd: '../backend',
          url: 'http://localhost:3000/api/health',
          reuseExistingServer: reuse,
          timeout: 120_000,
          // The suite logs in far more than the production limit (10/min/IP) allows; the limiter itself is covered by the API tests.
          // Access tokens live only 4 s here, so every long test also exercises silent refresh continuously.
          env: { THROTTLE_AUTH_LIMIT: '100000', THROTTLE_LIMIT: '1000000', ACCESS_TTL_SECONDS: '4' },
        },
        { command: `npx ng serve --port ${WEB_PORT}`, cwd: '../frontend', url: `http://localhost:${WEB_PORT}`, reuseExistingServer: reuse, timeout: 240_000 },
      ],
});
