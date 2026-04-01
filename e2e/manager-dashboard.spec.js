// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth.cjs');

test.describe('Manager dashboard & lead filters', () => {
  test('dashboard metrics & charts load; leads search and status filter', async ({
    page,
  }) => {
    const managerEmail = process.env.E2E_MANAGER_EMAIL || 'manager@servicesphere.dev';
    const managerPass = process.env.E2E_MANAGER_PASSWORD || 'manager123';

    await loginAs(page, { email: managerEmail, password: managerPass });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Total leads')).toBeVisible();
    await expect(page.getByText('Open deals')).toBeVisible();
    await expect(page.getByText('Won revenue')).toBeVisible();
    await expect(page.getByText('Win rate')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Leads by status' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lead volume by stage' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Recent deal creation trend' }),
    ).toBeVisible();

    await page.goto('/leads');
    await page.getByPlaceholder('Name, company, email…').fill('Jordan');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('link', { name: 'Jordan Lee' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByPlaceholder('Name, company, email…').fill('');
    await page.getByRole('combobox').selectOption('QUALIFIED');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('link', { name: 'Jordan Lee' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: 'Riley Chen' })).toHaveCount(0);

    await page.getByRole('combobox').selectOption('');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('link', { name: 'Jordan Lee' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: 'Riley Chen' })).toBeVisible({
      timeout: 15_000,
    });
  });
});
