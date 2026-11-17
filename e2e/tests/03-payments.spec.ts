import { expect, test } from '@playwright/test';
import { go, lastToast, login, logout } from './helpers';

test.describe('Payments: declare -> validate -> reverse', () => {
  test('owner declares, accountant validates (receipt issued), then reverses with a reason', async ({ page }) => {
    // ---- the owner declares a payment (reference is mandatory for residents)
    await login(page, 'owner');
    await go(page, '/payments');
    await page.getByRole('button', { name: 'Déclarer un paiement' }).click();
    await page.locator('#y-unit').selectOption({ index: 1 });
    await page.locator('#y-amount').fill('80');
    await page.locator('button[form="pay-form"]').click();
    await expect(page.locator('.field-error')).toContainText('obligatoire'); // reference missing
    await page.locator('#y-ref').fill('VIR 123456');
    await page.locator('button[form="pay-form"]').click();
    await expect(lastToast(page)).toContainText('Paiement déclaré');
    await expect(page.locator('tbody tr').first()).toContainText('À valider');
    await expect(page.locator('tbody .actions button')).toHaveCount(0); // a resident cannot validate
    await logout(page);

    // ---- the accountant sees the banner and validates
    await login(page, 'accountant');
    await expect(page.locator('a.note.warn')).toContainText('attendent votre validation');
    await go(page, '/payments');
    const row = page.locator('tbody tr', { hasText: 'À valider' }).first();
    await row.getByRole('button', { name: 'Valider le paiement' }).click();
    await page.locator('.modal-foot .btn-primary').click();
    await expect(lastToast(page)).toContainText('reçu REC-');
    await expect(page.locator('tbody tr').first()).toContainText('Enregistré');

    // ---- reversal needs a reason, keeps the receipt, never deletes
    await page.locator('tbody tr', { hasText: 'Enregistré' }).first().getByRole('button', { name: 'Annuler le paiement' }).click();
    await page.locator('button[form="reason-form"]').click();
    await expect(page.locator('.field-error')).toBeVisible(); // empty reason refused
    await page.locator('#why').fill('Virement non reçu par la banque');
    await page.locator('button[form="reason-form"]').click();
    await expect(lastToast(page)).toContainText('Paiement annulé');
    const reversed = page.locator('tbody tr', { hasText: 'Annulé' }).first();
    await expect(reversed).toContainText('REC-'); // the receipt number is kept
    await expect(reversed).toContainText('Virement non reçu par la banque');
  });

  test('a payment above the balance due is refused with the API explanation', async ({ page }) => {
    await login(page, 'accountant');
    await go(page, '/payments');
    await page.getByRole('button', { name: 'Enregistrer un paiement' }).click();
    await page.locator('#y-unit').selectOption({ index: 1 });
    await page.locator('#y-amount').fill('9999999');
    await page.locator('button[form="pay-form"]').click();
    await expect(page.locator('.toast.error p')).toContainText('exceeds the balance due');
  });
});
