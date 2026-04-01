// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { loginAs } = require('./helpers/auth.cjs');

/** Minimal valid PNG (1×1). */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function loadFixture() {
  const p = path.join(__dirname, '.fixture.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test.describe('Attachments', () => {
  test('allows PNG upload and rejects HTML upload', async ({ page, request, baseURL }) => {
    const fixture = loadFixture();
    const salesEmail = process.env.E2E_SALES_EMAIL || 'sales@servicesphere.dev';
    const salesPass = process.env.E2E_SALES_PASSWORD || 'sales123';

    await loginAs(page, { email: salesEmail, password: salesPass });
    await page.goto(`/leads/${fixture.leadId}`);
    await page.getByRole('button', { name: 'Overview' }).click();

    const tmpDir = path.join(__dirname, '.tmp-uploads');
    fs.mkdirSync(tmpDir, { recursive: true });
    const pngPath = path.join(tmpDir, `e2e-${Date.now()}.png`);
    fs.writeFileSync(pngPath, Buffer.from(PNG_BASE64, 'base64'));

    await page
      .locator('section')
      .filter({ hasText: 'Attachments' })
      .locator('input[type="file"]')
      .setInputFiles(pngPath);
    await expect(page.getByText(/\.png/i)).toBeVisible({ timeout: 20_000 });

    const token = await page.evaluate(() => localStorage.getItem('token'));
    const apiOrigin =
      process.env.PLAYWRIGHT_API_ORIGIN || 'http://localhost:4000';

    const up = await request.post(`${apiOrigin}/api/upload`, {
      headers: { authorization: `Bearer ${token}` },
      multipart: {
        leadId: fixture.leadId,
        file: {
          name: 'evil.html',
          mimeType: 'text/html',
          buffer: Buffer.from('<html><body>x</body></html>', 'utf8'),
        },
      },
    });
    expect(up.status()).toBe(400);

    try {
      fs.unlinkSync(pngPath);
    } catch (_) {}
  });
});
