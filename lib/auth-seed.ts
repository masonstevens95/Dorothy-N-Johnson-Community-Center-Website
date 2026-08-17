import { auth } from "./auth";

export interface SeedAdminInput {
  email: string;
  password: string;
  name?: string;
}

export interface SeedAdminResult {
  userId: string;
  created: boolean;
}

/**
 * Creates the single admin account, or resets its password if it already
 * exists.
 *
 * This is the only path to an account. The HTTP sign-up route is disabled
 * (see lib/auth.ts), so account creation requires shell access to the
 * deployment — which is the actual security property R13 asks for, rather
 * than a route that merely isn't linked.
 *
 * Idempotent on purpose: with no password-reset flow, rerunning this script is
 * how a forgotten password gets recovered, so a second run has to reset the
 * password rather than fail on a duplicate email.
 */
export async function seedAdmin({
  email,
  password,
  name = "Site maintainer",
}: SeedAdminInput): Promise<SeedAdminResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("An admin email is required.");
  }

  const ctx = await auth.$context;
  const minLength = ctx.password.config.minPasswordLength;

  if (password.length < minLength) {
    throw new Error(`The admin password must be at least ${minLength} characters.`);
  }

  const hash = await ctx.password.hash(password);
  const existing = await ctx.internalAdapter.findUserByEmail(normalizedEmail);

  if (existing) {
    await ctx.internalAdapter.updatePassword(existing.user.id, hash);
    return { userId: existing.user.id, created: false };
  }

  const created = await ctx.internalAdapter.createUser({
    email: normalizedEmail,
    name,
    emailVerified: true,
    role: "admin",
  });

  await ctx.internalAdapter.createAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: hash,
  });

  return { userId: created.id, created: true };
}
