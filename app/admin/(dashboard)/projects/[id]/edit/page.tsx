import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getPublicProject } from "@/lib/projects/public-data";
import {
  deleteProjectAction,
  removeProjectPhotoAction,
  updateProjectAction,
} from "@/app/admin/project-actions";
import { ProjectForm } from "../../project-form";
import { PhotoPolicyNotice } from "../../photo-policy";
import { PhotoUploader } from "./photo-uploader";

export default async function EditProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) notFound();

  const detail = await getPublicProject(project.slug);
  const photos = detail?.images ?? [];

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Edit project</h1>

      {saved ? (
        <p role="status" className="mt-3 rounded-lg border border-line p-3 text-sm">
          Saved.{" "}
          <Link href={`/projects/${project.slug}`} className="underline">
            View it on the site
          </Link>
        </p>
      ) : null}

      <ProjectForm
        action={updateProjectAction}
        submitLabel="Save changes"
        values={{
          id: project.id,
          name: project.name,
          slug: project.slug,
          description: project.description,
          status: project.status,
        }}
      />

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="text-base font-semibold">Photos</h2>

        <div className="mt-3">
          <PhotoPolicyNotice />
        </div>

        {photos.length > 0 ? (
          <ul className="mt-4 space-y-4">
            {photos.map((image) => (
              <li key={image.id} className="rounded-lg border border-line p-3">
                <Image
                  src={image.url}
                  alt={image.altText ?? project.name}
                  width={image.width}
                  height={image.height}
                  sizes="(max-width: 640px) 100vw, 640px"
                  className="h-auto w-full rounded"
                />
                <form action={removeProjectPhotoAction} className="mt-2">
                  <input type="hidden" name="id" value={project.id} />
                  <input type="hidden" name="imageId" value={image.id} />
                  <button type="submit" className="text-sm text-warn underline">
                    Remove this photo
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}

        <PhotoUploader projectId={project.id} />
      </section>

      <form action={deleteProjectAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={project.id} />
        <button type="submit" className="text-sm text-warn underline">
          Delete this project
        </button>
      </form>
    </main>
  );
}
