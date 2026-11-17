import { expect, Page, test } from '@playwright/test';
import { emailOf, lastToast, login, logout, password } from './helpers';
import { totp } from './totp';

const stepNow = () => Math.floor(Date.now() / 30_000);

/** First half of a login (e-mail + password), leaving the page at whatever comes next. */
async function passwordStep(page: Page, who: Parameters<typeof emailOf>[0]) {
  await page.goto('/login');
  await page.locator('#email').fill(emailOf(who));
  await page.locator('#password').fill(password());
  await page.locator('button[type=submit]').click();
}

async function codeStep(page: Page, code: string) {
  await page.locator('#mfa-code').fill(code);
  await page.locator('button[type=submit]').click();
}

test.describe('Two-factor authentication (authenticator app)', () => {
  test.describe.configure({ mode: 'serial' });

  let secret = '';
  let enrolledStep = 0;
  let backup: string[] = [];
  /** A code the API has not seen yet: the enrolment code is spent (single use), so the next step is accepted instead. */
  const freshCode = () => totp(secret, stepNow() === enrolledStep ? 1 : 0);

  test('a manager enrols an authenticator app and receives one-time recovery codes', async ({ page }) => {
    await login(page, 'manager3');
    await page.getByRole('link', { name: 'Paramètres' }).click();
    await expect(page.getByRole('heading', { name: 'Double authentification' })).toBeVisible();
    await page.getByRole('button', { name: 'Activer', exact: true }).click();

    secret = (await page.locator('#m-secret').inputValue()).replace(/\s/g, '');
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    await expect(page.locator('#m-url')).toHaveValue(/^otpauth:\/\/totp\/Syndic\.ma:/);

    await page.locator('#m-code').fill('000000');
    enrolledStep = stepNow();
    await page.getByRole('button', { name: 'Confirmer et activer' }).click();
    await expect(page.locator('.field-error')).toContainText('Code incorrect'); // a wrong code does not activate anything

    await page.locator('#m-code').fill(totp(secret));
    await page.getByRole('button', { name: 'Confirmer et activer' }).click();
    await expect(page.getByRole('heading', { name: 'Codes de secours' })).toBeVisible();
    backup = await page.locator('.backup-codes code').allInnerTexts();
    expect(backup).toHaveLength(10);
    await page.getByRole('button', { name: 'J\'ai conservé mes codes' }).click();
    await expect(page.getByText('10 code(s) de secours restant(s)')).toBeVisible();
    await expect(page.locator('.backup-codes')).toHaveCount(0); // never shown again
  });

  test('the password alone no longer opens a session; a wrong code does not either', async ({ page }) => {
    await passwordStep(page, 'manager3');
    await expect(page.getByRole('heading', { name: 'Vérification en deux étapes' })).toBeVisible();
    await expect(page.locator('.topbar')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain('syndicma.session'); // no session hint yet

    await codeStep(page, '000000');
    await expect(page.locator('.form-alert')).toContainText('Code incorrect ou expiré');
    await expect(page.locator('.topbar')).toHaveCount(0);
    await page.getByRole('button', { name: 'Recommencer' }).click();
    await expect(page.locator('#password')).toHaveValue(''); // the password is not kept
  });

  test('the right code signs in, and the session survives a reload', async ({ page }) => {
    await passwordStep(page, 'manager3');
    await codeStep(page, freshCode());
    await expect(page.locator('.topbar')).toBeVisible();
    await page.reload();
    await expect(page.locator('.topbar')).toBeVisible();
    await logout(page);
  });

  test('a recovery code works exactly once', async ({ page }) => {
    await passwordStep(page, 'manager3');
    await codeStep(page, backup[0].toUpperCase());
    await expect(page.locator('.topbar')).toBeVisible();
    await logout(page);

    await passwordStep(page, 'manager3');
    await codeStep(page, backup[0]);
    await expect(page.locator('.form-alert')).toContainText('Code incorrect ou expiré'); // already used
    await page.getByRole('button', { name: 'Recommencer' }).click();
    await passwordStep(page, 'manager3');
    await codeStep(page, backup[1]);
    await expect(page.locator('.topbar')).toBeVisible();
    await page.getByRole('link', { name: 'Paramètres' }).click();
    await expect(page.getByText('8 code(s) de secours restant(s)')).toBeVisible();
    await logout(page);
  });

  test('an administrator can reset a colleague who lost the phone; they then sign in with the password only', async ({ page }) => {
    await login(page, 'admin');
    await page.getByRole('link', { name: 'Utilisateurs' }).click();
    const row = page.locator('tbody tr', { hasText: emailOf('manager3') });
    await expect(row.locator('.badge', { hasText: '2FA' })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: emailOf('manager') }).locator('.badge', { hasText: '2FA' })).toHaveCount(0);

    await row.getByRole('button', { name: 'Réinitialiser la double authentification' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
    await expect(lastToast(page)).toContainText('Double authentification réinitialisée');
    await expect(row.locator('.badge', { hasText: '2FA' })).toHaveCount(0);
    await logout(page);

    await login(page, 'manager3'); // one step again
  });
});
