import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth-guard";
import { SignOutButton } from "./sign-out-button";

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
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/admin" className="text-sm font-semibold">
            Maintainer
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin/events/new" className="underline">
              New event
            </Link>
            <Link href="/" className="underline">
              View site
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
