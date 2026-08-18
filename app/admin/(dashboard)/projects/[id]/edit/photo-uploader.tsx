"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/admin/actions";
import { addProjectPhotoAction } from "@/app/admin/project-actions";
import { FormError, SubmitButton, fieldClass } from "@/app/form-ui";

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
      <div className="mb-3">
        <FormError message={state.error} />
      </div>

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
        className={fieldClass}
      />
      <p className="mt-1 text-sm text-muted">
        For visitors using a screen reader. Optional, but an empty description
        is better than a wrong one.
      </p>

      <SubmitButton label="Add photo" pendingLabel="Uploading…" variant="secondary" />
    </form>
  );
}
