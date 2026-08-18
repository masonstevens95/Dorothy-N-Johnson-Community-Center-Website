/**
 * A rendering hint, and nothing else.
 *
 * READ THIS BEFORE GATING ANYTHING ON IT. This cookie carries no authority and
 * no information. Its value is the literal string "1". Nothing on the server
 * reads it. Forging it in devtools grants a stranger exactly two things: the
 * sight of some links that redirect to /admin/login, and a confirm button that
 * comes back with an error. It is deliberately not httpOnly, because the whole
 * point is that client JavaScript reads it — which is safe only because it
 * opens nothing.
 *
 * Authorization lives in lib/auth-guard.ts. Every admin route is gated by
 * app/admin/(dashboard)/layout.tsx, and every mutation calls requireAdmin.
 * If you ever find yourself deciding whether someone *may* do something based
 * on what is in here, the answer is that you are in the wrong file (R8).
 *
 * Why it exists at all: app/(public)/layout.tsx reads no session, which is what
 * keeps every public page statically prerendered. Asking the auth API on every
 * public page load instead would cost a function invocation per visitor page
 * view — for a signal that, for the overwhelming majority of those visitors, is
 * always "no". Reading a cookie the browser already sent costs nothing and asks
 * no one, so a visitor's page issues no extra request at all (R9). The session
 * cookie itself is untouched by any of this: still httpOnly, still the only
 * thing that means anything.
 */

/** Named for the site so it is identifiable in a devtools cookie list. */
export const ADMIN_HINT_COOKIE = "dnj_maintainer";

/**
 * Loosely coupled to the session length in lib/auth.ts rather than tracking it
 * exactly. Drift is cosmetic: a hint that outlives its session is healed by the
 * first summary request, which clears it on a 401.
 */
export const ADMIN_HINT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Secure is keyed off the actual protocol rather than the build mode, because
 * the protocol is the condition that matters — a Secure cookie is dropped
 * outright over http, and a hint that silently never sets is a maintainer
 * staring at a page with no controls and no explanation.
 */
function attributes(maxAgeSeconds: number): string {
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";

  return `Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

/**
 * Every entry point checks for `document` first. This module is imported by
 * client components that still render on the server, and a throw here would be
 * a 500 on a public page — a far worse failure than the cosmetic one this
 * cookie exists to avoid.
 */
function available(): boolean {
  return typeof document !== "undefined";
}

/**
 * Nothing polls this cookie, so anything rendered from it has to be told when
 * it changes. Every write below notifies, which is what makes signing out —
 * or a summary request coming back 401 — take the maintainer's chrome away
 * immediately rather than at the next full page load.
 */
const listeners = new Set<() => void>();

export function subscribeToAdminHint(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Written on successful sign-in, and refreshed whenever the session answers. */
export function setAdminHint(): void {
  if (!available()) return;
  document.cookie = `${ADMIN_HINT_COOKIE}=1; ${attributes(ADMIN_HINT_MAX_AGE_SECONDS)}`;
  notify();
}

/** Written on sign-out, and whenever the server says the session is gone. */
export function clearAdminHint(): void {
  if (!available()) return;
  document.cookie = `${ADMIN_HINT_COOKIE}=; ${attributes(0)}`;
  notify();
}

/**
 * The Set-Cookie value that expires the hint, for the one server-side caller
 * that needs it (app/api/admin/summary/route.ts, on a 401).
 *
 * This is not the server reading the hint — it never does, and must not start.
 * It is the server telling a browser to throw away a stale one, which is the
 * belt to the client's braces: the hook clears the hint itself on a 401, and
 * this covers the case where that JavaScript never gets to run. No Secure
 * attribute, because removal matches on name, path, and domain only.
 */
export const EXPIRED_ADMIN_HINT_COOKIE = `${ADMIN_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;

/**
 * Presence is the entire signal — the value carries nothing, so there is
 * nothing to compare it against.
 *
 * Split on "=" rather than searching the cookie string, so a cookie merely
 * *containing* this name (`dnj_maintainer_other`, or someone else's
 * `not_dnj_maintainer`) does not read as a match.
 */
export function hasAdminHint(): boolean {
  if (!available()) return false;

  return document.cookie
    .split(";")
    .some((entry) => entry.trim().split("=")[0] === ADMIN_HINT_COOKIE);
}
