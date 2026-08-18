import Link from "next/link";
import { getUpcomingOccurrences } from "@/lib/public-data";
import { EventCard } from "./event-card";

/**
 * R2. The landing view answers "what is happening at the center soon" with no
 * navigation and no interaction. Everything else on this site is secondary to
 * this list rendering fast on a phone with poor reception.
 */
export default async function HomePage() {
  const upcoming = await getUpcomingOccurrences({ horizonDays: 45, limit: 20 });

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-xl font-semibold tracking-tight">What&rsquo;s on</h1>

      {upcoming.length === 0 ? (
        // Not an empty region. A blank page reads as broken; this reads as
        // honest.
        <div className="mt-6 rounded-lg border border-line bg-white p-5 text-sm">
          <p>Nothing is listed for the next few weeks.</p>
          <p className="mt-2 text-muted">
            That may mean nothing is scheduled, or it may mean this site has not
            been updated. The bulletin board inside the building is the place to
            check.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          {upcoming.map((item) => (
            <EventCard
              key={`${item.occurrence.event.id}-${item.occurrence.start.toISOString()}`}
              {...item}
            />
          ))}
        </div>
      )}

      <p className="mt-8 text-sm">
        <Link href="/calendar" className="underline">
          See further ahead
        </Link>
      </p>
    </main>
  );
}
