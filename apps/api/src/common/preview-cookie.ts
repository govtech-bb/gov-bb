/**
 * Shared `preview` cookie helpers (#1646 Phase 3, ADR 0058). The cross-app
 * `preview` cookie grants a **visibility** bypass by its presence — its value
 * is only the level, never a secret (a forgeable rollout gate per ADR
 * 0013/0058). Used by the form-GET path and the file-upload presign/confirm
 * path (#2116) so a non-public form loaded via the shared cookie — after
 * `canDropPreviewToken` removed the `?preview=` URL token — can still resolve
 * its file-field config.
 */
export const PREVIEW_COOKIE_NAME = "preview";

/**
 * Cookie values that grant a visibility bypass: the level name, or the legacy
 * boolean grant `"1"`. Mirrors `levelFromCookie` in apps/landing/src/lib/preview.ts.
 */
export const PREVIEW_COOKIE_BYPASS_VALUES = new Set(["preview", "draft", "1"]);

/**
 * Pull the `preview` cookie's value out of a raw `Cookie` request header without
 * a cookie-parser dependency. Returns undefined when the cookie is absent.
 */
export function readPreviewCookie(
  cookieHeader: string | undefined,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() === PREVIEW_COOKIE_NAME) {
      return pair.slice(eq + 1).trim();
    }
  }
  return undefined;
}

/**
 * True when the raw `Cookie` header carries a `preview` cookie whose value
 * grants a visibility bypass. Bypasses **visibility** only — it never sources
 * unpublished DB content (that still requires the per-request `X-Recipe-Draft`
 * secret, ADR 0011).
 */
export function hasPreviewCookieBypass(
  cookieHeader: string | undefined,
): boolean {
  const value = readPreviewCookie(cookieHeader);
  return value !== undefined && PREVIEW_COOKIE_BYPASS_VALUES.has(value);
}
