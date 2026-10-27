import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5174", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node --import tsx e2e/server.ts",
      url: "http://127.0.0.1:18080/health",
      env: { NODE_ENV: "test" },
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "npm run dev -- --mode e2e",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
