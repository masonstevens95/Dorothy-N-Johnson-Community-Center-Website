import { describe, expect, it } from "vitest";
import {
  expandEvent,
  expandEvents,
  nextOccurrence,
} from "@/lib/events/recurrence";
import { toZonedParts } from "@/lib/time";
import type { Event, EventOccurrenceException } from "@/lib/db/schema";

/**
 * Pure expansion logic — no database. Occurrences are computed at read time,
 * so this is the module that decides what the public calendar shows.
 */

const TZ = "America/New_York";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "event-1",
    title: "Tuesday community watch",
    startsAt: new Date("2026-09-01T22:00:00Z"), // 6pm Eastern
    endsAt: null,
    location: null,
    description: null,
    host: null,
    state: "published",
    lastConfirmedAt: new Date("2026-08-30T12:00:00Z"),
    imageId: null,
    projectId: null,
    recurrenceFrequency: null,
    recurrenceInterval: null,
    recurrenceUntil: null,
    submitterContact: null,
    createdByUserId: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

function makeException(
  overrides: Partial<EventOccurrenceException> &
    Pick<EventOccurrenceException, "occurrenceStart">,
): EventOccurrenceException {
  return {
    id: `exception-${overrides.occurrenceStart.toISOString()}`,
    eventId: "event-1",
    cancelled: false,
    overrideStartsAt: null,
    overrideEndsAt: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

const weekly = () =>
  makeEvent({ recurrenceFrequency: "weekly", recurrenceInterval: 1 });

const wholeAutumn = {
  from: new Date("2026-09-01T00:00:00Z"),
  to: new Date("2026-11-30T00:00:00Z"),
};

describe("one-off events", () => {
  it("yields a single occurrence inside the window", () => {
    const occurrences = expandEvent(makeEvent(), [], wholeAutumn);

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].start.toISOString()).toBe("2026-09-01T22:00:00.000Z");
    expect(occurrences[0].moved).toBe(false);
  });

  it("yields nothing outside the window", () => {
    const occurrences = expandEvent(makeEvent(), [], {
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-10-31T00:00:00Z"),
    });

    expect(occurrences).toEqual([]);
  });

  it("carries its duration onto the occurrence", () => {
    const event = makeEvent({ endsAt: new Date("2026-09-02T00:00:00Z") });
    const [occurrence] = expandEvent(event, [], wholeAutumn);

    expect(occurrence.end!.toISOString()).toBe("2026-09-02T00:00:00.000Z");
  });
});

describe("weekly series", () => {
  it("appears on each future occurrence without re-entry (R4)", () => {
    const occurrences = expandEvent(weekly(), [], wholeAutumn);

    expect(occurrences.length).toBeGreaterThan(10);
    expect(occurrences[0].start.toISOString()).toBe("2026-09-01T22:00:00.000Z");
    expect(occurrences[1].start.toISOString()).toBe("2026-09-08T22:00:00.000Z");
    expect(occurrences[2].start.toISOString()).toBe("2026-09-15T22:00:00.000Z");
  });

  it("holds the local hour across the end of daylight saving time", () => {
    // The failure this guards against: stepping by 7 × 24h moves a 6pm program
    // to 5pm the week the clocks go back, and sends people to a locked door.
    const occurrences = expandEvent(weekly(), [], {
      from: new Date("2026-10-25T00:00:00Z"),
      to: new Date("2026-11-15T00:00:00Z"),
    });

    for (const occurrence of occurrences) {
      const local = toZonedParts(occurrence.start, TZ);
      expect(local.hour).toBe(18);
      expect(local.minute).toBe(0);
    }

    // And the UTC instant really does shift, which is the whole point.
    const utcHours = occurrences.map((o) => o.start.getUTCHours());
    expect(new Set(utcHours).size).toBeGreaterThan(1);
  });

  it("respects an interval greater than one", () => {
    const fortnightly = makeEvent({
      recurrenceFrequency: "weekly",
      recurrenceInterval: 2,
    });

    const occurrences = expandEvent(fortnightly, [], wholeAutumn);

    expect(occurrences[0].start.toISOString()).toBe("2026-09-01T22:00:00.000Z");
    expect(occurrences[1].start.toISOString()).toBe("2026-09-15T22:00:00.000Z");
  });

  it("stops at the series end date", () => {
    const bounded = makeEvent({
      recurrenceFrequency: "weekly",
      recurrenceInterval: 1,
      recurrenceUntil: new Date("2026-09-20T00:00:00Z"),
    });

    const occurrences = expandEvent(bounded, [], wholeAutumn);

    expect(occurrences).toHaveLength(3);
    expect(occurrences.at(-1)!.start.toISOString()).toBe(
      "2026-09-15T22:00:00.000Z",
    );
  });
});

describe("per-occurrence exceptions", () => {
  it("drops a cancelled week and leaves the rest intact", () => {
    const cancelled = new Date("2026-09-15T22:00:00Z");
    const occurrences = expandEvent(
      weekly(),
      [makeException({ occurrenceStart: cancelled, cancelled: true })],
      wholeAutumn,
    );

    const starts = occurrences.map((o) => o.start.toISOString());
    expect(starts).not.toContain("2026-09-15T22:00:00.000Z");
    expect(starts).toContain("2026-09-08T22:00:00.000Z");
    expect(starts).toContain("2026-09-22T22:00:00.000Z");
  });

  it("moves one week without shifting the series", () => {
    const scheduled = new Date("2026-09-08T22:00:00Z");
    const movedTo = new Date("2026-09-09T23:30:00Z");

    const occurrences = expandEvent(
      weekly(),
      [makeException({ occurrenceStart: scheduled, overrideStartsAt: movedTo })],
      wholeAutumn,
    );

    const moved = occurrences.find((o) => o.moved);
    expect(moved).toBeDefined();
    expect(moved!.start.toISOString()).toBe("2026-09-09T23:30:00.000Z");
    // Its identity within the series is unchanged, so a later edit still
    // finds this week.
    expect(moved!.seriesStart.toISOString()).toBe("2026-09-08T22:00:00.000Z");

    // The week after is exactly where it always was.
    const following = occurrences.find(
      (o) => o.seriesStart.toISOString() === "2026-09-15T22:00:00.000Z",
    );
    expect(following!.start.toISOString()).toBe("2026-09-15T22:00:00.000Z");
    expect(following!.moved).toBe(false);
  });

  it("preserves duration when an occurrence is moved", () => {
    const event = makeEvent({
      recurrenceFrequency: "weekly",
      recurrenceInterval: 1,
      endsAt: new Date("2026-09-02T00:00:00Z"), // two hours long
    });
    const scheduled = new Date("2026-09-08T22:00:00Z");

    const [, moved] = expandEvent(
      event,
      [
        makeException({
          occurrenceStart: scheduled,
          overrideStartsAt: new Date("2026-09-09T22:00:00Z"),
        }),
      ],
      wholeAutumn,
    );

    expect(moved.end!.getTime() - moved.start.getTime()).toBe(2 * 60 * 60 * 1000);
  });

  it("uses an explicit override end time when given", () => {
    const scheduled = new Date("2026-09-08T22:00:00Z");
    const [, moved] = expandEvent(
      weekly(),
      [
        makeException({
          occurrenceStart: scheduled,
          overrideStartsAt: new Date("2026-09-09T22:00:00Z"),
          overrideEndsAt: new Date("2026-09-10T01:00:00Z"),
        }),
      ],
      wholeAutumn,
    );

    expect(moved.end!.toISOString()).toBe("2026-09-10T01:00:00.000Z");
  });

  it("ignores exceptions belonging to a different event", () => {
    const foreign = makeException({
      occurrenceStart: new Date("2026-09-08T22:00:00Z"),
      cancelled: true,
    });
    foreign.eventId = "some-other-event";

    const occurrences = expandEvent(weekly(), [foreign], wholeAutumn);

    expect(occurrences.map((o) => o.start.toISOString())).toContain(
      "2026-09-08T22:00:00.000Z",
    );
  });
});

describe("monthly series", () => {
  it("keeps the same day of the month", () => {
    const monthly = makeEvent({
      startsAt: new Date("2026-09-10T22:00:00Z"),
      recurrenceFrequency: "monthly",
      recurrenceInterval: 1,
    });

    const occurrences = expandEvent(monthly, [], {
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-12-31T00:00:00Z"),
    });

    const days = occurrences.map((o) => toZonedParts(o.start, TZ).day);
    expect(days).toEqual([10, 10, 10, 10]);
  });

  it("clamps the 31st into shorter months instead of rolling over", () => {
    const monthly = makeEvent({
      startsAt: new Date("2026-01-31T23:00:00Z"),
      recurrenceFrequency: "monthly",
      recurrenceInterval: 1,
    });

    const occurrences = expandEvent(monthly, [], {
      from: new Date("2026-01-01T00:00:00Z"),
      // Past the end of 30 April local time, so the April occurrence is inside
      // the window rather than cut off by the hour.
      to: new Date("2026-05-01T12:00:00Z"),
    });

    const local = occurrences.map((o) => {
      const parts = toZonedParts(o.start, TZ);
      return `${parts.month}-${parts.day}`;
    });

    // February clamps to the 28th rather than becoming March 3rd.
    expect(local).toEqual(["1-31", "2-28", "3-31", "4-30"]);
  });
});

describe("expandEvents", () => {
  it("returns occurrences from several events in chronological order", () => {
    const watch = weekly();
    const potluck = makeEvent({
      id: "event-2",
      title: "Potluck",
      startsAt: new Date("2026-09-05T23:00:00Z"),
    });

    const occurrences = expandEvents([watch, potluck], [], {
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-20T00:00:00Z"),
    });

    const times = occurrences.map((o) => o.start.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(occurrences[0].event.id).toBe("event-1");
    expect(occurrences[1].event.id).toBe("event-2");
  });

  it("routes each event's exceptions to that event only", () => {
    const watch = weekly();
    const potluck = makeEvent({
      id: "event-2",
      startsAt: new Date("2026-09-08T22:00:00Z"),
    });

    const exception = makeException({
      occurrenceStart: new Date("2026-09-08T22:00:00Z"),
      cancelled: true,
    });

    const occurrences = expandEvents([watch, potluck], [exception], wholeAutumn);

    // Only the watch series loses that date; the potluck is untouched.
    expect(
      occurrences.filter(
        (o) =>
          o.event.id === "event-1" &&
          o.start.toISOString() === "2026-09-08T22:00:00.000Z",
      ),
    ).toHaveLength(0);
    expect(
      occurrences.filter(
        (o) =>
          o.event.id === "event-2" &&
          o.start.toISOString() === "2026-09-08T22:00:00.000Z",
      ),
    ).toHaveLength(1);
  });
});

describe("nextOccurrence", () => {
  it("returns the next instance of a series, not its definition", () => {
    const next = nextOccurrence(weekly(), [], new Date("2026-09-10T00:00:00Z"));

    expect(next).not.toBeNull();
    expect(next!.start.toISOString()).toBe("2026-09-15T22:00:00.000Z");
  });

  it("skips a cancelled next week", () => {
    const next = nextOccurrence(
      weekly(),
      [
        makeException({
          occurrenceStart: new Date("2026-09-15T22:00:00Z"),
          cancelled: true,
        }),
      ],
      new Date("2026-09-10T00:00:00Z"),
    );

    expect(next!.start.toISOString()).toBe("2026-09-22T22:00:00.000Z");
  });

  it("returns null once a bounded series has ended", () => {
    const bounded = makeEvent({
      recurrenceFrequency: "weekly",
      recurrenceInterval: 1,
      recurrenceUntil: new Date("2026-09-20T00:00:00Z"),
    });

    expect(nextOccurrence(bounded, [], new Date("2026-10-01T00:00:00Z"))).toBeNull();
  });
});
