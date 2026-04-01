// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

    await page.goto('/login');
    await page.getByLabel('Email').fill(adminEmail);
    await page.getByLabel('Password').fill(adminPass);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({
      timeout: 20_000,
    });

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
