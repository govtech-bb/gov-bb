/**
 * Resolve an environment variable that must be set for a real deployment.
 *
 * Some form_builder config values (the forms-app origin, the landing live-preview
 * origin, the recipe PR base branch) used to fall back to a localhost/`dev`
 * default when unset — so a deployed build that forgot to set them silently
 * pointed at the wrong target with no signal (#1366).
 *
 * The convenient default is kept **only** under `import.meta.env.DEV`. In a
 * production build an unset value throws with a clear message so the
 * misconfiguration fails fast instead of shipping a wrong-environment bundle.
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
    `[form_builder] Required environment variable ${name} is not set for this ` +
      `production build. Set it for this environment and redeploy.`,
  );
}
