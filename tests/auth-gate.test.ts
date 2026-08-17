import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { UnauthorizedError, requireAdmin } from "@/lib/auth-guard";
import { seedAdmin } from "@/lib/auth-seed";
import { user } from "@/lib/db/schema";
import {
  closeTestDatabase,
  db,
  setupTestDatabase,
  truncateAll,
} from "./helpers/db";

/**
 * This is the security-critical seam of the project: every later unit adds
 * write paths behind this gate. A silent failure here is a public compromise
 * rather than a cosmetic bug, which is why these tests exist before the
 * surfaces they protect.
 */

const ADMIN_EMAIL = "maintainer@example.test";
const ADMIN_PASSWORD = "correct-horse-battery-staple";

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await truncateAll();
  await seedAdmin({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    name: "Site maintainer",
  });
});

afterAll(async () => {
  await closeTestDatabase();
});

/** Signs in and returns headers carrying the resulting session cookie. */
async function signInAsAdmin(): Promise<Headers> {
  const response = await auth.api.signInEmail({
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    asResponse: true,
  });

  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();

  const headers = new Headers();
  headers.set("cookie", setCookie!.split(";")[0]);
  return headers;
}

describe("admin sign-in", () => {
  it("issues a session to the seeded admin", async () => {
    const headers = await signInAsAdmin();
    const session = await auth.api.getSession({ headers });

    expect(session).not.toBeNull();
    expect(session!.user.email).toBe(ADMIN_EMAIL);
  });

  it("admits the seeded admin through the write-path gate", async () => {
    const headers = await signInAsAdmin();
    const session = await requireAdmin(headers);

    expect(session.user.email).toBe(ADMIN_EMAIL);
  });

  it("rejects a wrong password", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: ADMIN_EMAIL, password: "not-the-password" },
      }),
    ).rejects.toThrow();
  });

  it("rejects an email that was never seeded", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: "stranger@example.test", password: ADMIN_PASSWORD },
      }),
    ).rejects.toThrow();
  });
});

describe("the write-path gate", () => {
  it("rejects a request carrying no session at all", async () => {
    await expect(requireAdmin(new Headers())).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a tampered session token", async () => {
    const headers = await signInAsAdmin();
    const tampered = new Headers();
    tampered.set("cookie", headers.get("cookie")!.replace(/.$/, "x"));

    await expect(requireAdmin(tampered)).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a fabricated session token", async () => {
    const headers = new Headers();
    headers.set("cookie", "better-auth.session_token=totally-made-up-token");

    await expect(requireAdmin(headers)).rejects.toThrow(UnauthorizedError);
  });

  it("rejects an expired session", async () => {
    const headers = await signInAsAdmin();
    const session = await auth.api.getSession({ headers });
    expect(session).not.toBeNull();

    // Expire it in the database rather than waiting out the real TTL.
    const { session: sessionTable } = await import("@/lib/db/schema");
    await db
      .update(sessionTable)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(sessionTable.id, session!.session.id));

    await expect(requireAdmin(headers)).rejects.toThrow(UnauthorizedError);
  });

  it("rejects writes after the admin signs out", async () => {
    const headers = await signInAsAdmin();
    await requireAdmin(headers);

    await auth.api.signOut({ headers });

    await expect(requireAdmin(headers)).rejects.toThrow(UnauthorizedError);
  });
});

describe("account creation is unreachable from the public internet (R13)", () => {
  /** Drives the mounted HTTP handler, not the server-side API surface. */
  function publicRequest(path: string, body: unknown): Request {
    return new Request(`http://localhost:3000${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("refuses sign-up over HTTP", async () => {
    const response = await auth.handler(
      publicRequest("/api/auth/sign-up/email", {
        email: "intruder@example.test",
        password: "hunter2hunter2",
        name: "Intruder",
      }),
    );

    expect(response.ok).toBe(false);

    const accounts = await db.select().from(user);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].email).toBe(ADMIN_EMAIL);
  });

  it("leaves exactly one account after a sign-up attempt", async () => {
    await auth.handler(
      publicRequest("/api/auth/sign-up/email", {
        email: "second@example.test",
        password: "hunter2hunter2",
        name: "Second",
      }),
    );

    const intruder = await db
      .select()
      .from(user)
      .where(eq(user.email, "second@example.test"));

    expect(intruder).toHaveLength(0);
  });
});

describe("seeding", () => {
  it("is idempotent — reseeding does not create a second account", async () => {
    await seedAdmin({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: "Site maintainer",
    });

    const accounts = await db.select().from(user);
    expect(accounts).toHaveLength(1);
  });

  it("gives the seeded account the admin role", async () => {
    const [account] = await db.select().from(user);
    expect(account.role).toBe("admin");
  });

  it("updates the password when reseeded, so a forgotten one is recoverable", async () => {
    // There is no password-reset flow by design; rerunning the seed script is
    // the recovery path, and it has to actually work.
    await seedAdmin({
      email: ADMIN_EMAIL,
      password: "a-brand-new-password",
      name: "Site maintainer",
    });

    const session = await auth.api.signInEmail({
      body: { email: ADMIN_EMAIL, password: "a-brand-new-password" },
    });
    expect(session.user.email).toBe(ADMIN_EMAIL);

    await expect(
      auth.api.signInEmail({
        body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      }),
    ).rejects.toThrow();
  });
});
