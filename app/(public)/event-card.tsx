import Link from "next/link";
import Image from "next/image";
import type { PublicOccurrence } from "@/lib/public-data";
import { formatAge, formatEventWhen } from "@/lib/format";

/**
 * An unverified event is still shown, with its age visible.
 *
 * Hiding it would be a worse failure than showing it: a newcomer who sees
 * nothing concludes the center is dead, where a newcomer who sees "last
 * confirmed five weeks ago" knows exactly what they are looking at and can
 * decide for themselves (R10).
 */
export function EventCard({ occurrence, freshness, image }: PublicOccurrence) {
  const { event, start, end, moved } = occurrence;

  return (
    <article className="border-b border-line py-5 last:border-b-0">
      <h3 className="text-base font-semibold">
        <Link href={`/events/${event.id}`} className="hover:underline">
          {event.title}
        </Link>
      </h3>

      <p className="mt-1 text-sm">
        {formatEventWhen(start, end)}
        {moved ? <span className="text-muted"> (moved this week)</span> : null}
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
        // R15: the flyer can be the whole description. Fixed widths keep the
        // monthly image-transformation count bounded.
        <Link href={`/events/${event.id}`} className="mt-3 block">
          <Image
            src={image.url}
            alt={image.altText ?? `Flyer for ${event.title}`}
            width={image.width}
            height={image.height}
            sizes="(max-width: 640px) 100vw, 640px"
            className="h-auto w-full max-w-sm rounded-lg border border-line"
          />
        </Link>
      ) : null}

      <p className="mt-2 text-sm">
        {freshness.stale ? (
          <span className="text-warn">
            Unverified — last checked against the board{" "}
            {freshness.lastConfirmedAt ? formatAge(freshness.lastConfirmedAt) : "never"}
          </span>
        ) : (
          <span className="text-muted">
            Confirmed{" "}
            {freshness.lastConfirmedAt ? formatAge(freshness.lastConfirmedAt) : "never"}
          </span>
        )}
      </p>
    </article>
  );
}
