import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPublicProjects } from "@/lib/projects/public-data";
import { AdminControls, AdminShortcut } from "../admin-controls";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Active and past projects at the community center — the garden, the community watch, and the work that has happened here.",
};

/**
 * R5. The gallery answers a different question from the calendar: not "what is
 * on this week" but "is this place alive, and has it been for a while".
 *
 * Active and past are marked, not merely ordered. Sort order is invisible to
 * someone skimming one card, and a past project mistaken for a current one
 * sends a newcomer looking for something that ended years ago.
 */
export default async function ProjectsPage() {
  const projects = await getPublicProjects();

  const active = projects.filter((item) => item.project.status === "active");
  const past = projects.filter((item) => item.project.status === "past");

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Projects</h1>

      {/*
        R6. Contextual to the page rather than in the header, because "add one
        of these" only makes sense while looking at the list of these. Outside
        the empty check on purpose: an empty gallery is exactly when the
        maintainer most wants it, and a visitor still sees nothing but the
        empty-state copy below.
      */}
      <AdminShortcut href="/admin/projects/new" label="Add project" />

      {projects.length === 0 ? (
        <p className="mt-6 rounded-lg border border-line bg-white p-5 text-sm text-muted">
          No projects have been added yet.
        </p>
      ) : null}

      {active.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
            Happening now
          </h2>
          <div className="mt-3 space-y-5">
            {active.map((item) => (
              <ProjectCard key={item.project.id} {...item} />
            ))}
          </div>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Finished
          </h2>
          <div className="mt-3 space-y-5">
            {past.map((item) => (
              <ProjectCard key={item.project.id} {...item} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ProjectCard({
  project,
  coverImage,
  upcomingCount,
}: Awaited<ReturnType<typeof getPublicProjects>>[number]) {
  const isActive = project.status === "active";

  return (
    <article
      className={`rounded-lg border p-4 ${
        isActive ? "border-accent/40 bg-white" : "border-line bg-transparent"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold">
          <Link href={`/projects/${project.slug}`} className="hover:underline">
            {project.name}
          </Link>
        </h3>
        {/* Stated in words as well as styled — colour alone is not a label. */}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            isActive ? "bg-accent text-white" : "border border-line text-muted"
          }`}
        >
          {isActive ? "Active" : "Past"}
        </span>
      </div>

      {project.description ? (
        <p className="mt-2 text-sm">{project.description}</p>
      ) : null}

      {coverImage ? (
        <Link href={`/projects/${project.slug}`} className="mt-3 block">
          <Image
            src={coverImage.url}
            alt={coverImage.altText ?? project.name}
            width={coverImage.width}
            height={coverImage.height}
            sizes="(max-width: 640px) 100vw, 640px"
            className="h-auto w-full rounded-lg border border-line"
          />
        </Link>
      ) : null}

      {upcomingCount > 0 ? (
        <p className="mt-3 text-sm">
          <Link href={`/projects/${project.slug}`} className="underline">
            {upcomingCount} upcoming {upcomingCount === 1 ? "event" : "events"}
          </Link>
        </p>
      ) : null}

      {/*
        R4. Keyed by id, not by slug — this public route is /projects/[slug]
        but the edit form is /admin/projects/[id]/edit, and the two are
        different values for the same project. Reaching for `project.slug`
        here, which is the one already in scope for every other link on this
        card, produces a link that looks right and 404s.

        No confirm control: projects are not checked against the bulletin
        board, so there is nothing here for one to mean.
      */}
      <AdminControls editHref={`/admin/projects/${project.id}/edit`} />
    </article>
  );
}
