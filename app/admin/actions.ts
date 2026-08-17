"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  confirmEvents,
  createEvent,
  deleteEvent,
  updateEvent,
} from "@/lib/events/state";
import { ImageRejectedError, ingestImage } from "@/lib/images";
import { parseZonedInput } from "@/lib/time";

/**
 * Server actions are thin. Authorization and the write itself live in
 * lib/events/state.ts, so an action cannot accidentally ship without the gate
 * — there is no path here that writes directly.
 */

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Reads the optional flyer photo and puts it through the ingest pipeline.
 *
 * Upload failures surface to the poster rather than producing an event with a
 * missing image: someone standing at the bulletin board needs to know
 * immediately whether the post worked.
 */
async function readImageId(formData: FormData): Promise<string | null> {
  const existing = formData.get("imageId");
  const file = formData.get("photo");

  if (file instanceof File && file.size > 0) {
    const image = await ingestImage(file);
    return image.id;
  }

  return typeof existing === "string" && existing.length > 0 ? existing : null;
}

function readForm(formData: FormData, imageId: string | null) {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  };

  // Date inputs carry wall-clock time with no zone. They are the times written
  // on the flyer, so they are read in the center's zone rather than the
  // server's — which is UTC in production.
  const zoned = (key: string) => {
    const raw = text(key);
    return raw ? parseZonedInput(raw) : null;
  };

  const frequency = text("recurrenceFrequency");

  return {
    title: (formData.get("title") as string | null) ?? "",
    startsAt: zoned("startsAt") ?? undefined,
    endsAt: zoned("endsAt"),
    location: text("location"),
    description: text("description"),
    host: text("host"),
    imageId,
    projectId: text("projectId"),
    recurrenceFrequency: frequency === "none" ? null : frequency,
    recurrenceInterval: text("recurrenceInterval")
      ? Number(text("recurrenceInterval"))
      : null,
    recurrenceUntil: zoned("recurrenceUntil"),
  };
}

function toActionState(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  if (error instanceof ImageRejectedError) {
    return { error: error.message, fieldErrors: { photo: error.message } };
  }

  throw error;
}

export async function createEventAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let id: string;

  try {
    const imageId = await readImageId(formData);
    const event = await createEvent(readForm(formData, imageId));
    id = event.id;
  } catch (error) {
    return toActionState(error);
  }

  // Outside the try: redirect() signals by throwing, and catching it here
  // would turn a successful post into a form error.
  redirect(`/admin/events/${id}/edit?saved=1`);
}

export async function updateEventAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");

  if (typeof id !== "string") {
    return { error: "That event could not be found." };
  }

  try {
    const imageId = await readImageId(formData);
    await updateEvent(id, readForm(formData, imageId));
  } catch (error) {
    return toActionState(error);
  }

  redirect(`/admin/events/${id}/edit?saved=1`);
}

/**
 * R16. One action, many events, no edit form.
 */
export async function confirmEventsAction(formData: FormData): Promise<void> {
  const ids = formData.getAll("eventId").filter((id): id is string => typeof id === "string");

  await confirmEvents(ids);
  revalidatePath("/admin");
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  await deleteEvent(id);
  redirect("/admin");
}
