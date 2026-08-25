import Link from "next/link";
import { HEADER_CONTAINER, type HeaderWidth } from "./header-width";
import { SignOutButton } from "./admin/(dashboard)/sign-out-button";

/**
 * The maintainer-mode strip. One definition, rendered two ways: the admin shell
 * passes it a count it queried server-side, and the public shell's AdminBar
 * passes one it fetched client-side. Neither knows about the other, and the
 * markup is identical either way.
 *
 * It says "Maintainer view" out loud, and is tinted and bordered, because a
 * maintainer looking at /calendar with edit buttons on it is seeing something
 * no visitor sees. On a site whose entire freshness design rests on the
 * maintainer knowing what visitors actually see, "what I am looking at" must
 * never be mistaken for "what is published".
 *
 * Presentational only — it reads nothing and decides nothing. Whether it should
 * appear at all is AdminBar's question on public routes and the session's on
 * admin ones.
 */
export function AdminActionsNav({
  width = "narrow",
  pendingCount,
}: {
  width?: HeaderWidth;
  /** Waiting submissions, or null when not yet known. */
  pendingCount: number | null;
}) {
  return (
    <div className="border-t border-line bg-accent/5">
      <div className={`mx-auto ${HEADER_CONTAINER[width]} px-5 py-2`}>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          Maintainer view
        </p>

        <nav
          aria-label="Maintainer actions"
          className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
        >
          <Link href="/admin" className="py-1 underline">
            Confirmation pass
          </Link>
          <Link href="/admin/events/new" className="py-1 underline">
            New event
          </Link>
          <Link href="/admin/projects" className="py-1 underline">
            Projects
          </Link>
          {/*
            The number only when there is one. A badge reading "0" is a badge
            reporting an absence, which is noise the maintainer learns to skip
            past — and skipping past it is the habit that makes a real count
            get missed later.
          */}
          <Link href="/admin/queue" className="py-1 underline">
            Queue{pendingCount ? ` (${pendingCount})` : ""}
          </Link>
          <SignOutButton />
        </nav>
      </div>
    </div>
  );
}
