import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:48317',
    trace: 'on-first-retry',
  },
  webServer: {
    // Test the production build (as served in production) instead of the on-demand dev server.
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 48317 --strictPort',
    url: 'http://127.0.0.1:48317',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: '/usr/bin/chromium',
        },
      },
    },
  ],
});
