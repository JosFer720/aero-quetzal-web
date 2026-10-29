import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "node --import tsx e2e/server.ts",
      url: "http://127.0.0.1:18082/health",
      env: { NODE_ENV: "test" },
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "npm run dev:test",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
