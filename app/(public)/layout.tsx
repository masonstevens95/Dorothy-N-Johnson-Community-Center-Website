import { getSiteFreshness } from "@/lib/public-data";
import { STALENESS_WINDOW_DAYS } from "@/lib/freshness";
import { formatAge } from "@/lib/format";
import { site } from "@/lib/site";
import { SiteHeader } from "@/app/site-header";
import { MaintainerLink } from "@/app/maintainer-link";
import { AdminBar } from "@/app/admin-bar";

/**
 * Public pages render statically and revalidate on publish, keeping read
 * traffic off the function budget.
 *
 * The hourly revalidation is not a background job and not a cron: it is a
 * cache lifetime. It matters because staleness is derived from the current
 * time, and a page frozen at build time would keep claiming an event was
 * confirmed "2 days ago" indefinitely. The unattended site is exactly the case
 * the freshness design exists for, so the one thing that must not depend on
 * someone publishing is the notice that says nobody has.
 *
 * This layout reads no session, and must not start. That absence is what keeps
 * `revalidate` above real. Anything the maintainer should see here arrives
 * through a client component that gates itself — see app/site-header.tsx.
 */
export const revalidate = 3600;

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { siteStale, latestConfirmedAt, hasAnyEvents } = await getSiteFreshness();

  return (
    <div className="flex min-h-dvh flex-col">
      {/*
        Both slots are client components that render null for a visitor, so
        this stays a server component that reads no session and every public
        page stays statically prerendered. The maintainer's chrome is assembled
        in their browser from a cookie, not on the server from a session.
      */}
      <SiteHeader
        maintainerSlot={<MaintainerLink />}
        adminActions={<AdminBar />}
      />

      {/*
        R11. Appears on every public page when nothing at all has been
        confirmed recently — the site telling visitors plainly that it has
        stopped being maintained, rather than continuing to look current.
      */}
      {siteStale && hasAnyEvents ? (
        <div
          role="status"
          className="border-b border-line bg-white px-5 py-3 text-sm"
        >
          <p className="mx-auto max-w-2xl">
            <strong className="text-warn">This calendar may be out of date.</strong>{" "}
            Nothing here has been checked against the bulletin board
            {latestConfirmedAt ? ` since ${formatAge(latestConfirmedAt)}` : ""}. For
            what is actually happening, check the board inside the building
            {site.officialUrl ? (
              <>
                {" "}
                or the{" "}
                <a href={site.officialUrl} className="underline">
                  city&rsquo;s page for the center
                </a>
              </>
            ) : null}
            .
          </p>
        </div>
      ) : null}

      <div className="flex-1">{children}</div>

      <footer className="mt-12 border-t border-line">
        <div className="mx-auto max-w-2xl space-y-3 px-5 py-8 text-sm text-muted">
          {site.address ? (
            <p>
              <span className="font-medium text-ink">Address</span>
              <br />
              {site.address}
            </p>
          ) : null}

          {site.hours ? (
            <p>
              <span className="font-medium text-ink">Hours</span>
              <br />
              {site.hours}
            </p>
          ) : null}

          {/*
            R12. Not a footnote. The maintainer is a neighbor with informal
            blessing and no authority over the center, and a site that reads as
            official creates a problem for the center that saying so avoids.
          */}
          <p className="border-t border-line pt-3">
            This site is maintained by a neighborhood volunteer. It is{" "}
            <strong className="text-ink">not the center&rsquo;s official website</strong>
            . The physical bulletin board inside the building is the
            authoritative source
            {site.officialUrl ? (
              <>
                {" "}
                — see also the{" "}
                <a href={site.officialUrl} className="underline">
                  official city page
                </a>
              </>
            ) : null}
            .
          </p>

          <p>
            Events are checked against the board by hand. Anything not confirmed
            in {STALENESS_WINDOW_DAYS} days is marked unverified.
          </p>
        </div>
      </footer>
    </div>
  );
}
