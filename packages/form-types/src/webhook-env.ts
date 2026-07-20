/**
 * Per-form webhook destination env-var convention (#1920). A form's outbound
 * webhook resolves its URL from `WEBHOOK_URL_<TOKEN>` and its secret from
 * `WEBHOOK_SECRET_<TOKEN>`, where `<TOKEN>` is a short uppercase per-form label
 * the recipe names via `endpoint.env` / `auth.secretEnv`. Keeping the URL and
 * secret tokens equal is what prevents a recipe from pairing one destination's
 * URL with another destination's secret.
 *
 * Single source of truth shared by the CI recipe-lint and the API startup audit.
 */
export const WEBHOOK_URL_PREFIX = "WEBHOOK_URL_";
export const WEBHOOK_SECRET_PREFIX = "WEBHOOK_SECRET_";

// Uppercase letters, digits, underscores — e.g. SCIENCE_CAMP, BYAC, YDP.
const TOKEN_PATTERN = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;

export function webhookUrlEnv(token: string): string {
  return `${WEBHOOK_URL_PREFIX}${token}`;
}

export function webhookSecretEnv(token: string): string {
  return `${WEBHOOK_SECRET_PREFIX}${token}`;
}

/** The `<TOKEN>` from a `WEBHOOK_URL_<TOKEN>` name, or null if it doesn't match. */
export function webhookUrlToken(envName: string): string | null {
  if (!envName.startsWith(WEBHOOK_URL_PREFIX)) return null;
  const token = envName.slice(WEBHOOK_URL_PREFIX.length);
  return TOKEN_PATTERN.test(token) ? token : null;
}

/** The `<TOKEN>` from a `WEBHOOK_SECRET_<TOKEN>` name, or null if it doesn't match. */
export function webhookSecretToken(envName: string): string | null {
  if (!envName.startsWith(WEBHOOK_SECRET_PREFIX)) return null;
  const token = envName.slice(WEBHOOK_SECRET_PREFIX.length);
  return TOKEN_PATTERN.test(token) ? token : null;
}
