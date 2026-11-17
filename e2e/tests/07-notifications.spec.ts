import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { emailOf, login, password } from './helpers';

const title = `Coupure d'eau e2e ${Date.now()}`;

/** Publish an announcement as the manager, straight through the API (the UI under test is the RECIPIENT's bell). */
async function publish(request: APIRequestContext, audience: 'owners' | 'all' | 'staff') {
  const session = await request.post('/api/auth/login', { data: { email: emailOf('manager'), password: password() } });
  expect(session.ok()).toBeTruthy();
  const { accessToken } = await session.json();
  const auth = { Authorization: `Bearer ${accessToken}` };
  const residences = await (await request.get('/api/residences', { headers: auth })).json();
  const res = await request.post('/api/announcements', { headers: auth, data: { residenceId: residences[0].id, title, body: 'Contenu de test', category: 'works', audience } });
  expect(res.status()).toBe(201);
}

const unreadCount = async (page: Page) => {
  const dot = page.locator('.notif-dot');
  return (await dot.count()) ? Number((await dot.innerText()).replace('+', '')) : 0;
};

test.describe('In-app notifications', () => {
  test('an owner is notified, reads it, and it follows the language; a tenant is not notified', async ({ page, request }) => {
    await login(page, 'owner');
    const before = await unreadCount(page);

    await publish(request, 'owners');
    await page.reload(); // the bell polls once a minute; a reload checks right away
    await expect(page.locator('.topbar')).toBeVisible();
    await expect.poll(() => unreadCount(page)).toBe(before + 1);

    await page.locator('.notif-btn').click();
    const item = page.locator('.notif-item', { hasText: title });
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('Nouvelle annonce');
    await expect(item).toHaveClass(/unread/);

    // the same stored notification is translated when the language changes (clicking the switch closes the panel)
    await page.locator('button[lang=ar]').click();
    await page.locator('.notif-btn').click();
    await expect(item).not.toContainText('Nouvelle annonce');
    await expect(item).toContainText(title);
    await page.locator('button[lang=fr]').click();
    await page.locator('.notif-btn').click();
    await expect(item).toContainText('Nouvelle annonce');

    // clicking reads it and opens the related page
    await item.click();
    await expect(page).toHaveURL(/\/announcements$/);
    await expect.poll(() => unreadCount(page)).toBe(before);
    await page.locator('.notif-btn').click();
    await expect(page.locator('.notif-item', { hasText: title })).not.toHaveClass(/unread/);

    // "mark all read" clears the counter (only offered while something is unread)
    if (before > 0) {
      await page.getByRole('button', { name: 'Tout marquer lu' }).click();
      await expect(page.locator('.notif-dot')).toHaveCount(0);
    } else {
      await expect(page.getByRole('button', { name: 'Tout marquer lu' })).toHaveCount(0);
    }

    // an owners-only announcement never reaches the tenant
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await login(page, 'tenant');
    await page.locator('.notif-btn').click();
    await expect(page.locator('#notif-panel')).toBeVisible();
    await expect(page.locator('.notif-item', { hasText: title })).toHaveCount(0);
  });

  test('the bell closes with Escape and when clicking elsewhere', async ({ page }) => {
    await login(page, 'accountant');
    await page.locator('.notif-btn').click();
    await expect(page.locator('#notif-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#notif-panel')).toHaveCount(0);
    await page.locator('.notif-btn').click();
    await page.locator('main.view').click({ position: { x: 5, y: 200 } });
    await expect(page.locator('#notif-panel')).toHaveCount(0);
  });
});
