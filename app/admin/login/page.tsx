import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  // Never index the admin surfaces.
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-xl font-semibold tracking-tight">Maintainer sign-in</h1>
      <p className="mt-2 text-sm text-muted">
        This site has one account and no sign-up. If you are a neighbor with an
        event to share, use the{" "}
        <a href="/submit" className="underline">
          submission form
        </a>{" "}
        instead — no account needed.
      </p>

      <LoginForm />
    </main>
  );
}
