import { defineConfig, devices } from '@playwright/test';
const remote = process.env.PUBLIC_BASE_URL;
const browsers = (process.env.BROWSERS ?? 'chromium').split(',');
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: remote ?? 'http://127.0.0.1:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: browsers.map((name) => ({
    name,
    use: {
      ...devices[
        name === 'firefox'
          ? 'Desktop Firefox'
          : name === 'webkit'
            ? 'Desktop Safari'
            : 'Desktop Chrome'
      ],
    },
  })),
  webServer: remote
    ? undefined
    : {
        command:
          'node node_modules/vite/bin/vite.js preview --config apps/web/vite.config.ts --outDir dist --host 127.0.0.1 --port 5174 --strictPort',
        url: 'http://127.0.0.1:5174',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
