import { redirect } from "next/navigation";
import { z } from "zod";
import { UnauthorizedError, requireAdmin } from "@/lib/auth-guard";
import { ImageRejectedError } from "@/lib/images";

/**
 * Shared plumbing for the admin server actions.
 *
 * Event and project authoring translate the same two failure kinds — invalid
 * input and a refused image — into the same shape, and both read optional text
 * out of FormData the same way. Keeping one copy means an improvement to the
 * error wording reaches every form.
 */

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Gates a server action before it does any work.
 *
 * Server actions are ordinary POST endpoints — reachable by anyone who knows
 * the action id, whether or not the UI that calls them was ever rendered. That
 * matters most for actions that ingest an image: the gate inside
 * lib/events/state.ts runs *after* the upload has already been processed and
 * stored, so an unauthenticated caller could consume blob storage and leave
 * orphaned image rows before being turned away. Calling this first closes
 * that window.
 *
 * An expired session redirects to the login page rather than surfacing an
 * error, because that is the maintainer's likely case.
 */
export async function requireAdminAction(): Promise<void> {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/admin/login");
    }
    throw error;
  }
}

/** Trimmed field value, or null when absent or empty. */
export function readOptionalText(
  formData: FormData,
  key: string,
): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Maps a thrown error onto form state, or rethrows.
 *
 * Only the errors a person can act on are converted. Anything else propagates,
 * because turning an unexpected failure into a polite field message hides it
 * from both the maintainer and the logs.
 */
export function toActionState(error: unknown): ActionState {
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
