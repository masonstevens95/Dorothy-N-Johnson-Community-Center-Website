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

/** The site's own navigation, as opposed to the maintainer-mode strip below it. */
function siteNav(page: import("@playwright/test").Page) {
  return page.locator("header nav").first();
}

const VISITOR_NAV = [/What.s on/, /^Calendar$/, /^Projects$/, /^Add an event$/];

test("the maintainer keeps the site's own navigation inside the admin shell", async ({
  page,
}) => {
  // R3. One header, both shells: the same buttons the maintainer had on the
  // public pages are still there while they work.
  await page.goto("/admin");

  for (const name of VISITOR_NAV) {
    await expect(siteNav(page).getByRole("link", { name })).toBeVisible();
  }

  // The door to the room they are standing in is noise, so it is not offered.
  await expect(
    siteNav(page).getByRole("link", { name: "Maintainer", exact: true }),
  ).toHaveCount(0);
});

test("the admin shell fits a narrow phone too", async ({ page }) => {
  // R7. The shared header now carries more on admin routes than it used to.
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/admin");

  const overflows = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test("the maintainer link goes straight to the dashboard when signed in", async ({
  page,
}) => {
  // The same static href that sends a visitor to the login form has to send
  // the maintainer to the work — that is what buys a session-free public
  // layout, so both halves are asserted.
  await page.goto("/");
  await page.getByRole("link", { name: "Maintainer", exact: true }).click();

  await expect(page).toHaveURL("/admin");
  await expect(
    page.getByRole("heading", { name: "Confirmation pass" }),
  ).toBeVisible();
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

  test("every public page offers the maintainer entry point", async ({ page }) => {
    // It lives in the shared layout, so it is on all of them or none.
    for (const path of ["/", "/calendar", "/projects"]) {
      await page.goto(path);

      await expect(
        page.getByRole("link", { name: "Maintainer", exact: true }),
      ).toBeVisible();
    }
  });

  test("following the maintainer link reaches the sign-in page and no further", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Maintainer", exact: true }).click();

    // The href is /admin; the dashboard guard is what turns that into the
    // login page for a visitor without a session (R13).
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(
      page.getByRole("heading", { name: "Maintainer sign-in" }),
    ).toBeVisible();

    // Nothing from behind the guard leaked on the way.
    await expect(
      page.getByRole("heading", { name: "Confirmation pass" }),
    ).toHaveCount(0);
  });

  test("a visitor who took the wrong turn can get back without the back button", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Maintainer", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/login/);

    await page.getByRole("link", { name: /Back to what.s on/ }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: /What.s on/ })).toBeVisible();
  });

  test("the header marks the page you are on and only that page", async ({
    page,
  }) => {
    // R7. The active marker arrives at hydration; what it must never do is
    // claim two pages at once.
    await page.goto("/calendar");

    await expect(
      siteNav(page).getByRole("link", { name: "Calendar", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    await expect(
      siteNav(page).locator('[aria-current="page"]'),
    ).toHaveCount(1);
  });

  test("the header reads without JavaScript, minus the active marker", async ({
    browser,
    baseURL,
  }) => {
    // The nav is server-rendered markup; only NavLink's current-page marker
    // needs the client. Every destination has to stay reachable without it.
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/calendar");

    for (const name of VISITOR_NAV) {
      await expect(siteNav(page).getByRole("link", { name })).toBeVisible();
    }
    await expect(
      siteNav(page).getByRole("link", { name: "Maintainer", exact: true }),
    ).toBeVisible();

    await context.close();
  });

  test("the header wraps rather than overflowing on a narrow phone", async ({
    page,
  }) => {
    // R7. 320px is the narrowest phone still in use, and the fifth nav item
    // is what pushed the existing row past it.
    await page.setViewportSize({ width: 320, height: 800 });

    for (const path of ["/", "/calendar", "/projects"]) {
      await page.goto(path);

      await expect(
        page.getByRole("link", { name: "Maintainer", exact: true }),
      ).toBeVisible();

      const overflows = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflows).toBe(false);
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

  test("the upload endpoint refuses an unauthenticated post", async ({ request }) => {
    // Storage is the resource that can take this site offline by being filled,
    // so the upload path must reject before it processes anything.
    const response = await request.post("/api/upload", {
      multipart: {
        file: {
          name: "flyer.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]),
        },
      },
    });

    expect(response.status()).toBe(401);
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
