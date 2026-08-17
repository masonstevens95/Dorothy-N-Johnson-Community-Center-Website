import { config } from "dotenv";

/**
 * Imported for its side effect, and always first.
 *
 * ESM evaluates imported modules in declaration order, so putting the dotenv
 * call inside a script alongside `import { db } from "../lib/db"` runs it too
 * late — lib/db reads DATABASE_URL while being imported, which happens before
 * any statement in the script body. Isolating it in its own module is what
 * makes the ordering explicit rather than accidental.
 */
config({ path: ".env.local" });
config({ path: ".env" });
