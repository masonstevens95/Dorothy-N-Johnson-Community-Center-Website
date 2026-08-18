"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/admin/actions";
import {
  FieldError,
  FormError,
  SubmitButton,
  fieldClass,
} from "@/app/form-ui";

export interface ProjectFormValues {
  id?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  status?: "active" | "past";
}

export function ProjectForm({
  action,
  values = {},
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values?: ProjectFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-6 space-y-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <FormError message={state.error} />

      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Project name
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={values.name ?? ""}
          className={fieldClass}
        />
        <FieldError message={state.fieldErrors?.name} />
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={values.status ?? "active"}
          className={fieldClass}
        >
          <option value="active">Active — happening now</option>
          <option value="past">Past — finished</option>
        </select>
        <p className="mt-1 text-sm text-muted">
          Visitors are trying to work out whether the center is alive right now.
          Mark something past as soon as it ends.
        </p>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={values.description ?? ""}
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-medium">
          Web address
        </label>
        <input
          id="slug"
          name="slug"
          defaultValue={values.slug ?? ""}
          placeholder="community-garden"
          className={fieldClass}
        />
        <p className="mt-1 text-sm text-muted">
          Leave blank to generate one from the name.
        </p>
        <FieldError message={state.fieldErrors?.slug} />
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
