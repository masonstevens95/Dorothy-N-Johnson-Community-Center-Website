import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { UnauthorizedError } from "@/lib/auth-guard";
import {
  addProjectImage,
  createProject,
  deleteProject,
  removeProjectImage,
  slugify,
  updateProject,
} from "@/lib/projects/state";
import {
  getProjectSlugs,
  getPublicProject,
  getPublicProjects,
} from "@/lib/projects/public-data";
import { createEvent } from "@/lib/events/state";
import { events, images, projects } from "@/lib/db/schema";
import {
  closeTestDatabase,
  db,
  setupTestDatabase,
  truncateAll,
} from "./helpers/db";
import { noSession, seedAndSignIn } from "./helpers/auth";
import { makeStoredImage } from "./helpers/fixtures";

let adminHeaders: Headers;

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await truncateAll();
  adminHeaders = await seedAndSignIn();
});

afterAll(async () => {
  await closeTestDatabase();
});

const auth_ = () => ({ requestHeaders: adminHeaders });
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);

describe("slugify", () => {
  it("makes a URL-safe slug from a name", () => {
    expect(slugify("Community Garden")).toBe("community-garden");
    expect(slugify("  Mural (2026)!  ")).toBe("mural-2026");
  });
});

describe("creating projects", () => {
  it("defaults to active and derives a slug", async () => {
    const project = await createProject({ name: "Community Garden" }, auth_());

    expect(project.status).toBe("active");
    expect(project.slug).toBe("community-garden");
  });

  it("keeps two projects with the same name apart", async () => {
    const first = await createProject({ name: "Garden" }, auth_());
    const second = await createProject({ name: "Garden" }, auth_());

    expect(first.slug).toBe("garden");
    expect(second.slug).toBe("garden-2");
  });

  it("rejects a blank name", async () => {
    await expect(createProject({ name: "  " }, auth_())).rejects.toThrow(
      /name is required/i,
    );
  });

  it("keeps its own slug when updated without changing the name", async () => {
    const project = await createProject({ name: "Garden" }, auth_());

    const updated = await updateProject(
      project.id,
      { name: "Garden", status: "past" },
      auth_(),
    );

    // Not "garden-2" — a project must not collide with itself and change URL
    // every time it is saved.
    expect(updated.slug).toBe("garden");
    expect(updated.status).toBe("past");
  });
});

describe("active and past (R5)", () => {
  it("reports each project's status and lists active ones first", async () => {
    await createProject({ name: "Old mural", status: "past" }, auth_());
    await createProject({ name: "Community garden", status: "active" }, auth_());

    const listed = await getPublicProjects();

    expect(listed.map((item) => item.project.status)).toEqual(["active", "past"]);
    expect(listed[0].project.name).toBe("Community garden");
  });

  it("moves a project from active to past without any other change", async () => {
    const project = await createProject(
      { name: "Garden", description: "Raised beds by the fence." },
      auth_(),
    );

    const updated = await updateProject(
      project.id,
      { name: "Garden", description: "Raised beds by the fence.", status: "past" },
      auth_(),
    );

    expect(updated.status).toBe("past");
    expect(updated.description).toBe("Raised beds by the fence.");
  });
});

describe("cross-linking with events (R5)", () => {
  it("lists a project's upcoming events", async () => {
    const project = await createProject({ name: "Community garden" }, auth_());

    await createEvent(
      { title: "Work day", startsAt: inDays(3), projectId: project.id },
      auth_(),
    );
    await createEvent({ title: "Unrelated bingo", startsAt: inDays(4) }, auth_());

    const detail = await getPublicProject(project.slug);

    expect(detail!.upcoming).toHaveLength(1);
    expect(detail!.upcoming[0].occurrence.event.title).toBe("Work day");
  });

  it("does not surface a project's pending events", async () => {
    // A submission attached to a project must not appear on the project page
    // either (R18).
    const project = await createProject({ name: "Community garden" }, auth_());

    await createEvent(
      { title: "Submitted work day", startsAt: inDays(3), projectId: project.id },
      { ...auth_(), publish: false },
    );

    const detail = await getPublicProject(project.slug);
    expect(detail!.upcoming).toEqual([]);
  });

  it("reports no upcoming events for a finished project", async () => {
    const project = await createProject(
      { name: "Old mural", status: "past" },
      auth_(),
    );

    const detail = await getPublicProject(project.slug);
    const [summary] = await getPublicProjects();

    expect(detail!.upcoming).toEqual([]);
    expect(summary.upcomingCount).toBe(0);
  });

  it("counts a recurring project event on each of its dates", async () => {
    const project = await createProject({ name: "Community garden" }, auth_());

    await createEvent(
      {
        title: "Weekly work day",
        startsAt: inDays(2),
        projectId: project.id,
        recurrenceFrequency: "weekly",
      },
      auth_(),
    );

    const detail = await getPublicProject(project.slug);
    expect(detail!.upcoming.length).toBeGreaterThan(1);
  });
});

describe("project photos", () => {
  it("renders a project with no photos as simply having none", async () => {
    const project = await createProject({ name: "Community garden" }, auth_());
    const detail = await getPublicProject(project.slug);

    expect(detail!.images).toEqual([]);
  });

  it("attaches photos in the order they were added", async () => {
    const project = await createProject({ name: "Community garden" }, auth_());

    const first = await makeStoredImage("projects");
    const second = await makeStoredImage("projects");

    await addProjectImage(project.id, first.id, auth_());
    await addProjectImage(project.id, second.id, auth_());

    const detail = await getPublicProject(project.slug);

    expect(detail!.images.map((image) => image.id)).toEqual([first.id, second.id]);
  });

  it("stores gallery photos through the ingest pipeline", async () => {
    // No gallery-specific upload path exists, so the caps and EXIF stripping
    // apply here exactly as they do to a flyer.
    const project = await createProject({ name: "Community garden" }, auth_());
    const photo = await makeStoredImage("projects");
    await addProjectImage(project.id, photo.id, auth_());

    const [stored] = await db.select().from(images).where(eq(images.id, photo.id));

    expect(stored.contentType).toBe("image/webp");
    expect(Math.max(stored.width, stored.height)).toBeLessThanOrEqual(1600);
  });

  it("ignores a photo added twice", async () => {
    const project = await createProject({ name: "Community garden" }, auth_());
    const photo = await makeStoredImage("projects");

    await addProjectImage(project.id, photo.id, auth_());
    await addProjectImage(project.id, photo.id, auth_());

    const detail = await getPublicProject(project.slug);
    expect(detail!.images).toHaveLength(1);
  });

  it("removes a photo from a project", async () => {
    const project = await createProject({ name: "Community garden" }, auth_());
    const photo = await makeStoredImage("projects");

    await addProjectImage(project.id, photo.id, auth_());
    await removeProjectImage(project.id, photo.id, auth_());

    const detail = await getPublicProject(project.slug);
    expect(detail!.images).toEqual([]);
  });
});

describe("project lookup", () => {
  it("returns null for an unknown slug", async () => {
    expect(await getPublicProject("no-such-project")).toBeNull();
  });

  it("lists slugs for static generation", async () => {
    await createProject({ name: "Community garden" }, auth_());
    await createProject({ name: "Community watch" }, auth_());

    expect((await getProjectSlugs()).sort()).toEqual([
      "community-garden",
      "community-watch",
    ]);
  });

  it("leaves a deleted project's events in place", async () => {
    // Deleting a project must not take the events with it — the event still
    // happened, it just no longer belongs to a project.
    const project = await createProject({ name: "Community garden" }, auth_());
    await createEvent(
      { title: "Work day", startsAt: inDays(3), projectId: project.id },
      auth_(),
    );

    await deleteProject(project.id, auth_());

    const remaining = await db.select().from(events);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].projectId).toBeNull();
  });
});

describe("project authoring is behind the write gate (R13)", () => {
  const unauthenticated = noSession();

  it("refuses to create, update, or delete", async () => {
    await expect(
      createProject({ name: "Sneaky" }, unauthenticated),
    ).rejects.toThrow(UnauthorizedError);

    const project = await createProject({ name: "Real" }, auth_());

    await expect(
      updateProject(project.id, { name: "Hacked" }, unauthenticated),
    ).rejects.toThrow(UnauthorizedError);
    await expect(deleteProject(project.id, unauthenticated)).rejects.toThrow(
      UnauthorizedError,
    );

    const stored = await db.select().from(projects);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Real");
  });

  it("refuses to add or remove photos", async () => {
    const project = await createProject({ name: "Real" }, auth_());
    const photo = await makeStoredImage("projects");

    await expect(
      addProjectImage(project.id, photo.id, unauthenticated),
    ).rejects.toThrow(UnauthorizedError);

    await addProjectImage(project.id, photo.id, auth_());

    await expect(
      removeProjectImage(project.id, photo.id, unauthenticated),
    ).rejects.toThrow(UnauthorizedError);

    const detail = await getPublicProject(project.slug);
    expect(detail!.images).toHaveLength(1);
  });
});
