import type { ConditionalMarkdown, FormStep } from "@govtech-bb/form-types";
import { evaluateCondition, flattenStepValues } from "./internals";
// Type-only, so this back-reference to the barrel is erased at compile time and
// creates no runtime cycle — the same shape `internals.ts` already uses.
import type { StepScopedValues } from "./index";

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

/**
 * Fill the `{token}` placeholders a confirmation body declares in
 * `conditionalMarkdown` (#2068), each with the passage that matches the
 * submitted answers.
 *
 * Where {@link interpolateConfirmationMarkdown} substitutes *data* (the routed
 * polyclinic, the landing origin), this substitutes *copy* chosen by an answer:
 * whether an inspection is certain or merely possible, whether an
 * officer-request paragraph applies at all. Several passages of one body vary
 * independently, which is why this is not the whole-body, first-match-wins
 * shape of `resolveStepTitle` — that would need one full copy of the body per
 * combination of answers.
 *
 * Within a segment the first matching variant wins and `default` is the
 * fallback, exactly as `conditionalTitle`/`conditionalLabel` behave. A segment
 * with no match and an empty `default` drops its passage; markdown collapses
 * the blank lines left behind.
 *
 * Run this BEFORE `interpolateConfirmationMarkdown` so a conditional passage
 * may itself carry `{polyclinic}` / `{landingUrl}`. The corollary: a segment
 * must not be named after one of those tokens, or it would shadow it.
 *
 * Both confirmation surfaces resolve through here — the live page (via the
 * value persisted at submit, since the draft answers are cleared once the
 * submission succeeds) and the applicant email — so the branch an applicant
 * reads on screen is the branch in their inbox.
 *
 * Returns `undefined` when the step carries no `markdownContent`, matching
 * `interpolateConfirmationMarkdown` so the two compose directly.
 */
export function resolveConditionalMarkdown(
  step: Pick<FormStep, "markdownContent" | "conditionalMarkdown">,
  values: StepScopedValues,
): string | undefined {
  const { markdownContent } = step;
  if (markdownContent === undefined) return undefined;

  const segments: ConditionalMarkdown[] = step.conditionalMarkdown ?? [];
  if (segments.length === 0) return markdownContent;

  const flatValues = flattenStepValues(values);
  let result = markdownContent;
  for (const segment of segments) {
    const match = segment.variants.find((variant) =>
      evaluateCondition(variant, values, flatValues),
    );
    result = result.replaceAll(
      `{${segment.token}}`,
      match?.content ?? segment.default,
    );
  }
  return result;
}
