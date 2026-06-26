/**
 * Builds "Preview form" links that point at the live forms app (apps/forms).
 *
 * The origin comes from VITE_FORMS_URL — the same browser-exposed var the
 * landing app uses for forms links (ADR 0004). Per ADR 0005, browser-readable
 * config is read via import.meta.env, never process.env / a vite `define`.
 * The unified builder (/builder) renders this link. See
 * apps/form_builder/.env.example.
 *
 * The link carries the recipe preview token as `?preview=<token>`, which the
 * forms app forwards to the API as the X-Recipe-Preview header so an author
 * can view an unpublished DB draft. The token comes from
 * VITE_RECIPE_PREVIEW_TOKEN (baked into the bundle by Vite; acceptable because
 * the builder is gated behind GitHub OAuth). It fails closed (#1366): when
 * unset the token is empty, so no preview matches — there is no guessable
 * "demo" fallback.
 */

import { requireEnv } from "../config/env";

const DEFAULT_FORMS_URL = "http://localhost:3000";

/**
 * Joins a forms-app origin with a form id and preview token →
 * `${origin}/forms/${formId}?preview=<token>`. Trailing slashes on the origin
 * are trimmed; an empty origin falls back to the local dev default. The token
 * is URL-encoded so a rotated token with metacharacters survives intact.
 */
export function joinFormPreviewUrl(
  baseUrl: string,
  formId: string,
  token: string,
): string {
  const origin = (baseUrl || DEFAULT_FORMS_URL).replace(/\/+$/, "");
  return `${origin}/forms/${formId}?preview=${encodeURIComponent(token)}`;
}

/**
 * Preview URL for a form on the live forms app, sourced from VITE_FORMS_URL
 * (required in production, localhost only in dev — #1366) and
 * VITE_RECIPE_PREVIEW_TOKEN (fails closed: empty when unset, so no preview
 * matches rather than a guessable "demo").
 */
export function formPreviewUrl(formId: string): string {
  return joinFormPreviewUrl(
    requireEnv(
      import.meta.env.VITE_FORMS_URL,
      "VITE_FORMS_URL",
      DEFAULT_FORMS_URL,
    ),
    formId,
    import.meta.env.VITE_RECIPE_PREVIEW_TOKEN || "",
  );
}
