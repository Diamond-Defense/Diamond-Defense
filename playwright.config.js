import { defineConfig } from '@playwright/test';

const liveBaseUrl = process.env.BASE_URL;
const testPort = Number(process.env.TEST_PORT || 4175);
const localBaseUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  timeout: 15_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: liveBaseUrl || localBaseUrl,
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: liveBaseUrl ? undefined : {
    command: `npm run test:server -- --port ${testPort}`,
    url: localBaseUrl,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
