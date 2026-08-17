import type { Event, EventOccurrenceException } from "../db/schema";
import { addZonedDays, addZonedMonths } from "../time";

/**
 * Series expansion lives here and only here.
 *
 * Authoring, the public calendar, and moderation all read recurrence through
 * this module, so "what happens next Tuesday" has exactly one answer. If the
 * public page expanded series differently from the admin list, the maintainer
 * would be confirming events that visitors never saw.
 */

/** A single dated instance of an event, one-off or generated from a series. */
export interface Occurrence {
  event: Event;
  /** When this instance actually happens, after any override. */
  start: Date;
  end: Date | null;
  /**
   * The instance's originally scheduled start. This is its identity within
   * the series and does not change when the occurrence is moved — it is how a
   * later edit finds the right week.
   */
  seriesStart: Date;
  /** True when an exception moved this instance from its scheduled time. */
  moved: boolean;
}

export interface ExpandOptions {
  from: Date;
  to: Date;
  /** Guards against an unbounded series filling a page. */
  limit?: number;
}

const DEFAULT_LIMIT = 500;

/** Hard stop so a malformed series cannot spin forever. */
const MAX_ITERATIONS = 2000;

function isRecurring(event: Event): boolean {
  return event.recurrenceFrequency !== null;
}

function durationMs(event: Event): number | null {
  if (!event.endsAt) return null;
  return event.endsAt.getTime() - event.startsAt.getTime();
}

/**
 * The nth scheduled start, measured from the series anchor rather than from
 * the previous occurrence.
 *
 * Stepping occurrence-to-occurrence loses information permanently: a monthly
 * series on the 31st clamps to the 28th in February, and every later month
 * would then inherit the 28th. Anchoring means February is the only month
 * that clamps.
 *
 * Calendar arithmetic, not elapsed milliseconds — see lib/time.ts. A weekly
 * 6pm program stays at 6pm through the clock change.
 */
function occurrenceStartAt(event: Event, index: number): Date {
  const interval = event.recurrenceInterval ?? 1;

  return event.recurrenceFrequency === "monthly"
    ? addZonedMonths(event.startsAt, interval * index)
    : addZonedDays(event.startsAt, 7 * interval * index);
}

/**
 * Expands one event into the occurrences falling inside [from, to].
 *
 * Occurrences are computed, never stored. Materializing rows would make
 * "change the series" and "change this week" indistinguishable at exactly the
 * moment the difference matters.
 */
export function expandEvent(
  event: Event,
  exceptions: EventOccurrenceException[],
  { from, to, limit = DEFAULT_LIMIT }: ExpandOptions,
): Occurrence[] {
  const byScheduledStart = new Map<number, EventOccurrenceException>();
  for (const exception of exceptions) {
    if (exception.eventId === event.id) {
      byScheduledStart.set(exception.occurrenceStart.getTime(), exception);
    }
  }

  const duration = durationMs(event);
  const occurrences: Occurrence[] = [];

  const build = (seriesStart: Date): Occurrence | null => {
    const exception = byScheduledStart.get(seriesStart.getTime());

    if (exception?.cancelled) return null;

    const start = exception?.overrideStartsAt ?? seriesStart;
    const end =
      exception?.overrideEndsAt ??
      (duration === null ? null : new Date(start.getTime() + duration));

    return {
      event,
      start,
      end,
      seriesStart,
      moved: Boolean(exception?.overrideStartsAt),
    };
  };

  if (!isRecurring(event)) {
    const occurrence = build(event.startsAt);
    // A moved one-off is judged on where it actually landed, not where it was
    // originally scheduled.
    if (occurrence && occurrence.start >= from && occurrence.start <= to) {
      return [occurrence];
    }
    return [];
  }

  let previous = -Infinity;

  for (let index = 0; index < MAX_ITERATIONS; index++) {
    const cursor = occurrenceStartAt(event, index);

    // Defensive: a non-advancing series would otherwise loop to the cap.
    if (cursor.getTime() <= previous) break;
    previous = cursor.getTime();

    if (event.recurrenceUntil && cursor > event.recurrenceUntil) break;
    if (cursor > to) break;

    const occurrence = build(cursor);

    // Compared on actual start so a moved occurrence appears on the day it
    // was moved to.
    if (occurrence && occurrence.start >= from && occurrence.start <= to) {
      occurrences.push(occurrence);
      if (occurrences.length >= limit) break;
    }
  }

  return occurrences;
}

/**
 * Expands many events and returns every occurrence in chronological order —
 * the shape the landing page and calendar both render (R2, R6).
 */
export function expandEvents(
  events: Event[],
  exceptions: EventOccurrenceException[],
  options: ExpandOptions,
): Occurrence[] {
  const exceptionsByEvent = new Map<string, EventOccurrenceException[]>();
  for (const exception of exceptions) {
    const list = exceptionsByEvent.get(exception.eventId);
    if (list) list.push(exception);
    else exceptionsByEvent.set(exception.eventId, [exception]);
  }

  return events
    .flatMap((event) =>
      expandEvent(event, exceptionsByEvent.get(event.id) ?? [], options),
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * The next occurrence at or after `now`, or null when the series has ended.
 * A series renders as its next occurrence, never as its series definition.
 */
export function nextOccurrence(
  event: Event,
  exceptions: EventOccurrenceException[],
  now: Date = new Date(),
  horizonDays = 366,
): Occurrence | null {
  const [next] = expandEvent(event, exceptions, {
    from: now,
    to: addZonedDays(now, horizonDays),
    limit: 1,
  });

  return next ?? null;
}
