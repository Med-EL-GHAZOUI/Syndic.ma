import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Installable / offline app shell. It only exists in the PRODUCTION build (the service worker is off under `ng serve`),
 * so this spec runs against a production build served by the real nginx image, and is skipped otherwise:
 *   E2E_PWA_BASE_URL=http://localhost:18088 E2E_NO_SERVERS=1 npx playwright test tests/09-pwa.spec.ts
 * (see e2e/README.md for how to start that stack).
 */
const base = process.env.E2E_PWA_BASE_URL;
test.skip(!base, 'needs the production build behind nginx (E2E_PWA_BASE_URL)');
test.use({ baseURL: base });

/** Width/height of a PNG from its header, so the manifest cannot claim a size the file does not have. */
const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

test.describe('Progressive web app', () => {
  test('the production build is styled and the strict CSP blocks nothing', async ({ page }) => {
    // Angular's default "inline critical CSS" injects an inline onload handler, which our CSP (script-src 'self') blocks:
    // the stylesheet then never applies and the whole app shows unstyled. This test exists because that happened.
    const violations: string[] = [];
    page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text().slice(0, 160)); });
    page.on('pageerror', (e) => violations.push(e.message));
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    expect(await page.locator('link[rel=stylesheet]').evaluateAll((ls) => ls.map((l) => (l as HTMLLinkElement).media))).not.toContain('print');
    const box = await page.locator('.brand-mark').boundingBox();
    expect(box!.width).toBeLessThan(80); // unstyled, the logo SVG fills the whole viewport
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.btn-primary')!).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    expect(violations).toEqual([]);
  });

  test('the web manifest is valid and its icons exist with the declared sizes', async ({ page, request }) => {
    await page.goto('/login');
    const href = await page.locator('link[rel=manifest]').getAttribute('href');
    expect(href).toBeTruthy();
    const res = await request.get(new URL(href!, page.url()).toString());
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/manifest+json');
    const m = await res.json();
    expect(m).toMatchObject({ short_name: 'Syndic.ma', display: 'standalone', start_url: '/dashboard', scope: '/', theme_color: '#0f5c4d' });
    expect(m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`).sort()).toEqual(['192x192:any', '512x512:any', '512x512:maskable']);
    for (const icon of m.icons as { src: string; sizes: string; type: string }[]) {
      const r = await request.get(new URL(icon.src, page.url()).toString());
      expect(r.status(), icon.src).toBe(200);
      expect(r.headers()['content-type']).toBe(icon.type);
      const { w, h } = pngSize(await r.body());
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
    await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', '#0f5c4d');
  });

  test('the service worker installs, takes control, and the login screen still opens OFFLINE', async ({ page, context }) => {
    await page.goto('/login');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload(); // the first load is not controlled yet
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 40_000 }).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#email')).toBeVisible(); // served by the worker, not the browser's "no connection" page
    await expect(page.locator('button[type=submit]')).toBeVisible();
    await context.setOffline(false);
  });

  test('private API data is NEVER stored by the service worker', async ({ page }) => {
    await login(page, 'accountant');
    await page.getByRole('link', { name: 'Appels de fonds' }).click();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await page.getByRole('link', { name: 'Paiements' }).click();
    await expect(page.locator('.page-header')).toBeVisible();

    const cached = await page.evaluate(async () => {
      const out: string[] = [];
      for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) out.push(req.url);
      return out;
    });
    expect(cached.length).toBeGreaterThan(0); // the shell IS cached...
    expect(cached.filter((u) => /\/api\//.test(u))).toEqual([]); // ...but nothing from the API
  });

  test('cache headers: the files that pick the release are revalidated, hashed bundles are immutable', async ({ page, request }) => {
    await page.goto('/login');
    for (const f of ['/ngsw-worker.js', '/ngsw.json', '/manifest.webmanifest', '/index.html', '/login']) {
      const r = await request.get(f);
      expect(r.headers()['cache-control'], f).toBe('no-cache');
    }
    const bundle = await page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /main-[A-Z0-9]+\.js/i.test(s)));
    expect(bundle).toBeTruthy();
    expect((await request.get(bundle!)).headers()['cache-control']).toBe('public, max-age=31536000, immutable');
    // the API keeps its own (non-cacheable) policy: nginx adds nothing there
    const api = await request.get('/api/health');
    expect(api.headers()['cache-control'] ?? '').not.toContain('immutable');
  });
});
