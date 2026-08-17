import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  events,
  images,
  projectImages,
  projects,
  type Image,
  type Project,
} from "../db/schema";
import { expandEvents, type Occurrence } from "../events/recurrence";
import { freshnessOf, type Freshness } from "../freshness";
import { addZonedDays, startOfZonedDay } from "../time";

export interface ProjectSummary {
  project: Project;
  coverImage: Image | null;
  upcomingCount: number;
}

export interface ProjectDetail {
  project: Project;
  images: Image[];
  /** R5: a project lists its upcoming events, and they link back. */
  upcoming: { occurrence: Occurrence; freshness: Freshness }[];
}

async function loadProjectImages(projectId: string): Promise<Image[]> {
  const rows = await db
    .select({ image: images })
    .from(projectImages)
    .innerJoin(images, eq(projectImages.imageId, images.id))
    .where(eq(projectImages.projectId, projectId))
    .orderBy(asc(projectImages.sortOrder));

  return rows.map((row) => row.image);
}

/**
 * Upcoming published occurrences belonging to a project.
 *
 * Filtered to published like every other public read — a pending submission
 * attached to a project must not surface on the project page either.
 */
type UpcomingByProject = Map<string, ProjectDetail["upcoming"]>;

/**
 * Every project's upcoming occurrences, in two queries total.
 *
 * Loading per project meant re-reading every published event and every
 * exception once per project — the gallery's cost grew with the square of the
 * content. Expanding once and grouping keeps it linear.
 */
async function loadUpcomingByProject(now: Date): Promise<UpcomingByProject> {
  const publishedWithProject = (
    await db
      .select()
      .from(events)
      .where(eq(events.state, "published"))
      .orderBy(asc(events.startsAt))
  ).filter((event) => event.projectId !== null);

  const byProject: UpcomingByProject = new Map();
  if (publishedWithProject.length === 0) return byProject;

  const exceptions = await db.query.eventOccurrenceExceptions.findMany();

  const occurrences = expandEvents(publishedWithProject, exceptions, {
    from: startOfZonedDay(now),
    to: addZonedDays(now, 120),
  });

  for (const occurrence of occurrences) {
    const projectId = occurrence.event.projectId!;
    const entry = {
      occurrence,
      freshness: freshnessOf(occurrence.event.lastConfirmedAt, now),
    };

    const existing = byProject.get(projectId);
    if (existing) existing.push(entry);
    else byProject.set(projectId, [entry]);
  }

  return byProject;
}

/**
 * All projects, active first.
 *
 * Order is not the mechanism that communicates status — the pages mark active
 * and past distinctly, because a newcomer's question is "is this place alive
 * right now" and the answer has to survive being skimmed.
 */
export async function getPublicProjects(
  now: Date = new Date(),
): Promise<ProjectSummary[]> {
  const rows = await db
    .select({ project: projects, coverImage: images })
    .from(projects)
    .leftJoin(images, eq(projects.coverImageId, images.id))
    .orderBy(asc(projects.name));

  const upcomingByProject = await loadUpcomingByProject(now);

  const summaries: ProjectSummary[] = rows.map((row) => ({
    project: row.project,
    coverImage: row.coverImage ?? null,
    upcomingCount: upcomingByProject.get(row.project.id)?.length ?? 0,
  }));

  return summaries.sort((a, b) => {
    if (a.project.status !== b.project.status) {
      return a.project.status === "active" ? -1 : 1;
    }
    return a.project.name.localeCompare(b.project.name);
  });
}

export async function getPublicProject(
  slug: string,
  now: Date = new Date(),
): Promise<ProjectDetail | null> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);

  if (!project) return null;

  const [projectImageList, upcomingByProject] = await Promise.all([
    loadProjectImages(project.id),
    loadUpcomingByProject(now),
  ]);

  return {
    project,
    images: projectImageList,
    upcoming: upcomingByProject.get(project.id) ?? [],
  };
}

export async function getProjectSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: projects.slug }).from(projects);
  return rows.map((row) => row.slug);
}

/** Projects an event can be attached to, for the authoring form. */
export async function getProjectOptions(): Promise<Project[]> {
  return db.select().from(projects).orderBy(asc(projects.name));
}
