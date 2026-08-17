// Must come first — see the note in load-env.ts.
import "./load-env";
import { seedAdmin } from "../lib/auth-seed";
import { sql } from "../lib/db";

/**
 * The only way an account comes into existence. Run once after deploying:
 *
 *   pnpm seed:admin
 *
 * Rerunning it resets the password, which is the recovery path — there is no
 * password-reset flow, deliberately, because it would require email.
 */
async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Site maintainer";

  if (!email || !password) {
    console.error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must be set. See .env.example.",
    );
    process.exitCode = 1;
    return;
  }

  const { created } = await seedAdmin({ email, password, name });

  console.log(
    created
      ? `Created admin account for ${email}.`
      : `Admin account for ${email} already existed — password reset.`,
  );
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
