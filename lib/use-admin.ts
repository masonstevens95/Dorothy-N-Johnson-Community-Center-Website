"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  clearAdminHint,
  hasAdminHint,
  setAdminHint,
  subscribeToAdminHint,
} from "./admin-hint";

/**
 * "Is this the maintainer, and how many submissions are waiting?"
 *
 * Silent and free when the hint cookie is absent: no request is issued, ever,
 * so a visitor's page load costs exactly what it costs today (R9). This is the
 * whole reason the hint exists — see lib/admin-hint.ts, including the part
 * about it granting nothing.
 */

export interface AdminState {
  /** Whether to render maintainer chrome. Never whether to permit anything. */
  isAdmin: boolean;
  /** Waiting submissions, or null while unknown. */
  pendingCount: number | null;
}

type SummaryResult =
  | { status: "ok"; pendingCount: number }
  | { status: "signed-out" }
  /** Offline, or a server that failed for some reason of its own. */
  | { status: "unknown" };

/**
 * Memoized at module scope so navigating around within a tab reuses the first
 * answer instead of spending an invocation per page. A failure is deliberately
 * not memoized: caching a network blip for the lifetime of the tab would leave
 * the maintainer without a queue count until they reloaded.
 */
let inFlight: Promise<SummaryResult> | null = null;

function loadSummary(): Promise<SummaryResult> {
  inFlight ??= fetch("/api/admin/summary", { credentials: "same-origin" })
    .then(async (response): Promise<SummaryResult> => {
      if (response.status === 401) {
        // The session died while the hint lived on. Taking the hint away
        // notifies every mounted hook, and the chrome goes with it.
        clearAdminHint();
        return { status: "signed-out" };
      }

      if (!response.ok) {
        inFlight = null;
        return { status: "unknown" };
      }

      // Push the hint's expiry out on every confirmed-live session, so a
      // maintainer who visits regularly never has to sign in again on a
      // schedule set by the cookie rather than by the session.
      setAdminHint();

      const body = (await response.json()) as { pendingCount?: number };
      return { status: "ok", pendingCount: body.pendingCount ?? 0 };
    })
    .catch((): SummaryResult => {
      // A refused request is not a refused session. Losing the network must
      // not sign the maintainer out of their own site.
      inFlight = null;
      return { status: "unknown" };
    });

  return inFlight;
}

/** Matches the server render, where there is no cookie jar to consult. */
const notOnTheServer = () => false;

export function useAdmin(): AdminState {
  /*
   * The cookie is an external store, and read as one. The server snapshot is
   * always false, which is what makes the prerendered HTML byte-identical for
   * everyone and hydration clean; React swaps in the real reading immediately
   * afterwards.
   *
   * So admin chrome arrives a frame late. That is the accepted trade: the
   * alternative is reserving space on every visitor's page for chrome they
   * will never see, which makes the visitor pay for the maintainer's
   * convenience.
   *
   * True here is optimistic — it is believed before the round trip below
   * confirms it, and that is safe precisely because being "admin" in this hook
   * grants nothing. Every link it reveals is gated server-side and every
   * action re-checks (R8).
   */
  const isAdmin = useSyncExternalStore(
    subscribeToAdminHint,
    hasAdminHint,
    notOnTheServer,
  );

  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) return;

    let live = true;

    void loadSummary().then((result) => {
      // "signed-out" needs nothing here: clearing the hint already notified
      // the store above, which is what turns isAdmin false. "unknown" keeps
      // the optimistic state — the chrome stays, the count does not appear,
      // and nothing about the page is wrong.
      if (live && result.status === "ok") setPendingCount(result.pendingCount);
    });

    return () => {
      live = false;
    };
  }, [isAdmin]);

  return { isAdmin, pendingCount };
}
