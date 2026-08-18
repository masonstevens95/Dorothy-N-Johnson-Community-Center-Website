import { createEventAction } from "@/app/admin/actions";
import { getProjectOptions } from "@/lib/projects/public-data";
import { EventForm } from "../event-form";

export default async function NewEventPage() {
  const projects = await getProjectOptions();

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-xl font-semibold tracking-tight">New event</h1>
      <p className="mt-2 text-sm text-muted">
        A name and a time are all that is needed. Everything else can wait.
      </p>

      <EventForm
        action={createEventAction}
        submitLabel="Publish event"
        projects={projects}
      />
    </main>
  );
}
