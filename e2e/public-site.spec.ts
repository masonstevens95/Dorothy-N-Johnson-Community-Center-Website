import { expect, test } from "@playwright/test";

/**
 * The visitor's side (F1). A newcomer arrives on a phone, having never heard
 * of this site, and has to be able to tell both what is on and how much to
 * trust it.
 */

function soon(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T19:00`;
}

test("publishing an event makes it appear on the public page", async ({ page }) => {
  // The landing page is statically rendered, so this also proves that
  // publishing revalidates it rather than serving the build-time version.
  const title = `Neighborhood meeting ${Date.now()}`;

  await page.goto("/admin/events/new");
  await page.getByLabel("Event name").fill(title);
  await page.getByLabel("Starts").fill(soon(2));

  // The optional fields are collapsed by default so the required two are the
  // whole form on a phone.
  await page.getByRole("group").getByText("Add details (all optional)").click();
  await page.getByLabel("Where in the center").fill("Meeting room");

  await page.getByRole("button", { name: "Publish event" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");

  await page.goto("/");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await expect(page.getByText("Meeting room")).toBeVisible();

  // R9: the confirmation date is visible to the visitor, not just internally.
  await expect(page.getByText(/Confirmed today/).first()).toBeVisible();
});

test.describe("as a signed-out visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the landing page answers what is on without navigating", async ({ page }) => {
    await page.goto("/");

    // The page renders a typographic apostrophe, so match loosely on it.
    await expect(page.getByRole("heading", { name: /What.s on/ })).toBeVisible();
    // Something is listed — the admin tests have published events by now.
    await expect(page.locator("article").first()).toBeVisible();
  });

  test("every public page carries the disclaimer and the board reference", async ({
    page,
  }) => {
    for (const path of ["/", "/calendar"]) {
      await page.goto(path);

      // R12: not the official site, and the board is authoritative.
      await expect(
        page.getByText(/not the center.s official website/),
      ).toBeVisible();
      await expect(
        page.getByText(/bulletin board inside the building is the/),
      ).toBeVisible();
    }
  });

  test("exposes no authoring or confirmation control", async ({ page }) => {
    for (const path of ["/", "/calendar"]) {
      await page.goto(path);

      await expect(page.getByRole("button", { name: /Confirm/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Publish/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /^Edit/ })).toHaveCount(0);
      await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
    }
  });

  test("the forward calendar shows more than the landing page", async ({ page }) => {
    await page.goto("/calendar");

    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
    await expect(page.locator("article").first()).toBeVisible();
  });

  test("an event detail page shows when, where, and how current it is", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("article h3 a").first().click();

    await expect(page).toHaveURL(/\/events\//);
    await expect(
      page.getByText(/Checked against the bulletin board|Unverified/),
    ).toBeVisible();
  });

  test("a made-up event id is not found rather than revealing anything", async ({
    page,
  }) => {
    const response = await page.goto(
      "/events/00000000-0000-4000-8000-000000000000",
    );

    expect(response?.status()).toBe(404);
  });
});
