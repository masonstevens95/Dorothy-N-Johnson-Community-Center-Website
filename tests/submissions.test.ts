import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { seedAdmin } from "@/lib/auth-seed";
import { UnauthorizedError } from "@/lib/auth-guard";
import {
  RateLimitedError,
  SUBMISSION_LIMIT,
  SUBMISSION_WINDOW_MINUTES,
  submitEvent,
} from "@/lib/submissions";
import { publishEvent, rejectEvent, updateEvent } from "@/lib/events/state";
import {
  getPublicEvent,
  getPublishedEventIds,
  getUpcomingOccurrences,
} from "@/lib/public-data";
import { ImageRejectedError } from "@/lib/images";
import { events, images, submissionAttempts } from "@/lib/db/schema";
import {
  closeTestDatabase,
  db,
  setupTestDatabase,
  truncateAll,
} from "./helpers/db";

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

/** A datetime-local string a few days ahead, as the form would send it. */
function soon(daysAhead = 5): string {
  const date = new Date(Date.now() + daysAhead * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T18:00`;
}

function submission(overrides: Record<string, unknown> = {}) {
  return { title: "Community watch meeting", startsAt: soon(), ...overrides };
}

async function flyerFile() {
  const width = 1200;
  const height = 1600;
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 2654435761) % 256;

  const jpeg = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .withExif({
      IFD0: { Make: "TestPhone" },
      GPS: { GPSLatitudeRef: "N", GPSLatitude: "42/1 19/1 3/1" },
    } as Parameters<ReturnType<typeof sharp>["withExif"]>[0])
    .jpeg()
    .toBuffer();

  return new File([new Uint8Array(jpeg)], "flyer.jpg", { type: "image/jpeg" });
}

describe("submitting without an account (R17)", () => {
  it("accepts a submission and files it as pending", async () => {
    const { accepted, event } = await submitEvent(submission(), {
      clientIp: "203.0.113.10",
    });

    expect(accepted).toBe(true);
    expect(event!.state).toBe("pending");
    // Never confirmed — nobody has checked it against the board.
    expect(event!.lastConfirmedAt).toBeNull();
    expect(event!.createdByUserId).toBeNull();
  });

  it("accepts a name, a date, and a flyer photo alone", async () => {
    const { event } = await submitEvent(submission({ description: "" }), {
      clientIp: "203.0.113.11",
      photo: await flyerFile(),
    });

    expect(event!.imageId).not.toBeNull();
    expect(event!.description).toBeNull();
  });

  it("treats submitter contact as optional and never publishes it", async () => {
    const withContact = await submitEvent(
      submission({ submitterContact: "555-0100" }),
      { clientIp: "203.0.113.12" },
    );
    expect(withContact.event!.submitterContact).toBe("555-0100");

    const without = await submitEvent(submission({ title: "No contact" }), {
      clientIp: "203.0.113.13",
    });
    expect(without.event!.submitterContact).toBeNull();
  });

  it("rejects a submission with no name or no date", async () => {
    await expect(
      submitEvent(submission({ title: "  " }), { clientIp: "203.0.113.14" }),
    ).rejects.toThrow(/name/i);

    await expect(
      submitEvent(submission({ startsAt: "" }), { clientIp: "203.0.113.15" }),
    ).rejects.toThrow(/date/i);
  });

  it("rejects an unreadable date", async () => {
    await expect(
      submitEvent(submission({ startsAt: "next Tuesday-ish" }), {
        clientIp: "203.0.113.16",
      }),
    ).rejects.toThrow(/could not be read/i);
  });
});

describe("nothing submitted is public until approved (R18)", () => {
  it("is absent from the public calendar immediately after submission", async () => {
    // Covers AE3 / F3.
    const { event } = await submitEvent(submission(), { clientIp: "203.0.113.20" });

    expect(await getUpcomingOccurrences()).toEqual([]);
    expect(await getPublicEvent(event!.id)).toBeNull();
    expect(await getPublishedEventIds()).toEqual([]);
  });

  it("stays invisible after being rejected, by any route", async () => {
    const { event } = await submitEvent(submission(), { clientIp: "203.0.113.21" });
    await rejectEvent(event!.id, auth_());

    expect(await getUpcomingOccurrences()).toEqual([]);
    expect(await getPublicEvent(event!.id)).toBeNull();
    expect(await getPublishedEventIds()).toEqual([]);
  });

  it("appears publicly once approved, with a confirmation date", async () => {
    const { event } = await submitEvent(submission(), { clientIp: "203.0.113.22" });
    const published = await publishEvent(event!.id, auth_());

    expect(published.state).toBe("published");
    // Set at approval — the maintainer has just read it.
    expect(published.lastConfirmedAt).not.toBeNull();

    const upcoming = await getUpcomingOccurrences();
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].freshness.stale).toBe(false);
  });

  it("publishes the corrected version, never the original (AE6)", async () => {
    const { event } = await submitEvent(
      submission({ title: "Watch meeting", startsAt: soon(5) }),
      { clientIp: "203.0.113.23" },
    );

    // Corrected through the ordinary edit path — the same function that edits
    // a maintainer-authored event.
    const corrected = await updateEvent(
      event!.id,
      { title: "Community watch meeting", startsAt: soon(6) },
      auth_(),
    );
    expect(corrected.state).toBe("pending");

    // Still not public while it is being fixed.
    expect(await getUpcomingOccurrences()).toEqual([]);

    await publishEvent(event!.id, auth_());

    const [visible] = await getUpcomingOccurrences();
    expect(visible.occurrence.event.title).toBe("Community watch meeting");
    // One row throughout — the original was never a separate public record.
    expect(await db.select().from(events)).toHaveLength(1);
  });
});

describe("spam resistance (R20)", () => {
  it("discards a submission with the honeypot filled, creating nothing", async () => {
    const result = await submitEvent(submission(), {
      clientIp: "203.0.113.30",
      honeypot: "https://buy-cheap-things.example",
    });

    expect(result.accepted).toBe(false);
    expect(result.event).toBeNull();
    expect(await db.select().from(events)).toHaveLength(0);
  });

  it("does not spend a rate-limit attempt on a honeypot hit", async () => {
    await submitEvent(submission(), {
      clientIp: "203.0.113.31",
      honeypot: "spam",
    });

    expect(await db.select().from(submissionAttempts)).toHaveLength(0);
  });

  it("refuses submissions past the limit without revealing earlier outcomes", async () => {
    const clientIp = "203.0.113.32";

    for (let index = 0; index < SUBMISSION_LIMIT; index++) {
      await submitEvent(submission({ title: `Event ${index}` }), { clientIp });
    }

    const error = await submitEvent(submission({ title: "One too many" }), {
      clientIp,
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(RateLimitedError);
    // Says nothing about how many got through.
    expect((error as Error).message).not.toMatch(/\d/);

    expect(await db.select().from(events)).toHaveLength(SUBMISSION_LIMIT);
  });

  it("limits each origin separately", async () => {
    for (let index = 0; index < SUBMISSION_LIMIT; index++) {
      await submitEvent(submission({ title: `A${index}` }), {
        clientIp: "203.0.113.40",
      });
    }

    // A different neighbor is not punished for the first one's behaviour.
    const other = await submitEvent(submission({ title: "From elsewhere" }), {
      clientIp: "203.0.113.41",
    });

    expect(other.accepted).toBe(true);
  });

  it("lets an origin submit again once the window has passed", async () => {
    const clientIp = "203.0.113.42";
    const start = new Date();

    for (let index = 0; index < SUBMISSION_LIMIT; index++) {
      await submitEvent(submission({ title: `B${index}` }), {
        clientIp,
        now: start,
      });
    }

    const later = new Date(start.getTime() + (SUBMISSION_WINDOW_MINUTES + 1) * 60_000);
    const result = await submitEvent(submission({ title: "Much later" }), {
      clientIp,
      now: later,
    });

    expect(result.accepted).toBe(true);
  });

  it("stores no raw addresses", async () => {
    const clientIp = "203.0.113.50";
    await submitEvent(submission(), { clientIp });

    const [attempt] = await db.select().from(submissionAttempts);

    expect(attempt.clientHash).not.toContain(clientIp);
    expect(attempt.clientHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an over-long free-text field", async () => {
    await expect(
      submitEvent(submission({ description: "x".repeat(5000) }), {
        clientIp: "203.0.113.51",
      }),
    ).rejects.toThrow();
  });
});

describe("submitted photos go through the same ingest path (U4)", () => {
  it("strips EXIF from an untrusted upload exactly as from a maintainer's", async () => {
    const { event } = await submitEvent(submission(), {
      clientIp: "203.0.113.60",
      photo: await flyerFile(),
    });

    const [image] = await db
      .select()
      .from(images)
      .where(eq(images.id, event!.imageId!));

    expect(image.contentType).toBe("image/webp");
    expect(Math.max(image.width, image.height)).toBeLessThanOrEqual(1600);
  });

  it("rejects a non-image attachment and files nothing", async () => {
    const notAnImage = new File(
      [new Uint8Array(Buffer.from("definitely not a jpeg"))],
      "flyer.jpg",
      { type: "image/jpeg" },
    );

    await expect(
      submitEvent(submission(), { clientIp: "203.0.113.61", photo: notAnImage }),
    ).rejects.toThrow(ImageRejectedError);

    expect(await db.select().from(events)).toHaveLength(0);
  });

  it("rejects an oversized attachment", async () => {
    const huge = new File(
      [new Uint8Array(Buffer.alloc(9 * 1024 * 1024, 4))],
      "huge.jpg",
      { type: "image/jpeg" },
    );

    await expect(
      submitEvent(submission(), { clientIp: "203.0.113.62", photo: huge }),
    ).rejects.toThrow(/larger than/i);
  });
});

describe("moderation is behind the write gate (R13)", () => {
  const unauthenticated = { requestHeaders: new Headers() };

  it("refuses to approve or reject without a session", async () => {
    const { event } = await submitEvent(submission(), { clientIp: "203.0.113.70" });

    await expect(publishEvent(event!.id, unauthenticated)).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(rejectEvent(event!.id, unauthenticated)).rejects.toThrow(
      UnauthorizedError,
    );

    const [stored] = await db.select().from(events);
    expect(stored.state).toBe("pending");
    expect(await getUpcomingOccurrences()).toEqual([]);
  });
});
