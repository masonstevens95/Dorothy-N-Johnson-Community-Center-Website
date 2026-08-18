import { expect, test } from "@playwright/test";

/**
 * F3: a program director who has not asked for software, will not learn an
 * admin tool, and has no account gets an event listed anyway — and the
 * maintainer keeps editorial control.
 */

function soon(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T17:30`;
}

const submittedTitle = `Watch meeting ${Date.now()}`;

/**
 * Submits as a stranger from a fresh context.
 *
 * A new context does not inherit baseURL or the signed-in state, so both are
 * passed explicitly — the whole point is that this visitor has no session.
 */
async function submitAnonymously(
  browser: import("@playwright/test").Browser,
  baseURL: string,
  title: string,
  daysAhead: number,
) {
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const visitor = await context.newPage();

  await visitor.goto("/submit");
  await visitor.getByLabel(/What is it/).fill(title);
  await visitor.getByLabel(/When/).fill(soon(daysAhead));
  await visitor.getByRole("button", { name: "Send it in" }).click();
  await expect(visitor.getByRole("status")).toContainText("Thank you");

  await context.close();
}

test.describe("as a neighbor with no account", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("submits an event and it does not appear publicly (AE3)", async ({ page }) => {
    await page.goto("/submit");

    // No sign-in anywhere in this flow.
    await expect(page.getByText("No account needed")).toBeVisible();

    await page.getByLabel(/What is it/).fill(submittedTitle);
    await page.getByLabel(/When/).fill(soon(12));
    await page.getByRole("button", { name: "Send it in" }).click();

    await expect(page.getByRole("status")).toContainText("Thank you");

    // Reloading the public calendar does not show it (R18).
    await page.goto("/");
    await expect(page.getByRole("link", { name: submittedTitle })).toHaveCount(0);

    await page.goto("/calendar");
    await expect(page.getByRole("link", { name: submittedTitle })).toHaveCount(0);
  });

  test("the form requires only a name and a time", async ({ page }) => {
    await page.goto("/submit");

    await page.getByLabel(/What is it/).fill(`Bare minimum ${Date.now()}`);
    await page.getByLabel(/When/).fill(soon(13));
    await page.getByRole("button", { name: "Send it in" }).click();

    await expect(page.getByRole("status")).toContainText("Thank you");
  });

  test("the submission queue is not reachable", async ({ page }) => {
    await page.goto("/admin/queue");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test("the maintainer sees the submission in the queue and can approve it", async ({
  page,
}) => {
  await page.goto("/admin/queue");

  const row = page.locator("li").filter({ hasText: submittedTitle }).first();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Approve" }).click();

  // Wait for the queue to actually lose the row. Navigating straight away
  // would race the action's revalidation of the public pages.
  await expect(page.locator("li").filter({ hasText: submittedTitle })).toHaveCount(0);

  // Now, and only now, it is public.
  await page.goto("/");
  await expect(page.getByRole("link", { name: submittedTitle })).toBeVisible();
});

test("a submission corrected in the queue publishes in its corrected form (AE6)", async ({
  page,
  browser,
  baseURL,
}) => {
  const wrong = `Potluck wrong time ${Date.now()}`;
  const right = `Potluck corrected ${Date.now()}`;

  // Arrive as a stranger to submit, then return as the maintainer.
  await submitAnonymously(browser, baseURL!, wrong, 14);

  await page.goto("/admin/queue");
  const row = page.locator("li").filter({ hasText: wrong }).first();
  await row.getByRole("link", { name: "Fix, then approve" }).click();

  // The ordinary edit form, not a separate moderation editor.
  await page.getByLabel("Event name").fill(right);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");

  await page.getByRole("button", { name: "Approve and publish" }).click();

  // The pending panel disappears once it is published — wait for that rather
  // than racing the revalidation.
  await expect(page.getByText("This is a submitted event.")).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByRole("link", { name: right })).toBeVisible();
  // The original wording was never public.
  await expect(page.getByRole("link", { name: wrong })).toHaveCount(0);
});

test("a rejected submission never becomes visible", async ({
  page,
  browser,
  baseURL,
}) => {
  const doomed = `Spam event ${Date.now()}`;

  await submitAnonymously(browser, baseURL!, doomed, 15);

  await page.goto("/admin/queue");
  const row = page.locator("li").filter({ hasText: doomed }).first();
  await row.getByRole("button", { name: "Reject" }).click();

  // Gone from the queue, and never anywhere else.
  await expect(page.locator("li").filter({ hasText: doomed })).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByRole("link", { name: doomed })).toHaveCount(0);

  await page.goto("/calendar");
  await expect(page.getByRole("link", { name: doomed })).toHaveCount(0);
});
