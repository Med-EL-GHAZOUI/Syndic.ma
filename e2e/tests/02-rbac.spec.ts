import { expect, test } from '@playwright/test';
import { go, login, navLabels } from './helpers';

test.describe('Role-based access', () => {
  test('owner: own finances only; staff pages are forbidden', async ({ page }) => {
    await login(page, 'owner');
    expect(await navLabels(page)).toEqual(['Tableau de bord', 'Mes charges', 'Mes paiements', 'Documents', 'Assemblées générales', 'Mes réclamations', 'Annonces', 'Paramètres']);
    await go(page, '/residences');
    await expect(page).toHaveURL(/\/forbidden$/);
    await expect(page.getByRole('heading', { name: 'Accès non autorisé' })).toBeVisible();
  });

  test('tenant has no financial access at all', async ({ page }) => {
    await login(page, 'tenant');
    const labels = await navLabels(page);
    expect(labels).not.toContain('Mes charges');
    expect(labels).not.toContain('Mes paiements');
    for (const path of ['/finance', '/payments', '/expenses', '/reconciliation']) {
      await go(page, path);
      await expect(page).toHaveURL(/\/forbidden$/);
    }
  });

  test('provider only sees maintenance, worded as "my interventions"', async ({ page }) => {
    await login(page, 'provider');
    expect(await navLabels(page)).toEqual(['Tableau de bord', 'Mes interventions', 'Paramètres']);
    await go(page, '/units');
    await expect(page).toHaveURL(/\/forbidden$/);
  });

  test('manager cannot validate payments or reconcile; accountant can', async ({ page }) => {
    await login(page, 'manager');
    expect(await navLabels(page)).not.toContain('Rapprochement bancaire');
    await go(page, '/reconciliation');
    await expect(page).toHaveURL(/\/forbidden$/);
  });

  test('accountant sees reconciliation but not user administration', async ({ page }) => {
    await login(page, 'accountant');
    const labels = await navLabels(page);
    expect(labels).toContain('Rapprochement bancaire');
    expect(labels).not.toContain('Utilisateurs');
  });
});
