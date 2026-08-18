/**
 * Every table, in an order safe to truncate.
 *
 * The vitest helper and the Playwright global setup both wipe the database
 * between runs, and a table missing from one of the two lists leaks fixtures
 * into the next run in ways that are hard to attribute. One list, imported by
 * both.
 */
export const TRUNCATABLE_TABLES = [
  "event_occurrence_exceptions",
  "events",
  "project_images",
  "projects",
  "images",
  "submission_attempts",
  "session",
  "account",
  "verification",
  "user",
] as const;

/** Quoted for the reserved words (`user`, `session`) among them. */
export const truncatableTableList = TRUNCATABLE_TABLES.map(
  (table) => `"${table}"`,
).join(", ");
