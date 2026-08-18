/**
 * Public pages are statically rendered and revalidated on write, which is what
 * keeps read traffic off the function budget while still reflecting a change
 * the moment the maintainer makes one.
 */
export const PUBLIC_EVENT_PATHS = ["/", "/calendar"];

/**
 * next/cache is only callable inside a request scope. Tests and the seeding
 * script mutate the same tables outside one, so the import is deferred and
 * skipped when there is no Next.js runtime rather than wrapped in a catch that
 * would also swallow real revalidation failures in production.
 */
export async function revalidatePublicPages(extraPaths: string[] = []): Promise<void> {
  if (!process.env.NEXT_RUNTIME) return;

  const { revalidatePath } = await import("next/cache");

  for (const path of [...PUBLIC_EVENT_PATHS, ...extraPaths]) {
    revalidatePath(path);
  }
}
