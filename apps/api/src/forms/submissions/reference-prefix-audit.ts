import { canonicalizeReferenceCode } from "./reference-code";

export interface FormReferencePrefix {
  formId: string;
  /** `mapping.mdaCode` from the recipe; undefined for an unmigrated form. */
  mdaCode: string | undefined;
  /** Resolved `form_config → mda_contact.ministry_key`; null when unlinked. */
  ministryKey: string | null;
}

/**
 * Boot-time consistency check on the MDA codes recipes declare (#2318).
 *
 * An `mdaCode` typo mints permanently wrong citizen-facing references — a
 * reference is immutable once minted — so the cheap cross-checks are worth
 * running at deploy rather than discovering the drift from a case list.
 *
 * Returns human-readable issues; the caller logs them. Deliberately does not
 * throw: a reference-code inconsistency must not down the API, exactly as a
 * missing webhook destination does not.
 */
export function auditReferencePrefixes(
  forms: readonly FormReferencePrefix[],
): string[] {
  const issues: string[] = [];
  const declared = forms.filter(
    (f): f is FormReferencePrefix & { mdaCode: string } => Boolean(f.mdaCode),
  );

  // One ministry must not have two different MDA codes across its forms.
  const codesByMinistry = new Map<string, Map<string, string[]>>();
  for (const { formId, mdaCode, ministryKey } of declared) {
    if (!ministryKey) continue;
    const byCode = codesByMinistry.get(ministryKey) ?? new Map();
    byCode.set(mdaCode, [...(byCode.get(mdaCode) ?? []), formId]);
    codesByMinistry.set(ministryKey, byCode);
  }
  for (const [ministryKey, byCode] of codesByMinistry) {
    if (byCode.size < 2) continue;
    const detail = [...byCode]
      .map(([code, formIds]) => `${code} (${formIds.join(", ")})`)
      .join(" vs ");
    issues.push(
      `ministry "${ministryKey}" has conflicting mdaCodes: ${detail}`,
    );
  }

  // One MDA code must not be claimed by two ministries — that is the
  // cross-CaMS collision this prefix exists to prevent, one level up.
  const ministriesByCode = new Map<string, Set<string>>();
  for (const { mdaCode, ministryKey } of declared) {
    if (!ministryKey) continue;
    const keys = ministriesByCode.get(mdaCode) ?? new Set();
    keys.add(ministryKey);
    ministriesByCode.set(mdaCode, keys);
  }
  for (const [mdaCode, keys] of ministriesByCode) {
    if (keys.size < 2) continue;
    issues.push(
      `mdaCode "${mdaCode}" is claimed by more than one ministry: ${[...keys].sort().join(", ")}`,
    );
  }

  // Two codes that differ only by a confusable glyph are indistinguishable to
  // anyone reading a reference off paper, so treat them as a collision.
  const byCanonical = new Map<string, Set<string>>();
  for (const { mdaCode } of declared) {
    const canonical = canonicalizeReferenceCode(mdaCode);
    byCanonical.set(
      canonical,
      (byCanonical.get(canonical) ?? new Set()).add(mdaCode),
    );
  }
  for (const [canonical, codes] of byCanonical) {
    if (codes.size < 2) continue;
    issues.push(
      `mdaCodes ${[...codes].sort().join(", ")} are indistinguishable — all canonicalise to "${canonical}"`,
    );
  }

  return issues;
}
