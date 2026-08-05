/**
 * Build-time guard for the two public origins the services table links out to.
 *
 * `LANDING_URL` / `FORMS_URL` are baked into the bundle by vite's `define` (see
 * vite.config.ts) because Amplify Compute doesn't pass branch env vars to the
 * SSR Lambda at runtime — build time is the only moment their absence can be
 * detected. Unset, `define` substitutes `""`, app/lib/service-url.ts falls back
 * to the docker-stack origins, and every service link in a deployed table
 * points at the reader's own machine (#2167).
 *
 * A local run wants that fallback, so only a deployed build is refused:
 * `AWS_APP_ID` is set by the Amplify build container and by nothing else, so a
 * local or CI `vite build` — and `vite dev` — keep the localhost defaults.
 */
export function assertDeployedLinkOrigins(
  command: string,
  pick: (key: string) => string,
): void {
  if (command !== "build" || !process.env.AWS_APP_ID) return;

  const missing = ["LANDING_URL", "FORMS_URL"].filter((key) => !pick(key));
  if (missing.length === 0) return;

  throw new Error(
    `feature_flagging: ${missing.join(" and ")} must be set on the Amplify ` +
      `branch (${process.env.AWS_BRANCH || "unknown"}) — without them the ` +
      `services table links at http://localhost (see #2167). Set e.g. ` +
      `LANDING_URL=https://landing.sandbox.alpha.gov.bb and ` +
      `FORMS_URL=https://forms.sandbox.alpha.gov.bb.`,
  );
}
