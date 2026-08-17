import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, images } from "@/lib/db/schema";
import { toZonedDateValue, toZonedInputValue } from "@/lib/time";
import { deleteEventAction, updateEventAction } from "@/app/admin/actions";
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
        values={{
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

      <form action={deleteEventAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={event.id} />
        <button type="submit" className="text-sm text-warn underline">
          Delete this event
        </button>
      </form>
    </main>
  );
}
