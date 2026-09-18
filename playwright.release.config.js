import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config.js';

export default defineConfig({
  ...baseConfig,
  testMatch: 'release-readiness.spec.js',
  testIgnore: [],
  timeout: 30_000,
  workers: 1,
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'desktop-webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'compact-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        screen: { width: 1024, height: 768 },
      },
    },
    {
      name: 'tablet-webkit',
      use: { ...devices['iPad Pro 11 landscape'] },
    },
  ],
});
