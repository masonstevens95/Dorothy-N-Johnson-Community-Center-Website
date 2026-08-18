"use client";

import { useActionState } from "react";
import { submitEventAction, type SubmitState } from "./actions";
import {
  FieldError,
  FormError,
  SubmitButton,
  fieldClass,
} from "@/app/form-ui";

export function SubmissionForm() {
  const [state, formAction] = useActionState<SubmitState, FormData>(
    submitEventAction,
    { status: "idle" },
  );

  if (state.status === "submitted") {
    return (
      <div role="status" className="mt-6 rounded-lg border border-line bg-white p-5">
        <p className="font-medium">Thank you — that has been sent.</p>
        <p className="mt-2 text-sm text-muted">
          A neighbor checks submissions by hand and will add it to the calendar
          if it fits. It will not appear on the site until then, and there is no
          confirmation email — this site does not send any.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <FormError message={state.error} />

      {/*
        Honeypot. Hidden from people and from screen readers, so anything that
        fills it is automated. Cheaper and kinder than a CAPTCHA, which would
        be a barrier for exactly the neighbors most likely to be running
        programs.
      */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          What is it? <span className="text-muted">(required)</span>
        </label>
        <input
          id="title"
          name="title"
          required
          className={fieldClass}
          placeholder="Community watch meeting"
        />
        <FieldError message={state.fieldErrors?.title} />
      </div>

      <div>
        <label htmlFor="startsAt" className="block text-sm font-medium">
          When? <span className="text-muted">(required)</span>
        </label>
        <input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          required
          className={fieldClass}
        />
        <FieldError message={state.fieldErrors?.startsAt} />
      </div>

      <div>
        <label htmlFor="photo" className="block text-sm font-medium">
          Photo of the flyer
        </label>
        <p className="mt-1 text-sm text-muted">
          If you have a flyer, a photo of it is enough — you do not need to type
          the details out.
        </p>
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/*"
          capture="environment"
          className="mt-2 w-full text-sm"
        />
        <FieldError message={state.fieldErrors?.photo} />
      </div>

      <div>
        <label htmlFor="location" className="block text-sm font-medium">
          Where in the center
        </label>
        <input id="location" name="location" className={fieldClass} />
      </div>

      <div>
        <label htmlFor="host" className="block text-sm font-medium">
          Who runs it
        </label>
        <input id="host" name="host" className={fieldClass} />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Anything else
        </label>
        <textarea id="description" name="description" rows={4} className={fieldClass} />
      </div>

      <div>
        <label htmlFor="submitterContact" className="block text-sm font-medium">
          Your phone or email <span className="text-muted">(optional)</span>
        </label>
        <input id="submitterContact" name="submitterContact" className={fieldClass} />
        <p className="mt-1 text-sm text-muted">
          Only so the maintainer can check a detail with you. Never shown on the
          site.
        </p>
      </div>

      <SubmitButton label="Send it in" pendingLabel="Sending…" />
    </form>
  );
}
