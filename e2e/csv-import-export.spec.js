// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { loginAs } = require('./helpers/auth.cjs');

test.describe('CSV import/export', () => {
  test('manager imports leads from CSV and exports CSV', async ({ page }) => {
    const managerEmail = process.env.E2E_MANAGER_EMAIL || 'manager@servicesphere.dev';
    const managerPass = process.env.E2E_MANAGER_PASSWORD || 'manager123';
    const tag = `E2E-CSV-${Date.now()}`;

    await loginAs(page, { email: managerEmail, password: managerPass });
    await page.goto('/leads');

    const tmpDir = path.join(__dirname, '.tmp-csv');
    fs.mkdirSync(tmpDir, { recursive: true });
    const csvPath = path.join(tmpDir, `import-${Date.now()}.csv`);
    fs.writeFileSync(
      csvPath,
      `name,company,email,source\n${tag} Co,TestCo,${tag.toLowerCase()}@e2e.example,csv_e2e\n`,
      'utf8',
    );

    await page.locator('input[type="file"][accept*="csv"]').setInputFiles(csvPath);
    await expect(page.getByText(/Imported\s+[1-9]/)).toBeVisible({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/leads-export-/);

    try {
      fs.unlinkSync(csvPath);
    } catch (_) {}
  });
});
