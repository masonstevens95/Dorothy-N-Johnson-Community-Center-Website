import type { Metadata } from "next";
import { SubmissionForm } from "./submission-form";

export const metadata: Metadata = {
  title: "Add an event",
  description:
    "Send an event to be added to the community center calendar. No account needed.",
};

/**
 * R17. No account, no sign-up, no login — the whole point is that a program
 * director who will never learn an admin tool can still get an event listed.
 */
export default function SubmitPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Add an event</h1>
      <p className="mt-2 text-sm">
        Running something at the center? Send it here and it will be added to
        the calendar. <strong>No account needed.</strong>
      </p>
      <p className="mt-2 text-sm text-muted">
        Only the name and the time are required. A photo of your flyer covers
        everything else.
      </p>

      <SubmissionForm />
    </main>
  );
}
