# Dorothy N. Johnson Community Center — neighborhood calendar

A public, mobile-first calendar and project gallery for the Dorothy N. Johnson
Community Center, mirroring the center's physical bulletin board.

**This is not the center's official website.** It is maintained by a
neighborhood volunteer. The physical bulletin board inside the building remains
the authoritative source, and the site links out to the city/parks page.

## Why it is built this way

Three constraints shape nearly every decision here, and knowing them makes the
code read as deliberate rather than sparse:

1. **Bus factor of one.** A single volunteer maintains this. Anything that
   needs tending — cron jobs, queues, a mail provider — is a liability, so
   there are none. Staleness is computed when a page renders, not by a
   scheduled job.
2. **An unmaintained site must degrade into an honest one.** Every event
   carries a last-confirmed date. Past the staleness window it is shown as
   unverified rather than hidden, because a visitor who sees nothing concludes
   the center is dead, while a visitor who sees "last confirmed five weeks ago"
   knows exactly what they are looking at.
3. **Vercel's Hobby tier pauses the project when a ceiling is tripped.** A
   photo-bearing site can take itself offline by being used. Images are capped
   and re-encoded at ingest, and public pages render statically.

## Stack

- Next.js (App Router) + TypeScript, deployed on Vercel
- Postgres via Drizzle ORM (no vendor-specific column types — the database
  stays portable, which is how content ownership is guaranteed)
- Better Auth for the single admin account
- Vercel Blob for images, `sharp` for processing
- Vitest for unit and integration tests, Playwright for browser tests

## Local setup

Requires Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
```

Start a local Postgres:

```bash
brew install postgresql@17
brew services start postgresql@17

createdb dnj_dev
createdb dnj_test   # the test suite truncates tables, so it gets its own
```

The test suite refuses to run if `TEST_DATABASE_URL` is unset or equal to
`DATABASE_URL` — it truncates tables, and pointing it at real content would
destroy it silently.

Apply migrations and create the one admin account:

```bash
pnpm db:migrate
pnpm seed:admin      # reads ADMIN_EMAIL / ADMIN_PASSWORD from .env.local
pnpm dev
```

There is no public registration route. `pnpm seed:admin` is the only way an
account comes into existence.

## Maintainer controls on public pages

Signed in, the maintainer sees a "Maintainer view" strip in the header on every
page, plus Edit and Confirm controls on the public event and project surfaces.
Confirming an event against the bulletin board is one tap from the page it is
listed on — no edit form, no navigation.

None of that is server-rendered. Public pages read no session, which is what
keeps them statically prerendered and read traffic off the function budget. The
chrome is assembled in the browser instead, gated on a `dnj_maintainer` cookie
written at sign-in and cleared at sign-out.

**That cookie is a rendering hint with no authority.** Its value is the literal
`1`, nothing on the server reads it, and it is deliberately not `httpOnly`
because client JavaScript is what reads it. Forging it shows a stranger some
links that redirect to `/admin/login` and a Confirm button that returns an
error, and nothing else. Every admin route is gated by the dashboard layout and
every mutation calls `requireAdmin` — see `lib/admin-hint.ts` and
`lib/auth-guard.ts`. Do not gate anything real on it.

The one request it enables is `GET /api/admin/summary`, which returns the
pending-submission count for the header badge and, by answering at all, proves
the session is still alive. A 401 expires the hint, so a cookie that outlived
its session heals on the next page load. A visitor's page issues no admin
request at all.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm test` | Unit and integration tests (needs `TEST_DATABASE_URL`) |
| `pnpm test:e2e` | Playwright browser tests |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm seed:admin` | Create or update the single admin account |

Migrations are forward-only — `drizzle-kit generate` does not emit `down` SQL.
Rolling one back means writing the reversing SQL by hand, or, for the initial
migration, dropping the schema and reapplying. At this project's size that is
the honest trade rather than maintaining paired migrations nobody runs.

## Deploying

1. Create a Vercel project pointing at this repository.
2. Attach a Postgres database and copy its **pooled** connection string into
   `DATABASE_URL`. Serverless functions exhaust a direct connection limit
   quickly.
3. Create a Blob store and copy `BLOB_READ_WRITE_TOKEN`.
4. Set every remaining variable from `.env.example`. Generate
   `BETTER_AUTH_SECRET` with `openssl rand -base64 32`, and set
   `BETTER_AUTH_URL` to the deployment's public origin.
5. Run `pnpm db:migrate` against the production database, then `pnpm seed:admin`
   once.

## Tunable constants

Both were deliberately left to be adjusted after real use rather than guessed
at up front. Each lives in exactly one place:

| Constant | Where | Current | Why it is tunable |
| --- | --- | --- | --- |
| Staleness window | `lib/freshness.ts` | 14 days | Depends on how often the maintainer actually reaches the bulletin board. Drives both the per-event unverified marking and the site-level notice. |
| Image caps | `lib/images.ts` | 1600px / 8MB | Set from the Hobby-tier ceilings and expected posting volume; retune once real flyer photos have been measured. |

## Handing this off

The site is designed to be transferred to the center without a rebuild. Nothing
is bound to the original maintainer's personal identity:

- The database is standard Postgres with no proprietary column types — dump it
  with `pg_dump` and restore anywhere.
- Images are ordinary files in blob storage.
- Every environment variable the project needs is documented in `.env.example`,
  so a new owner can stand this up without contacting anyone.

Handoff is transferring ownership of the Vercel, Postgres, and blob storage
accounts, plus this repository.

## Before going public

Set the site-identity variables. `NEXT_PUBLIC_CENTER_ADDRESS`,
`NEXT_PUBLIC_CENTER_HOURS`, and `NEXT_PUBLIC_OFFICIAL_URL` ship empty, and the
footer omits each block while its value is blank — so the address, the hours,
and the link to the city's page are simply absent until they are filled in.
Also set `NEXT_PUBLIC_SITE_TIME_ZONE` to the center's actual timezone, or every
displayed time and every repeating program will be an offset out.

Two further questions are deliberately unresolved and block launch, not
development:

- Does anyone at the center — staff, a director, the board — know that a public
  site carrying the center's name is going up? Blessing to build is not
  blessing to publish.
- Is the center a city or parks-department facility, and does the city have
  policy governing third-party use of its facilities' names online? This
  decides whether the disclaimer is sufficient or explicit permission is needed.

## Content policy

Gallery photos show spaces, structures, and work products. **No identifiable
individuals appear in v1 imagery.** The center's projects involve residents and
children, and there is no media release or consent process behind this site.
Photographs of garden beds and finished work carry the same "this place is
active" signal without needing anyone's permission.

This is a policy, not something the code enforces.
