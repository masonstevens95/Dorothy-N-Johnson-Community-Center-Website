"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { clearAdminHint } from "@/lib/admin-hint";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="underline"
      onClick={async () => {
        await signOut();

        // The symmetric half of the write in the login form. Without it the
        // maintainer keeps seeing edit and confirm controls on public pages
        // after signing out — controls that would now bounce them to the login
        // page, which reads as the site being broken rather than as them being
        // signed out.
        clearAdminHint();

        router.push("/admin/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
