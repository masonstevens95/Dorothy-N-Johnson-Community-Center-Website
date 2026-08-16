import { config } from "dotenv";

// Load .env.local first — values already in the real environment win.
config({ path: ".env.local" });
config({ path: ".env" });

/**
 * Integration tests truncate tables. Pointing them at the development database
 * would quietly destroy real content, so the test database is a separate,
 * explicitly configured URL and the suite refuses to run without it.
 */
const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.\n" +
      "It must point at a throwaway database — the suite truncates tables.",
  );
}

if (testUrl === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must not equal DATABASE_URL. The test suite truncates tables.",
  );
}

// Vitest already sets NODE_ENV=test; the remaining values are what the app
// code reads at import time.
process.env.DATABASE_URL = testUrl;
process.env.BETTER_AUTH_SECRET ||= "test-secret-not-used-in-production";
process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
