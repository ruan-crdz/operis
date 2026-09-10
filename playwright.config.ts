import { defineConfig, devices } from '@playwright/test';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173' + basePath + '/';
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'node scripts/serve-static.mjs',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
});
