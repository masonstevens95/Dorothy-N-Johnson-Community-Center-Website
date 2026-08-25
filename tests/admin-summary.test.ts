import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/admin/summary/route";
import { ADMIN_HINT_COOKIE } from "@/lib/admin-hint";
import { createEvent, rejectEvent } from "@/lib/events/state";
import {
  closeTestDatabase,
  setupTestDatabase,
  truncateAll,
} from "./helpers/db";
import { seedAndSignIn } from "./helpers/auth";

/**
 * The summary route is the only request a public page ever makes on the
 * maintainer's behalf, and the only thing that can tell a stale hint cookie
 * that its session is gone. Both halves are load-bearing: the first for the
 * function budget, the second for the hint healing itself.
 */

const SUMMARY_URL = "http://localhost/api/admin/summary";

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDatabase();
});

function request(headers?: Headers): Request {
  return new Request(SUMMARY_URL, { headers: headers ?? new Headers() });
}

/** An event waiting for review, in the state the public form leaves them in. */
async function addPending(title: string, headers: Headers): Promise<string> {
  const event = await createEvent(
    { title, startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    { publish: false, requestHeaders: headers },
  );
  return event.id;
}

describe("the admin summary route", () => {
  it("answers an authenticated request with the pending count", async () => {
    const headers = await seedAndSignIn();
    await addPending("Bake sale", headers);
    await addPending("Repair cafe", headers);

    const response = await GET(request(headers));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ pendingCount: 2 });
  });

  it("counts only pending events, not published or rejected ones", async () => {
    const headers = await seedAndSignIn();

    await addPending("Waiting for review", headers);
    await createEvent(
      { title: "Already published", startsAt: new Date() },
      { requestHeaders: headers },
    );
    const spam = await addPending("Turned down", headers);
    await rejectEvent(spam, { requestHeaders: headers });

    const response = await GET(request(headers));

    // A badge that counts events the maintainer has already dealt with is a
    // badge they learn to ignore.
    await expect(response.json()).resolves.toEqual({ pendingCount: 1 });
  });

  it("answers zero rather than failing when nothing is waiting", async () => {
    const headers = await seedAndSignIn();

    const response = await GET(request(headers));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ pendingCount: 0 });
  });

  it("reflects a new submission rather than a cached count", async () => {
    const headers = await seedAndSignIn();

    const before = await GET(request(headers)).then((r) => r.json());
    await addPending("Arrived in between", headers);
    const after = await GET(request(headers)).then((r) => r.json());

    expect(before).toEqual({ pendingCount: 0 });
    expect(after).toEqual({ pendingCount: 1 });
  });

  it("refuses an unauthenticated request and gives away no count", async () => {
    const headers = await seedAndSignIn();
    await addPending("Nobody unauthenticated should learn this exists", headers);

    const response = await GET(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.not.toHaveProperty("pendingCount");
  });

  it("expires the hint cookie when it refuses", async () => {
    // This is what makes a hint that outlived its session self-healing: the
    // browser drops it even if the client-side clear never runs.
    const response = await GET(request());

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${ADMIN_HINT_COOKIE}=`);
    expect(setCookie).toContain("Max-Age=0");
  });

  it("refuses a forged hint cookie exactly as it refuses no cookie", async () => {
    // The hint decides what is rendered. It has never decided what is
    // permitted, and this is the assertion that says so out loud (R8).
    const forged = new Headers();
    forged.set("cookie", `${ADMIN_HINT_COOKIE}=1`);

    const response = await GET(request(forged));

    expect(response.status).toBe(401);
  });
});
