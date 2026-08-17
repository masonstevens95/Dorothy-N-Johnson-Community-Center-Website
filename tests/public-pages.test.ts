import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { seedAdmin } from "@/lib/auth-seed";
import { createEvent } from "@/lib/events/state";
import {
  getPublicEvent,
  getPublishedEventIds,
  getSiteFreshness,
  getUpcomingOccurrences,
} from "@/lib/public-data";
import { STALENESS_WINDOW_DAYS } from "@/lib/freshness";
import { events } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  closeTestDatabase,
  db,
  setupTestDatabase,
  truncateAll,
} from "./helpers/db";

/**
 * The public read path. Its two guarantees are that nothing unapproved is
 * reachable, and that what is shown carries an honest age.
 */

const ADMIN_EMAIL = "maintainer@example.test";
const ADMIN_PASSWORD = "correct-horse-battery-staple";

let adminHeaders: Headers;

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await truncateAll();
  await seedAdmin({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  const response = await auth.api.signInEmail({
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    asResponse: true,
  });

  adminHeaders = new Headers();
  adminHeaders.set("cookie", response.headers.get("set-cookie")!.split(";")[0]);
});

afterAll(async () => {
  await closeTestDatabase();
});

const auth_ = () => ({ requestHeaders: adminHeaders });
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

async function publish(title: string, daysAhead: number) {
  return createEvent({ title, startsAt: inDays(daysAhead) }, auth_());
}

describe("the upcoming list (R2)", () => {
  it("returns events in chronological order", async () => {
    await publish("Third", 9);
    await publish("First", 2);
    await publish("Second", 5);

    const upcoming = await getUpcomingOccurrences();

    expect(upcoming.map((item) => item.occurrence.event.title)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it("returns nothing when there are no events", async () => {
    expect(await getUpcomingOccurrences()).toEqual([]);
  });

  it("keeps today's event visible after its start time", async () => {
    // Expanding from the start of the day rather than from this instant: an
    // event at 6pm should not disappear at 6:01pm while it is still running.
    const event = await publish("Started an hour ago", 0);
    await db
      .update(events)
      .set({ startsAt: new Date(Date.now() - 3_600_000) })
      .where(eq(events.id, event.id));

    const upcoming = await getUpcomingOccurrences();

    expect(upcoming.map((item) => item.occurrence.event.title)).toContain(
      "Started an hour ago",
    );
  });

  it("expands a series into its individual dates", async () => {
    await createEvent(
      {
        title: "Weekly watch",
        startsAt: inDays(2),
        recurrenceFrequency: "weekly",
      },
      auth_(),
    );

    const upcoming = await getUpcomingOccurrences({ horizonDays: 30 });

    // A series renders as its occurrences, never as a series definition.
    expect(upcoming.length).toBeGreaterThan(2);
    expect(
      new Set(upcoming.map((item) => item.occurrence.start.toISOString())).size,
    ).toBe(upcoming.length);
  });

  it("marks an event past the window as unverified but still returns it", async () => {
    // Covers AE1: shown, flagged, with its date visible — not hidden.
    const event = await publish("Old news", 4);
    await db
      .update(events)
      .set({ lastConfirmedAt: daysAgo(STALENESS_WINDOW_DAYS + 21) })
      .where(eq(events.id, event.id));

    const [item] = await getUpcomingOccurrences();

    expect(item.occurrence.event.title).toBe("Old news");
    expect(item.freshness.stale).toBe(true);
    expect(item.freshness.lastConfirmedAt).not.toBeNull();
  });
});

describe("nothing unapproved is publicly reachable (R18)", () => {
  it("omits pending events from the upcoming list", async () => {
    await createEvent(
      { title: "Submitted, not approved", startsAt: inDays(3) },
      { ...auth_(), publish: false },
    );

    expect(await getUpcomingOccurrences()).toEqual([]);
  });

  it("omits rejected events from the upcoming list", async () => {
    const event = await publish("Doomed", 3);
    await db
      .update(events)
      .set({ state: "rejected" })
      .where(eq(events.id, event.id));

    expect(await getUpcomingOccurrences()).toEqual([]);
  });

  it("refuses to serve a pending event by direct id", async () => {
    // The guessed-URL case: knowing the id must not be enough.
    const pending = await createEvent(
      { title: "Submitted", startsAt: inDays(3) },
      { ...auth_(), publish: false },
    );

    expect(await getPublicEvent(pending.id)).toBeNull();
  });

  it("refuses to serve a rejected event by direct id", async () => {
    const event = await publish("Doomed", 3);
    await db.update(events).set({ state: "rejected" }).where(eq(events.id, event.id));

    expect(await getPublicEvent(event.id)).toBeNull();
  });

  it("excludes pending and rejected events from static params", async () => {
    const published = await publish("Real", 3);
    await createEvent(
      { title: "Pending", startsAt: inDays(4) },
      { ...auth_(), publish: false },
    );

    expect(await getPublishedEventIds()).toEqual([published.id]);
  });

  it("returns null for an id that does not exist", async () => {
    expect(
      await getPublicEvent("00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
  });
});

describe("event detail", () => {
  it("carries the confirmation date and the next occurrence", async () => {
    const event = await createEvent(
      {
        title: "Weekly watch",
        startsAt: inDays(2),
        location: "Meeting room",
        host: "Community watch",
        recurrenceFrequency: "weekly",
      },
      auth_(),
    );

    const detail = await getPublicEvent(event.id);

    expect(detail).not.toBeNull();
    expect(detail!.event.location).toBe("Meeting room");
    expect(detail!.event.host).toBe("Community watch");
    expect(detail!.freshness.stale).toBe(false);
    expect(detail!.occurrences.length).toBeGreaterThan(1);
  });
});

describe("the site-level notice (R11)", () => {
  it("stays quiet while something is current", async () => {
    const stale = await publish("Old", 3);
    await db
      .update(events)
      .set({ lastConfirmedAt: daysAgo(60) })
      .where(eq(events.id, stale.id));

    await publish("Fresh", 5);

    const freshness = await getSiteFreshness();

    expect(freshness.siteStale).toBe(false);
    expect(freshness.hasAnyEvents).toBe(true);
  });

  it("fires when nothing has been confirmed within the window (AE2)", async () => {
    const first = await publish("One", 3);
    const second = await publish("Two", 6);

    await db
      .update(events)
      .set({ lastConfirmedAt: daysAgo(STALENESS_WINDOW_DAYS + 10) })
      .where(eq(events.id, first.id));
    await db
      .update(events)
      .set({ lastConfirmedAt: daysAgo(STALENESS_WINDOW_DAYS + 30) })
      .where(eq(events.id, second.id));

    const freshness = await getSiteFreshness();

    expect(freshness.siteStale).toBe(true);
    expect(freshness.latestConfirmedAt).not.toBeNull();
  });

  it("ignores pending events when deciding", async () => {
    // A queue full of unreviewed submissions is not evidence that anyone is
    // tending the site.
    const published = await publish("Stale published", 3);
    await db
      .update(events)
      .set({ lastConfirmedAt: daysAgo(60) })
      .where(eq(events.id, published.id));

    await createEvent(
      { title: "Fresh submission", startsAt: inDays(2) },
      { ...auth_(), publish: false },
    );

    expect((await getSiteFreshness()).siteStale).toBe(true);
  });

  it("reports an empty site as having no events", async () => {
    const freshness = await getSiteFreshness();

    expect(freshness.hasAnyEvents).toBe(false);
    expect(freshness.latestConfirmedAt).toBeNull();
  });
});
