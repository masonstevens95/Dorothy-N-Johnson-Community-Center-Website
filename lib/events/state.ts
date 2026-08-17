import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../auth-guard";
import { db } from "../db";
import {
  eventOccurrenceExceptions,
  events,
  type Event,
} from "../db/schema";
import { revalidatePublicPages } from "./revalidate";

/**
 * Every transition an event can make, in one module.
 *
 * A submitted event and a published event are the same row in different
 * states, so approving is a transition rather than a copy between tables. That
 * is what keeps the maintainer's edit form and the moderation edit path on one
 * code path — they cannot drift apart, because there is only one.
 *
 * Every function here calls requireAdmin first. Centralizing the gate means a
 * new mutation has one thing to forget rather than one check per route to
 * remember.
 */

export interface AuthOptions {
  /** Supplied by tests; production callers read the incoming request scope. */
  requestHeaders?: Headers;
}

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .optional();

/**
 * R14: name and date/time are the only required fields. Every additional
 * required field is a reason the maintainer doesn't post while standing at the
 * bulletin board.
 */
export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1, "An event name is required."),
    startsAt: z.coerce.date({ message: "A date and time is required." }),
    endsAt: z.coerce.date().nullable().optional(),
    location: optionalText,
    description: optionalText,
    host: optionalText,
    imageId: z.uuid().nullable().optional(),
    projectId: z.uuid().nullable().optional(),
    recurrenceFrequency: z.enum(["weekly", "monthly"]).nullable().optional(),
    recurrenceInterval: z.number().int().min(1).nullable().optional(),
    recurrenceUntil: z.coerce.date().nullable().optional(),
    submitterContact: optionalText,
  })
  .refine((value) => !value.endsAt || value.endsAt >= value.startsAt, {
    message: "The end time cannot be before the start time.",
    path: ["endsAt"],
  })
  .refine(
    (value) => value.recurrenceFrequency !== null || !value.recurrenceInterval,
    {
      message: "A repeat interval needs a repeat frequency.",
      path: ["recurrenceInterval"],
    },
  );

export type EventInput = z.infer<typeof eventInputSchema>;

/** A recurrence is all-or-nothing; the database enforces the same rule. */
function normalizeRecurrence(input: EventInput) {
  const frequency = input.recurrenceFrequency ?? null;
  return {
    recurrenceFrequency: frequency,
    recurrenceInterval: frequency ? (input.recurrenceInterval ?? 1) : null,
    recurrenceUntil: frequency ? (input.recurrenceUntil ?? null) : null,
  };
}

export interface CreateEventOptions extends AuthOptions {
  /** Maintainer-authored events publish immediately; submissions do not. */
  publish?: boolean;
}

export async function createEvent(
  input: unknown,
  { publish = true, requestHeaders }: CreateEventOptions = {},
): Promise<Event> {
  const session = await requireAdmin(requestHeaders);
  const parsed = eventInputSchema.parse(input);
  const now = new Date();

  const [event] = await db
    .insert(events)
    .values({
      title: parsed.title,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt ?? null,
      location: parsed.location ?? null,
      description: parsed.description ?? null,
      host: parsed.host ?? null,
      imageId: parsed.imageId ?? null,
      projectId: parsed.projectId ?? null,
      submitterContact: parsed.submitterContact ?? null,
      ...normalizeRecurrence(parsed),
      state: publish ? "published" : "pending",
      // Typing it in *is* confirming it — the maintainer is standing at the
      // board reading the flyer as they post.
      lastConfirmedAt: publish ? now : null,
      createdByUserId: session.user.id,
    })
    .returning();

  if (publish) await revalidatePublicPages([`/events/${event.id}`]);

  return event;
}

export async function updateEvent(
  id: string,
  input: unknown,
  { requestHeaders }: AuthOptions = {},
): Promise<Event> {
  await requireAdmin(requestHeaders);
  const parsed = eventInputSchema.parse(input);

  const [event] = await db
    .update(events)
    .set({
      title: parsed.title,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt ?? null,
      location: parsed.location ?? null,
      description: parsed.description ?? null,
      host: parsed.host ?? null,
      imageId: parsed.imageId ?? null,
      projectId: parsed.projectId ?? null,
      submitterContact: parsed.submitterContact ?? null,
      ...normalizeRecurrence(parsed),
      updatedAt: new Date(),
    })
    .where(eq(events.id, id))
    .returning();

  if (!event) throw new EventNotFoundError(id);

  await revalidatePublicPages([`/events/${event.id}`]);
  return event;
}

/**
 * R16. The confirmation pass.
 *
 * Touches the confirmation timestamp and nothing else — no edit form, no other
 * field. The entire freshness design rests on this being faster than editing,
 * so it has to stay a single action over many events rather than a shortcut
 * into the editor.
 */
export async function confirmEvents(
  ids: string[],
  { requestHeaders }: AuthOptions = {},
): Promise<Event[]> {
  await requireAdmin(requestHeaders);

  if (ids.length === 0) return [];

  const confirmed = await db
    .update(events)
    .set({ lastConfirmedAt: new Date() })
    .where(and(inArray(events.id, ids), eq(events.state, "published")))
    .returning();

  if (confirmed.length > 0) {
    await revalidatePublicPages(confirmed.map((event) => `/events/${event.id}`));
  }

  return confirmed;
}

/**
 * Moves a pending event to published (R21). Approval sets the confirmation
 * date, because the maintainer has just read it against the board.
 */
export async function publishEvent(
  id: string,
  { requestHeaders }: AuthOptions = {},
): Promise<Event> {
  await requireAdmin(requestHeaders);

  const [event] = await db
    .update(events)
    .set({ state: "published", lastConfirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(events.id, id))
    .returning();

  if (!event) throw new EventNotFoundError(id);

  await revalidatePublicPages([`/events/${event.id}`]);
  return event;
}

/** Terminal, and reversible only by resubmission. The submitter is not told. */
export async function rejectEvent(
  id: string,
  { requestHeaders }: AuthOptions = {},
): Promise<Event> {
  await requireAdmin(requestHeaders);

  const [event] = await db
    .update(events)
    .set({ state: "rejected", updatedAt: new Date() })
    .where(eq(events.id, id))
    .returning();

  if (!event) throw new EventNotFoundError(id);

  await revalidatePublicPages([`/events/${event.id}`]);
  return event;
}

export async function deleteEvent(
  id: string,
  { requestHeaders }: AuthOptions = {},
): Promise<void> {
  await requireAdmin(requestHeaders);
  await db.delete(events).where(eq(events.id, id));
  await revalidatePublicPages([`/events/${id}`]);
}

/**
 * Cancels one occurrence of a series without disturbing the series (R4).
 */
export async function cancelOccurrence(
  eventId: string,
  occurrenceStart: Date,
  { requestHeaders }: AuthOptions = {},
): Promise<void> {
  await requireAdmin(requestHeaders);

  await db
    .insert(eventOccurrenceExceptions)
    .values({ eventId, occurrenceStart, cancelled: true })
    .onConflictDoUpdate({
      target: [
        eventOccurrenceExceptions.eventId,
        eventOccurrenceExceptions.occurrenceStart,
      ],
      set: { cancelled: true, overrideStartsAt: null, overrideEndsAt: null },
    });

  await revalidatePublicPages([`/events/${eventId}`]);
}

/** Moves one occurrence without shifting the series (R4). */
export async function moveOccurrence(
  eventId: string,
  occurrenceStart: Date,
  overrideStartsAt: Date,
  overrideEndsAt: Date | null = null,
  { requestHeaders }: AuthOptions = {},
): Promise<void> {
  await requireAdmin(requestHeaders);

  await db
    .insert(eventOccurrenceExceptions)
    .values({
      eventId,
      occurrenceStart,
      cancelled: false,
      overrideStartsAt,
      overrideEndsAt,
    })
    .onConflictDoUpdate({
      target: [
        eventOccurrenceExceptions.eventId,
        eventOccurrenceExceptions.occurrenceStart,
      ],
      set: { cancelled: false, overrideStartsAt, overrideEndsAt },
    });

  await revalidatePublicPages([`/events/${eventId}`]);
}

/** Undoes a cancellation or a move, restoring the scheduled occurrence. */
export async function restoreOccurrence(
  eventId: string,
  occurrenceStart: Date,
  { requestHeaders }: AuthOptions = {},
): Promise<void> {
  await requireAdmin(requestHeaders);

  await db
    .delete(eventOccurrenceExceptions)
    .where(
      and(
        eq(eventOccurrenceExceptions.eventId, eventId),
        eq(eventOccurrenceExceptions.occurrenceStart, occurrenceStart),
      ),
    );

  await revalidatePublicPages([`/events/${eventId}`]);
}

export class EventNotFoundError extends Error {
  constructor(id: string) {
    super(`No event with id ${id}.`);
    this.name = "EventNotFoundError";
  }
}
