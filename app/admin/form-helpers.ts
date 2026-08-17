import { z } from "zod";
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
