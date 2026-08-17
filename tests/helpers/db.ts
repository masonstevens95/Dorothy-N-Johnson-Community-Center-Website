import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "@/lib/db";

/**
 * tests/setup.ts has already repointed DATABASE_URL at TEST_DATABASE_URL and
 * refused to run if the two match, so importing the real client here cannot
 * reach the development database.
 */

let migrated = false;

/** Applies migrations from empty. Idempotent within a test file. */
export async function setupTestDatabase(): Promise<void> {
  if (migrated) return;
  await migrate(db, { migrationsFolder: "./drizzle" });
  migrated = true;
}

/**
 * Truncated in dependency order with CASCADE so tests never inherit each
 * other's fixtures. The migrations table is deliberately left alone.
 */
export async function truncateAll(): Promise<void> {
  await sql`
    TRUNCATE TABLE
      event_occurrence_exceptions,
      events,
      project_images,
      projects,
      images,
      "session",
      account,
      verification,
      "user"
    RESTART IDENTITY CASCADE
  `;
}

/** Vitest hangs on an open pool, so every suite closes its connection. */
export async function closeTestDatabase(): Promise<void> {
  await sql.end({ timeout: 5 });
}

/** The fields postgres.js attaches to a rejected query. */
export interface PostgresError extends Error {
  /** SQLSTATE — 23514 check, 23505 unique, 23503 foreign key, 22P02 bad enum. */
  code?: string;
  constraint_name?: string;
}

export const PG_CHECK_VIOLATION = "23514";
export const PG_UNIQUE_VIOLATION = "23505";

/**
 * Asserts a write is rejected and returns the underlying Postgres error.
 *
 * Drizzle wraps driver errors, so the top-level message is only ever
 * "Failed query: ..." — the constraint name lives further down the cause
 * chain. Asserting on the unwrapped error lets a test name the exact
 * constraint it expects rather than settling for "something threw", which
 * would pass even if an unrelated failure moved in.
 */
export async function expectRejection(
  promise: PromiseLike<unknown>,
): Promise<PostgresError> {
  try {
    await promise;
  } catch (error) {
    let current = error as PostgresError;
    while (current.cause instanceof Error) {
      current = current.cause as PostgresError;
    }
    return current;
  }
  throw new Error("Expected the database to reject this write, but it succeeded.");
}

export { db, sql };
