/**
 * The center is in one place, so the site has one clock.
 *
 * This matters more than it looks. A weekly program stepped forward by
 * 7 × 24 hours lands an hour early or late the week the clocks change, and a
 * calendar that quietly moves a program by an hour is worse than one that
 * says nothing — it sends someone to a locked door. All recurrence stepping
 * therefore happens in calendar terms in this zone, not in elapsed
 * milliseconds.
 *
 * Set NEXT_PUBLIC_SITE_TIME_ZONE to the center's actual zone before launch.
 */

export const DEFAULT_TIME_ZONE = "America/New_York";

/**
 * A blank value counts as unset, and an unusable one fails by name.
 *
 * `?? DEFAULT_TIME_ZONE` was not enough. Hosting dashboards store a variable
 * added with an empty value as `""`, which passes a nullish check untouched
 * and reaches Intl as an invalid zone. Every formatter in lib/format.ts is
 * built at module scope, so the whole build died on
 * `RangeError: Invalid time zone specified: ` — a message that never names the
 * variable responsible, from a file that does not mention it.
 *
 * An unrecognized zone throws rather than falling back, because the fallback
 * would be a plausible-looking calendar showing the wrong hour. Note that Intl
 * does accept fixed-offset aliases like `EST`, which have no daylight saving —
 * those pass this check and then drift by an hour for half the year, so the
 * zone still has to be a real IANA name like `America/New_York`.
 */
export function resolveTimeZone(configured: string | undefined): string {
  const zone = configured?.trim();

  if (!zone) {
    return DEFAULT_TIME_ZONE;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SITE_TIME_ZONE is not a time zone this runtime recognizes: ` +
        `"${zone}". Use an IANA name such as "America/New_York", or leave it ` +
        `unset to fall back to ${DEFAULT_TIME_ZONE}.`,
    );
  }

  return zone;
}

export const SITE_TIME_ZONE = resolveTimeZone(
  process.env.NEXT_PUBLIC_SITE_TIME_ZONE,
);

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
}

const partsFormatter = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatter.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatter.set(timeZone, formatter);
  }
  return formatter;
}

/** How the given instant reads on a wall clock in `timeZone`. */
export function toZonedParts(
  date: Date,
  timeZone: string = SITE_TIME_ZONE,
): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)!.value);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** The zone's UTC offset, in milliseconds, at the given instant. */
function offsetAt(date: Date, timeZone: string): number {
  const parts = toZonedParts(date, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asIfUtc - date.getTime();
}

/**
 * The instant at which the wall clock in `timeZone` reads these parts.
 *
 * Two passes because the offset depends on the instant we are solving for. The
 * first guess uses the offset at the naive timestamp; if applying it crosses a
 * DST boundary the offset changes, so the second pass corrects. On the two
 * ambiguous hours a year this settles deterministically rather than
 * oscillating, which is what the "boundary resolves deterministically"
 * requirement needs.
 */
export function fromZonedParts(
  parts: ZonedParts,
  timeZone: string = SITE_TIME_ZONE,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  const firstGuess = offsetAt(new Date(naive), timeZone);
  const candidate = new Date(naive - firstGuess);
  const secondGuess = offsetAt(candidate, timeZone);

  if (secondGuess === firstGuess) return candidate;
  return new Date(naive - secondGuess);
}

/**
 * Adds calendar days in the site's zone, preserving the wall-clock time.
 * Seven of these across the spring-forward weekend still lands at 6pm.
 */
export function addZonedDays(
  date: Date,
  days: number,
  timeZone: string = SITE_TIME_ZONE,
): Date {
  const parts = toZonedParts(date, timeZone);
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );

  return fromZonedParts(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
    },
    timeZone,
  );
}

/**
 * Adds calendar months, preserving the wall-clock time and clamping the day.
 * "The 31st" in a 30-day month becomes the 30th rather than rolling into the
 * next month, which is what someone reading "monthly" actually expects.
 */
export function addZonedMonths(
  date: Date,
  months: number,
  timeZone: string = SITE_TIME_ZONE,
): Date {
  const parts = toZonedParts(date, timeZone);

  const targetMonthIndex = parts.month - 1 + months;
  const year = parts.year + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12;

  const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return fromZonedParts(
    {
      year,
      month: month + 1,
      day: Math.min(parts.day, daysInTargetMonth),
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
    },
    timeZone,
  );
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

/**
 * Parses a `datetime-local` or `date` input value as wall-clock time in the
 * site's zone.
 *
 * Without this, "2026-09-01T18:00" would be read as server-local time — UTC on
 * Vercel — and every event would silently shift by the zone offset. The
 * maintainer types the time on the flyer; this is what makes that the time
 * stored.
 */
export function parseZonedInput(
  value: string,
  timeZone: string = SITE_TIME_ZONE,
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
    value.trim(),
  );

  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;

  return fromZonedParts(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour ?? 0),
      minute: Number(minute ?? 0),
      second: Number(second ?? 0),
    },
    timeZone,
  );
}

/** Formats an instant for a `datetime-local` input in the site's zone. */
export function toZonedInputValue(
  date: Date,
  timeZone: string = SITE_TIME_ZONE,
): string {
  const parts = toZonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** Formats an instant for a `date` input in the site's zone. */
export function toZonedDateValue(
  date: Date,
  timeZone: string = SITE_TIME_ZONE,
): string {
  const parts = toZonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Midnight at the start of the given instant's day, in the site's zone. */
export function startOfZonedDay(
  date: Date,
  timeZone: string = SITE_TIME_ZONE,
): Date {
  const parts = toZonedParts(date, timeZone);
  return fromZonedParts(
    { ...parts, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}
