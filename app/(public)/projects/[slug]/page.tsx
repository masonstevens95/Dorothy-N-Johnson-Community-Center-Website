import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectSlugs, getPublicProject } from "@/lib/projects/public-data";
import { formatEventWhen } from "@/lib/format";
import { AdminControls } from "../../admin-controls";

export async function generateStaticParams() {
  const slugs = await getProjectSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getPublicProject(slug);

  if (!detail) return { title: "Project not found" };

  return {
    title: detail.project.name,
    description: detail.project.description ?? undefined,
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getPublicProject(slug);

  if (!detail) notFound();

  const { project, images, upcoming } = detail;
  const isActive = project.status === "active";

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <p className="text-sm">
        <Link href="/projects" className="underline">
          ← Projects
        </Link>
      </p>

      <div className="mt-3 flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            isActive ? "bg-accent text-white" : "border border-line text-muted"
          }`}
        >
          {isActive ? "Active" : "Past"}
        </span>
      </div>

      {/*
        R4. Keyed by the project's id — this page is reached by slug, but the
        edit form is not. See the same note on the card in ../page.tsx.
      */}
      <AdminControls editHref={`/admin/projects/${project.id}/edit`} />

      {project.description ? (
        <p className="mt-3 whitespace-pre-line">{project.description}</p>
      ) : null}

      {/* No empty image region when a project has no photos yet. */}
      {images.length > 0 ? (
        <div className="mt-6 space-y-4">
          {images.map((image) => (
            <Image
              key={image.id}
              src={image.url}
              alt={image.altText ?? project.name}
              width={image.width}
              height={image.height}
              sizes="(max-width: 640px) 100vw, 640px"
              className="h-auto w-full rounded-lg border border-line"
            />
          ))}
        </div>
      ) : null}

      {/* R5: the cross-link. Omitted entirely rather than shown empty. */}
      {upcoming.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-base font-semibold">Coming up</h2>
          <ul className="mt-3 space-y-3">
            {upcoming.map(({ occurrence, freshness }) => (
              <li key={`${occurrence.event.id}-${occurrence.start.toISOString()}`}>
                <Link
                  href={`/events/${occurrence.event.id}`}
                  className="font-medium underline"
                >
                  {occurrence.event.title}
                </Link>
                <span className="block text-sm text-muted">
                  {formatEventWhen(occurrence.start, occurrence.end)}
                </span>
                {freshness.stale ? (
                  <span className="block text-sm text-warn">
                    Unverified — not checked against the board recently
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
