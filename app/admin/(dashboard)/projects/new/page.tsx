import { createProjectAction } from "@/app/admin/project-actions";
import { ProjectForm } from "../project-form";

export default function NewProjectPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-xl font-semibold tracking-tight">New project</h1>
      <p className="mt-2 text-sm text-muted">
        Photos can be added once the project is saved.
      </p>

      <ProjectForm action={createProjectAction} submitLabel="Create project" />
    </main>
  );
}
