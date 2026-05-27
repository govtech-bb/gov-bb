/**
 * Builds "Preview form" links that point at the live forms app (apps/forms).
 *
 * The origin comes from VITE_FORMS_URL — the same browser-exposed var the
 * landing app uses for forms links (ADR 0004). Per ADR 0005, browser-readable
 * config is read via import.meta.env, never process.env / a vite `define`.
 * Both builder surfaces — AI (/builder/ai) and UI (/builder/ui) — render the
 * same link. See apps/form_builder/.env.example.
 */

const DEFAULT_FORMS_URL = "http://localhost:3000";

/**
 * Joins a forms-app origin with a form id → `${origin}/forms/${formId}`.
 * Trailing slashes on the origin are trimmed; an empty origin falls back to
 * the local dev default.
 */
export function joinFormPreviewUrl(baseUrl: string, formId: string): string {
  const origin = (baseUrl || DEFAULT_FORMS_URL).replace(/\/+$/, "");
  return `${origin}/forms/${formId}`;
}

/** Preview URL for a form on the live forms app, sourced from VITE_FORMS_URL. */
export function formPreviewUrl(formId: string): string {
  return joinFormPreviewUrl(import.meta.env.VITE_FORMS_URL || "", formId);
}
