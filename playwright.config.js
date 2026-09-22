import { defineConfig } from '@playwright/test';

const liveBaseUrl = process.env.BASE_URL;
const testPort = Number(process.env.TEST_PORT || 4175);
const localBaseUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: './tests',
  testIgnore: 'release-readiness.spec.js',
  fullyParallel: false,
  // Files share one D1 database and seeded users. Concurrent API assignments can
  // lock free play for a UI test using the same player. fullyParallel:false only
  // serializes tests within each file; serialize files as well until fixtures
  // have independent databases/accounts per worker.
  workers: 1,
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
    reuseExistingServer: false,
    // Includes fresh D1 migrations, seeding, production build, and Worker startup.
    timeout: 120_000,
  },
});
