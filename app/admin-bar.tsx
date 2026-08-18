"use client";

import { useAdmin } from "@/lib/use-admin";
import { AdminActionsNav } from "./admin-actions-nav";
import type { HeaderWidth } from "./header-width";

/**
 * The public shell's half of the maintainer strip.
 *
 * Renders nothing — no wrapper, no reserved space, no tinted empty bar — when
 * there is no maintainer, which is every visitor. That is why the strip's own
 * chrome lives inside AdminActionsNav rather than around this component: an
 * empty container rendered by the header would be visible to everyone.
 *
 * The admin shell does not use this. It already holds the session, so it
 * renders AdminActionsNav directly with a server-side count and never asks the
 * browser anything.
 */
export function AdminBar({ width = "narrow" }: { width?: HeaderWidth }) {
  const { isAdmin, pendingCount } = useAdmin();

  if (!isAdmin) return null;

  return <AdminActionsNav width={width} pendingCount={pendingCount} />;
}
