import { expect, test as setup } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, ADMIN_STATE_PATH } from "./global-setup";
import { ADMIN_HINT_COOKIE } from "../lib/admin-hint";

/**
 * Signs in once for the whole run and saves the session.
 *
 * Better Auth rate-limits sign-in to 3 attempts per 10 seconds per IP —
 * deliberate brute-force protection for a site with exactly one account, and
 * not something to weaken for tests. Signing in per test would trip it; this
 * signs in once and every authenticated test reuses the result.
 */
setup("authenticate as the maintainer", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Confirmation pass" })).toBeVisible();

  /*
   * Asserted here rather than trusted, and asserted in setup rather than in the
   * tests that depend on it.
   *
   * This runs the real login form, so the saved state picks up whatever that
   * form writes — including the maintainer hint, with no fixture of its own.
   * That is exactly why it is worth checking: if the hint ever stops being
   * written, nothing here breaks, and instead every signed-in assertion about
   * maintainer controls fails later for a reason that has nothing to do with
   * what it was testing. One obvious failure at setup beats a dozen confusing
   * ones downstream.
   */
  const cookies = await page.context().cookies();
  expect(
    cookies.find((cookie) => cookie.name === ADMIN_HINT_COOKIE)?.value,
    `the login form must write the ${ADMIN_HINT_COOKIE} hint — see lib/admin-hint.ts`,
  ).toBe("1");

  await page.context().storageState({ path: ADMIN_STATE_PATH });
});
