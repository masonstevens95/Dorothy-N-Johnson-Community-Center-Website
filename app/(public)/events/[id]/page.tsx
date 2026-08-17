import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicEvent, getPublishedEventIds } from "@/lib/public-data";
import { formatAge, formatEventWhen } from "@/lib/format";

export async function generateStaticParams() {
  const ids = await getPublishedEventIds();
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await getPublicEvent(id);

  if (!detail) return { title: "Event not found" };

  return {
    title: detail.event.title,
    description: detail.event.description ?? undefined,
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getPublicEvent(id);

  // getPublicEvent returns null for pending and rejected events, so a guessed
  // URL cannot surface a submission nobody approved (R18).
  if (!detail) notFound();

  const { event, image, freshness, occurrences } = detail;
  const [next, ...later] = occurrences;

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <p className="text-sm">
        <Link href="/" className="underline">
          ← What&rsquo;s on
        </Link>
      </p>

      <h1 className="mt-3 text-xl font-semibold tracking-tight">{event.title}</h1>

      {/* R3: when, where in the center, and who runs it when known. */}
      <p className="mt-2 text-base">
        {next
          ? formatEventWhen(next.start, next.end)
          : formatEventWhen(event.startsAt, event.endsAt)}
      </p>

      {event.location ? (
        <p className="mt-1 text-sm text-muted">{event.location}</p>
      ) : null}

      {event.host ? (
        <p className="mt-1 text-sm text-muted">Run by {event.host}</p>
      ) : null}

      {/* R9: the confirmation date is always visible, current or not. */}
      <p className="mt-4 rounded-lg border border-line bg-white p-3 text-sm">
        {freshness.stale ? (
          <span className="text-warn">
            <strong>Unverified.</strong> This was last checked against the
            bulletin board{" "}
            {freshness.lastConfirmedAt
              ? formatAge(freshness.lastConfirmedAt)
              : "never"}
            , so it may have changed. Check the board inside the building before
            relying on it.
          </span>
        ) : (
          <span>
            Checked against the bulletin board{" "}
            {freshness.lastConfirmedAt
              ? formatAge(freshness.lastConfirmedAt)
              : "never"}
            .
          </span>
        )}
      </p>

      {event.description ? (
        <p className="mt-5 whitespace-pre-line">{event.description}</p>
      ) : null}

      {image ? (
        <Image
          src={image.url}
          alt={image.altText ?? `Flyer for ${event.title}`}
          width={image.width}
          height={image.height}
          sizes="(max-width: 640px) 100vw, 640px"
          className="mt-5 h-auto w-full rounded-lg border border-line"
          priority
        />
      ) : null}

      {later.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-muted">Also coming up</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {later.map((occurrence) => (
              <li key={occurrence.start.toISOString()}>
                {formatEventWhen(occurrence.start, occurrence.end)}
                {occurrence.moved ? (
                  <span className="text-muted"> (moved)</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
