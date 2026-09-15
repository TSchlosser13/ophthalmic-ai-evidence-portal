import { defineConfig, devices } from '@playwright/test';

const basePath = (process.env.BASE_PATH || '/').replace(/\/?$/, '/');
const port = Number(process.env.PORT || 4322);
const useEdge = process.env.PLAYWRIGHT_USE_EDGE === '1';
const manageWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER !== '1';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './.cache/test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}${basePath}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(useEdge ? { channel: 'msedge' } : {})
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  ...(manageWebServer ? {
    webServer: {
      command: `node node_modules/astro/bin/astro.mjs preview --host 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}${basePath}`,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore' as const,
      stderr: 'ignore' as const,
      timeout: 120_000
    }
  } : {})
});
