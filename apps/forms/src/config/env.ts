/**
 * Resolve an environment variable that must be set for a real deployment.
 *
 * Some forms config values (the landing-site origin, the API base) used to fall
 * back to a fixed default when unset — so a non-prod build that forgot to set
 * them silently pointed at the wrong environment (or a prod URL) with no signal
 * (#1366).
 *
 * The convenient default is kept **only** under `import.meta.env.DEV`. In a
 * production build an unset value throws with a clear message so the
 * misconfiguration fails fast instead of shipping a wrong-environment bundle.
 * (Vite freezes these at build time, so this is the fail-fast the value can
 * have — there is no later runtime read to validate.)
 */
export function requireEnv(
  value: string | undefined | null,
  name: string,
  devDefault: string,
): string {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  if (import.meta.env.DEV) return devDefault;
  throw new Error(
    `[forms] Required environment variable ${name} is not set for this ` +
      `production build. Set it for this environment and rebuild.`,
  );
}
