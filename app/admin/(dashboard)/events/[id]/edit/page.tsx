import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, images } from "@/lib/db/schema";
import { toZonedDateValue, toZonedInputValue } from "@/lib/time";
import { getProjectOptions } from "@/lib/projects/public-data";
import { deleteEventAction, updateEventAction } from "@/app/admin/actions";
import {
  approveSubmissionAction,
  rejectSubmissionAction,
} from "@/app/admin/queue-actions";
import { EventForm } from "../../event-form";

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const projects = await getProjectOptions();

  const [row] = await db
    .select({ event: events, image: images })
    .from(events)
    .leftJoin(images, eq(events.imageId, images.id))
    .where(eq(events.id, id))
    .limit(1);

  if (!row) notFound();

  const { event, image } = row;

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Edit event</h1>

      {saved ? (
        <p role="status" className="mt-3 rounded-lg border border-line p-3 text-sm">
          Saved.{" "}
          <Link href="/admin" className="underline">
            Back to the confirmation pass
          </Link>
        </p>
      ) : null}

      <EventForm
        action={updateEventAction}
        submitLabel="Save changes"
        projects={projects}
        values={{
          projectId: event.projectId,
          id: event.id,
          title: event.title,
          startsAt: toZonedInputValue(event.startsAt),
          endsAt: event.endsAt ? toZonedInputValue(event.endsAt) : "",
          location: event.location,
          description: event.description,
          host: event.host,
          imageId: event.imageId,
          imageUrl: image?.url ?? null,
          recurrenceFrequency: event.recurrenceFrequency,
          recurrenceInterval: event.recurrenceInterval,
          recurrenceUntil: event.recurrenceUntil
            ? toZonedDateValue(event.recurrenceUntil)
            : "",
        }}
      />

      {/*
        AE6. A submission corrected here is approved from here, so "edit then
        approve" is the ordinary edit form plus one button rather than a second
        editor that could drift from this one.
      */}
      {event.state === "pending" ? (
        <div className="mt-8 rounded-lg border border-line bg-white p-4">
          <p className="text-sm font-medium">This is a submitted event.</p>
          <p className="mt-1 text-sm text-muted">
            It is not visible on the site. Save any corrections first, then
            approve.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <form action={approveSubmissionAction}>
              <input type="hidden" name="id" value={event.id} />
              <button
                type="submit"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
              >
                Approve and publish
              </button>
            </form>
            <form action={rejectSubmissionAction}>
              <input type="hidden" name="id" value={event.id} />
              <button type="submit" className="text-sm text-warn underline">
                Reject
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <form action={deleteEventAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={event.id} />
        <button type="submit" className="text-sm text-warn underline">
          Delete this event
        </button>
      </form>
    </main>
  );
}
