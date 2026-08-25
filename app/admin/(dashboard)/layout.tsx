import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth-guard";
import { countPendingEvents } from "@/lib/events/pending";
import { SiteHeader } from "@/app/site-header";
import { AdminActionsNav } from "@/app/admin-actions-nav";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Admin pages never render statically — they are behind a session and change
 * on every write.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession(await headers());

  // This layout covers the (dashboard) route group only. /admin/login sits
  // outside it deliberately — when the login page was inside, this redirect
  // fired on the login page itself and looped.
  if (!session) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-dvh">
      {/*
        The same header the public pages get, so the maintainer keeps the site's
        own navigation while they work (R3) and the two shells cannot drift
        apart again. No "View site" link: the public navigation is right there.
        No maintainer door either — this is the room it opens onto.

        This shell is already force-dynamic and already holds the session, so it
        fills the admin slot server-side. The public shell fills it with a
        client component instead, which is what lets one header serve both
        without either paying the other's rendering cost.
      */}
      <SiteHeader
        width="wide"
        adminActions={
          <AdminActionsNav width="wide" pendingCount={await countPendingEvents()} />
        }
      />
      {children}
    </div>
  );
}
