/**
 * Fallback copy substituted for a confirmation token when the caller has no
 * resolved value. Owned here in exactly one place so the confirmation page and
 * the applicant email can never drift — they previously carried duplicate
 * `replaceAll("{polyclinic}", … ?? "your local polyclinic")` literals kept in
 * step only by a comment (#2201).
 */
const TOKEN_FALLBACKS = {
  // Coordinate-routed forms name the resolved polyclinic; non-routed forms and
  // unresolved submissions read the generic phrase instead.
  polyclinic: "your local polyclinic",
} as const;

/** Values a caller may supply for the known confirmation tokens. */
export type ConfirmationTokens = {
  [K in keyof typeof TOKEN_FALLBACKS]?: string | null;
};

/**
 * Substitute confirmation `{token}` placeholders in a recipe's authored
 * `markdownContent` with the caller-supplied value, or the shared fallback when
 * the caller has none.
 *
 * The single source of truth for both confirmation surfaces — the live
 * confirmation page (`apps/forms`) and the applicant email (`apps/api`) — so the
 * copy an applicant sees on screen matches the copy in their email. Callers pass
 * only the values they have; the fallback lives here, not at the call site.
 *
 * Returns `undefined` when `markdownContent` is absent, matching the optional
 * chaining (`markdownContent?.replaceAll(...)`) both call sites relied on, so
 * this extraction is behaviour-preserving.
 */
export function interpolateConfirmationMarkdown(
  markdownContent: string | undefined,
  tokens: ConfirmationTokens,
): string | undefined {
  if (markdownContent === undefined) return undefined;

  let result = markdownContent;
  for (const token of Object.keys(
    TOKEN_FALLBACKS,
  ) as (keyof typeof TOKEN_FALLBACKS)[]) {
    const value = tokens[token] ?? TOKEN_FALLBACKS[token];
    result = result.replaceAll(`{${token}}`, value);
  }
  return result;
}
