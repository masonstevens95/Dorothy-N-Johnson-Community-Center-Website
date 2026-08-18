import { createHash } from "node:crypto";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { events, submissionAttempts, type Event } from "./db/schema";
import { ImageRejectedError, ingestImage } from "./images";
import { parseZonedInput } from "./time";

/**
 * The only public write path on the site.
 *
 * It can create pending events and nothing else. It cannot publish, cannot
 * edit, and cannot reach any other table. That constraint is what makes an
 * account-free form safe to expose (R17, R18).
 */

// --- Spam resistance (R20) --------------------------------------------------
// Deliberately no CAPTCHA. It is a barrier for exactly the older and less
// technical neighbors most likely to be running programs, and the threat here
// is drive-by spam, not a determined attacker. Start conservative and retune
// against observed traffic.

/** Submissions allowed from one origin per window. */
export const SUBMISSION_LIMIT = 5;

/** Window length, in minutes. */
export const SUBMISSION_WINDOW_MINUTES = 60;

/** Longest accepted free-text field. */
export const MAX_FIELD_LENGTH = 2000;

/** Attempts older than this are pruned; nothing needs them. */
const ATTEMPT_RETENTION_HOURS = 24;

export class SubmissionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionRejectedError";
  }
}

export class RateLimitedError extends SubmissionRejectedError {
  constructor() {
    // Says nothing about whether earlier submissions succeeded. Confirming
    // that would tell someone probing the form exactly how far they got.
    super(
      "Too many submissions from this connection recently. Please try again later.",
    );
  }
}

/**
 * Salted with the auth secret so the stored value cannot be reversed by
 * hashing candidate addresses.
 */
function hashClient(clientIp: string): string {
  const salt = process.env.BETTER_AUTH_SECRET ?? "unsalted";
  return createHash("sha256").update(`${salt}:${clientIp}`).digest("hex");
}

export const submissionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Please give the event a name.")
    .max(200, "That name is too long."),
  startsAt: z
    .string()
    .trim()
    .min(1, "Please give a date and time.")
    .transform((value, ctx) => {
      const parsed = parseZonedInput(value);
      if (!parsed) {
        ctx.addIssue({ code: "custom", message: "That date could not be read." });
        return z.NEVER;
      }
      return parsed;
    }),
  location: z.string().trim().max(MAX_FIELD_LENGTH).optional(),
  description: z.string().trim().max(MAX_FIELD_LENGTH).optional(),
  host: z.string().trim().max(MAX_FIELD_LENGTH).optional(),
  /** R19: optional. A contributor who will not leave a number should still be able to contribute. */
  submitterContact: z.string().trim().max(MAX_FIELD_LENGTH).optional(),
});

export interface SubmitOptions {
  clientIp: string;
  /** A field real people never see and never fill. */
  honeypot?: string | null;
  photo?: File | null;
  now?: Date;
}

export interface SubmitResult {
  /** False when the submission was silently discarded as spam. */
  accepted: boolean;
  event: Event | null;
}

async function recordAttempt(clientHash: string, now: Date): Promise<void> {
  await db.insert(submissionAttempts).values({ clientHash, createdAt: now });
}

async function isRateLimited(clientHash: string, now: Date): Promise<boolean> {
  const windowStart = new Date(now.getTime() - SUBMISSION_WINDOW_MINUTES * 60_000);

  const [row] = await db
    .select({ attempts: sql<number>`count(*)::int` })
    .from(submissionAttempts)
    .where(
      and(
        eq(submissionAttempts.clientHash, clientHash),
        gte(submissionAttempts.createdAt, windowStart),
      ),
    );

  return (row?.attempts ?? 0) >= SUBMISSION_LIMIT;
}

/** Opportunistic cleanup — no scheduled job exists on this site, by design. */
async function pruneOldAttempts(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - ATTEMPT_RETENTION_HOURS * 3_600_000);
  await db.delete(submissionAttempts).where(lt(submissionAttempts.createdAt, cutoff));
}

/**
 * Accepts a submission from an anonymous visitor and files it as pending.
 *
 * Never publishes. The resulting event is invisible on every public route
 * until the maintainer approves it (R18), and approving is a state transition
 * handled by lib/events/state.ts — the same code path that edits a
 * maintainer-authored event, so the two cannot drift apart.
 */
export async function submitEvent(
  input: unknown,
  { clientIp, honeypot, photo, now = new Date() }: SubmitOptions,
): Promise<SubmitResult> {
  // A filled honeypot means a bot. Discarded without creating anything, and
  // reported back as success so the bot has nothing to learn from the
  // difference.
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    return { accepted: false, event: null };
  }

  const clientHash = hashClient(clientIp);

  if (await isRateLimited(clientHash, now)) {
    throw new RateLimitedError();
  }

  // Recorded before the work, so a burst of expensive failing requests still
  // counts against the limit.
  await recordAttempt(clientHash, now);

  const parsed = submissionSchema.parse(input);

  let imageId: string | null = null;

  if (photo && photo.size > 0) {
    // The same ingest path as a maintainer upload: identical caps, identical
    // EXIF stripping. Divergence here would turn this form into a way around
    // the limits that keep the deployment alive.
    const image = await ingestImage(photo, { keyPrefix: "submissions" });
    imageId = image.id;
  }

  const [event] = await db
    .insert(events)
    .values({
      title: parsed.title,
      startsAt: parsed.startsAt,
      location: parsed.location || null,
      description: parsed.description || null,
      host: parsed.host || null,
      submitterContact: parsed.submitterContact || null,
      imageId,
      // The two fields that make this invisible: pending, and never confirmed.
      state: "pending",
      lastConfirmedAt: null,
      createdByUserId: null,
    })
    .returning();

  await pruneOldAttempts(now);

  return { accepted: true, event };
}

export { ImageRejectedError };
