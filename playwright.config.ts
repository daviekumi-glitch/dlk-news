import type { Config } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * The app is a static export, so the "server" is just a file server over `out/`
 * (built beforehand by `npm run build`). Shell tests run with no credentials.
 * The signed-in chat flow runs only when E2E_ACCESS_TOKEN is provided, and is
 * reported as skipped (not passed) otherwise.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

const config: Config = {
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { browserName: "chromium" } }],

  webServer: {
    command: `npx --yes serve@14 out -l ${PORT} --no-clipboard`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
};

export default config;
