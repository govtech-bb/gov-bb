/**
 * Lint the per-MDA webhook convention (#1920/#2020) on a parsed recipe. A
 * mapped (case-management) webhook resolves its destination per-MDA from the
 * `MDA_WEBHOOK_DESTINATIONS` secret via `form_config → mda_contact`, so the
 * recipe carries **only** the `mapping` — no destination env refs. This guard
 * is the trunk gate that stops an incomplete migration from merging:
 *
 *  - a `webhook` processor with a `mapping` MUST carry a non-empty
 *    `programmeCode` and MUST NOT declare `endpoint` / `auth` / `url` (those
 *    are the retired per-form env convention — a leftover means the migration
 *    is half-done);
 *  - every `mapping.applicant` path is a well-formed `stepId.fieldId` whose
 *    `stepId` exists in the recipe, and every `excludeSteps` entry names a real
 *    step — catching the typo that would otherwise send a blank applicant.
 *
 * (Field-level existence within a step needs registry-ref expansion and is not
 * checked here — the runtime read simply yields null for a bad field.)
 * Returns human-readable error strings (empty when clean).
 */
interface WebhookProcessorish {
  type?: string;
  config?: {
    endpoint?: unknown;
    auth?: unknown;
    url?: unknown;
    mapping?: {
      programmeCode?: unknown;
      applicant?: { name?: unknown; email?: unknown; phone?: unknown };
      excludeSteps?: unknown;
    };
  };
}

function stepIdsOf(recipe: unknown): Set<string> {
  const steps = (recipe as { steps?: unknown }).steps;
  const ids = new Set<string>();
  if (Array.isArray(steps)) {
    for (const s of steps) {
      const id = (s as { stepId?: unknown }).stepId;
      if (typeof id === "string") ids.add(id);
    }
  }
  return ids;
}

function checkApplicantPath(
  path: unknown,
  label: string,
  stepIds: Set<string>,
  loc: string,
): string[] {
  if (typeof path !== "string" || path.length === 0) {
    return [`${loc} applicant.${label} is required (a "stepId.fieldId" path)`];
  }
  const dot = path.indexOf(".");
  if (dot <= 0 || dot === path.length - 1) {
    return [
      `${loc} applicant.${label} path "${path}" must be "stepId.fieldId"`,
    ];
  }
  const stepId = path.slice(0, dot);
  if (!stepIds.has(stepId)) {
    return [
      `${loc} applicant.${label} path "${path}" references unknown step "${stepId}"`,
    ];
  }
  return [];
}

export function checkWebhookRecipe(
  recipe: unknown,
  relative: string,
): string[] {
  const errors: string[] = [];
  const processors = (recipe as { processors?: unknown }).processors;
  if (!Array.isArray(processors)) return errors;
  const stepIds = stepIdsOf(recipe);

  processors.forEach((raw, i) => {
    const p = raw as WebhookProcessorish;
    if (p?.type !== "webhook") return;
    const cfg = p.config ?? {};
    const mapping = cfg.mapping;
    // Only mapped (case-management) webhooks are governed by this convention.
    // A generic (envelope) webhook keeps its endpoint/auth and is left alone.
    if (!mapping) return;
    const loc = `${relative}: processors[${i}]`;

    // Destination is per-MDA; the recipe must not carry the retired env refs.
    if (cfg.endpoint !== undefined || cfg.url !== undefined) {
      errors.push(
        `${loc} a mapped webhook must not declare endpoint/url — the destination resolves per-MDA from MDA_WEBHOOK_DESTINATIONS`,
      );
    }
    if (cfg.auth !== undefined) {
      errors.push(
        `${loc} a mapped webhook must not declare auth — the X-API-Key resolves per-MDA from MDA_WEBHOOK_DESTINATIONS`,
      );
    }

    if (
      typeof mapping.programmeCode !== "string" ||
      mapping.programmeCode.length === 0
    ) {
      errors.push(
        `${loc} mapping.programmeCode is required (non-empty string)`,
      );
    }

    // Applicant paths + excludeSteps only checkable when the recipe has steps
    // (a summary/fixture with no steps is skipped).
    if (stepIds.size > 0) {
      const applicant = mapping.applicant ?? {};
      const names = Array.isArray(applicant.name)
        ? applicant.name
        : [applicant.name];
      for (const n of names) {
        errors.push(...checkApplicantPath(n, "name", stepIds, loc));
      }
      errors.push(
        ...checkApplicantPath(applicant.email, "email", stepIds, loc),
      );
      errors.push(
        ...checkApplicantPath(applicant.phone, "phone", stepIds, loc),
      );
      if (Array.isArray(mapping.excludeSteps)) {
        for (const s of mapping.excludeSteps) {
          if (typeof s === "string" && !stepIds.has(s)) {
            errors.push(`${loc} excludeSteps entry "${s}" is not a step`);
          }
        }
      }
    }
  });

  return errors;
}
