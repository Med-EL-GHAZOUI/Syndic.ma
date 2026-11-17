import { expect, test } from '@playwright/test';
import { go, lastToast, login, logout } from './helpers';

const PDF = Buffer.from('%PDF-1.4\nreal enough pdf body\n%%EOF');

test.describe('Documents', () => {
  test('upload is validated by content, download works, audiences are respected', async ({ page }) => {
    await login(page, 'admin');
    await go(page, '/documents');
    const open = async () => {
      await page.getByRole('button', { name: 'Ajouter un document' }).click();
      await page.locator('#f-res').selectOption({ index: 1 });
      await page.locator('#f-name').fill('Règlement de copropriété');
      await page.locator('#f-vis').selectOption('owners');
    };

    // the file is mandatory; a forbidden extension is refused right away
    await open();
    await page.locator('button[form="doc-form"]').click();
    await expect(page.locator('.field-error')).toContainText('obligatoire');
    await page.setInputFiles('#f-file', { name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ fake') });
    await expect(page.locator('.field-error')).toContainText('PDF, Word, Excel ou image');

    // an executable renamed .pdf is refused by the SERVER (content sniffing)
    await page.setInputFiles('#f-file', { name: 'facture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ\x90\x00\x03 executable content') });
    await page.locator('button[form="doc-form"]').click();
    await expect(page.locator('.toast.error p')).toContainText('content does not match its extension');

    // a real PDF goes through
    await page.setInputFiles('#f-file', { name: 'reglement.pdf', mimeType: 'application/pdf', buffer: PDF });
    await page.locator('button[form="doc-form"]').click();
    await expect(lastToast(page)).toContainText('Document ajouté');
    const row = page.locator('tbody tr', { hasText: 'Règlement de copropriété' });
    await expect(row).toContainText('reglement.pdf');

    // authenticated download delivers the same bytes
    const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('button', { name: 'Télécharger' }).click()]);
    expect(download.suggestedFilename()).toBe('reglement.pdf');
    const path = await download.path();
    expect(require('fs').readFileSync(path).equals(PDF)).toBe(true);
    await logout(page);

    // owners see it, tenants (audience "owners") do not
    await login(page, 'owner');
    await go(page, '/documents');
    await expect(page.locator('tbody tr', { hasText: 'Règlement de copropriété' })).toBeVisible();
    await logout(page);
    await login(page, 'tenant');
    await go(page, '/documents');
    await expect(page.locator('tbody tr', { hasText: 'Règlement de copropriété' })).toHaveCount(0);
  });
});

test.describe('Language & direction', () => {
  test('Arabic switches to RTL, translates the UI and persists across reloads', async ({ page }) => {
    await login(page, 'accountant');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.locator('.lang-switch [lang=ar]').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await go(page, '/payments');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الأداءات');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.locator('.lang-switch [lang=fr]').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });
});
