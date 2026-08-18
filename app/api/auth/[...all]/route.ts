import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/**
 * Better Auth's endpoints. Sign-up is refused here by configuration
 * (disableSignUp in lib/auth.ts), so this catch-all exposes sign-in, sign-out,
 * and session reads only.
 */
export const { GET, POST } = toNextJsHandler(auth);
