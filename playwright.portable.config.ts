import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/portable',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices['Pixel 7'],
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
