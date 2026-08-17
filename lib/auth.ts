import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import { account, session, user, verification } from "./db/schema";

/**
 * One admin account, created by a seeding script, signing in with a password.
 *
 * Everything absent here is absent deliberately. No OAuth providers, no
 * registration route, no password reset, no email verification, no magic
 * links — each would be an unused surface with a permanent maintenance cost,
 * and every email-bearing flow is a deliverability failure mode on a site
 * nobody is monitoring. Password recovery is rerunning the seed script.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  emailAndPassword: {
    enabled: true,
    /**
     * R13. This is what makes the public sign-up route refuse at the HTTP
     * layer rather than relying on the route simply not being linked from
     * anywhere. Accounts come into existence only through scripts/seed-admin.ts.
     */
    disableSignUp: true,
    minPasswordLength: 12,
    requireEmailVerification: false,
  },

  session: {
    // Long enough that the maintainer is not signing in every time they stand
    // at the bulletin board, short enough that a lost phone is not permanent.
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "admin",
        input: false,
      },
    },
  },

  /**
   * Better Auth's defaults are kept on purpose: in production, sign-in is
   * limited to 3 attempts per 10 seconds per IP. With exactly one account and
   * no lockout or reset flow, that throttle is the only thing standing between
   * a password and an unattended brute-force attempt. Browser tests sign in
   * once per run rather than weakening it.
   */

  advanced: {
    cookiePrefix: "better-auth",
  },
});

export type Session = typeof auth.$Infer.Session;
