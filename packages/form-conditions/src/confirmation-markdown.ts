/**
 * How one confirmation `{token}` behaves when it is substituted.
 *
 * Owned here in exactly one place so the confirmation page and the applicant
 * email can never drift — they previously carried duplicate
 * `replaceAll("{polyclinic}", … ?? "your local polyclinic")` literals kept in
 * step only by a comment (#2201).
 */
type TokenSpec = {
  /** Substituted when the caller has no value for the token. */
  fallback: string;
  /**
   * Applied to a caller-supplied value before substitution. Returning
   * `undefined` rejects the value and hands the token back to `fallback`.
   * Tokens without a normaliser substitute whatever the caller passed,
   * empty string included.
   */
  normalise?: (value: string) => string | undefined;
};

const TOKENS = {
  // Coordinate-routed forms name the resolved polyclinic; non-routed forms and
  // unresolved submissions read the generic phrase instead.
  polyclinic: { fallback: "your local polyclinic" },

  // Origin of the public landing site, so recipe copy can link to a service
  // page as `{landingUrl}/business-trade/…` and resolve per environment. Both
  // confirmation surfaces sit off the landing origin — the confirmation page
  // is served from `forms.<env>.alpha.gov.bb`, and an email has no base URL at
  // all — so a root-relative link would 404 on one and be dead on the other.
  landingUrl: {
    fallback: "https://alpha.gov.bb",
    // A trailing slash would double up against the authored `{landingUrl}/path`,
    // and a blank origin would emit exactly the root-relative link the token
    // exists to avoid. Both degrade to prod, which is a real page.
    normalise: (value) => value.replace(/\/+$/, "") || undefined,
  },
} satisfies Record<string, TokenSpec>;

/** Values a caller may supply for the known confirmation tokens. */
export type ConfirmationTokens = {
  [K in keyof typeof TOKENS]?: string | null;
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
  for (const token of Object.keys(TOKENS) as (keyof typeof TOKENS)[]) {
    const spec: TokenSpec = TOKENS[token];
    const supplied = tokens[token];
    const value =
      supplied === undefined || supplied === null
        ? undefined
        : spec.normalise
          ? spec.normalise(supplied)
          : supplied;
    result = result.replaceAll(`{${token}}`, value ?? spec.fallback);
  }
  return result;
}
