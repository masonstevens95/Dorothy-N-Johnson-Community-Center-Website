import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { events } from "@/lib/db/schema";
import { ADMIN_HINT_COOKIE } from "@/lib/admin-hint";
import { createEvent } from "@/lib/events/state";
import { expandEvent } from "@/lib/events/recurrence";
import {
  closeTestDatabase,
  db,
  setupTestDatabase,
  truncateAll,
} from "./helpers/db";
import { seedAndSignIn } from "./helpers/auth";

/**
 * The one action a statically rendered public page can invoke.
 *
 * A server action is an ordinary POST endpoint: reachable by anyone who learns
 * its id, whether or not the button that calls it was ever rendered for them.
 * So the question these tests answer is not "does the button work" — that is
 * the browser suite's job — but "does this endpoint write when it should and
 * refuse when it should", asked directly against the action.
 *
 * `headers()` is stubbed because a server action reads its session from the
 * request scope rather than taking one as an argument, and there is no request
 * scope here. The stub is what lets both the signed-in and signed-out paths be
 * exercised against the real gate rather than against a mock of it.
 */

let requestHeaders = new Headers();

vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
}));

const { confirmEventAction } = await import("@/app/(public)/admin-actions");

/**
 * The shape next/navigation's redirect() throws with.
 *
 * Deliberately strict: an assertion that accepted any thrown error would pass
 * just as happily if the gate had been removed and something further down the
 * call had failed for an unrelated reason.
 */
function isRedirectToLogin(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.includes("/admin/login");
}

const nextWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

let session: Headers;

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await truncateAll();
  session = await seedAndSignIn();
  requestHeaders = session;
});

afterAll(async () => {
  await closeTestDatabase();
});

async function stored(id: string) {
  return db.query.events.findFirst({ where: eq(events.id, id) });
}

describe("confirming from a public page", () => {
  it("moves the confirmation date forward", async () => {
    const event = await createEvent(
      { title: "Bingo night", startsAt: nextWeek() },
      { requestHeaders: session },
    );

    // Published events are confirmed on creation, so age it first — otherwise
    // "it moved" and "it was already today" are indistinguishable.
    const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await db
      .update(events)
      .set({ lastConfirmedAt: stale })
      .where(eq(events.id, event.id));

    await confirmEventAction(event.id);

    const after = await stored(event.id);
    expect(after!.lastConfirmedAt!.getTime()).toBeGreaterThan(stale.getTime());
  });

  it("touches the confirmation date and nothing else", async () => {
    // The whole value of confirming is that it is not editing. An action that
    // quietly changed anything else would make the maintainer read the form
    // before tapping, which is the cost this exists to avoid.
    const event = await createEvent(
      {
        title: "Garden work day",
        startsAt: nextWeek(),
        location: "Back lot",
        host: "Garden club",
      },
      { requestHeaders: session },
    );

    await confirmEventAction(event.id);

    const after = await stored(event.id);
    expect(after).toMatchObject({
      title: "Garden work day",
      location: "Back lot",
      host: "Garden club",
      state: "published",
    });
    expect(after!.startsAt.getTime()).toBe(event.startsAt.getTime());
  });

  it("confirms a whole series, not one occurrence of it", async () => {
    const series = await createEvent(
      {
        title: "Weekly community watch",
        startsAt: nextWeek(),
        recurrenceFrequency: "weekly",
        recurrenceInterval: 1,
      },
      { requestHeaders: session },
    );

    const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await db
      .update(events)
      .set({ lastConfirmedAt: stale })
      .where(eq(events.id, series.id));

    await confirmEventAction(series.id);

    const after = await stored(series.id);
    expect(after!.lastConfirmedAt!.getTime()).toBeGreaterThan(stale.getTime());

    // Every occurrence a visitor sees on /calendar reads from this one row, so
    // confirming the series is what makes all of them read as current.
    const occurrences = expandEvent(after!, [], {
      from: new Date(),
      to: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    });
    expect(occurrences.length).toBeGreaterThan(1);
  });

  it("does not confirm an event nobody has approved", async () => {
    // A pending event with a confirmation date would read as reviewed when
    // nobody has looked at it. It is also not reachable from a public page at
    // all, which is exactly why the action must not depend on that.
    const pending = await createEvent(
      { title: "Waiting for review", startsAt: nextWeek() },
      { publish: false, requestHeaders: session },
    );

    await confirmEventAction(pending.id);

    expect((await stored(pending.id))!.lastConfirmedAt).toBeNull();
  });

  it("shrugs at an id that does not exist", async () => {
    await expect(
      confirmEventAction("00000000-0000-4000-8000-000000000000"),
    ).resolves.toBeUndefined();
  });

  it("writes nothing at all without a session", async () => {
    const event = await createEvent(
      { title: "Not yours to confirm", startsAt: nextWeek() },
      { requestHeaders: session },
    );

    const before = (await stored(event.id))!.lastConfirmedAt;

    // The maintainer's likely case is an expired session, so the action sends
    // them to the login page rather than surfacing an error. What matters here
    // is the other half: it does that instead of writing (R8).
    requestHeaders = new Headers();

    await expect(confirmEventAction(event.id)).rejects.toSatisfy(isRedirectToLogin);

    expect((await stored(event.id))!.lastConfirmedAt).toEqual(before);
  });

  it("is not opened by the hint cookie alone", async () => {
    // The cookie decides what the maintainer sees. It has never decided what
    // anyone may do, and forging it reaches this line and stops.
    const event = await createEvent(
      { title: "Still not yours", startsAt: nextWeek() },
      { requestHeaders: session },
    );

    const before = (await stored(event.id))!.lastConfirmedAt;

    const forged = new Headers();
    forged.set("cookie", `${ADMIN_HINT_COOKIE}=1`);
    requestHeaders = forged;

    await expect(confirmEventAction(event.id)).rejects.toSatisfy(isRedirectToLogin);

    expect((await stored(event.id))!.lastConfirmedAt).toEqual(before);
  });
});
