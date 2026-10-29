import { defineConfig } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // static 架构：没有 build 步骤，直接起 wrangler 本地静态资源
        command: process.env.E2E_SERVER_CMD ?? `npx wrangler dev --local --port ${port}`,
        url: `http://localhost:${port}`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
