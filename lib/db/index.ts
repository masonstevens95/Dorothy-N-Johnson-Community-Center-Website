import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  return url;
}

/**
 * Serverless functions are created and destroyed constantly, and each one
 * opening its own pool would exhaust Postgres' connection limit under trivial
 * traffic. One connection per instance, plus a pooled DATABASE_URL in
 * production, is what keeps that from happening.
 *
 * In development the client is cached on globalThis so hot reload doesn't leak
 * a connection on every edit.
 */
function createClient() {
  return postgres(connectionString(), {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    // Prepared statements are cached per connection and break through
    // transaction-mode poolers such as PgBouncer.
    prepare: false,
  });
}

const globalForDb = globalThis as unknown as {
  __dnjSql?: ReturnType<typeof createClient>;
};

export const sql = globalForDb.__dnjSql ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__dnjSql = sql;
}

export const db = drizzle(sql, { schema });

export type Database = typeof db;
