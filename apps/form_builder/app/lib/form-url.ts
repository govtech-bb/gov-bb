/**
 * Builds "Preview form" links that point at the live forms app (apps/forms).
 *
 * The origin comes from VITE_FORMS_URL — the same browser-exposed var the
 * landing app uses for forms links (ADR 0004). Per ADR 0005, browser-readable
 * config is read via import.meta.env, never process.env / a vite `define`.
 * The unified builder (/builder) renders this link. See
 * apps/form_builder/.env.example.
 *
 * The link carries the recipe preview token as `?draft=<token>`, which the
 * forms app forwards to the API as the X-Recipe-Draft header so an author can
 * view the in-progress DB draft (the builder scratch, submission blocked). The
 * `?preview=` param now serves the *published* recipe and is submittable, so it
 * is the wrong source for a builder preview (#1682). The token comes from
 * VITE_RECIPE_PREVIEW_TOKEN (baked into the bundle by Vite; acceptable because
 * the builder is gated behind GitHub OAuth) and defaults to "demo".
 */

const DEFAULT_FORMS_URL = "http://localhost:3000";
const DEFAULT_PREVIEW_TOKEN = "demo";

/**
 * Joins a forms-app origin with a form id and draft token →
 * `${origin}/forms/${formId}?draft=<token>`. Trailing slashes on the origin
 * are trimmed; an empty origin falls back to the local dev default. The token
 * is URL-encoded so a rotated token with metacharacters survives intact.
 */
export function joinFormPreviewUrl(
  baseUrl: string,
  formId: string,
  token: string,
): string {
  const origin = (baseUrl || DEFAULT_FORMS_URL).replace(/\/+$/, "");
  return `${origin}/forms/${formId}?draft=${encodeURIComponent(token)}`;
}

/**
 * Preview URL for a form on the live forms app, sourced from VITE_FORMS_URL and
 * VITE_RECIPE_PREVIEW_TOKEN (defaulting to "demo" when the token is unset).
 */
export function formPreviewUrl(formId: string): string {
  return joinFormPreviewUrl(
    import.meta.env.VITE_FORMS_URL || "",
    formId,
    import.meta.env.VITE_RECIPE_PREVIEW_TOKEN || DEFAULT_PREVIEW_TOKEN,
  );
}
