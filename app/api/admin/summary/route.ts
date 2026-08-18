import { NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { UnauthorizedError, requireAdmin } from "@/lib/auth-guard";
import { EXPIRED_ADMIN_HINT_COOKIE } from "@/lib/admin-hint";

/**
 * The only request a public page ever makes on the maintainer's behalf, and
 * one a visitor's page never makes at all — the hint cookie is checked first,
 * client-side, and when it is absent nothing here is ever reached (R9).
 *
 * It does two jobs with one round trip. It answers how many submissions are
 * waiting, for the badge in the header. And by answering at all it proves the
 * session is still alive, which is the one thing the hint cookie cannot tell
 * anyone: a 30-day cookie can easily outlive the session it was written
 * alongside. A 401 here expires the hint and the chrome disappears, so a stale
 * hint self-heals on the next page load rather than needing a poll.
 *
 * Gated the same way as /api/upload, and for the same reason: a route handler
 * is reachable by anyone who knows its path, so it checks before it counts.
 * A forged hint cookie gets a 401 from here exactly like no cookie at all —
 * the hint decides what is rendered, never what is permitted (R8).
 */
export async function GET(request: Request) {
  try {
    await requireAdmin(request.headers);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "Sign in required." },
        {
          status: 401,
          headers: {
            "set-cookie": EXPIRED_ADMIN_HINT_COOKIE,
            "cache-control": "no-store",
          },
        },
      );
    }
    throw error;
  }

  // Mirrors the pending selection in app/admin/(dashboard)/page.tsx, counted
  // rather than fetched — the badge needs the number, not the events.
  const [pending] = await db
    .select({ value: count() })
    .from(events)
    .where(eq(events.state, "pending"));

  return NextResponse.json(
    { pendingCount: pending?.value ?? 0 },
    { headers: { "cache-control": "no-store" } },
  );
}

// A count that is cached is a count that is wrong, and this is behind a
// session in any case.
export const dynamic = "force-dynamic";
