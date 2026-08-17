import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Everything here is standard Postgres — no vendor-specific column types, no
 * proprietary extensions beyond `gen_random_uuid()`, which ships with Postgres
 * itself. A future owner can `pg_dump` this and restore it anywhere (R22).
 */

// ---------------------------------------------------------------------------
// Auth (Better Auth core schema)
// ---------------------------------------------------------------------------

/**
 * Exactly one row is seeded into this table, and there is no public
 * registration route. It is a real users table anyway, because that is what
 * makes adding a second publisher later an INSERT rather than a rewrite of the
 * auth layer (R23).
 */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /**
   * Deliberately plain text rather than an enum. R23 asks that adding a
   * publisher later not require an architectural change, and widening a text
   * column costs nothing where widening an enum costs a migration. No
   * permission logic reads this yet — it exists so the column is already there
   * when it does.
   */
  role: text("role").notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * A row exists here only after lib/images.ts has resized, capped, and
 * EXIF-stripped the upload. Dimensions and byte size are recorded as stored,
 * which is what lets the caps be audited after the fact rather than trusted.
 */
export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  /** Storage key, retained so the object can actually be deleted later. */
  pathname: text("pathname").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  byteSize: integer("byte_size").notNull(),
  contentType: text("content_type").notNull(),
  /** Optional, and never auto-generated. An empty alt is better than a wrong one. */
  altText: text("alt_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * Active and past are mutually exclusive by construction. Representing this as
 * two booleans would make "active AND past" storable, and the gallery's whole
 * job is answering "is this place alive right now" unambiguously (R5).
 */
export const projectStatus = pgEnum("project_status", ["active", "past"]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    status: projectStatus("status").notNull().default("active"),
    coverImageId: uuid("cover_image_id").references(() => images.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("projects_status_idx").on(table.status),
    check("projects_slug_not_blank", sql`length(trim(${table.slug})) > 0`),
    check("projects_name_not_blank", sql`length(trim(${table.name})) > 0`),
  ],
);

export const projectImages = pgTable(
  "project_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    imageId: uuid("image_id")
      .notNull()
      .references(() => images.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("project_images_unique").on(table.projectId, table.imageId),
    index("project_images_project_idx").on(table.projectId, table.sortOrder),
  ],
);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * A submitted event and a published event are the same row in different
 * states. This is what keeps moderation and authoring on one code path —
 * approving is a transition, not a copy between tables, so the two edit
 * surfaces cannot drift apart (R18, R21).
 */
export const eventState = pgEnum("event_state", ["pending", "published", "rejected"]);

/**
 * Weekly and monthly cover every program the center actually runs. A null
 * frequency means a one-off event. Occurrences are expanded at read time and
 * never written as rows — materializing them would make "edit the series"
 * versus "edit this week" ambiguous at exactly the moment it matters (R4).
 */
export const recurrenceFrequency = pgEnum("recurrence_frequency", ["weekly", "monthly"]);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // R14: these two are the only required fields. Everything below is
    // optional so a post can be finished standing at the bulletin board.
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),

    endsAt: timestamp("ends_at", { withTimezone: true }),
    location: text("location"),
    description: text("description"),
    host: text("host"),

    state: eventState("state").notNull().default("pending"),

    /**
     * R9. When this was last checked against the physical bulletin board.
     * lib/freshness.ts derives both the per-event unverified marking and the
     * site-level notice from this column — there is no stored "stale" flag,
     * and so nothing to keep in sync.
     */
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),

    /** R15: a flyer photo can stand in for a typed description entirely. */
    imageId: uuid("image_id").references(() => images.id, { onDelete: "set null" }),

    /** R5: events and projects cross-link. */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),

    // Recurrence series definition (R4). Null frequency = one-off event.
    recurrenceFrequency: recurrenceFrequency("recurrence_frequency"),
    recurrenceInterval: integer("recurrence_interval"),
    recurrenceUntil: timestamp("recurrence_until", { withTimezone: true }),

    /** R19: optional, and never rendered publicly. */
    submitterContact: text("submitter_contact"),

    /** Null for public submissions — nobody is signed in when those arrive. */
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The public calendar's only query shape: published events, by date.
    index("events_state_starts_at_idx").on(table.state, table.startsAt),
    index("events_project_idx").on(table.projectId),

    check("events_title_not_blank", sql`length(trim(${table.title})) > 0`),

    /**
     * R9 as a storage guarantee: a published event always has a confirmation
     * date to display. Without this, "published but never confirmed" is
     * representable and the public page has nothing to render.
     */
    check(
      "events_published_requires_confirmation",
      sql`${table.state} <> 'published' OR ${table.lastConfirmedAt} IS NOT NULL`,
    ),

    check(
      "events_ends_after_starts",
      sql`${table.endsAt} IS NULL OR ${table.endsAt} >= ${table.startsAt}`,
    ),

    /**
     * A recurrence is all-or-nothing: an interval without a frequency is a
     * half-written series, and expanding it at read time would silently do
     * nothing.
     */
    check(
      "events_recurrence_complete",
      sql`(${table.recurrenceFrequency} IS NULL AND ${table.recurrenceInterval} IS NULL)
          OR (${table.recurrenceFrequency} IS NOT NULL AND ${table.recurrenceInterval} >= 1)`,
    ),

    check(
      "events_recurrence_until_after_start",
      sql`${table.recurrenceUntil} IS NULL OR ${table.recurrenceUntil} >= ${table.startsAt}`,
    ),
  ],
);

/**
 * A per-occurrence override on a series (R4). Cancelling or moving one week
 * writes a row here and leaves the series definition untouched, so "every
 * Tuesday" stays true even when one Tuesday is not.
 */
export const eventOccurrenceExceptions = pgTable(
  "event_occurrence_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),

    /**
     * The occurrence's originally scheduled start, which is how an exception
     * is matched to an expanded occurrence. It stays fixed even when the
     * occurrence is moved, so the identity of "which week this is" survives
     * the override.
     */
    occurrenceStart: timestamp("occurrence_start", { withTimezone: true }).notNull(),

    cancelled: boolean("cancelled").notNull().default(false),
    overrideStartsAt: timestamp("override_starts_at", { withTimezone: true }),
    overrideEndsAt: timestamp("override_ends_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("event_exception_unique").on(table.eventId, table.occurrenceStart),

    /**
     * An exception either cancels an occurrence or moves it — never both, and
     * never neither. A row that does neither is a no-op that would quietly
     * suggest an edit had been applied.
     */
    check(
      "event_exception_cancel_xor_move",
      sql`(${table.cancelled} = true AND ${table.overrideStartsAt} IS NULL AND ${table.overrideEndsAt} IS NULL)
          OR (${table.cancelled} = false AND ${table.overrideStartsAt} IS NOT NULL)`,
    ),

    check(
      "event_exception_ends_after_starts",
      sql`${table.overrideEndsAt} IS NULL
          OR (${table.overrideStartsAt} IS NOT NULL AND ${table.overrideEndsAt} >= ${table.overrideStartsAt})`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof user.$inferSelect;
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventState = (typeof eventState.enumValues)[number];
export type EventOccurrenceException = typeof eventOccurrenceExceptions.$inferSelect;
export type NewEventOccurrenceException = typeof eventOccurrenceExceptions.$inferInsert;
