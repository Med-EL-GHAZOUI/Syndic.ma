import { expect, test } from '@playwright/test';
import { go, lastToast, login } from './helpers';

const today = () => new Date().toISOString().slice(0, 10);
const csv = (...rows: string[]) => Buffer.from(['date;amount;label;reference', ...rows].join('\n'));

test.describe('Bank reconciliation', () => {
  test('import, match, and the "bank-verified payments cannot be reversed" rule', async ({ page }) => {
    await login(page, 'accountant');

    // a bank-transfer payment to reconcile
    await go(page, '/payments');
    await page.getByRole('button', { name: 'Enregistrer un paiement' }).click();
    await page.locator('#y-unit').selectOption({ index: 3 });
    await page.locator('#y-amount').fill('333.33');
    await page.locator('#y-ref').fill('VIR 7001');
    await page.locator('button[form="pay-form"]').click();
    await expect(lastToast(page)).toContainText('reçu REC-');
    const receipt = /REC-\d{4}-\d{4}/.exec(await lastToast(page).innerText())![0];

    await go(page, '/reconciliation');
    await expect(page.getByRole('heading', { name: 'Choisissez une résidence' })).toBeVisible();
    await page.locator('#r-res').selectOption({ index: 1 });

    // an invalid statement is refused as a whole, with line numbers
    await page.setInputFiles('#csv-file', { name: 'bad.csv', mimeType: 'text/csv', buffer: csv(`${today()};333,33;OK LINE;`, '2026-02-31;12;IMPOSSIBLE DATE;', `${today()};abc;BAD AMOUNT;`) });
    await expect(page.locator('.form-alert li')).toHaveText(['#3: invalid date "2026-02-31" (expected YYYY-MM-DD)', '#4: invalid amount "abc"']);
    await expect(page.locator('tbody tr')).toHaveCount(0); // nothing was imported

    // a valid one is imported; importing it again creates no duplicate
    const good = csv(`${today()};333,33;VIREMENT RECU VIR 7001;`, `${today()};-12;FRAIS TENUE DE COMPTE;`);
    await page.setInputFiles('#csv-file', { name: 'ok.csv', mimeType: 'text/csv', buffer: good });
    await expect(lastToast(page)).toContainText('2 ligne(s) importée(s), 0 déjà connue(s)');
    await page.setInputFiles('#csv-file', { name: 'ok-again.csv', mimeType: 'text/csv', buffer: good });
    await expect(lastToast(page)).toContainText('0 ligne(s) importée(s), 2 déjà connue(s)');

    // the suggestion points to our receipt; matching verifies the payment
    const line = page.locator('tbody tr', { hasText: 'VIR 7001' });
    await expect(line).toContainText(receipt);
    await line.getByRole('button', { name: 'Rapprocher' }).click();
    await page.locator('.modal-foot .btn-primary').click();
    await expect(lastToast(page)).toContainText('désormais vérifié');

    // a bank-verified payment cannot be reversed...
    await go(page, '/payments');
    await page.locator('tbody tr', { hasText: receipt }).getByRole('button', { name: 'Annuler le paiement' }).click();
    await page.locator('#why').fill('Erreur de saisie');
    await page.locator('button[form="reason-form"]').click();
    await expect(page.locator('.toast.error p')).toContainText('bank-verified');

    // ...until it is un-matched, with a reason
    await go(page, '/reconciliation');
    await page.locator('#r-res').selectOption({ index: 1 });
    await page.locator('#r-status').selectOption('matched');
    await page.locator('tbody tr').first().getByRole('button', { name: 'Dé-rapprocher' }).click();
    await page.locator('#rs-why').fill('Mauvais rapprochement');
    await page.locator('button[form="rs-form"]').click();
    await expect(lastToast(page)).toContainText('Rapprochement annulé');
    await go(page, '/payments');
    await page.locator('tbody tr', { hasText: receipt }).getByRole('button', { name: 'Annuler le paiement' }).click();
    await page.locator('#why').fill('Erreur de saisie');
    await page.locator('button[form="reason-form"]').click();
    await expect(lastToast(page)).toContainText('Paiement annulé');
  });

  test('closing a period is forward-only', async ({ page }) => {
    await login(page, 'accountant');
    await go(page, '/reconciliation');
    await page.locator('#r-res').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Clôturer la période' }).click();
    await page.locator('#cl-date').fill('2026-01-01');
    await page.locator('button[form="cl-form"]').click();
    await expect(lastToast(page)).toContainText('Période clôturée');
    await page.getByRole('button', { name: 'Clôturer la période' }).click();
    await page.locator('#cl-date').fill('2025-12-01');
    await page.locator('button[form="cl-form"]').click();
    await expect(page.locator('.toast.error p')).toContainText('already closed through 2026-01-01');
  });
});
