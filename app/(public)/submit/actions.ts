"use server";

import { headers } from "next/headers";
import { z } from "zod";
import {
  ImageRejectedError,
  RateLimitedError,
  SubmissionRejectedError,
  submitEvent,
} from "@/lib/submissions";

export interface SubmitState {
  status: "idle" | "submitted" | "error";
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Best-effort client address for rate limiting.
 *
 * Behind Vercel's proxy the socket address is always the proxy, so the
 * forwarded headers are what carry the visitor. They are spoofable in
 * principle; the limit is a speed bump against drive-by spam, not an access
 * control, and nothing security-critical rests on it.
 */
async function clientAddress(): Promise<string> {
  const requestHeaders = await headers();

  const forwarded = requestHeaders.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();

  return requestHeaders.get("x-real-ip") ?? "unknown";
}

export async function submitEventAction(
  _previous: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const photo = formData.get("photo");

  try {
    await submitEvent(
      {
        title: formData.get("title"),
        startsAt: formData.get("startsAt"),
        location: formData.get("location"),
        description: formData.get("description"),
        host: formData.get("host"),
        submitterContact: formData.get("submitterContact"),
      },
      {
        clientIp: await clientAddress(),
        honeypot: formData.get("website") as string | null,
        photo: photo instanceof File ? photo : null,
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      return { status: "error", error: "Please fix the highlighted fields.", fieldErrors };
    }

    if (error instanceof RateLimitedError) {
      return { status: "error", error: error.message };
    }

    if (error instanceof ImageRejectedError) {
      return {
        status: "error",
        error: error.message,
        fieldErrors: { photo: error.message },
      };
    }

    if (error instanceof SubmissionRejectedError) {
      return { status: "error", error: error.message };
    }

    throw error;
  }

  // Identical response whether the submission was filed or discarded as spam.
  return { status: "submitted" };
}
