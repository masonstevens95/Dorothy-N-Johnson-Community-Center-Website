import { expect, test } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";
import { ADMIN_HINT_COOKIE } from "../lib/admin-hint";

/**
 * The flow this site exists to support: the maintainer is standing at the
 * bulletin board with a phone, and the post has to be finishable in seconds
 * (F2, AE4, AE5). Every test here runs at a phone viewport.
 *
 * The signed-in session comes from auth.setup.ts, once per run — signing in
 * per test would trip Better Auth's sign-in rate limit, which exists for good
 * reason on a site with exactly one account.
 */

/** A datetime-local value a few days out, in the browser's local terms. */
function soon(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T18:00`;
}

async function publishEvent(
  page: import("@playwright/test").Page,
  title: string,
  daysAhead: number,
) {
  await page.goto("/admin/events/new");
  await page.getByLabel("Event name").fill(title);
  await page.getByLabel("Starts").fill(soon(daysAhead));
  await page.getByRole("button", { name: "Publish event" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
}

test.describe("signed out", () => {
  // The point of these is the absence of a session, so they get a clean one.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the admin surfaces are unreachable", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);

    await page.goto("/admin/events/new");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("the login page points contributors at the public form instead", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await expect(page.getByRole("link", { name: "submission form" })).toBeVisible();
  });
});

test("publishes an event with only a name and a time (AE4)", async ({ page }) => {
  await publishEvent(page, "Saturday potluck", 3);

  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "Saturday potluck" })).toBeVisible();
});

test("refuses an event with no name", async ({ page }) => {
  await page.goto("/admin/events/new");
  await page.getByLabel("Starts").fill(soon(4));
  await page.getByRole("button", { name: "Publish event" }).click();

  // The browser's own required-field validation keeps us on the form.
  await expect(page).toHaveURL(/\/admin\/events\/new/);
});

test("confirms several events in one pass without editing them (AE5)", async ({
  page,
}) => {
  const titles = ["Bingo night", "Garden work day", "Community watch"];

  for (const [index, title] of titles.entries()) {
    await publishEvent(page, title, 5 + index);
  }

  await page.goto("/admin");
  await page.getByRole("button", { name: "Select all" }).click();

  const confirmButton = page.getByRole("button", { name: /^Confirm \d+ events?$/ });
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();

  // Every event reads as confirmed today, and no edit form was opened to do it.
  for (const title of titles) {
    const row = page.locator("li").filter({ hasText: title }).first();
    await expect(row).toContainText("Confirmed today");
  }
});

test("confirms a stale event from the public page it is listed on (R5)", async ({
  page,
}) => {
  // The single most frequent maintenance action on this site, moved to where
  // the maintainer already is. They are standing at the bulletin board with
  // /calendar open; tapping Confirm has to be the whole interaction.
  const title = `Still on the board ${Date.now()}`;
  await publishEvent(page, title, 6);

  await page.goto("/");
  const card = page.locator("article").filter({ hasText: title });
  await expect(card.getByRole("button", { name: "Confirm" })).toBeVisible();

  await card.getByRole("button", { name: "Confirm" }).click();

  // One tap and it is done. No form opened, no dialog, and the page the
  // maintainer was reading is the page they are still reading — which is the
  // property the whole freshness design rests on.
  await expect(card.getByRole("status")).toHaveText("Confirmed");
  await expect(page).toHaveURL("/");
  await expect(card.getByRole("button", { name: "Confirm" })).toHaveCount(0);
  await expect(card.getByText(/Confirmed today/)).toBeVisible();
});

test("reaches an event's edit form in one tap from a public page (R4)", async ({
  page,
}) => {
  const title = `Needs a fix ${Date.now()}`;
  await publishEvent(page, title, 7);

  // From the card on the landing page.
  await page.goto("/");
  await page
    .locator("article")
    .filter({ hasText: title })
    .getByRole("link", { name: "Edit" })
    .click();

  await expect(page).toHaveURL(/\/admin\/events\/[^/]+\/edit/);
  await expect(page.getByLabel("Event name")).toHaveValue(title);

  // And from the event's own page, which is the other place the maintainer
  // notices something is wrong.
  await page.goto("/");
  await page.locator("article").filter({ hasText: title }).locator("h3 a").click();
  await expect(page).toHaveURL(/\/events\//);

  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[^/]+\/edit/);
  await expect(page.getByLabel("Event name")).toHaveValue(title);
});

test("reaches a project's edit form from the public gallery (R4)", async ({
  page,
}) => {
  const stamp = Date.now();
  const name = `Community garden ${stamp}`;
  const slug = `garden-${stamp}`;

  await page.goto("/admin/projects/new");
  await page.getByLabel("Project name").fill(name);
  await page.getByLabel("Web address").fill(slug);
  await page.getByRole("button", { name: "Create project" }).click();
  // Landing on the edit form is how this action reports success. Asserting it
  // means a validation failure below reads as a validation failure rather than
  // as a missing card on the gallery.
  await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]{36}\/edit/);

  /*
   * The slug is set explicitly and asserted against, because the public route
   * is keyed by slug while the admin edit route is keyed by id. They are
   * different values for the same project, and a link built from the one
   * already in scope on the card looks right and 404s. This test only catches
   * that because the two genuinely differ.
   */
  await page.goto("/projects");
  const card = page.locator("article").filter({ hasText: name });
  await card.getByRole("link", { name: "Edit" }).click();

  await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]{36}\/edit/);
  await expect(page).not.toHaveURL(new RegExp(slug));
  await expect(page.getByLabel("Project name")).toHaveValue(name);

  // The detail page offers the same door onto the same form.
  await page.goto(`/projects/${slug}`);
  await page.getByRole("link", { name: "Edit" }).click();

  await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]{36}\/edit/);
  await expect(page.getByLabel("Project name")).toHaveValue(name);
});

test("offers contextual add shortcuts where they are relevant (R6)", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.getByRole("link", { name: "Add project" }).click();
  await expect(page).toHaveURL("/admin/projects/new");

  await page.goto("/calendar");
  await page.getByRole("link", { name: "Add event" }).click();
  await expect(page).toHaveURL("/admin/events/new");
});

test("leaves the submission page alone even for the maintainer", async ({
  page,
}) => {
  // R1/R17. /submit's entire job is telling a neighbor they need no account.
  // Maintainer chrome on that page of all pages would be the exact misreading
  // the rest of this design works to avoid, so it gets the shared header and
  // nothing else.
  await page.goto("/submit");

  // The shared header strip is expected — it is on every page. What must not
  // appear is anything in the page itself, so the assertions are scoped to
  // <main> rather than to the document.
  await expect(page.getByText("Maintainer view")).toBeVisible();

  const body = page.locator("main");
  await expect(body.getByRole("link", { name: /^Edit/ })).toHaveCount(0);
  await expect(body.getByRole("link", { name: /^Add / })).toHaveCount(0);
  await expect(body.getByRole("button", { name: /Confirm/ })).toHaveCount(0);
});

test("an event edited in admin keeps its identity", async ({ page }) => {
  await publishEvent(page, "Typo nite", 9);

  const editUrl = page.url().split("?")[0];

  await page.getByLabel("Event name").fill("Movie night");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");

  // Same event, edited in place — not a new row.
  expect(page.url().split("?")[0]).toBe(editUrl);
  await expect(page.getByLabel("Event name")).toHaveValue("Movie night");
});

test("a published event carries a confirmation date immediately", async ({
  page,
}) => {
  // Typing it in is confirming it — the maintainer is reading the flyer as
  // they post (R9).
  await publishEvent(page, "Story hour", 11);

  await page.goto("/admin");
  const row = page.locator("li").filter({ hasText: "Story hour" }).first();
  await expect(row).toContainText("Confirmed today");
});

test("signing out closes the admin surfaces again", async ({ browser, baseURL }) => {
  // Signs in for itself rather than using the shared session. Signing out
  // invalidates the token server-side, and the shared storageState carries
  // that same token — using it here would break every test that runs after
  // this one.
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const hint = async () =>
    (await context.cookies()).some(
      (cookie) => cookie.name === ADMIN_HINT_COOKIE,
    );

  // Signing in writes the rendering hint that puts maintainer controls on the
  // public pages; signing out has to take it away again, or the maintainer
  // keeps seeing controls that now only lead back to the login form.
  expect(await hint()).toBe(true);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);

  expect(await hint()).toBe(false);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);

  await context.close();
});

test("signing out from a public page takes the maintainer chrome with it", async ({
  browser,
  baseURL,
}) => {
  // Same reason as above for the private context: signing out invalidates the
  // token the shared storage state carries.
  //
  // The case worth its own test is that the strip is now reachable from pages
  // the sign-out button was never on before. Leaving stale chrome behind on a
  // public page would show the maintainer controls that only lead back to the
  // login form, which reads as the site being broken rather than as them being
  // signed out.
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/calendar");
  await expect(page.getByText("Maintainer view")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page.getByText("Maintainer view")).toHaveCount(0);
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === ADMIN_HINT_COOKIE,
    ),
  ).toBe(false);

  await context.close();
});
