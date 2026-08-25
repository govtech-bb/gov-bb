/**
 * Base URL of the application tracker, which is a separate app on its own
 * domain rather than a route in this one.
 *
 * Same shape as chat-url.ts and the forms URL in markdown/StartLink.tsx: an
 * env var with a sandbox default, so a deploy points it at the right
 * environment without a code change.
 *
 * ⚠️ The default is a guess. It follows the estate's `<app>.sandbox.alpha.gov.bb`
 * naming, but the tracker's deployed hostname is not recorded anywhere in either
 * repo — confirm it before this ships, or set VITE_TRACKER_URL.
 */
export const TRACKER_URL =
  import.meta.env.VITE_TRACKER_URL || 'https://tracker.sandbox.alpha.gov.bb'
