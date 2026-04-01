// @ts-check
/**
 * @param {import('@playwright/test').Page} page
 * @param {{ email: string; password: string }} creds
 */
async function loginAs(page, { email, password }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Sign out' }).waitFor({
    state: 'visible',
    timeout: 20_000,
  });
}

module.exports = { loginAs };
