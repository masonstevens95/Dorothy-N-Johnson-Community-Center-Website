import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../auth-guard";
import { db } from "../db";
import { projectImages, projects, type Project } from "../db/schema";
import { revalidatePublicPages } from "../events/revalidate";
import type { AuthOptions } from "../events/state";

/**
 * Project authoring. Same shape as event authoring: the gate is inside each
 * mutation, so no caller can reach a write without passing it.
 */

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, "A project name is required."),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens.")
    .optional(),
  description: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional(),
  status: z.enum(["active", "past"]).default("active"),
  coverImageId: z.uuid().nullable().optional(),
});

export type ProjectInput = z.input<typeof projectInputSchema>;

/** URL-safe slug from a project name, used when none is supplied. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Appends a counter until the slug is free. Two projects called "Garden" is a
 * realistic accident, and failing the save over it would be unhelpful.
 */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const candidate = base || "project";

  for (let suffix = 0; suffix < 100; suffix++) {
    const slug = suffix === 0 ? candidate : `${candidate}-${suffix + 1}`;

    const [existing] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, slug))
      .limit(1);

    if (!existing || existing.id === excludeId) return slug;
  }

  return `${candidate}-${Date.now()}`;
}

export async function createProject(
  input: unknown,
  { requestHeaders }: AuthOptions = {},
): Promise<Project> {
  await requireAdmin(requestHeaders);
  const parsed = projectInputSchema.parse(input);

  const slug = await uniqueSlug(parsed.slug ?? slugify(parsed.name));

  const [project] = await db
    .insert(projects)
    .values({
      name: parsed.name,
      slug,
      description: parsed.description ?? null,
      status: parsed.status,
      coverImageId: parsed.coverImageId ?? null,
    })
    .returning();

  await revalidatePublicPages(["/projects", `/projects/${project.slug}`]);
  return project;
}

export async function updateProject(
  id: string,
  input: unknown,
  { requestHeaders }: AuthOptions = {},
): Promise<Project> {
  await requireAdmin(requestHeaders);
  const parsed = projectInputSchema.parse(input);

  const slug = await uniqueSlug(parsed.slug ?? slugify(parsed.name), id);

  const [project] = await db
    .update(projects)
    .set({
      name: parsed.name,
      slug,
      description: parsed.description ?? null,
      status: parsed.status,
      coverImageId: parsed.coverImageId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();

  if (!project) throw new ProjectNotFoundError(id);

  await revalidatePublicPages(["/projects", `/projects/${project.slug}`]);
  return project;
}

export async function deleteProject(
  id: string,
  { requestHeaders }: AuthOptions = {},
): Promise<void> {
  await requireAdmin(requestHeaders);
  await db.delete(projects).where(eq(projects.id, id));
  await revalidatePublicPages(["/projects"]);
}

/**
 * Attaches an already-ingested image to a project.
 *
 * Takes an image id rather than a file: the only way to get one is through
 * lib/images.ts, so there is no gallery path that reaches storage without the
 * caps and EXIF stripping.
 */
export async function addProjectImage(
  projectId: string,
  imageId: string,
  { requestHeaders }: AuthOptions = {},
): Promise<void> {
  await requireAdmin(requestHeaders);

  const [{ nextOrder } = { nextOrder: 0 }] = await db
    .select({ nextOrder: sql<number>`coalesce(max(${projectImages.sortOrder}) + 1, 0)::int` })
    .from(projectImages)
    .where(eq(projectImages.projectId, projectId));

  await db
    .insert(projectImages)
    .values({ projectId, imageId, sortOrder: nextOrder })
    .onConflictDoNothing();

  await revalidatePublicPages(["/projects"]);
}

export async function removeProjectImage(
  projectId: string,
  imageId: string,
  { requestHeaders }: AuthOptions = {},
): Promise<void> {
  await requireAdmin(requestHeaders);

  await db
    .delete(projectImages)
    .where(
      and(
        eq(projectImages.projectId, projectId),
        eq(projectImages.imageId, imageId),
      ),
    );

  await revalidatePublicPages(["/projects"]);
}

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`No project with id ${id}.`);
    this.name = "ProjectNotFoundError";
  }
}
