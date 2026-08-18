import Link from "next/link";
import { site } from "@/lib/site";
import { NavLink } from "./nav-link";

/**
 * The one header. Public pages and admin pages render this same component, so
 * the maintainer sees the same site navigation wherever they are (R3) and the
 * two shells cannot drift apart again.
 *
 * This component reads no session, and must not start. It is rendered by
 * app/(public)/layout.tsx, which is statically prerendered — a session read
 * anywhere in this subtree turns every public page dynamic and puts read
 * traffic back on the function budget. Whatever the maintainer should see that
 * a visitor should not arrives through the `adminActions` slot, which the admin
 * shell fills server-side (it already has the session) and the public shell
 * fills with a client component gated on a cookie. Neither path costs a
 * visitor anything. Do not import lib/auth-guard, lib/auth-client, or
 * next/headers here.
 *
 * Styling stays inside the palette in app/globals.css for the reason stated at
 * the top of that file: this site is read on a phone with poor reception, and
 * decoration is paid for in bytes.
 */

const CONTAINER = {
  /** The public shell's reading width. */
  narrow: "max-w-2xl",
  /** The admin shell's, which has wider tables and lists to hold. */
  wide: "max-w-3xl",
} as const;

export type HeaderWidth = keyof typeof CONTAINER;

export function SiteHeader({
  width = "narrow",
  maintainerSlot,
  adminActions,
}: {
  width?: HeaderWidth;
  /**
   * The maintainer's door, when this shell wants one. The admin shell does
   * not — offering a door to the room you are standing in is noise.
   */
  maintainerSlot?: React.ReactNode;
  /** The maintainer-mode strip, rendered full width below the navigation. */
  adminActions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-line">
      <div className={`mx-auto ${CONTAINER[width]} px-5 pt-4`}>
        <Link href="/" className="text-base font-semibold tracking-tight">
          {site.name}
        </Link>

        {/*
          Destinations first, then the one action, then the maintainer's door.
          They wrap at 320px rather than overflowing (R7), and the order is what
          makes the wrap read as two deliberate groups instead of a spill.
        */}
        <nav className="mt-1 flex flex-wrap items-center gap-x-5">
          <NavLink href="/">What&rsquo;s on</NavLink>
          <NavLink href="/calendar">Calendar</NavLink>
          <NavLink href="/projects">Projects</NavLink>
          {/* The one item here that does something. Accent, not underline. */}
          <NavLink href="/submit" action>
            Add an event
          </NavLink>
          {maintainerSlot}
        </nav>
      </div>

      {/*
        Its own strip below the navigation, not woven into it: admin chrome
        appears a frame after hydration on public pages, and confining the shift
        to one boundary is what keeps that from reflowing the whole header. The
        strip supplies its own full-width tint, so nothing is reserved — and
        therefore nothing is visible — when there is no maintainer.
      */}
      {adminActions}
    </header>
  );
}
