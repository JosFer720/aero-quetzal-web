import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  testDir: ".", testMatch: "integrated.spec.ts", workers: 1, reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  webServer: [
    { command: "node --import tsx tests/e2e/server.ts", cwd, env: { NODE_ENV: "test" }, url: "http://127.0.0.1:18080/health", reuseExistingServer: false },
    { command: "npm run dev --workspace site -- --mode integration", cwd, url: "http://127.0.0.1:5173", reuseExistingServer: false },
    { command: "npm run dev --workspace @aeroquetzal/internal-web -- --mode e2e", cwd, url: "http://127.0.0.1:5174", reuseExistingServer: false },
  ],
});
