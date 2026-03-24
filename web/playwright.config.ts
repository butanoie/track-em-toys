import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Load VITE_API_URL from web/.env so the health check URL matches the API origin.
function loadViteApiUrl(): string | undefined {
  try {
    const envPath = path.join(import.meta.dirname, '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/^VITE_API_URL=(.+)$/m);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const apiURL = process.env.E2E_API_URL ?? loadViteApiUrl() ?? 'https://localhost:3010';

// Derive web base URL from the API hostname so they're same-site (required for
// SameSite cookies — cross-site fetch() won't send the cookie).
const apiHostname = new URL(apiURL).hostname;
const baseURL = `https://${apiHostname}:4173`;

export default defineConfig({
  testDir: './e2e',
  // Per-test auth via e2e-fixtures eliminates token rotation conflicts,
  // so fullyParallel can be enabled. Each test gets its own fresh token.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Cap workers: each test calls test-signin + /auth/refresh, and rate limits are per-IP.
  workers: process.env.CI ? 1 : 3,
  reporter: 'html',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
  },
  projects: [
    // Unauthenticated tests — login page, redirect behavior
    {
      name: 'unauthenticated',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /login-page\.spec\.ts|protected-routes\.spec\.ts/,
    },
    // Authenticated as regular user — catalog browsing, session tests
    {
      name: 'user',
      use: { ...devices['Desktop Chrome'] },
      testMatch:
        /authenticated-session\.spec\.ts|catalog-browse\.spec\.ts|catalog-detail-pages\.spec\.ts|catalog-search\.spec\.ts|session-persistence\.spec\.ts|collection\.spec\.ts|collection-export-import\.spec\.ts/,
    },
    // Authenticated as admin — admin dashboard
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /admin-users\.spec\.ts/,
    },
    // Authenticated as curator — future curator-specific tests
    {
      name: 'curator',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /curator-.*\.spec\.ts/,
    },
  ],
  webServer: [
    // API server — must be running for real auth
    {
      command: 'cd ../api && npm run dev',
      url: `${apiURL}/health`,
      reuseExistingServer: !process.env.CI,
      ignoreHTTPSErrors: true,
      timeout: 30_000,
    },
    // Web preview server
    {
      command: 'npm run preview',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      ignoreHTTPSErrors: true,
    },
  ],
});
