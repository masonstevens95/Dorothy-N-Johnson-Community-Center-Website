import { auth, type Session } from "./auth";

/**
 * Thrown when a write path is reached without a valid session. Callers should
 * let this propagate rather than catching it into a generic error — the
 * distinction between "not signed in" and "something went wrong" is what makes
 * the admin surfaces redirect to login instead of showing a failure.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * next/headers is only importable inside a request scope, so it is pulled in
 * lazily. Tests pass headers explicitly and never reach this path.
 */
async function resolveHeaders(provided?: Headers): Promise<Headers> {
  if (provided) return provided;
  const { headers } = await import("next/headers");
  return await headers();
}

/**
 * Returns the current session, or null when there is none.
 *
 * Use this for *rendering* decisions. Anything that writes must go through
 * requireAdmin instead, so that a missing session is an error rather than a
 * falsy value some caller forgets to check.
 */
export async function getSession(
  requestHeaders?: Headers,
): Promise<Session | null> {
  const resolved = await resolveHeaders(requestHeaders);
  const session = await auth.api.getSession({ headers: resolved });
  return (session as Session | null) ?? null;
}

/**
 * The single write-path gate (R13).
 *
 * Every mutation in the application — event authoring, confirmation,
 * moderation, project editing, uploads — calls this first. Centralizing it is
 * what stops a newly added mutation from shipping unauthenticated: there is
 * one function to forget rather than one check per route to remember.
 */
export async function requireAdmin(requestHeaders?: Headers): Promise<Session> {
  const session = await getSession(requestHeaders);

  if (!session) {
    throw new UnauthorizedError();
  }

  return session;
}
