import { SITE_TIME_ZONE } from "./time";

/**
 * All user-facing dates render in the center's timezone, not the visitor's.
 * A neighbor reading the site from a phone still set to another timezone
 * needs the time they should show up at the building.
 */

const dateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: SITE_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateOnly = new Intl.DateTimeFormat("en-US", {
  timeZone: SITE_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
});

const shortDate = new Intl.DateTimeFormat("en-US", {
  timeZone: SITE_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

const timeOnly = new Intl.DateTimeFormat("en-US", {
  timeZone: SITE_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

export function formatDateTime(date: Date): string {
  return dateTime.format(date);
}

export function formatDate(date: Date): string {
  return dateOnly.format(date);
}

export function formatShortDate(date: Date): string {
  return shortDate.format(date);
}

export function formatTime(date: Date): string {
  return timeOnly.format(date);
}

/** "Tue, Sep 1, 6:00 PM – 8:00 PM", collapsing the date when it repeats. */
export function formatEventWhen(start: Date, end: Date | null): string {
  if (!end) return formatDateTime(start);

  const sameDay = formatShortDate(start) === formatShortDate(end);
  return sameDay
    ? `${formatDateTime(start)} – ${formatTime(end)}`
    : `${formatDateTime(start)} – ${formatDateTime(end)}`;
}

/**
 * Whole days between two instants, floored. Used for freshness wording, where
 * "3 days ago" is what a reader needs rather than an exact duration.
 */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/** Plain-language age, e.g. "today", "yesterday", "5 days ago". */
export function formatAge(date: Date, now: Date = new Date()): string {
  const days = daysBetween(date, now);

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;

  const months = Math.floor(days / 30);
  if (months === 1) return "about a month ago";
  if (months < 12) return `about ${months} months ago`;

  return `on ${formatShortDate(date)}`;
}
