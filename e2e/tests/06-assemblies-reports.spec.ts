import { expect, test } from '@playwright/test';
import { go, login } from './helpers';

const title = `AG e2e ${Date.now()}`;
const future = () => new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);

test.describe('General assemblies', () => {
  test.describe.configure({ mode: 'serial' });

  test('manager runs an assembly: plan, convene, attendance, vote, hold', async ({ page }) => {
    await login(page, 'manager');
    await go(page, '/assemblies');
    await page.getByRole('button', { name: 'Nouvelle assemblée' }).click();

    // required fields are enforced before anything reaches the API
    await page.locator('button[form="as-form"]').click();
    await expect(page.locator('.field-error').first()).toContainText('obligatoire');

    await page.locator('#f-res').selectOption({ index: 1 });
    await page.locator('#f-title').fill(title);
    await page.locator('#f-date').fill(future());
    await page.locator('#f-loc').fill('Salle polyvalente');
    await page.locator('#f-agenda').fill('Approbation des comptes\nTravaux de façade');
    await page.locator('button[form="as-form"]').click();

    const row = page.locator('tbody tr', { hasText: title });
    await expect(row).toContainText('Planifiée');
    await row.getByRole('button', { name: 'Consulter' }).click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toContainText('Les présences s\'ouvrent une fois l\'assemblée convoquée');
    await expect(dialog.locator('ol.agenda li')).toHaveText(['Approbation des comptes', 'Travaux de façade']);

    // convening needs a confirmation, then attendance opens
    await dialog.getByRole('button', { name: 'Convoquer' }).click();
    await page.getByRole('dialog').last().getByRole('button', { name: 'Confirmer' }).click();
    await expect(dialog).toContainText('Convoquée');
    const quorum = dialog.locator('p', { hasText: 'Tantièmes représentés' }).locator('span').first();
    await expect(quorum).toHaveText(/^0 \/ \d+$/);
    await dialog.locator('select[id^="att-"]').first().selectOption('present');
    await expect(quorum).not.toHaveText(/^0 \//); // quorum is weighted by the unit's tantièmes

    // votes beyond the represented tantièmes are refused by the API
    await dialog.locator('#r-title').fill('Approbation des comptes 2026');
    await dialog.locator('#r-for').fill('999999999');
    await dialog.getByRole('button', { name: 'Ajouter une résolution' }).click();
    await expect(page.locator('.toast.error p')).toContainText('Votes exceed the represented tantièmes');

    await dialog.locator('#r-for').fill('1');
    await dialog.getByRole('button', { name: 'Ajouter une résolution' }).click();
    await expect(dialog.locator('tbody tr', { hasText: 'Approbation des comptes 2026' })).toContainText('Adoptée');

    await dialog.locator('#a-min').fill('Séance ouverte à 18h. Comptes approuvés.');
    await dialog.getByRole('button', { name: 'Rédiger le procès-verbal' }).click();

    // holding the session freezes it: no more edits, and it can never be deleted
    await dialog.getByRole('button', { name: 'Clôturer la séance' }).click();
    await page.getByRole('dialog').last().getByRole('button', { name: 'Confirmer' }).click();
    await expect(dialog).toContainText('Tenue');
    await expect(dialog.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
    await expect(dialog.locator('select[id^="att-"]').first()).toBeDisabled();
    await expect(dialog.locator('#r-title')).toHaveCount(0);
  });

  test('an owner sees the held assembly and its result, but not who attended', async ({ page }) => {
    await login(page, 'owner');
    await go(page, '/assemblies');
    const row = page.locator('tbody tr', { hasText: title });
    await expect(row).toContainText('Tenue');
    await expect(page.getByRole('button', { name: 'Nouvelle assemblée' })).toHaveCount(0);
    await row.getByRole('button', { name: 'Consulter' }).click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toContainText('Approbation des comptes 2026');
    await expect(dialog).toContainText('Adoptée');
    await expect(dialog).toContainText('Comptes approuvés');
    await expect(dialog.getByRole('heading', { name: 'Présences' })).toHaveCount(0);
    await expect(dialog.locator('select')).toHaveCount(0);
  });

  test('a tenant cannot open the assemblies page', async ({ page }) => {
    await login(page, 'tenant');
    await go(page, '/assemblies');
    await expect(page).toHaveURL(/\/forbidden$/);
  });
});

test.describe('Reports', () => {
  test('accountant reads the finance, arrears, expenses and complaints reports; a tenant cannot', async ({ page }) => {
    await login(page, 'accountant');
    await go(page, '/reports');
    await expect(page.getByRole('heading', { name: 'Rapports' })).toBeVisible();
    await expect(page.getByText('Solde de trésorerie')).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible(); // one line per residence

    await page.getByRole('tab', { name: 'Impayés' }).click();
    await expect(page.getByText('Total des impayés échus')).toBeVisible();
    await page.getByRole('tab', { name: 'Dépenses' }).click();
    await expect(page.getByRole('heading', { name: 'Dépenses par catégorie' })).toBeVisible();
    await page.getByRole('tab', { name: 'Réclamations' }).click();
    await expect(page.getByText('Taux de résolution')).toBeVisible();
    await expect(page.locator('.toast.error')).toHaveCount(0);

    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await login(page, 'tenant');
    await go(page, '/reports');
    await expect(page).toHaveURL(/\/forbidden$/);
  });
});
