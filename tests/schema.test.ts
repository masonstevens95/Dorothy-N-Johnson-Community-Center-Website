import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  events,
  eventOccurrenceExceptions,
  projects,
} from "@/lib/db/schema";
import {
  closeTestDatabase,
  db,
  expectRejection,
  PG_CHECK_VIOLATION,
  PG_UNIQUE_VIOLATION,
  setupTestDatabase,
  sql,
  truncateAll,
} from "./helpers/db";

/**
 * These tests are about the *database* refusing bad data, not about
 * application code declining to write it. Application-level validation can be
 * bypassed by the next code path someone adds; a check constraint cannot.
 */

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDatabase();
});

const inTwoWeeks = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

describe("events", () => {
  it("round-trips a published event with its confirmation timestamp", async () => {
    const startsAt = inTwoWeeks();
    const confirmedAt = new Date();

    const [inserted] = await db
      .insert(events)
      .values({
        title: "Community garden work day",
        startsAt,
        state: "published",
        lastConfirmedAt: confirmedAt,
        location: "Back lot, east entrance",
        host: "Garden committee",
      })
      .returning();

    const found = await db.query.events.findFirst({
      where: eq(events.id, inserted.id),
    });

    expect(found).toBeDefined();
    expect(found!.title).toBe("Community garden work day");
    expect(found!.state).toBe("published");
    expect(found!.startsAt.toISOString()).toBe(startsAt.toISOString());
    expect(found!.lastConfirmedAt?.toISOString()).toBe(confirmedAt.toISOString());
    expect(found!.location).toBe("Back lot, east entrance");
    expect(found!.host).toBe("Garden committee");
  });

  it("accepts an event carrying only the two required fields (R14)", async () => {
    const [inserted] = await db
      .insert(events)
      .values({ title: "Bingo", startsAt: inTwoWeeks() })
      .returning();

    expect(inserted.state).toBe("pending");
    expect(inserted.description).toBeNull();
    expect(inserted.location).toBeNull();
    expect(inserted.host).toBeNull();
    expect(inserted.imageId).toBeNull();
  });

  it("rejects an invalid publication state rather than storing it", async () => {
    await expect(
      sql`INSERT INTO events (title, starts_at, state)
          VALUES ('Bad state', now(), 'draft')`,
    ).rejects.toThrow(/invalid input value for enum/i);

    const remaining = await db.select().from(events);
    expect(remaining).toHaveLength(0);
  });

  it("rejects a published event with no confirmation date (R9)", async () => {
    // Published-but-never-confirmed would leave the public page with no
    // freshness date to render, which is the one thing R9 guarantees.
    const error = await expectRejection(
      db.insert(events).values({
        title: "Published without confirmation",
        startsAt: inTwoWeeks(),
        state: "published",
      }),
    );

    expect(error.code).toBe(PG_CHECK_VIOLATION);
    expect(error.constraint_name).toBe("events_published_requires_confirmation");
  });

  it("rejects a blank title", async () => {
    const error = await expectRejection(
      db.insert(events).values({ title: "   ", startsAt: inTwoWeeks() }),
    );

    expect(error.constraint_name).toBe("events_title_not_blank");
  });

  it("rejects an end time before the start time", async () => {
    const startsAt = inTwoWeeks();
    const error = await expectRejection(
      db.insert(events).values({
        title: "Backwards",
        startsAt,
        endsAt: new Date(startsAt.getTime() - 60 * 60 * 1000),
      }),
    );

    expect(error.constraint_name).toBe("events_ends_after_starts");
  });

  it("rejects a half-written recurrence", async () => {
    // An interval with no frequency would expand to nothing at read time,
    // silently dropping a program the maintainer believed they had scheduled.
    const error = await expectRejection(
      db.insert(events).values({
        title: "Interval without frequency",
        startsAt: inTwoWeeks(),
        recurrenceInterval: 2,
      }),
    );

    expect(error.constraint_name).toBe("events_recurrence_complete");
  });
});

describe("recurring series and per-occurrence exceptions (R4)", () => {
  async function createWeeklySeries() {
    const [series] = await db
      .insert(events)
      .values({
        title: "Tuesday community watch",
        startsAt: new Date("2026-09-01T18:00:00Z"),
        state: "published",
        lastConfirmedAt: new Date(),
        recurrenceFrequency: "weekly",
        recurrenceInterval: 1,
      })
      .returning();
    return series;
  }

  it("stores a cancelled occurrence without altering the series definition", async () => {
    const series = await createWeeklySeries();
    const cancelledWeek = new Date("2026-09-15T18:00:00Z");

    await db.insert(eventOccurrenceExceptions).values({
      eventId: series.id,
      occurrenceStart: cancelledWeek,
      cancelled: true,
    });

    const seriesAfter = await db.query.events.findFirst({
      where: eq(events.id, series.id),
    });

    // The series is untouched — "every Tuesday" stays true even though one
    // Tuesday is not.
    expect(seriesAfter!.startsAt.toISOString()).toBe(series.startsAt.toISOString());
    expect(seriesAfter!.recurrenceFrequency).toBe("weekly");
    expect(seriesAfter!.recurrenceInterval).toBe(1);
    expect(seriesAfter!.recurrenceUntil).toBeNull();

    const exceptions = await db
      .select()
      .from(eventOccurrenceExceptions)
      .where(eq(eventOccurrenceExceptions.eventId, series.id));

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].cancelled).toBe(true);
    expect(exceptions[0].overrideStartsAt).toBeNull();
  });

  it("stores a moved occurrence without shifting the series", async () => {
    const series = await createWeeklySeries();
    const originalWeek = new Date("2026-09-08T18:00:00Z");
    const movedTo = new Date("2026-09-09T19:30:00Z");

    await db.insert(eventOccurrenceExceptions).values({
      eventId: series.id,
      occurrenceStart: originalWeek,
      cancelled: false,
      overrideStartsAt: movedTo,
    });

    const seriesAfter = await db.query.events.findFirst({
      where: eq(events.id, series.id),
    });
    expect(seriesAfter!.startsAt.toISOString()).toBe(series.startsAt.toISOString());

    const [exception] = await db
      .select()
      .from(eventOccurrenceExceptions)
      .where(
        and(
          eq(eventOccurrenceExceptions.eventId, series.id),
          eq(eventOccurrenceExceptions.occurrenceStart, originalWeek),
        ),
      );

    // occurrenceStart keeps identifying *which* week this is, even though the
    // occurrence itself now happens at a different time.
    expect(exception.occurrenceStart.toISOString()).toBe(originalWeek.toISOString());
    expect(exception.overrideStartsAt?.toISOString()).toBe(movedTo.toISOString());
  });

  it("rejects an exception that neither cancels nor moves", async () => {
    const series = await createWeeklySeries();

    const error = await expectRejection(
      db.insert(eventOccurrenceExceptions).values({
        eventId: series.id,
        occurrenceStart: new Date("2026-09-22T18:00:00Z"),
        cancelled: false,
      }),
    );

    expect(error.constraint_name).toBe("event_exception_cancel_xor_move");
  });

  it("rejects an exception that both cancels and moves", async () => {
    const series = await createWeeklySeries();

    const error = await expectRejection(
      db.insert(eventOccurrenceExceptions).values({
        eventId: series.id,
        occurrenceStart: new Date("2026-09-22T18:00:00Z"),
        cancelled: true,
        overrideStartsAt: new Date("2026-09-23T18:00:00Z"),
      }),
    );

    expect(error.constraint_name).toBe("event_exception_cancel_xor_move");
  });

  it("rejects two exceptions for the same occurrence", async () => {
    const series = await createWeeklySeries();
    const week = new Date("2026-09-29T18:00:00Z");

    await db.insert(eventOccurrenceExceptions).values({
      eventId: series.id,
      occurrenceStart: week,
      cancelled: true,
    });

    const error = await expectRejection(
      db.insert(eventOccurrenceExceptions).values({
        eventId: series.id,
        occurrenceStart: week,
        cancelled: false,
        overrideStartsAt: new Date("2026-09-30T18:00:00Z"),
      }),
    );

    expect(error.code).toBe(PG_UNIQUE_VIOLATION);
    expect(error.constraint_name).toBe("event_exception_unique");
  });

  it("removes exceptions when the series is deleted", async () => {
    const series = await createWeeklySeries();
    await db.insert(eventOccurrenceExceptions).values({
      eventId: series.id,
      occurrenceStart: new Date("2026-10-06T18:00:00Z"),
      cancelled: true,
    });

    await db.delete(events).where(eq(events.id, series.id));

    const orphans = await db.select().from(eventOccurrenceExceptions);
    expect(orphans).toHaveLength(0);
  });
});

describe("projects", () => {
  it("cannot be marked both active and past", async () => {
    // Status is a single enum column, so "active AND past" is not a state the
    // database can hold — the invalid value is refused outright.
    await expect(
      sql`INSERT INTO projects (slug, name, status)
          VALUES ('both', 'Both at once', 'active,past')`,
    ).rejects.toThrow(/invalid input value for enum/i);

    const [project] = await db
      .insert(projects)
      .values({ slug: "garden", name: "Community garden", status: "active" })
      .returning();

    expect(project.status).toBe("active");

    const [updated] = await db
      .update(projects)
      .set({ status: "past" })
      .where(eq(projects.id, project.id))
      .returning();

    // Moving to past necessarily leaves active — one column, one answer.
    expect(updated.status).toBe("past");
  });

  it("rejects a duplicate slug", async () => {
    await db.insert(projects).values({ slug: "watch", name: "Community watch" });

    const error = await expectRejection(
      db.insert(projects).values({ slug: "watch", name: "Another watch" }),
    );

    expect(error.code).toBe(PG_UNIQUE_VIOLATION);
    expect(error.constraint_name).toBe("projects_slug_unique");
  });

  it("rejects a blank slug or name", async () => {
    const blankSlug = await expectRejection(
      db.insert(projects).values({ slug: "  ", name: "Blank slug" }),
    );
    expect(blankSlug.constraint_name).toBe("projects_slug_not_blank");

    const blankName = await expectRejection(
      db.insert(projects).values({ slug: "blank-name", name: " " }),
    );
    expect(blankName.constraint_name).toBe("projects_name_not_blank");
  });

  it("defaults to active", async () => {
    const [project] = await db
      .insert(projects)
      .values({ slug: "mural", name: "Hallway mural" })
      .returning();

    expect(project.status).toBe("active");
  });
});
