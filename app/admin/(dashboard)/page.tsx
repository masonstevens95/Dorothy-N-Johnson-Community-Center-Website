import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { expandEvents } from "@/lib/events/recurrence";
import { formatAge, formatEventWhen } from "@/lib/format";
import { freshnessOf, STALENESS_WINDOW_DAYS } from "@/lib/freshness";
import { addZonedDays, startOfZonedDay } from "@/lib/time";
import { ConfirmationPass, type ConfirmableEvent } from "./confirmation-pass";

export default async function AdminPage() {
  const now = new Date();

  const [published, pending, allExceptions] = await Promise.all([
    db
      .select()
      .from(events)
      .where(eq(events.state, "published"))
      .orderBy(asc(events.startsAt)),
    db
      .select()
      .from(events)
      .where(eq(events.state, "pending"))
      .orderBy(asc(events.createdAt)),
    db.query.eventOccurrenceExceptions.findMany(),
  ]);

  // Series render as their next occurrence, so the confirmation list shows
  // what a visitor would see rather than a series definition.
  const upcoming = expandEvents(published, allExceptions, {
    from: startOfZonedDay(now),
    to: addZonedDays(now, 120),
  });

  const seen = new Set<string>();
  const confirmable: ConfirmableEvent[] = [];

  for (const occurrence of upcoming) {
    if (seen.has(occurrence.event.id)) continue;
    seen.add(occurrence.event.id);

    const freshness = freshnessOf(occurrence.event.lastConfirmedAt, now);

    confirmable.push({
      id: occurrence.event.id,
      title: occurrence.event.title,
      when: formatEventWhen(occurrence.start, occurrence.end),
      confirmedLabel: freshness.lastConfirmedAt
        ? formatAge(freshness.lastConfirmedAt, now)
        : "never",
      stale: freshness.stale,
    });
  }

  // Past events are still listed, further down — an event typed with the wrong
  // year has to be findable and fixable rather than silently absent.
  const past = published
    .filter((event) => !seen.has(event.id))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .slice(0, 20);

  const staleCount = confirmable.filter((event) => event.stale).length;

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Confirmation pass</h1>
      <p className="mt-2 text-sm text-muted">
        Tick everything that still matches the bulletin board and confirm in one
        go. Anything unconfirmed for more than {STALENESS_WINDOW_DAYS} days is
        shown to visitors as unverified.
      </p>

      {staleCount > 0 ? (
        <p className="mt-3 rounded-lg border border-line bg-white p-3 text-sm text-warn">
          {staleCount} {staleCount === 1 ? "event needs" : "events need"}{" "}
          confirming.
        </p>
      ) : null}

      {pending.length > 0 ? (
        <p className="mt-3 text-sm">
          <Link href="/admin/queue" className="underline">
            {pending.length} submitted{" "}
            {pending.length === 1 ? "event is" : "events are"} waiting for review
          </Link>
        </p>
      ) : null}

      <ConfirmationPass events={confirmable} />

      <h2 className="mt-10 text-base font-semibold">Edit an event</h2>
      <ul className="mt-3 space-y-1 text-sm">
        {confirmable.map((event) => (
          <li key={event.id}>
            <Link href={`/admin/events/${event.id}/edit`} className="underline">
              {event.title}
            </Link>{" "}
            <span className="text-muted">— {event.when}</span>
          </li>
        ))}
      </ul>

      {past.length > 0 ? (
        <>
          <h2 className="mt-10 text-base font-semibold">Past events</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {past.map((event) => (
              <li key={event.id}>
                <Link href={`/admin/events/${event.id}/edit`} className="underline">
                  {event.title}
                </Link>{" "}
                <span className="text-muted">
                  — {formatEventWhen(event.startsAt, event.endsAt)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </main>
  );
}
