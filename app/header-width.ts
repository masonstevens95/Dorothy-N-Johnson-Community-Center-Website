/**
 * The two shells read at different widths — the public one at a reading
 * measure, the admin one wider to hold its lists — and the shared header has
 * to sit inside whichever it is in.
 *
 * Its own module rather than an export from app/site-header.tsx so that the
 * client-side admin strip can line up with the header above it without pulling
 * the whole server header into the browser bundle.
 */
export const HEADER_CONTAINER = {
  narrow: "max-w-2xl",
  wide: "max-w-3xl",
} as const;

export type HeaderWidth = keyof typeof HEADER_CONTAINER;
