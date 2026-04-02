// @ts-check
const { defineConfig } = require('@playwright/test');
const path = require('path');

const repoRoot = __dirname;
// In GitHub Actions, localhost can resolve to IPv6 while services listen on IPv4-mapped ports.
const loopback = process.env.CI ? '127.0.0.1' : 'localhost';
const defaultApiOrigin = `http://${loopback}:4000`;

module.exports = defineConfig({
  testDir: path.join(repoRoot, 'e2e'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  globalSetup: path.join(repoRoot, 'e2e', 'global-setup.cjs'),
  timeout: 120_000,
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ||
      (process.env.CI ? 'http://127.0.0.1:5173' : 'http://localhost:5173'),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: 'npm run dev',
          cwd: path.join(repoRoot, 'server'),
          url: `${defaultApiOrigin}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            // Playwright-spawned API: skip boot IMAP so lastUid is not advanced before the spec clicks sync.
            ...(process.env.IMAP_SKIP_BOOT_SYNC === undefined
              ? { IMAP_SKIP_BOOT_SYNC: '1' }
              : {}),
          },
        },
        {
          command: 'npm run dev',
          cwd: path.join(repoRoot, 'client'),
          url: `http://${loopback}:5173`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            VITE_GRAPHQL_URL:
              process.env.VITE_GRAPHQL_URL || `${defaultApiOrigin}/graphql`,
          },
        },
      ],
});
