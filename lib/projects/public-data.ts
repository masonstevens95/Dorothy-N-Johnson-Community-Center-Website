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
async function upcomingForProject(projectId: string, now: Date) {
  const projectEvents = await db
    .select()
    .from(events)
    .where(eq(events.state, "published"))
    .orderBy(asc(events.startsAt));

  const mine = projectEvents.filter((event) => event.projectId === projectId);
  if (mine.length === 0) return [];

  const exceptions = await db.query.eventOccurrenceExceptions.findMany();

  return expandEvents(mine, exceptions, {
    from: startOfZonedDay(now),
    to: addZonedDays(now, 120),
  }).map((occurrence) => ({
    occurrence,
    freshness: freshnessOf(occurrence.event.lastConfirmedAt, now),
  }));
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

  const summaries: ProjectSummary[] = [];

  for (const row of rows) {
    const upcoming = await upcomingForProject(row.project.id, now);
    summaries.push({
      project: row.project,
      coverImage: row.coverImage ?? null,
      upcomingCount: upcoming.length,
    });
  }

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

  return {
    project,
    images: await loadProjectImages(project.id),
    upcoming: await upcomingForProject(project.id, now),
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
