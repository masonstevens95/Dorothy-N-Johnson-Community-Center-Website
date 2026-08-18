"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A header navigation item that knows whether it is the page you are on.
 *
 * `usePathname` rather than a server-side read: there is no server API for the
 * current path inside a layout, and the one that comes closest means reading
 * headers — which would end static rendering for every public page. This costs
 * a little JavaScript and no network.
 *
 * The active and inactive states differ only in colour, weight, and the colour
 * of a border that is always there. Nothing moves when the marker arrives, so
 * a header rendered before hydration reads as finished rather than broken.
 */
export function NavLink({
  href,
  children,
  /** The one item that does something rather than going somewhere. */
  action = false,
}: {
  href: string;
  children: React.ReactNode;
  action?: boolean;
}) {
  const pathname = usePathname();
  const current = pathname === href;

  // py-2 rather than a taller row: it buys a thumb-sized target out of the
  // gap the wrapped rows already leave, without spreading the header out.
  const base = "inline-block border-b-2 py-2 text-sm";
  const edge = current ? "border-accent" : "border-transparent";
  // Destinations read in ink and the action in accent; being on a page is said
  // with weight and the border rather than by dimming everything else.
  const tone = action ? "text-accent" : "text-ink";
  const weight = current ? "font-medium" : "";

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`${base} ${edge} ${tone} ${weight}`}
    >
      {children}
    </Link>
  );
}
