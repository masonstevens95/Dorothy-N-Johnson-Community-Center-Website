"use client";

import Link from "next/link";
import { useAdmin } from "@/lib/use-admin";

/**
 * The maintainer's door — last in the header and quieter than everything
 * beside it, because it is the one item there that is not for visitors.
 *
 * "Maintainer" and not "Sign in": beside "Add an event", "sign in" reads as
 * though posting needs an account, which is the opposite of true (R1, R17).
 *
 * It points at /admin rather than /admin/login so a single static href is
 * correct in both session states — the dashboard layout redirects a
 * sessionless request onward to the login page. That delegation is why the
 * public layout reads no session, which is what keeps every public page static.
 * Do not add a session read here to hide or relabel this link.
 *
 * It is a client component only so it can take itself away once the maintainer
 * strip has replaced it: offering a door to a room you are standing in is
 * noise. The server render always includes it, so it is in the prerendered HTML
 * for every visitor, every crawler, and anyone without JavaScript — which is
 * the state that has to be right. It disappears a frame after hydration, and
 * only for the one person who no longer needs it.
 */
export function MaintainerLink() {
  const { isAdmin } = useAdmin();

  if (isAdmin) return null;

  return (
    <Link
      href="/admin"
      className="inline-block border-b-2 border-transparent py-2 text-xs text-muted hover:text-ink"
    >
      Maintainer
    </Link>
  );
}
