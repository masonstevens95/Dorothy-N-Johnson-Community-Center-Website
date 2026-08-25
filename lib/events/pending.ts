import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";

/**
 * How many submitted events are waiting for review.
 *
 * The header badge needs this on both shells — fetched over HTTP on public
 * pages, queried directly on admin ones — so the selection lives in one place
 * rather than being written out twice and drifting into two different answers
 * to the same question.
 *
 * Counted rather than fetched: the badge wants the number, not the events.
 */
export async function countPendingEvents(): Promise<number> {
  const [pending] = await db
    .select({ value: count() })
    .from(events)
    .where(eq(events.state, "pending"));

  return pending?.value ?? 0;
}
