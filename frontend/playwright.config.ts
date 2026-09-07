import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", timeout: 60000, workers: 1,
  use: { baseURL: "http://127.0.0.1:3000", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1", url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI, timeout: 120000,
  },
});
