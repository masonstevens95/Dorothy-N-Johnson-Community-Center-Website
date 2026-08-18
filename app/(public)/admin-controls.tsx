"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdmin } from "@/lib/use-admin";
import { confirmEventAction } from "./admin-actions";

/**
 * The maintainer's controls on public pages: a way into the edit form, and —
 * for events — confirming against the board without leaving the page.
 *
 * Each of these gates itself rather than being wrapped in a shared
 * `<AdminOnly>` that takes children. That is not a style preference. Children
 * handed from a server component to a client component are serialized into the
 * page's payload whether or not the client ever renders them, so a wrapper
 * would put "Edit" and "Confirm" into every visitor's page and only decline to
 * paint them. Gating inside each control means the markup is constructed in the
 * maintainer's browser and exists nowhere else (R1).
 *
 * Nothing here is a permission check. useAdmin reads a cookie that grants
 * nothing; every href below lands on a route the dashboard layout guards, and
 * the confirm button calls an action that re-checks before it writes (R8).
 *
 * Placement is a trailing row rather than anything near a card's heading, so
 * that chrome arriving a frame after hydration cannot reflow the content the
 * visitor came for.
 */

const CONTROL = "rounded-lg border px-3 py-2 text-sm";

/**
 * A row of controls under an event. `confirmEventId` is omitted for anything
 * that is not an event — only events are confirmed against the board.
 */
export function AdminControls({
  editHref,
  confirmEventId,
}: {
  editHref: string;
  confirmEventId?: string;
}) {
  const { isAdmin } = useAdmin();

  if (!isAdmin) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Link href={editHref} className={`${CONTROL} border-line`}>
        Edit
      </Link>
      {confirmEventId ? <ConfirmButton eventId={confirmEventId} /> : null}
    </div>
  );
}

/** A standalone maintainer link, for the "add one of these" shortcuts. */
export function AdminShortcut({ href, label }: { href: string; label: string }) {
  const { isAdmin } = useAdmin();

  if (!isAdmin) return null;

  return (
    <Link href={href} className={`${CONTROL} border-line`}>
      {label}
    </Link>
  );
}

/**
 * One tap, and never more than one.
 *
 * No form, no fields, no navigation, no confirmation dialog. Confirming has to
 * stay faster than editing or the freshness design stops working, and this is
 * the surface where that matters most — the alternative to tapping this is
 * opening an edit form to change nothing.
 *
 * The label changes optimistically because the page behind it re-renders a
 * moment later: confirmEvents revalidates the public paths, so the card's own
 * "Unverified" line becomes "Confirmed today" on its own. This just covers the
 * gap without claiming anything the server has not already agreed to.
 */
function ConfirmButton({ eventId }: { eventId: string }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "failed">(
    "idle",
  );

  if (state === "done") {
    return (
      <span role="status" className="text-sm text-muted">
        Confirmed
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={state === "saving"}
      onClick={async () => {
        setState("saving");
        try {
          await confirmEventAction(eventId);
          setState("done");
        } catch {
          // Most often a session that ended while the page was open. Saying so
          // beats a button that silently does nothing.
          setState("failed");
        }
      }}
      className={`${CONTROL} border-accent font-medium text-accent disabled:opacity-60`}
    >
      {state === "saving"
        ? "Confirming…"
        : state === "failed"
          ? "Try again"
          : "Confirm"}
    </button>
  );
}
