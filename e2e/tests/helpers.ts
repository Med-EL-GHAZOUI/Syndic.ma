import { expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

// manager2 is reserved for tests that change credentials, so they cannot break the other tests.
export type Role = 'admin' | 'manager' | 'manager2' | 'manager3' | 'accountant' | 'owner' | 'tenant' | 'provider';

const state = (): { tag: string; password: string } => JSON.parse(readFileSync(join(__dirname, '..', '.e2e-state.json'), 'utf8'));

export const password = () => state().password;
export const emailOf = (role: Role) => `${role}.${state().tag}@example.com`;

export async function login(page: Page, role: Role, pwd = password()) {
  await page.goto('/login');
  await page.locator('#email').fill(emailOf(role));
  await page.locator('#password').fill(pwd);
  await page.locator('button[type=submit]').click();
  await expect(page.locator('.topbar')).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/**
 * SPA navigation without reloading (keeps the in-memory access token). It does NOT assert the final URL:
 * a route guard may legitimately redirect (e.g. to /forbidden) and callers assert what they expect.
 */
export async function go(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

export const navLabels = (page: Page) => page.locator('.nav-link').allInnerTexts().then((t) => t.map((x) => x.trim()));
export const lastToast = (page: Page) => page.locator('.toast p').last();
