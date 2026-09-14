// Emails have no base URL, so an unset origin must never degrade to localhost.
// The landing origin falls back to the public site like every other API email;
// the API has no safe default for its own origin, so callers skip what needs it.
export const landingOrigin = (): string =>
  (process.env.LANDING_BASE_URL || "https://alpha.gov.bb").replace(/\/+$/, "");

export const apiOrigin = (): string | undefined =>
  process.env.API_PUBLIC_URL?.replace(/\/+$/, "") || undefined;
