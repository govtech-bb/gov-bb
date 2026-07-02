/**
 * Resolve an environment variable that must be set for a real deployment.
 *
 * Several landing config values (forms/chat URLs, the forms API base) used to
 * default to a `sandbox` target when unset — so a production build that forgot
 * to set them silently talked to the wrong environment with no signal (#1366).
 *
 * The convenient default is kept **only** under `import.meta.env.DEV`. In a
 * production build an unset value throws with a clear message, so the
 * misconfiguration fails fast instead of shipping a wrong-environment bundle.
 * (Vite freezes these at build time, so this is the build/boot fail-fast the
 * value can have — there is no later runtime read to validate.)
 */
export function requireEnv(
  value: string | undefined | null,
  name: string,
  devDefault: string,
): string {
  const trimmed = value?.trim()
  if (trimmed) return trimmed
  if (import.meta.env.DEV) return devDefault
  throw new Error(
    `[landing] Required environment variable ${name} is not set for this ` +
      `production build. Set it in the Amplify Console for this environment ` +
      `and redeploy.`,
  )
}
