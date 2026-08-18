---
title: "feat: Give the maintainer sign-in a visible entry point"
type: feat
status: completed
date: 2026-08-18
origin: docs/brainstorms/2026-08-15-community-center-website-requirements.md
---

# feat: Give the maintainer sign-in a visible entry point

## Summary

Add a `Maintainer` link to the public header nav pointing at `/admin` — not `/admin/login` — so the existing dashboard guard resolves the signed-out and signed-in cases for us and the public layout never reads a session. This keeps public pages statically rendered, and turns the login page from a URL you must already know into a place you can navigate to.

---

## Problem Frame

Admin authentication is already built and tested on this branch: a login page, Better Auth with HTTP sign-up disabled, a centralized `requireAdmin` write gate, a shell-only seeding script, and a session-gated dashboard with event authoring. What does not exist is any way to *reach* it. No file in `app/` outside `app/admin/` links to `/admin` or `/admin/login`; the only navigation to those routes anywhere in the repo is e2e tests typing URLs directly.

This is an omission rather than a decision. The completed plan's auth unit (`docs/plans/2026-08-15-001-feat-community-center-website-plan.md`, U9) lists the files it creates and never specifies an entry point, and neither the plan nor the origin requirements document discusses admin discoverability at all. The maintainer's only route in today is remembering to type `/admin/login`.

**Placement is a user decision, already made.** The header was chosen over a discreet footer link with the R1/R17 misread risk stated up front. This plan implements the header and mitigates that risk through labeling and ordering rather than revisiting placement.

---

## Requirements

- R1. Fully public reading experience — no visitor accounts, logins, signups, or RSVPs. *(constraint: the entry point must not imply otherwise)*
- R7. Phone is the primary form factor for reading and posting.
- R12. The site reads as neighbor-maintained, not official.
- R13. A single authenticated admin account is the only way to publish; no self-registration. *(unchanged — this plan alters discoverability, not the security model)*
- R17. Anyone can submit an event through a public form without an account. *(constraint: same as R1)*

**Origin actors:** A2 (maintainer — the sole beneficiary), A1 (newcomer resident — must not be confused by the link)
**Origin flows:** F2 (maintainer transcribes the board — this is its missing first step)

---

## Scope Boundaries

- No change to the authentication model, session handling, seeding, or the `requireAdmin` write gate. R13's security properties are untouched.
- No password reset, self-registration, or in-browser account creation. Recovery remains rerunning `pnpm seed:admin`.
- No additional admin accounts or roles — still deferred per the origin document.
- No session-aware public header. Rejected on cost; see Key Technical Decisions.
- No `robots.txt` or sitemap work. Neither file exists, and `app/admin/login/page.tsx` already sets `robots: { index: false, follow: false }`, which is what keeps the login page out of search results once it is linked.

---

## Context & Research

### Relevant Code and Patterns

- `app/(public)/layout.tsx` — the public shell. Header nav is a `<nav className="mt-2 flex gap-4 text-sm">` holding four `next/link` items. Carries `export const revalidate = 3600`; the file reads no session today, which is what keeps public pages static.
- `app/admin/(dashboard)/layout.tsx` — reads the session and `redirect("/admin/login")` when absent. The comment there records that `/admin/login` sits *outside* the `(dashboard)` route group deliberately, because an earlier version put it inside and the redirect looped on itself. This guard is the mechanism U1 delegates to.
- `app/admin/login/page.tsx` — `h1` reads "Maintainer sign-in"; body copy already redirects neighbors to `/submit` ("no account needed"), showing the author anticipated the account-required misread.
- `app/admin/(dashboard)/layout.tsx` header — labels the dashboard link "Maintainer". U1 reuses that word rather than introducing a competing one.
- `e2e/public-site.spec.ts` — `test.describe("as a signed-out visitor")` with `test.use({ storageState: { cookies: [], origins: [] } })` is the pattern for asserting signed-out behavior; the default Playwright project is authenticated via `e2e/auth.setup.ts`.
- `app/globals.css` — `--color-muted` / `--color-line` are the existing tokens for de-emphasized text and separators.

### Institutional Learnings

- `docs/solutions/` does not exist in this repo; no prior learnings applied.

---

## Key Technical Decisions

- **Link to `/admin`, not `/admin/login`.** The dashboard layout already redirects sessionless requests to the login page, so one static href is correct in both states: signed-out visitors land on the login form, a signed-in maintainer lands on the dashboard. This is what makes the next decision affordable.
- **Do not make the public header session-aware.** Reading a session in `app/(public)/layout.tsx` would force every public page to render dynamically, discarding `revalidate = 3600`. Static public pages are load-bearing for the Vercel Hobby budget the original plan is built around — the origin document treats tripping Hobby ceilings as a live risk, since it pauses the project. Delegating to the `/admin` guard buys the correct two-state behavior at zero rendering cost.
- **Label it "Maintainer", not "Sign in".** "Sign in" placed beside "Add an event" is the specific wording that reads as *accounts are required to participate*, contradicting R1 and R17. "Maintainer" names a role the visitor knows they are not, matches the dashboard's own vocabulary and the login page's `h1`, and asks nothing of them.
- **Place it last and de-emphasize it.** Ordering after "Add an event" and styling with `--color-muted` rather than the shared underline treatment separates site navigation from the maintenance door. This is the mitigation available inside the chosen placement.

---

## Open Questions

### Resolved During Planning

- *Does linking the login page from public pages expose it to search engines?* No. `app/admin/login/page.tsx` sets `robots: { index: false, follow: false }`, and there is no sitemap or `robots.txt` to amend.
- *Should the link be hidden from signed-out visitors?* No — hiding it requires a session read, which is exactly the static-rendering cost this plan avoids. It is public information that the site has a maintainer; R12 already says so in the footer.
- *Does a fifth nav item break `e2e/public-site.spec.ts`'s "exposes no authoring or confirmation control" test?* No. Those assertions match buttons named `/Confirm/` and `/Publish/`, links matching `/^Edit/`, and checkboxes. A "Maintainer" link matches none of them. U1's test scenarios re-assert this rather than assuming it.

### Deferred to Implementation

- Exact Tailwind utilities for the muted/separated treatment — a visual judgment better made against a rendered phone viewport than specified here.
- Whether the nav needs a visual separator (border or spacer) before the last item, or whether color de-emphasis alone reads clearly enough.

---

## Implementation Units

- U1. **Add the maintainer entry point to the public header**

**Goal:** A visitor or maintainer on any public page can reach the admin surfaces without knowing a URL, with public pages still rendering statically.

**Requirements:** R1, R7, R12, R13, R17

**Dependencies:** None

**Files:**
- Modify: `app/(public)/layout.tsx`
- Test: `e2e/public-site.spec.ts`

**Approach:**
- Add a fifth `next/link` to the header nav, last in order, labeled "Maintainer", with `href="/admin"`.
- Style it de-emphasized (`--color-muted`) rather than matching the four content links, so it reads as a separate affordance.
- Change nothing else in the file. In particular, do not import `headers`, `getSession`, or anything from `lib/auth-guard` — the absence of a session read is the property that keeps `revalidate = 3600` meaningful, and is the single most important thing a reviewer should check about this diff.

**R7 note — the nav already overflows.** `nav` is `flex gap-4` with **no** `flex-wrap`. The four existing items measure roughly 330px at `text-sm`, against ~280px of usable width on a 320px viewport (`px-5` each side). A fifth item makes an existing phone overflow decidedly worse. Add `flex-wrap` as part of this unit. This is a pre-existing R7 defect that this change would otherwise amplify; fixing it here is in scope because the plan created the pressure.

**Patterns to follow:**
- The four existing `<Link>` elements in `app/(public)/layout.tsx` for markup shape.
- `app/admin/(dashboard)/layout.tsx` for the "Maintainer" label.
- `text-muted` as used throughout the same file's footer.

**Test scenarios:**
- Happy path: a signed-out visitor on `/` sees a link named "Maintainer" in the header.
- Happy path: a signed-out visitor clicking "Maintainer" ends on `/admin/login` with the "Maintainer sign-in" heading visible — proving the `/admin` guard redirect works from a public entry.
- Happy path: an authenticated maintainer (default Playwright project) clicking "Maintainer" ends on `/admin` with the "Confirmation pass" heading visible — proving the same href serves both states.
- Happy path: the link appears on `/calendar` and `/projects` too, not just `/`, since it lives in the shared layout.
- Edge case (R7): at a 320px-wide viewport the header nav wraps rather than overflowing horizontally — assert the page does not scroll sideways.
- Integration (R1/R17): the existing "exposes no authoring or confirmation control" test still passes unchanged for a signed-out visitor.
- Integration (R13): a signed-out visitor navigating via the link reaches the login form and no further — `/admin` itself does not render dashboard content to them.

**Verification:**
- The header link is present on every public page and lands correctly in both session states.
- `app/(public)/layout.tsx` still declares `revalidate = 3600` and imports nothing from `lib/auth-guard` or `next/headers`.
- The full e2e suite passes, including the pre-existing signed-out assertions.

---

- U2. **Give the login page a way back to the public site**

**Goal:** A visitor who follows the new header link and realizes it is not for them can get back without the browser back button.

**Requirements:** R1, R17

**Dependencies:** U1

**Files:**
- Modify: `app/admin/login/page.tsx`
- Test: `e2e/public-site.spec.ts`

**Approach:**
- Add a "Back to the calendar" link to `/` on the login page.
- The page's existing copy already routes neighbors with an event to `/submit`; this covers the visitor who simply took a wrong turn and wants out. Keep both — they serve different intents.
- This unit exists because of U1. While the login page was reachable only by typing its URL, everyone arriving had meant to; once it is in the public header, arriving by accident becomes the common case and a dead-end page becomes a real defect.

**Patterns to follow:**
- The existing `/submit` anchor in `app/admin/login/page.tsx` for link styling and tone.

**Test scenarios:**
- Happy path: a signed-out visitor on `/admin/login` sees a link back to the public site and clicking it lands on `/`.
- Integration: the full path works end to end — a visitor goes `/` → "Maintainer" → `/admin/login` → back link → `/`, with no dead end and no sign-in required at any step.

**Verification:**
- A visitor can complete the round trip from the public site into the login page and back using only in-page links.

---

## System-Wide Impact

- **Rendering:** The one real blast-radius concern. `app/(public)/layout.tsx` is the shared shell for every public page; introducing a session read there would silently convert the entire public site from static to dynamic. The `/admin`-href decision exists specifically to avoid this, and U1's verification checks for it explicitly.
- **Interaction graph:** The new link depends on the `app/admin/(dashboard)/layout.tsx` redirect. That redirect's placement — login page outside the `(dashboard)` group — is load-bearing and was previously a source of a redirect loop. If it is ever restructured, this entry point is a downstream caller to re-check.
- **Search indexing:** Public pages now link into the admin surface for the first time. Page-level `robots: { index: false, follow: false }` on the login page is what keeps it unindexed.
- **Unchanged invariants:** `lib/auth.ts`, `lib/auth-guard.ts`, `lib/auth-seed.ts`, and `scripts/seed-admin.ts` are not touched. Sign-up stays disabled at the HTTP layer, `requireAdmin` still gates every mutation, and accounts still come into existence only through shell access. This plan changes who can *find* the door, not who can open it.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Visitors read the header link as "I need an account to add an event", contradicting R1/R17 | Label "Maintainer" rather than "Sign in"; place it last and de-emphasized; the login page's existing copy routes them to `/submit`. Accepted residual risk — the user chose header placement with this tradeoff stated. |
| A session read creeps into the public layout during implementation or a later change, silently ending static rendering | Called out in U1's approach and verification as the key reviewer check; the `/admin` href removes the motivation to add one. |
| The fifth nav item overflows the header on a phone (R7) | `flex-wrap` added in U1 with a 320px viewport test scenario. The overflow predates this change. |
| Linking the admin surface publicly draws automated login attempts | Better Auth's default throttle (3 attempts / 10s / IP) is already in place and documented in `lib/auth.ts` as deliberate. No new mitigation needed; do not weaken it. |

---

## Sources & References

- **Origin document:** `docs/brainstorms/2026-08-15-community-center-website-requirements.md`
- Prior plan (completed, defines R13 and U9 auth): `docs/plans/2026-08-15-001-feat-community-center-website-plan.md`
- Public shell: `app/(public)/layout.tsx`
- Dashboard guard: `app/admin/(dashboard)/layout.tsx`
- Login page: `app/admin/login/page.tsx`
- Existing signed-out coverage: `e2e/public-site.spec.ts`
