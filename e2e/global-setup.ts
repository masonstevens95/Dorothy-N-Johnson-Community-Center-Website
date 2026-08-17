import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

export const E2E_ADMIN_EMAIL = "e2e-maintainer@example.test";
export const E2E_ADMIN_PASSWORD = "e2e-correct-horse-battery";

/** Where the once-per-run signed-in session is stored. */
export const ADMIN_STATE_PATH = "e2e/.auth/admin.json";

/**
 * Browser tests run against their own database. They publish real events, and
 * pointing them at the development database would leave fixtures behind that
 * look like real content the next time the site is opened.
 */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL;

  if (!url) {
    throw new Error(
      "E2E_DATABASE_URL is not set. See .env.example — it must be a throwaway database.",
    );
  }

  process.env.DATABASE_URL = url;

  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db, sql } = await import("../lib/db");
  const { seedAdmin } = await import("../lib/auth-seed");

  await migrate(db, { migrationsFolder: "./drizzle" });

  await sql`
    TRUNCATE TABLE
      event_occurrence_exceptions, events, project_images, projects, images,
      submission_attempts, "session", account, verification, "user"
    RESTART IDENTITY CASCADE
  `;

  await seedAdmin({
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
    name: "E2E maintainer",
  });

  await sql.end({ timeout: 5 });
}
