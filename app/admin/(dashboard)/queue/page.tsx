import Link from "next/link";
import Image from "next/image";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, images } from "@/lib/db/schema";
import { formatEventWhen } from "@/lib/format";
import {
  approveSubmissionAction,
  rejectSubmissionAction,
} from "@/app/admin/queue-actions";

export default async function QueuePage() {
  const rows = await db
    .select({ event: events, image: images })
    .from(events)
    .leftJoin(images, eq(events.imageId, images.id))
    .where(eq(events.state, "pending"))
    .orderBy(asc(events.createdAt));

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Submitted events</h1>
      <p className="mt-2 text-sm text-muted">
        Nothing here is visible on the site until you approve it.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-line bg-white p-5 text-sm text-muted">
          Nothing waiting. Submissions from the public form land here.
        </p>
      ) : (
        <ul className="mt-6 space-y-5">
          {rows.map(({ event, image }) => (
            <li key={event.id} className="rounded-lg border border-line bg-white p-4">
              <h2 className="text-base font-semibold">{event.title}</h2>
              <p className="mt-1 text-sm">
                {formatEventWhen(event.startsAt, event.endsAt)}
              </p>

              {event.location ? (
                <p className="mt-1 text-sm text-muted">{event.location}</p>
              ) : null}
              {event.host ? (
                <p className="mt-1 text-sm text-muted">Run by {event.host}</p>
              ) : null}
              {event.description ? (
                <p className="mt-2 text-sm">{event.description}</p>
              ) : null}

              {image ? (
                <Image
                  src={image.url}
                  alt={`Flyer for ${event.title}`}
                  width={image.width}
                  height={image.height}
                  sizes="(max-width: 640px) 100vw, 640px"
                  className="mt-3 h-auto w-full max-w-xs rounded-lg border border-line"
                />
              ) : null}

              {/* Never rendered publicly — only here, so the maintainer can
                  check a detail with whoever sent it. */}
              {event.submitterContact ? (
                <p className="mt-3 text-sm text-muted">
                  Sent by {event.submitterContact}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <form action={approveSubmissionAction}>
                  <input type="hidden" name="id" value={event.id} />
                  <button
                    type="submit"
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
                  >
                    Approve
                  </button>
                </form>

                {/*
                  AE6: correcting before approving is the ordinary edit form,
                  not a separate moderation editor. One code path, so the two
                  cannot drift apart.
                */}
                <Link
                  href={`/admin/events/${event.id}/edit`}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-medium"
                >
                  Fix, then approve
                </Link>

                <form action={rejectSubmissionAction}>
                  <input type="hidden" name="id" value={event.id} />
                  <button type="submit" className="text-sm text-warn underline">
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
