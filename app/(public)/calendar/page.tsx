import type { Metadata } from "next";
import {
  CALENDAR_HORIZON_DAYS,
  getUpcomingOccurrences,
  type PublicOccurrence,
} from "@/lib/public-data";
import { formatDate } from "@/lib/format";
import { toZonedParts } from "@/lib/time";
import { EventCard } from "../event-card";
import { AdminShortcut } from "../admin-controls";

export const metadata: Metadata = {
  title: "Calendar",
  description: "Everything coming up at the community center.",
};

/**
 * R6. The forward view, kept as a separate route rather than an expansion of
 * the landing list: the landing page's job is answering "this week" in one
 * screen, and making it also carry four months of events would compromise
 * that.
 *
 * Grouped by day rather than shown as a month grid — a grid of mostly-empty
 * cells is a poor use of a phone screen at this event volume.
 */
export default async function CalendarPage() {
  const upcoming = await getUpcomingOccurrences({
    horizonDays: CALENDAR_HORIZON_DAYS,
  });

  const byDay = new Map<string, PublicOccurrence[]>();

  for (const item of upcoming) {
    const parts = toZonedParts(item.occurrence.start);
    const key = `${parts.year}-${parts.month}-${parts.day}`;
    const existing = byDay.get(key);
    if (existing) existing.push(item);
    else byDay.set(key, [item]);
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
      <p className="mt-2 text-sm text-muted">
        Everything listed for the next {Math.round(CALENDAR_HORIZON_DAYS / 30)}{" "}
        months.
      </p>

      {/*
        R6. The forward view is where the maintainer notices a gap, so it is
        where the shortcut to fill one belongs. It points at the admin form,
        not at /submit — the maintainer publishes, they do not queue.
      */}
      <AdminShortcut href="/admin/events/new" label="Add event" />

      {byDay.size === 0 ? (
        <div className="mt-6 rounded-lg border border-line bg-white p-5 text-sm">
          <p>Nothing is listed yet.</p>
          <p className="mt-2 text-muted">
            The bulletin board inside the building is the place to check.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {[...byDay.entries()].map(([key, items]) => (
            <section key={key}>
              <h2 className="text-sm font-semibold text-muted">
                {formatDate(items[0].occurrence.start)}
              </h2>
              <div className="mt-1">
                {items.map((item) => (
                  <EventCard
                    key={`${item.occurrence.event.id}-${item.occurrence.start.toISOString()}`}
                    {...item}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
