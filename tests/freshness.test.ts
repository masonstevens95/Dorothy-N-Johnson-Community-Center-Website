import { describe, expect, it } from "vitest";
import {
  STALENESS_WINDOW_DAYS,
  freshnessOf,
  isStale,
  siteIsStale,
} from "@/lib/freshness";

const NOW = new Date("2026-09-30T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("freshnessOf", () => {
  it("treats a recently confirmed event as current", () => {
    const freshness = freshnessOf(daysAgo(2), NOW);

    expect(freshness.stale).toBe(false);
    expect(freshness.ageInDays).toBe(2);
  });

  it("marks an event beyond the window as unverified (AE1)", () => {
    // Five weeks, the acceptance example's case.
    const freshness = freshnessOf(daysAgo(35), NOW);

    expect(freshness.stale).toBe(true);
    expect(freshness.ageInDays).toBe(35);
    // The date is still returned — the event is shown, with its age visible,
    // not hidden.
    expect(freshness.lastConfirmedAt).not.toBeNull();
  });

  it("resolves the boundary deterministically", () => {
    // Exactly at the window is still current; one day past is not. Asserting
    // both sides pins the comparison so it cannot flicker.
    expect(freshnessOf(daysAgo(STALENESS_WINDOW_DAYS), NOW).stale).toBe(false);
    expect(freshnessOf(daysAgo(STALENESS_WINDOW_DAYS + 1), NOW).stale).toBe(true);
  });

  it("gives the same answer twice for the same inputs", () => {
    const boundary = daysAgo(STALENESS_WINDOW_DAYS);

    expect(freshnessOf(boundary, NOW)).toEqual(freshnessOf(boundary, NOW));
  });

  it("treats a never-confirmed event as stale", () => {
    // Presenting something nobody has ever checked as current would be the
    // worst case the freshness design exists to prevent.
    const freshness = freshnessOf(null, NOW);

    expect(freshness.stale).toBe(true);
    expect(freshness.ageInDays).toBeNull();
    expect(freshness.lastConfirmedAt).toBeNull();
  });

  it("treats a future confirmation date as current rather than negative-aged", () => {
    const freshness = freshnessOf(new Date(NOW.getTime() + 60_000), NOW);

    expect(freshness.stale).toBe(false);
  });
});

describe("isStale", () => {
  it("agrees with freshnessOf", () => {
    for (const days of [0, 1, STALENESS_WINDOW_DAYS, STALENESS_WINDOW_DAYS + 1, 90]) {
      expect(isStale(daysAgo(days), NOW)).toBe(freshnessOf(daysAgo(days), NOW).stale);
    }
  });
});

describe("siteIsStale (R11)", () => {
  it("is false while anything at all is current", () => {
    // A few stale events mean the maintainer has been selective, not absent.
    expect(siteIsStale([daysAgo(40), daysAgo(60), daysAgo(1)], NOW)).toBe(false);
  });

  it("is true when everything has gone unconfirmed (AE2)", () => {
    expect(siteIsStale([daysAgo(40), daysAgo(60), daysAgo(30)], NOW)).toBe(true);
  });

  it("is true for a site with nothing on it", () => {
    // A site with no content cannot vouch for anything.
    expect(siteIsStale([], NOW)).toBe(true);
  });

  it("is true when nothing has ever been confirmed", () => {
    expect(siteIsStale([null, null], NOW)).toBe(true);
  });

  it("uses the same window as per-event staleness", () => {
    // The two must never disagree about what stale means — a site-level notice
    // that fires while events still read as current would be incoherent.
    const boundary = daysAgo(STALENESS_WINDOW_DAYS);

    expect(siteIsStale([boundary], NOW)).toBe(false);
    expect(isStale(boundary, NOW)).toBe(false);

    const past = daysAgo(STALENESS_WINDOW_DAYS + 1);
    expect(siteIsStale([past], NOW)).toBe(true);
    expect(isStale(past, NOW)).toBe(true);
  });
});
