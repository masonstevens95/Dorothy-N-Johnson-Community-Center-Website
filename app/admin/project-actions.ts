"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addProjectImage,
  createProject,
  deleteProject,
  removeProjectImage,
  updateProject,
} from "@/lib/projects/state";
import { ingestImage } from "@/lib/images";
import {
  readOptionalText,
  requireAdminAction,
  toActionState,
  type ActionState,
} from "./form-helpers";

function readForm(formData: FormData) {
  const text = (key: string) => readOptionalText(formData, key);

  return {
    name: (formData.get("name") as string | null) ?? "",
    slug: text("slug") ?? undefined,
    description: text("description"),
    status: (text("status") ?? "active") as "active" | "past",
  };
}

export async function createProjectAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let id: string;

  try {
    const project = await createProject(readForm(formData));
    id = project.id;
  } catch (error) {
    return toActionState(error);
  }

  redirect(`/admin/projects/${id}/edit?saved=1`);
}

export async function updateProjectAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");

  if (typeof id !== "string") {
    return { error: "That project could not be found." };
  }

  try {
    await updateProject(id, readForm(formData));
  } catch (error) {
    return toActionState(error);
  }

  redirect(`/admin/projects/${id}/edit?saved=1`);
}

/**
 * Photos go through the same ingest path as everything else — resized, capped,
 * and EXIF-stripped. There is no gallery-specific upload route (R5a, U4).
 */
export async function addProjectPhotoAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Before the upload is processed — see the note in form-helpers.ts.
  await requireAdminAction();

  const id = formData.get("id");
  const file = formData.get("photo");

  if (typeof id !== "string") {
    return { error: "That project could not be found." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo to add." };
  }

  try {
    const image = await ingestImage(file, {
      altText: readOptionalText(formData, "altText"),
      keyPrefix: "projects",
    });

    await addProjectImage(id, image.id);
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath(`/admin/projects/${id}/edit`);
  return {};
}

export async function removeProjectPhotoAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const imageId = formData.get("imageId");

  if (typeof id !== "string" || typeof imageId !== "string") return;

  await removeProjectImage(id, imageId);
  revalidatePath(`/admin/projects/${id}/edit`);
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  await deleteProject(id);
  redirect("/admin/projects");
}
