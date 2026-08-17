import { asc, eq, sql as raw } from "drizzle-orm";
import { db } from "./db";
import { events, eventOccurrenceExceptions, images, type Event, type Image } from "./db/schema";
import { expandEvents, type Occurrence } from "./events/recurrence";
import { freshnessOf, isStale, type Freshness } from "./freshness";
import { addZonedDays, startOfZonedDay } from "./time";

/**
 * Every public read goes through here, and every one of them filters to
 * published events.
 *
 * Pending and rejected events must be unreachable from any public route
 * (R18). Keeping the filter in one module rather than in each page means a new
 * public page cannot forget it.
 */

export interface PublicOccurrence {
  occurrence: Occurrence;
  freshness: Freshness;
  image: Image | null;
}

/** How far ahead the forward calendar looks (R6). */
export const CALENDAR_HORIZON_DAYS = 120;

async function loadPublishedEvents(): Promise<{
  events: Event[];
  imagesById: Map<string, Image>;
}> {
  const rows = await db
    .select({ event: events, image: images })
    .from(events)
    .leftJoin(images, eq(events.imageId, images.id))
    .where(eq(events.state, "published"))
    .orderBy(asc(events.startsAt));

  const imagesById = new Map<string, Image>();
  for (const row of rows) {
    if (row.image) imagesById.set(row.image.id, row.image);
  }

  return { events: rows.map((row) => row.event), imagesById };
}

export interface UpcomingOptions {
  now?: Date;
  horizonDays?: number;
  limit?: number;
}

/**
 * Upcoming occurrences in chronological order — what the landing page and the
 * forward calendar both render (R2, R6).
 *
 * Series are expanded, so a weekly program appears on each of its dates rather
 * than once as a series definition.
 */
export async function getUpcomingOccurrences({
  now = new Date(),
  horizonDays = CALENDAR_HORIZON_DAYS,
  limit,
}: UpcomingOptions = {}): Promise<PublicOccurrence[]> {
  const { events: published, imagesById } = await loadPublishedEvents();
  const exceptions = await db.query.eventOccurrenceExceptions.findMany();

  // From the start of today, not from this instant — an event at 6pm should
  // not vanish from the landing page at 6:01pm while it is still happening.
  const occurrences = expandEvents(published, exceptions, {
    from: startOfZonedDay(now),
    to: addZonedDays(now, horizonDays),
  });

  const visible = limit ? occurrences.slice(0, limit) : occurrences;

  return visible.map((occurrence) => ({
    occurrence,
    freshness: freshnessOf(occurrence.event.lastConfirmedAt, now),
    image: occurrence.event.imageId
      ? (imagesById.get(occurrence.event.imageId) ?? null)
      : null,
  }));
}

export interface SiteFreshness {
  /** R11: true when nothing at all has been confirmed within the window. */
  siteStale: boolean;
  latestConfirmedAt: Date | null;
  hasAnyEvents: boolean;
}

/**
 * R11. Whether the site as a whole should warn visitors.
 *
 * Asked as a single aggregate rather than by loading every event: the newest
 * confirmation is all that decides it, and if even that one is stale then
 * nothing on the site is current.
 */
export async function getSiteFreshness(now: Date = new Date()): Promise<SiteFreshness> {
  const [row] = await db
    .select({
      latest: raw<Date | null>`max(${events.lastConfirmedAt})`,
      total: raw<number>`count(*)::int`,
    })
    .from(events)
    .where(eq(events.state, "published"));

  const latestConfirmedAt = row?.latest ? new Date(row.latest) : null;

  return {
    latestConfirmedAt,
    hasAnyEvents: (row?.total ?? 0) > 0,
    siteStale: isStale(latestConfirmedAt, now),
  };
}

export interface PublicEventDetail {
  event: Event;
  image: Image | null;
  freshness: Freshness;
  occurrences: Occurrence[];
}

/**
 * A single published event. Returns null for anything pending or rejected, so
 * a guessed URL cannot expose a submission that was never approved (R18).
 */
export async function getPublicEvent(
  id: string,
  now: Date = new Date(),
): Promise<PublicEventDetail | null> {
  const [row] = await db
    .select({ event: events, image: images })
    .from(events)
    .leftJoin(images, eq(events.imageId, images.id))
    .where(eq(events.id, id))
    .limit(1);

  if (!row || row.event.state !== "published") return null;

  const exceptions = await db.query.eventOccurrenceExceptions.findMany({
    where: eq(eventOccurrenceExceptions.eventId, id),
  });

  const occurrences = expandEvents([row.event], exceptions, {
    from: startOfZonedDay(now),
    to: addZonedDays(now, CALENDAR_HORIZON_DAYS),
    limit: 12,
  });

  return {
    event: row.event,
    image: row.image ?? null,
    freshness: freshnessOf(row.event.lastConfirmedAt, now),
    occurrences,
  };
}

/** Published event ids, for generating static params. */
export async function getPublishedEventIds(): Promise<string[]> {
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.state, "published"));

  return rows.map((row) => row.id);
}
