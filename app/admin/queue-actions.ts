"use server";

import { revalidatePath } from "next/cache";
import { publishEvent, rejectEvent } from "@/lib/events/state";

/**
 * Approving is a state transition on the event, not a copy into another table
 * (R21). Editing before approving uses the ordinary edit form, so AE6 needs no
 * separate code path at all.
 */

export async function approveSubmissionAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  await publishEvent(id);
  revalidatePath("/admin/queue");
  revalidatePath("/admin");
}

export async function rejectSubmissionAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  // Terminal, and reversible only by resubmission. The submitter is not
  // notified — this site sends no email at all.
  await rejectEvent(id);
  revalidatePath("/admin/queue");
  revalidatePath("/admin");
}
