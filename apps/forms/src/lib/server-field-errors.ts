import type { ClientFormStep } from "@forms/types";

export interface ServerFieldErrors {
  /** Client field id (`ClientPrimitive.id`) → the server's messages for it. */
  byFieldId: Record<string, string[]>;
  /**
   * The first step in form order holding a mapped error — where the citizen has
   * to be sent to see and fix it. Undefined when nothing mapped.
   */
  stepId?: string;
}

function messagesFor(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  if (!value.every((m) => typeof m === "string")) return undefined;
  return value as string[];
}

/**
 * Map a server validation bundle (`meta.errors` on a 422 — keyed
 * `{ stepId: { fieldId: string[] } }`) onto the client's own field ids, so the
 * messages can be applied to the form and rendered by the same error summary and
 * field error slots that client-side validation uses.
 *
 * Ids are read off the built steps rather than recomposed from `stepId.fieldId`,
 * so a step whose id the server no longer recognises — or a field that has since
 * been renamed — simply does not map instead of attaching an error to nothing.
 *
 * A repeatable step's bundle is shaped `{ _step: string[], instances: [...] }`
 * (see `foldErrors` in the API): the instance index corresponds to an expanded
 * client step id (`stepId~N`), which this deliberately does not attempt to
 * reverse. Those map to nothing, which the caller treats as "could not surface
 * this" and falls back to the failure panel — better than half-attaching an
 * error to the base instance.
 */
export function resolveServerFieldErrors(
  errors: unknown,
  steps: ClientFormStep[],
): ServerFieldErrors {
  const byFieldId: Record<string, string[]> = {};
  let stepId: string | undefined;

  if (!errors || typeof errors !== "object" || Array.isArray(errors)) {
    return { byFieldId };
  }
  const bundle = errors as Record<string, unknown>;

  for (const step of steps) {
    const stepErrors = bundle[step.stepId];
    if (!stepErrors || typeof stepErrors !== "object") continue;
    const fieldErrors = stepErrors as Record<string, unknown>;

    for (const field of step.fields) {
      const messages = messagesFor(fieldErrors[field.fieldId]);
      if (!messages) continue;
      byFieldId[field.id] = messages;
      stepId ??= step.stepId;
    }
  }

  return { byFieldId, ...(stepId && { stepId }) };
}

/**
 * Find out if a server validation bundle (`meta.errors` on a 422) names a step,
 * or a field in a step, that the browser's copy of the form does not have. Then
 * the browser has an old copy of the definition, and the API checked the answers
 * against a newer one (#3886). The applicant cannot correct a field that the form
 * does not show, so the caller tells them that the form changed (#3901).
 *
 * Give all the steps of the definition as the contract has them
 * (`FormMeta.contractSteps`), not only the visible steps: a field that a
 * condition hides is not a missing field. `_step` holds errors for the step
 * itself, so it is not a field name. The fields in a repeatable step's bundle
 * (`{ _step?, instances }`) are not examined: that bundle keeps the general
 * failure panel (see `resolveServerFieldErrors`).
 *
 * Returns the first step that the bundle names, which is where the applicant
 * must go after the reload. Returns undefined when the definition has every
 * step and field that the bundle names.
 */
export function findStaleDefinitionStep(
  errors: unknown,
  steps: ClientFormStep[],
): string | undefined {
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) {
    return undefined;
  }
  const bundle = errors as Record<string, unknown>;

  const isStale = Object.entries(bundle).some(([stepId, stepErrors]) => {
    const step = steps.find((s) => s.stepId === stepId);
    if (!step) return true;
    if (!stepErrors || typeof stepErrors !== "object") return false;
    if ("instances" in stepErrors) return false;
    return Object.keys(stepErrors).some(
      (key) =>
        key !== "_step" && !step.fields.some((field) => field.fieldId === key),
    );
  });

  return isStale ? Object.keys(bundle)[0] : undefined;
}
