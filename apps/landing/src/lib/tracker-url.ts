/**
 * Base URL of the application tracker, where someone checks the status of
 * something they have already applied for. A separate app on its own domain
 * rather than a route in this one.
 *
 * Read by the homepage Featured column and the header nav, so it appears on
 * every page.
 *
 * ── Why this defaults to production, where chat and forms default to sandbox ──
 * Those apps have a sandbox host. The tracker does not — checked at the time of
 * writing, `tracking.alpha.gov.bb` resolves and answers 200, while
 * `tracking.sandbox.alpha.gov.bb` and `tracking.staging.alpha.gov.bb` have no DNS
 * record at all. Defaulting to a sandbox host that does not exist would put a
 * dead link in the primary navigation of every page, which is worse than
 * pointing sandbox and staging at the real tracker.
 *
 * So every environment links to production tracking until per-environment hosts
 * exist. That is a deliberate trade, not an oversight: the value is a navigation
 * target rather than a data source, so crossing environments costs a reader
 * nothing — unlike VITE_FORMS_API_URL, which deliberately has no default because
 * defaulting it once served wrong-environment data.
 *
 * When a sandbox or staging tracker appears, set VITE_TRACKER_URL for those
 * environments in the Amplify Console and no code change is needed. It is baked
 * in at build time, so changing it needs a rebuild.
 */
export const TRACKER_URL =
  import.meta.env.VITE_TRACKER_URL || 'https://tracking.alpha.gov.bb'
