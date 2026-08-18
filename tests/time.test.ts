import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_ZONE,
  addZonedDays,
  addZonedMonths,
  parseZonedInput,
  resolveTimeZone,
  startOfZonedDay,
  toZonedDateValue,
  toZonedInputValue,
  toZonedParts,
} from "@/lib/time";

const TZ = "America/New_York";

describe("parseZonedInput", () => {
  it("reads a datetime-local value as the center's wall clock", () => {
    // 6pm on 1 September is EDT (UTC-4), so 22:00Z. Reading it as server-local
    // time would store 18:00Z and show the wrong hour to everyone.
    const parsed = parseZonedInput("2026-09-01T18:00", TZ);

    expect(parsed!.toISOString()).toBe("2026-09-01T22:00:00.000Z");
  });

  it("applies the winter offset for a winter date", () => {
    // 6pm on 1 December is EST (UTC-5), so 23:00Z — a different offset for the
    // same typed time.
    const parsed = parseZonedInput("2026-12-01T18:00", TZ);

    expect(parsed!.toISOString()).toBe("2026-12-01T23:00:00.000Z");
  });

  it("accepts a date-only value as midnight", () => {
    const parsed = parseZonedInput("2026-09-01", TZ);

    expect(toZonedParts(parsed!, TZ).hour).toBe(0);
    expect(toZonedParts(parsed!, TZ).day).toBe(1);
  });

  it("returns null for something that is not a date", () => {
    expect(parseZonedInput("next Tuesday", TZ)).toBeNull();
    expect(parseZonedInput("", TZ)).toBeNull();
  });

  it("round-trips through the input formatter", () => {
    const original = "2026-07-04T09:30";
    const parsed = parseZonedInput(original, TZ)!;

    expect(toZonedInputValue(parsed, TZ)).toBe(original);
    expect(toZonedDateValue(parsed, TZ)).toBe("2026-07-04");
  });
});

describe("calendar arithmetic", () => {
  it("keeps the wall-clock hour when crossing into daylight saving time", () => {
    // 8 March 2026 is the spring-forward date in the US.
    const before = parseZonedInput("2026-03-07T18:00", TZ)!;
    const after = addZonedDays(before, 7, TZ);

    expect(toZonedParts(after, TZ).hour).toBe(18);
    // The UTC instant genuinely shifts by an hour — that is the offset change.
    expect(after.getTime() - before.getTime()).toBe(6 * 24 * 3600_000 + 23 * 3600_000);
  });

  it("keeps the wall-clock hour when leaving daylight saving time", () => {
    const before = parseZonedInput("2026-10-31T18:00", TZ)!;
    const after = addZonedDays(before, 7, TZ);

    expect(toZonedParts(after, TZ).hour).toBe(18);
  });

  it("clamps a month-end day into a shorter month", () => {
    const jan31 = parseZonedInput("2026-01-31T18:00", TZ)!;
    const feb = addZonedMonths(jan31, 1, TZ);

    expect(toZonedParts(feb, TZ).month).toBe(2);
    expect(toZonedParts(feb, TZ).day).toBe(28);
    expect(toZonedParts(feb, TZ).hour).toBe(18);
  });

  it("finds the start of the local day, not the UTC day", () => {
    // 00:30Z on 2 September is still the evening of 1 September in New York.
    const lateEvening = new Date("2026-09-02T00:30:00Z");
    const start = startOfZonedDay(lateEvening, TZ);

    const parts = toZonedParts(start, TZ);
    expect(parts.day).toBe(1);
    expect(parts.hour).toBe(0);
  });
});

describe("resolveTimeZone", () => {
  it("uses a configured zone", () => {
    expect(resolveTimeZone("America/Chicago")).toBe("America/Chicago");
  });

  it("falls back when the variable is unset", () => {
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
  });

  it("treats a blank value as unset rather than passing it to Intl", () => {
    // This is the case that broke a deploy: a hosting dashboard stores a
    // variable added with an empty value as "", which `??` lets through to
    // Intl as an invalid zone.
    expect(resolveTimeZone("")).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone("   ")).toBe(DEFAULT_TIME_ZONE);
  });

  it("tolerates surrounding whitespace on a real zone", () => {
    expect(resolveTimeZone("  America/Denver  ")).toBe("America/Denver");
  });

  it("names the variable when the zone is unusable", () => {
    // The bare RangeError from Intl says only "Invalid time zone specified:",
    // which does not say where the value came from.
    expect(() => resolveTimeZone("Springfield/Unknown")).toThrowError(
      /NEXT_PUBLIC_SITE_TIME_ZONE/,
    );
  });

  it("does not silently fall back on an unusable zone", () => {
    // Falling back would publish a plausible calendar showing wrong hours.
    expect(() => resolveTimeZone("EDT-5")).toThrow();
  });
});
