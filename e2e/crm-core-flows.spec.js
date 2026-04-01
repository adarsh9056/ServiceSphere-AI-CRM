// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth.cjs');

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} source
 * @param {import('@playwright/test').Locator} target
 */
async function dndKitDrag(page, source, target) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const srcBox = await source.boundingBox();
  const tgtBox = await target.boundingBox();
  expect(srcBox).toBeTruthy();
  expect(tgtBox).toBeTruthy();
  const sx = srcBox.x + Math.min(24, srcBox.width / 2);
  const sy = srcBox.y + Math.min(20, srcBox.height / 2);
  const tx = tgtBox.x + tgtBox.width / 2;
  const ty = tgtBox.y + 100;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 10, sy, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 35 });
  await page.mouse.up();
}

test.describe('Core CRM flows', () => {
  test('login → lead detail → task & note → pipeline stage move', async ({ page }) => {
    const salesEmail = process.env.E2E_SALES_EMAIL || 'sales@servicesphere.dev';
    const salesPass = process.env.E2E_SALES_PASSWORD || 'sales123';

    await loginAs(page, { email: salesEmail, password: salesPass });

    await page.goto('/leads');
    await page.getByPlaceholder('Name, company, email…').fill('Jordan Lee');
    await page.getByRole('button', { name: 'Apply' }).click();
    await page.getByRole('link', { name: 'Jordan Lee' }).click();

    await expect(page.getByRole('heading', { name: 'Jordan Lee' })).toBeVisible();

    await page.getByRole('button', { name: 'Overview' }).click();

    const taskTitle = `E2E task ${Date.now()}`;
    await page.getByPlaceholder('New task').fill(taskTitle);
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    const noteBody = `E2E note ${Date.now()}`;
    await page.getByPlaceholder('Add a note…').fill(noteBody);
    await page.getByRole('button', { name: 'Save note' }).click();
    const notesSection = page.locator('section').filter({ hasText: 'Notes' });
    await expect(notesSection.getByText(noteBody)).toBeVisible({ timeout: 15_000 });

    await page.goto('/pipeline');
    await expect(page.getByRole('heading', { name: 'Deal pipeline' })).toBeVisible();

    const stageOrder = [
      'NEW',
      'CONTACTED',
      'QUALIFIED',
      'PROPOSAL',
      'NEGOTIATION',
      'WON',
      'LOST',
    ];
    const card = page.locator('.cursor-grab').filter({ hasText: 'Jordan Lee' }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    let currentStage = null;
    for (const id of stageOrder) {
      const col = page.getByTestId(`pipeline-column-${id}`);
      const n = await col.locator('.cursor-grab').filter({ hasText: 'Jordan Lee' }).count();
      if (n > 0) {
        currentStage = id;
        break;
      }
    }
    expect(currentStage).toBeTruthy();
    const targetStage = currentStage === 'PROPOSAL' ? 'NEGOTIATION' : 'PROPOSAL';

    const targetCol = page.getByTestId(`pipeline-column-${targetStage}`);
    const cardHandle = page.locator('.cursor-grab').filter({ hasText: 'Jordan Lee' }).first();
    await dndKitDrag(page, cardHandle, targetCol);

    await expect(targetCol.locator('.cursor-grab').filter({ hasText: 'Jordan Lee' })).toBeVisible({
      timeout: 20_000,
    });

    await page.goto('/leads');
    await page.getByPlaceholder('Name, company, email…').fill('Jordan Lee');
    await page.getByRole('button', { name: 'Apply' }).click();
    await page.getByRole('link', { name: 'Jordan Lee' }).click();
    await page.getByRole('button', { name: 'Overview' }).click();

    const historySection = page.locator('section').filter({ hasText: 'Deal stage history' });
    await expect(historySection).toBeVisible({ timeout: 15_000 });
    await expect(historySection.locator('li').first()).toContainText(`→ ${targetStage}`, {
      timeout: 15_000,
    });
  });
});
