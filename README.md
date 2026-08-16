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
docker run -d --name dnj-postgres \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=dnj_dev \
  -p 5433:5432 postgres:16-alpine

# the test suite truncates tables, so it gets its own database
docker exec dnj-postgres psql -U postgres -c 'CREATE DATABASE dnj_test;'
```

Apply migrations and create the one admin account:

```bash
pnpm db:migrate
pnpm seed:admin      # reads ADMIN_EMAIL / ADMIN_PASSWORD from .env.local
pnpm dev
```

There is no public registration route. `pnpm seed:admin` is the only way an
account comes into existence.

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

Two questions are deliberately unresolved and block launch, not development:

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
