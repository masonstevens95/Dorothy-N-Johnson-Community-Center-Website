import { expect, test as setup } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, ADMIN_STATE_PATH } from "./global-setup";

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

  await page.context().storageState({ path: ADMIN_STATE_PATH });
});
