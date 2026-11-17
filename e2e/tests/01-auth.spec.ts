import { expect, test } from '@playwright/test';
import { emailOf, go, lastToast, login, logout, password } from './helpers';

test.describe('Authentication & session', () => {
  test('unauthenticated visitors are sent to the login page', async ({ page }) => {
    await page.goto('/payments');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a wrong password shows one generic message and does not log in', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(emailOf('owner'));
    await page.locator('#password').fill('definitely-wrong-1');
    await page.locator('button[type=submit]').click();
    await expect(page.locator('.form-alert')).toContainText('incorrect');
    await expect(page).toHaveURL(/\/login$/);
    // an unknown e-mail gets the very same message (no account enumeration)
    await page.locator('#email').fill('nobody@example.com');
    await page.locator('button[type=submit]').click();
    await expect(page.locator('.form-alert')).toContainText('incorrect');
  });

  test('the session survives a reload, yet the refresh token is invisible to JavaScript', async ({ page, context }) => {
    await login(page, 'owner');
    expect(await page.evaluate(() => document.cookie)).toBe(''); // HttpOnly
    const stored = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
    expect(stored).not.toMatch(/eyJ/); // no JWT anywhere in browser storage
    const cookies = await context.cookies();
    const rt = cookies.find((c) => c.name === 'syndicma_rt')!;
    expect(rt).toBeDefined();
    expect(rt.httpOnly).toBe(true);
    expect(rt.sameSite).toBe('Strict');
    expect(rt.path).toBe('/api/auth');

    await page.reload();
    await expect(page.locator('.topbar')).toBeVisible(); // silent refresh restored the session
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('logout ends the session for good (a reload does not bring it back)', async ({ page }) => {
    await login(page, 'tenant');
    await logout(page);
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
  });

  // Behavioural check only: the API now answers 403 here. The interceptor-level regression (a 401 that survives a
  // refresh must not sign you out) is covered by the unit test in auth.interceptor.spec.ts.
  test('a wrong current password shows the error and keeps you signed in', async ({ page }) => {
    await login(page, 'tenant');
    await go(page, '/settings');
    await page.locator('#p-cur').fill('wrong-current-pass');
    await page.locator('#p-new').fill('Another-Passw0rd-77!');
    await page.locator('#p-conf').fill('Another-Passw0rd-77!');
    await page.locator('form button[type=submit]').click();
    await expect(page.locator('.toast.error p')).toContainText('incorrect');
    await expect(page).toHaveURL(/\/settings$/); // still here
    await expect(page.locator('.topbar')).toBeVisible();
  });

  test('an expired access token is refreshed transparently, with exactly ONE refresh for parallel requests', async ({ page }) => {
    await login(page, 'accountant');
    await page.waitForTimeout(5000); // access tokens live 4 s in the e2e API (see playwright.config.ts)
    const refreshes: string[] = [];
    page.on('request', (r) => { if (r.url().endsWith('/api/auth/refresh')) refreshes.push(r.url()); });

    // The finance page fires several API calls at once, all carrying the now-expired token.
    await go(page, '/finance');
    await expect(page.locator('tbody tr').first()).toBeVisible(); // the data arrived
    await expect(page).toHaveURL(/\/finance$/);                  // and we were not thrown out
    // A second parallel refresh would look like token REUSE to the API and revoke the whole session.
    expect(refreshes).toHaveLength(1);
    await page.reload();
    await expect(page.locator('.topbar')).toBeVisible();
  });

  test('changing the password signs every session out; only the new password works', async ({ page }) => {
    const next = 'Changed-Passw0rd-2027!';
    await login(page, 'manager2');
    await go(page, '/settings');
    await page.locator('#p-cur').fill(password());
    await page.locator('#p-new').fill(next);
    await page.locator('#p-conf').fill(next);
    await page.locator('form button[type=submit]').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(lastToast(page)).toContainText('Mot de passe modifié');

    await page.locator('#email').fill(emailOf('manager2'));
    await page.locator('#password').fill(password());
    await page.locator('button[type=submit]').click();
    await expect(page.locator('.form-alert')).toBeVisible(); // old password refused
    await page.locator('#password').fill(next);
    await page.locator('button[type=submit]').click();
    await expect(page.locator('.topbar')).toBeVisible();
  });
});
