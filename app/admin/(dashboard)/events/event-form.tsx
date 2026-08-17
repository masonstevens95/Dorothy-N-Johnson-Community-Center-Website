"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/actions";

export interface EventFormValues {
  id?: string;
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  location?: string | null;
  description?: string | null;
  host?: string | null;
  imageId?: string | null;
  imageUrl?: string | null;
  projectId?: string | null;
  recurrenceFrequency?: "weekly" | "monthly" | null;
  recurrenceInterval?: number | null;
  recurrenceUntil?: string | null;
}

export interface ProjectOption {
  id: string;
  name: string;
}

interface EventFormProps {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values?: EventFormValues;
  submitLabel: string;
  projects?: ProjectOption[];
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent px-4 py-3 text-base font-medium text-white disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

const fieldClass =
  "mt-1 w-full rounded-lg border border-line bg-white px-3 py-3 text-base";

export function EventForm({
  action,
  values = {},
  submitLabel,
  projects = [],
}: EventFormProps) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-6 space-y-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {values.imageId ? (
        <input type="hidden" name="imageId" value={values.imageId} />
      ) : null}

      {state.error ? (
        <p role="alert" className="rounded-lg border border-line p-3 text-sm text-warn">
          {state.error}
        </p>
      ) : null}

      {/* Only these two are required (R14). Everything below is optional so a
          post can be finished while standing at the board. */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          Event name
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={values.title ?? ""}
          className={fieldClass}
        />
        {state.fieldErrors?.title ? (
          <p className="mt-1 text-sm text-warn">{state.fieldErrors.title}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="startsAt" className="block text-sm font-medium">
          Starts
        </label>
        <input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          required
          defaultValue={values.startsAt ?? ""}
          className={fieldClass}
        />
        {state.fieldErrors?.startsAt ? (
          <p className="mt-1 text-sm text-warn">{state.fieldErrors.startsAt}</p>
        ) : null}
      </div>

      <details className="rounded-lg border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Add details (all optional)
        </summary>

        <div className="mt-4 space-y-5">
          <div>
            <label htmlFor="photo" className="block text-sm font-medium">
              Flyer photo
            </label>
            <p className="mt-1 text-sm text-muted">
              A photo of the flyer can stand in for a description — you do not
              need to type anything else.
            </p>
            {values.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={values.imageUrl}
                alt="Current flyer"
                className="mt-2 max-h-48 rounded-lg border border-line"
              />
            ) : null}
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/*"
              capture="environment"
              className="mt-2 w-full text-sm"
            />
            {state.fieldErrors?.photo ? (
              <p className="mt-1 text-sm text-warn">{state.fieldErrors.photo}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="endsAt" className="block text-sm font-medium">
              Ends
            </label>
            <input
              id="endsAt"
              name="endsAt"
              type="datetime-local"
              defaultValue={values.endsAt ?? ""}
              className={fieldClass}
            />
            {state.fieldErrors?.endsAt ? (
              <p className="mt-1 text-sm text-warn">{state.fieldErrors.endsAt}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="location" className="block text-sm font-medium">
              Where in the center
            </label>
            <input
              id="location"
              name="location"
              defaultValue={values.location ?? ""}
              placeholder="Gym, meeting room, back lot…"
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="host" className="block text-sm font-medium">
              Who runs it
            </label>
            <input
              id="host"
              name="host"
              defaultValue={values.host ?? ""}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={values.description ?? ""}
              className={fieldClass}
            />
          </div>

          {projects.length > 0 ? (
            <div>
              <label htmlFor="projectId" className="block text-sm font-medium">
                Part of a project
              </label>
              <select
                id="projectId"
                name="projectId"
                defaultValue={values.projectId ?? ""}
                className={fieldClass}
              >
                <option value="">Not part of a project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-muted">
                The project page will list this event, and this event will link
                back to it.
              </p>
            </div>
          ) : null}

          <div>
            <label htmlFor="recurrenceFrequency" className="block text-sm font-medium">
              Repeats
            </label>
            <select
              id="recurrenceFrequency"
              name="recurrenceFrequency"
              defaultValue={values.recurrenceFrequency ?? "none"}
              className={fieldClass}
            >
              <option value="none">Does not repeat</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <p className="mt-1 text-sm text-muted">
              A repeating program is entered once. You can cancel or move a
              single week later without disturbing the rest.
            </p>
          </div>

          <div>
            <label htmlFor="recurrenceUntil" className="block text-sm font-medium">
              Repeats until
            </label>
            <input
              id="recurrenceUntil"
              name="recurrenceUntil"
              type="date"
              defaultValue={values.recurrenceUntil ?? ""}
              className={fieldClass}
            />
          </div>
        </div>
      </details>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
