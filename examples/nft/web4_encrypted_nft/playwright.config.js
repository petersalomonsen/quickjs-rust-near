import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './playwright-tests',
  timeout: 180000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'line',
  use: {
    trace: 'on-first-retry',
    headless: true,
    navigationTimeout: 60000,
    actionTimeout: 30000,
    video: process.env.CI ? 'off' : 'on',  // Record video locally, not in CI
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
