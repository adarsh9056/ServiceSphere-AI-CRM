// @ts-check
/**
 * E2E covers the product path (login → lead mail UI → Settings sync → UI updates).
 * Message B is inserted via Prisma (same shape as IMAP import), not fetched over IMAP;
 * real mailbox import is validated manually or with a dedicated IMAP integration environment.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loginAs } = require('./helpers/auth.cjs');

const fixturePath = path.join(__dirname, '.fixture.json');

function loadFixture() {
  const raw = fs.readFileSync(fixturePath, 'utf8');
  return JSON.parse(raw);
}

function seedAnotherInbound(subject) {
  const script = path.join(__dirname, 'scripts', 'seed-inbound-email.cjs');
  const r = spawnSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      E2E_INBOUND_SUBJECT: subject,
    },
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || 'seed failed');
  }
  const lines = r.stdout.trim().split('\n').filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

test.describe('Lead inbox (E2E)', () => {
  test('login → lead → IMAP sync → thread & timeline reflect new mail', async ({ page }) => {
    const fixture = loadFixture();
    const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@servicesphere.dev';
    const adminPass = process.env.E2E_ADMIN_PASSWORD || 'admin123';

    await loginAs(page, { email: adminEmail, password: adminPass });

    await page.goto(`/leads/${fixture.leadId}`);

    await page.getByRole('button', { name: 'Communication' }).click();
    await expect(page.getByText(fixture.subject, { exact: false })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Timeline' }).click();
    await expect(page.getByText(fixture.subject, { exact: false })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto('/settings');
    await page.getByRole('button', { name: /Run IMAP sync now/i }).click();
    await expect(page.getByText(/Imported\s+\d+/)).toBeVisible({ timeout: 30_000 });

    const subjectB = `E2E Playwright B ${Date.now()}`;
    seedAnotherInbound(subjectB);

    await page.goto(`/leads/${fixture.leadId}`);
    await page.getByRole('button', { name: 'Communication' }).click();
    await expect(page.getByText(subjectB, { exact: false })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Timeline' }).click();
    await expect(page.getByText(subjectB, { exact: false })).toBeVisible({
      timeout: 15_000,
    });
  });
});
