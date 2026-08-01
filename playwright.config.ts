import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    // A dev server already on this port is reused, which is the common local
    // case — note that its environment is whatever it was started with, so the
    // auth tests detect an enabled DEV_SKIP_AUTH at runtime rather than trusting
    // the env set here. Next refuses to run a second dev server from one
    // directory, so starting an isolated one is not an option.
    reuseExistingServer: !process.env.CI,
    env: { DEV_SKIP_AUTH: 'false' },
    timeout: 120_000,
  },
});
