/**
 * Site identity (R8, R12).
 *
 * Read from the environment so a future owner can change what the site says
 * about itself without editing code — including, if the center ever takes it
 * over, the disclaimer.
 */
export const site = {
  /**
   * A blank value falls back rather than rendering an empty header, for the
   * same reason as the time zone (see lib/time.ts): a variable added with no
   * value arrives as `""`, which a nullish check lets through. The three
   * below are different — blank is a real choice there, and the footer omits
   * each block while it is empty.
   */
  name:
    process.env.NEXT_PUBLIC_CENTER_NAME?.trim() ||
    "Dorothy N. Johnson Community Center",
  address: process.env.NEXT_PUBLIC_CENTER_ADDRESS ?? "",
  hours: process.env.NEXT_PUBLIC_CENTER_HOURS ?? "",
  officialUrl: process.env.NEXT_PUBLIC_OFFICIAL_URL ?? "",
} as const;
