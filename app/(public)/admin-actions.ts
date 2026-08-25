"use server";

import { confirmEvents } from "@/lib/events/state";
import { requireAdminAction } from "@/app/admin/form-helpers";

/**
 * The actions reachable from a public page.
 *
 * Kept in their own file rather than folded into app/admin/actions.ts so that
 * "what can be invoked from a statically rendered page a stranger is looking
 * at" is a list someone can read in one sitting. A server action is an
 * ordinary POST endpoint — reachable by anyone who learns its id, whether or
 * not the button that calls it was ever rendered for them — so the set of them
 * exposed here is worth being able to audit at a glance.
 *
 * Everything in this file gates before it does anything, and every write it
 * reaches gates again inside lib/events/state.ts.
 */

/**
 * R16 from the page the maintainer is already on.
 *
 * Confirming stays one action with no form and no navigation. The comment on
 * ConfirmationPass says the freshness design depends on confirming being
 * faster than editing; that is more true here than in the dashboard, not less,
 * because here the maintainer is standing at the bulletin board looking at the
 * event they just read off it.
 *
 * No revalidation of its own: confirmEvents already revalidates "/", "/calendar"
 * and the event's own path, which is what makes the card the maintainer just
 * tapped re-render as confirmed. If that call ever goes away, this appears to
 * do nothing.
 */
export async function confirmEventAction(eventId: string): Promise<void> {
  await requireAdminAction();
  await confirmEvents([eventId]);
}
