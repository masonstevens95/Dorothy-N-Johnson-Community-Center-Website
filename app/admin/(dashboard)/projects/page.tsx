import Link from "next/link";
import { getPublicProjects } from "@/lib/projects/public-data";

export default async function AdminProjectsPage() {
  const projects = await getPublicProjects();

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        <Link href="/admin/projects/new" className="text-sm underline">
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          No projects yet. The garden, the community watch, a mural — anything
          with a history worth showing.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line">
          {projects.map(({ project, upcomingCount }) => (
            <li key={project.id} className="flex items-center justify-between gap-3 p-4">
              <span className="min-w-0">
                <Link
                  href={`/admin/projects/${project.id}/edit`}
                  className="font-medium underline"
                >
                  {project.name}
                </Link>
                <span className="block text-sm text-muted">
                  {project.status === "active" ? "Active" : "Past"}
                  {upcomingCount > 0
                    ? ` · ${upcomingCount} upcoming ${upcomingCount === 1 ? "event" : "events"}`
                    : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
