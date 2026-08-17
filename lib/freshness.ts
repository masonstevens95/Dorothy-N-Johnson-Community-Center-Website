import { daysBetween } from "./format";

/**
 * Freshness is derived when a page renders, never stored and never computed by
 * a scheduled job.
 *
 * This is the single largest reduction in things that can silently break on an
 * unattended site: no cron, no queue, no worker, nothing to notice has stopped
 * running. An event's honesty is a function of its last-confirmed timestamp
 * and the current time, which are both always available.
 *
 * Both the per-event unverified marking (R10) and the site-level notice (R11)
 * read from this module, so they cannot disagree about what "stale" means.
 */

/**
 * How long an event may go unconfirmed before the site stops presenting it as
 * current.
 *
 * Two weeks assumes the maintainer reaches the bulletin board every week or
 * so: one missed visit does not flag the site, two does. Tunable — this is the
 * one number worth revisiting after a month of real use, and it is deliberately
 * the only place the threshold appears.
 */
export const STALENESS_WINDOW_DAYS = 14;

export interface Freshness {
  /** Null when the event has never been confirmed. */
  lastConfirmedAt: Date | null;
  /** True when the site should present this as unverified rather than current. */
  stale: boolean;
  /** Whole days since confirmation; null when never confirmed. */
  ageInDays: number | null;
}

export function freshnessOf(
  lastConfirmedAt: Date | null,
  now: Date = new Date(),
): Freshness {
  if (!lastConfirmedAt) {
    // Never confirmed is treated as stale. The alternative would present
    // something nobody has ever checked as current information.
    return { lastConfirmedAt: null, stale: true, ageInDays: null };
  }

  const ageInDays = daysBetween(lastConfirmedAt, now);

  return {
    lastConfirmedAt,
    // Strictly greater: an event confirmed exactly the window ago is still
    // current, so the boundary resolves the same way every time rather than
    // flickering between states.
    stale: ageInDays > STALENESS_WINDOW_DAYS,
    ageInDays,
  };
}

export function isStale(
  lastConfirmedAt: Date | null,
  now: Date = new Date(),
): boolean {
  return freshnessOf(lastConfirmedAt, now).stale;
}

/**
 * R11. True when *nothing* on the site has been confirmed within the window.
 *
 * The distinction from per-event staleness matters: a few stale events mean
 * the maintainer has been selective, while an entirely stale site means nobody
 * is tending it at all, and visitors should be sent to the bulletin board.
 *
 * An empty site counts as stale — a site with no content cannot vouch for
 * anything.
 */
export function siteIsStale(
  lastConfirmedDates: (Date | null)[],
  now: Date = new Date(),
): boolean {
  return !lastConfirmedDates.some((date) => !isStale(date, now));
}
