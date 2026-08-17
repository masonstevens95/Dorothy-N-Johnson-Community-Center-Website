"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/actions";
import { addProjectPhotoAction } from "@/app/admin/project-actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 w-full rounded-lg border border-line px-4 py-3 text-base font-medium disabled:opacity-60"
    >
      {pending ? "Uploading…" : "Add photo"}
    </button>
  );
}

export function PhotoUploader({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    addProjectPhotoAction,
    {},
  );

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="id" value={projectId} />

      {/* Upload failures surface here rather than silently producing a project
          with a missing photo. */}
      {state.error ? (
        <p role="alert" className="mb-3 rounded-lg border border-line p-3 text-sm text-warn">
          {state.error}
        </p>
      ) : null}

      <label htmlFor="photo" className="block text-sm font-medium">
        Photo
      </label>
      <input
        id="photo"
        name="photo"
        type="file"
        accept="image/*"
        capture="environment"
        required
        className="mt-1 w-full text-sm"
      />

      <label htmlFor="altText" className="mt-3 block text-sm font-medium">
        Describe the photo
      </label>
      <input
        id="altText"
        name="altText"
        placeholder="Raised beds along the back fence"
        className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-3 text-base"
      />
      <p className="mt-1 text-sm text-muted">
        For visitors using a screen reader. Optional, but an empty description
        is better than a wrong one.
      </p>

      <SubmitButton />
    </form>
  );
}
