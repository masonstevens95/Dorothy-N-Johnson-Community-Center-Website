import { auth } from "@/lib/auth";
import { seedAdmin } from "@/lib/auth-seed";

export const TEST_ADMIN_EMAIL = "maintainer@example.test";
export const TEST_ADMIN_PASSWORD = "correct-horse-battery-staple";

/**
 * Seeds the admin and returns headers carrying a live session.
 *
 * Every suite that exercises a write path needs this, and the write gate takes
 * headers explicitly so tests never depend on a Next.js request scope.
 */
export async function seedAndSignIn(): Promise<Headers> {
  await seedAdmin({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

  const response = await auth.api.signInEmail({
    body: { email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD },
    asResponse: true,
  });

  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Sign-in did not return a session cookie.");
  }

  const headers = new Headers();
  headers.set("cookie", setCookie.split(";")[0]);
  return headers;
}

/** Headers with no session, for asserting the gate refuses. */
export const noSession = (): { requestHeaders: Headers } => ({
  requestHeaders: new Headers(),
});
