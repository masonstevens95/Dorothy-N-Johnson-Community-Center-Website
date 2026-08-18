import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

/**
 * Phone-first (R7): the default project is a mobile viewport, because posting
 * from the bulletin board and reading on the way there both happen on a phone.
 *
 * The server runs against E2E_DATABASE_URL, never the development database —
 * these tests publish real events.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["setup"],
      testIgnore: /.*\.setup\.ts/,
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm run build && pnpm exec next start --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        env: {
          // Wins over .env.local: Next gives precedence to the real process
          // environment.
          DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
          BETTER_AUTH_URL: "http://127.0.0.1:3100",
          BETTER_AUTH_SECRET:
            process.env.BETTER_AUTH_SECRET ?? "e2e-secret-not-used-in-production",
          NEXT_PUBLIC_SITE_TIME_ZONE:
            process.env.NEXT_PUBLIC_SITE_TIME_ZONE ?? "America/New_York",
        },
      },
});
