import type { Metadata } from "next";
import Link from "next/link";
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

      {/*
        Since "Maintainer" went into the public header, arriving here by
        accident is the common case rather than the rare one, and the copy
        above only helps the neighbor who has an event to post. This is the
        way out for everyone else, so the page is not a dead end.
      */}
      <p className="mt-8 text-sm">
        <Link href="/" className="underline">
          Back to what&rsquo;s on at the center
        </Link>
      </p>
    </main>
  );
}
