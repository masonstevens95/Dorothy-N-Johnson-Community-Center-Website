/**
 * Site identity (R8, R12).
 *
 * Read from the environment so a future owner can change what the site says
 * about itself without editing code — including, if the center ever takes it
 * over, the disclaimer.
 */
export const site = {
  name: process.env.NEXT_PUBLIC_CENTER_NAME ?? "Dorothy N. Johnson Community Center",
  address: process.env.NEXT_PUBLIC_CENTER_ADDRESS ?? "",
  hours: process.env.NEXT_PUBLIC_CENTER_HOURS ?? "",
  officialUrl: process.env.NEXT_PUBLIC_OFFICIAL_URL ?? "",
} as const;
