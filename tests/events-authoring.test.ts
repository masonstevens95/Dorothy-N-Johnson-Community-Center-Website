import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { UnauthorizedError } from "@/lib/auth-guard";
import {
  cancelOccurrence,
  confirmEvents,
  createEvent,
  deleteEvent,
  moveOccurrence,
  publishEvent,
  rejectEvent,
  restoreOccurrence,
  updateEvent,
} from "@/lib/events/state";
import { expandEvent } from "@/lib/events/recurrence";
import { events, eventOccurrenceExceptions } from "@/lib/db/schema";
import {
  closeTestDatabase,
  db,
  setupTestDatabase,
  truncateAll,
} from "./helpers/db";
import { noSession, seedAndSignIn } from "./helpers/auth";

let adminHeaders: Headers;

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await truncateAll();
  adminHeaders = await seedAndSignIn();
});

afterAll(async () => {
  await closeTestDatabase();
});

const auth_ = () => ({ requestHeaders: adminHeaders });
const nextSaturday = () => new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

describe("creating events (R14, R15)", () => {
  it("publishes an event with only a name and a date/time", async () => {
    // Covers AE4: the maintainer is standing at the board with a phone.
    const event = await createEvent(
      { title: "Potluck", startsAt: nextSaturday() },
      auth_(),
    );

    expect(event.state).toBe("published");
    expect(event.lastConfirmedAt).not.toBeNull();
    expect(event.description).toBeNull();
    expect(event.location).toBeNull();
  });

  it("publishes with a flyer photo standing in for a description", async () => {
    // Covers AE4: the photo carries the event; nothing is typed.
    const [image] = await db
      .insert((await import("@/lib/db/schema")).images)
      .values({
        url: "/uploads/images/flyer.webp",
        pathname: "images/flyer.webp",
        width: 1200,
        height: 1600,
        byteSize: 90_000,
        contentType: "image/webp",
      })
      .returning();

    const event = await createEvent(
      { title: "Bingo night", startsAt: nextSaturday(), imageId: image.id },
      auth_(),
    );

    expect(event.imageId).toBe(image.id);
    expect(event.description).toBeNull();
    expect(event.state).toBe("published");
  });

  it("rejects a missing name, naming the field", async () => {
    await expect(
      createEvent({ title: "   ", startsAt: nextSaturday() }, auth_()),
    ).rejects.toThrow(/name is required/i);
  });

  it("rejects a missing date/time, naming the field", async () => {
    await expect(createEvent({ title: "Potluck" }, auth_())).rejects.toThrow(
      /date and time is required/i,
    );
  });

  it("rejects an end time before the start time", async () => {
    const startsAt = nextSaturday();
    await expect(
      createEvent(
        {
          title: "Backwards",
          startsAt,
          endsAt: new Date(startsAt.getTime() - 3_600_000),
        },
        auth_(),
      ),
    ).rejects.toThrow(/end time cannot be before/i);
  });

  it("keeps an event with a past date rather than discarding it", async () => {
    // Deliberate: a mistyped year should be findable and fixable in admin, not
    // silently absent from every view with no explanation.
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const event = await createEvent(
      { title: "Last month's cleanup", startsAt: lastMonth },
      auth_(),
    );

    const stored = await db.query.events.findFirst({
      where: eq(events.id, event.id),
    });

    expect(stored).toBeDefined();
    expect(stored!.startsAt.getTime()).toBe(lastMonth.getTime());
    expect(stored!.state).toBe("published");
  });

  it("defaults a recurring event's interval to one", async () => {
    const event = await createEvent(
      {
        title: "Tuesday watch",
        startsAt: nextSaturday(),
        recurrenceFrequency: "weekly",
      },
      auth_(),
    );

    expect(event.recurrenceInterval).toBe(1);
  });

  it("clears recurrence fields on a one-off event", async () => {
    const event = await createEvent(
      {
        title: "One-off",
        startsAt: nextSaturday(),
        recurrenceFrequency: null,
        recurrenceUntil: new Date(),
      },
      auth_(),
    );

    expect(event.recurrenceFrequency).toBeNull();
    expect(event.recurrenceInterval).toBeNull();
    expect(event.recurrenceUntil).toBeNull();
  });
});

describe("the confirmation pass (R16)", () => {
  async function createSix() {
    const created = [];
    for (let index = 0; index < 6; index++) {
      created.push(
        await createEvent(
          {
            title: `Event ${index}`,
            startsAt: new Date(Date.now() + (index + 1) * 86_400_000),
            location: `Room ${index}`,
            description: `Description ${index}`,
          },
          auth_(),
        ),
      );
    }
    return created;
  }

  it("refreshes six events in one pass without editing any field", async () => {
    // Covers AE5.
    const created = await createSix();

    // Age them so a refresh is observable.
    const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await db.update(events).set({ lastConfirmedAt: stale });

    const confirmed = await confirmEvents(
      created.map((event) => event.id),
      auth_(),
    );

    expect(confirmed).toHaveLength(6);

    for (const event of confirmed) {
      expect(event.lastConfirmedAt!.getTime()).toBeGreaterThan(stale.getTime());
    }

    // Nothing else moved.
    const after = await db.select().from(events);
    for (const event of after) {
      const original = created.find((candidate) => candidate.id === event.id)!;
      expect(event.title).toBe(original.title);
      expect(event.startsAt.getTime()).toBe(original.startsAt.getTime());
      expect(event.location).toBe(original.location);
      expect(event.description).toBe(original.description);
      expect(event.state).toBe(original.state);
    }
  });

  it("ignores ids that are not published", async () => {
    const pending = await createEvent(
      { title: "Submitted", startsAt: nextSaturday() },
      { ...auth_(), publish: false },
    );

    const confirmed = await confirmEvents([pending.id], auth_());

    expect(confirmed).toEqual([]);

    // A pending event gaining a confirmation date would make it look reviewed
    // when nobody has looked at it.
    const stored = await db.query.events.findFirst({
      where: eq(events.id, pending.id),
    });
    expect(stored!.lastConfirmedAt).toBeNull();
  });

  it("does nothing when given no ids", async () => {
    await expect(confirmEvents([], auth_())).resolves.toEqual([]);
  });

  it("tolerates unknown ids alongside real ones", async () => {
    const event = await createEvent(
      { title: "Real", startsAt: nextSaturday() },
      auth_(),
    );

    const confirmed = await confirmEvents(
      [event.id, "00000000-0000-4000-8000-000000000000"],
      auth_(),
    );

    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].id).toBe(event.id);
  });
});

describe("state transitions", () => {
  it("publishing a pending event sets its confirmation date", async () => {
    const pending = await createEvent(
      { title: "Submitted", startsAt: nextSaturday() },
      { ...auth_(), publish: false },
    );

    expect(pending.lastConfirmedAt).toBeNull();

    const published = await publishEvent(pending.id, auth_());

    expect(published.state).toBe("published");
    expect(published.lastConfirmedAt).not.toBeNull();
  });

  it("rejecting an event keeps it out of the published set", async () => {
    const pending = await createEvent(
      { title: "Spam", startsAt: nextSaturday() },
      { ...auth_(), publish: false },
    );

    const rejected = await rejectEvent(pending.id, auth_());
    expect(rejected.state).toBe("rejected");
  });

  it("editing preserves the event's state and identity", async () => {
    const event = await createEvent(
      { title: "Typo", startsAt: nextSaturday() },
      auth_(),
    );

    const updated = await updateEvent(
      event.id,
      { title: "Fixed", startsAt: event.startsAt, location: "Gym" },
      auth_(),
    );

    expect(updated.id).toBe(event.id);
    expect(updated.title).toBe("Fixed");
    expect(updated.location).toBe("Gym");
    expect(updated.state).toBe("published");
  });

  it("reports a missing event rather than silently doing nothing", async () => {
    await expect(
      publishEvent("00000000-0000-4000-8000-000000000000", auth_()),
    ).rejects.toThrow(/No event with id/);
  });

  it("deleting an event removes it", async () => {
    const event = await createEvent(
      { title: "Gone", startsAt: nextSaturday() },
      auth_(),
    );

    await deleteEvent(event.id, auth_());

    expect(await db.select().from(events)).toHaveLength(0);
  });
});

describe("occurrence exceptions", () => {
  async function weeklySeries() {
    return createEvent(
      {
        title: "Tuesday watch",
        startsAt: new Date("2026-09-01T22:00:00Z"),
        recurrenceFrequency: "weekly",
      },
      auth_(),
    );
  }

  const autumn = {
    from: new Date("2026-09-01T00:00:00Z"),
    to: new Date("2026-10-15T00:00:00Z"),
  };

  it("cancelling one week leaves the others intact", async () => {
    const series = await weeklySeries();
    await cancelOccurrence(series.id, new Date("2026-09-15T22:00:00Z"), auth_());

    const exceptions = await db.select().from(eventOccurrenceExceptions);
    const occurrences = expandEvent(series, exceptions, autumn);
    const starts = occurrences.map((o) => o.start.toISOString());

    expect(starts).not.toContain("2026-09-15T22:00:00.000Z");
    expect(starts).toContain("2026-09-08T22:00:00.000Z");
    expect(starts).toContain("2026-09-22T22:00:00.000Z");
  });

  it("moving one week does not shift the series", async () => {
    const series = await weeklySeries();
    await moveOccurrence(
      series.id,
      new Date("2026-09-08T22:00:00Z"),
      new Date("2026-09-09T23:00:00Z"),
      null,
      auth_(),
    );

    const exceptions = await db.select().from(eventOccurrenceExceptions);
    const occurrences = expandEvent(series, exceptions, autumn);

    expect(occurrences.find((o) => o.moved)!.start.toISOString()).toBe(
      "2026-09-09T23:00:00.000Z",
    );
    expect(
      occurrences.some((o) => o.start.toISOString() === "2026-09-15T22:00:00.000Z"),
    ).toBe(true);
  });

  it("cancelling a week that was already moved replaces the override", async () => {
    const series = await weeklySeries();
    const week = new Date("2026-09-08T22:00:00Z");

    await moveOccurrence(series.id, week, new Date("2026-09-09T23:00:00Z"), null, auth_());
    await cancelOccurrence(series.id, week, auth_());

    const [exception] = await db.select().from(eventOccurrenceExceptions);

    expect(exception.cancelled).toBe(true);
    expect(exception.overrideStartsAt).toBeNull();
  });

  it("restoring an occurrence brings it back", async () => {
    const series = await weeklySeries();
    const week = new Date("2026-09-15T22:00:00Z");

    await cancelOccurrence(series.id, week, auth_());
    await restoreOccurrence(series.id, week, auth_());

    const exceptions = await db.select().from(eventOccurrenceExceptions);
    expect(exceptions).toHaveLength(0);

    const occurrences = expandEvent(series, exceptions, autumn);
    expect(occurrences.map((o) => o.start.toISOString())).toContain(
      "2026-09-15T22:00:00.000Z",
    );
  });
});

describe("every authoring path is behind the write gate (R13)", () => {
  const unauthenticated = noSession();

  it("refuses to create", async () => {
    await expect(
      createEvent({ title: "Sneaky", startsAt: nextSaturday() }, unauthenticated),
    ).rejects.toThrow(UnauthorizedError);

    expect(await db.select().from(events)).toHaveLength(0);
  });

  it("refuses to confirm", async () => {
    const event = await createEvent(
      { title: "Real", startsAt: nextSaturday() },
      auth_(),
    );

    await expect(confirmEvents([event.id], unauthenticated)).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("refuses to update, publish, reject, and delete", async () => {
    const event = await createEvent(
      { title: "Real", startsAt: nextSaturday() },
      auth_(),
    );

    await expect(
      updateEvent(event.id, { title: "Hacked", startsAt: event.startsAt }, unauthenticated),
    ).rejects.toThrow(UnauthorizedError);
    await expect(publishEvent(event.id, unauthenticated)).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(rejectEvent(event.id, unauthenticated)).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(deleteEvent(event.id, unauthenticated)).rejects.toThrow(
      UnauthorizedError,
    );

    // The event is exactly as it was.
    const stored = await db.query.events.findFirst({
      where: eq(events.id, event.id),
    });
    expect(stored!.title).toBe("Real");
    expect(stored!.state).toBe("published");
  });

  it("refuses to cancel, move, or restore an occurrence", async () => {
    const series = await createEvent(
      {
        title: "Series",
        startsAt: new Date("2026-09-01T22:00:00Z"),
        recurrenceFrequency: "weekly",
      },
      auth_(),
    );
    const week = new Date("2026-09-08T22:00:00Z");

    await expect(cancelOccurrence(series.id, week, unauthenticated)).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(
      moveOccurrence(series.id, week, new Date("2026-09-09T22:00:00Z"), null, unauthenticated),
    ).rejects.toThrow(UnauthorizedError);
    await expect(restoreOccurrence(series.id, week, unauthenticated)).rejects.toThrow(
      UnauthorizedError,
    );

    expect(await db.select().from(eventOccurrenceExceptions)).toHaveLength(0);
  });
});
