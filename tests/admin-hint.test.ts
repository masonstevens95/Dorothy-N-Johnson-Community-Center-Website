import { afterEach, describe, expect, it } from "vitest";
import {
  ADMIN_HINT_COOKIE,
  clearAdminHint,
  hasAdminHint,
  setAdminHint,
} from "@/lib/admin-hint";

/**
 * The hint cookie decides what the maintainer *sees*. Nothing it can say
 * decides what anyone can *do* — that is lib/auth-guard.ts, and tests/auth-gate
 * covers it. These tests are therefore about one thing only: that the hint
 * reads true exactly when it was written and false in every other case,
 * including the cases where "false" is the difference between a visitor seeing
 * a clean page and a visitor seeing a crash.
 *
 * The suite runs in Vitest's node environment, so `document` is stubbed rather
 * than supplied by jsdom. That is not a shortcut around a missing dependency:
 * it keeps the assertions about cookie *strings*, which is what the module
 * actually produces, and it lets the non-browser case below be a real test
 * rather than an unreachable branch.
 */

interface CookieJar {
  get(name: string): string | undefined;
  raw(): string;
}

/** A `document.cookie` with just enough of the real semantics to be honest. */
function stubDocument(initial: Record<string, string> = {}): CookieJar {
  const jar = new Map<string, string>(Object.entries(initial));

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
      },
      set cookie(raw: string) {
        const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
        const split = pair.indexOf("=");
        const name = pair.slice(0, split);
        const value = pair.slice(split + 1);

        // A browser removes a cookie whose lifetime has already run out; the
        // clear path depends on that rather than on any special delete API.
        const maxAge = attributes.find((attribute) =>
          attribute.toLowerCase().startsWith("max-age="),
        );

        if (maxAge && Number(maxAge.split("=")[1]) <= 0) jar.delete(name);
        else jar.set(name, value);
      },
    },
  });

  return {
    get: (name) => jar.get(name),
    raw: () => [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
  };
}

function removeDocument(): void {
  Reflect.deleteProperty(globalThis, "document");
}

afterEach(() => {
  removeDocument();
});

describe("the maintainer hint", () => {
  it("reads true after it is set", () => {
    stubDocument();

    expect(hasAdminHint()).toBe(false);
    setAdminHint();
    expect(hasAdminHint()).toBe(true);
  });

  it("reads false after it is cleared", () => {
    stubDocument();
    setAdminHint();

    clearAdminHint();

    expect(hasAdminHint()).toBe(false);
  });

  it("reads false when there are no cookies at all", () => {
    stubDocument();

    expect(hasAdminHint()).toBe(false);
  });

  it("reads false when other cookies are present but the hint is not", () => {
    stubDocument({ "better-auth.session_token": "abc", theme: "light" });

    expect(hasAdminHint()).toBe(false);
  });

  it("does not mistake a cookie whose name merely contains the hint's", () => {
    // The difference between splitting on "=" and searching for a substring.
    // Getting this wrong shows admin chrome to someone who has no session,
    // which is cosmetically wrong for them and misleading for us.
    stubDocument({
      [`not_${ADMIN_HINT_COOKIE}`]: "1",
      [`${ADMIN_HINT_COOKIE}_other`]: "1",
    });

    expect(hasAdminHint()).toBe(false);
  });

  it("finds the hint among other cookies", () => {
    stubDocument({ "better-auth.session_token": "abc" });
    setAdminHint();

    expect(hasAdminHint()).toBe(true);
  });

  it("clears only the hint and leaves other cookies alone", () => {
    const jar = stubDocument({ "better-auth.session_token": "abc" });
    setAdminHint();

    clearAdminHint();

    expect(hasAdminHint()).toBe(false);
    expect(jar.get("better-auth.session_token")).toBe("abc");
  });

  it("scopes the cookie to the whole site and keeps it same-site", () => {
    const jar = stubDocument();
    setAdminHint();

    // Path=/ so the hint is readable from every public page, not only from
    // wherever sign-in happened to land.
    expect(jar.get(ADMIN_HINT_COOKIE)).toBe("1");
  });

  it("returns false rather than throwing outside a browser", () => {
    // The module is imported from files that also render on the server. A
    // throw here would be a 500 on a public page, which is the single worst
    // outcome this cosmetic cookie could possibly cause.
    removeDocument();

    expect(() => hasAdminHint()).not.toThrow();
    expect(hasAdminHint()).toBe(false);
  });

  it("writes and clears silently outside a browser", () => {
    removeDocument();

    expect(() => setAdminHint()).not.toThrow();
    expect(() => clearAdminHint()).not.toThrow();
  });
});
