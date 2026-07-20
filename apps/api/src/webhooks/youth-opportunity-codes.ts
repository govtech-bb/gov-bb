import type { ServiceCode } from "./application-code";

/**
 * Maps a submission's `formId` to the programme/service code the case-management
 * webhook expects — the legacy dispatch path.
 *
 * DRAINED (#841/#1458): every programme that used to live here has been migrated
 * to the declarative `webhook` processor in its own recipe, which sends the
 * submission's own `referenceCode` as the case `code` — the single reference the
 * citizen also sees. The old `YouthOpportunityWebhookListener` minted a *separate*
 * application code and sent that instead, so a form carried two unrelated
 * references (the confirmation/email showed one, the CMS case another).
 *
 * A formId is removed from this map the moment its recipe gains the mapped
 * webhook processor, so exactly one dispatch fires per submission (no double
 * dispatch). The map is now empty; the listener is retained but dormant and can
 * be deleted once we're confident nothing else depends on it.
 */
export const FORM_ID_SERVICE_CODES: Record<string, ServiceCode> = {};

/** True when a submission's formId maps to a youth-opportunity programme. */
export function isYouthOpportunityFormId(formId: string): boolean {
  return formId in FORM_ID_SERVICE_CODES;
}

/**
 * Resolves a submission `formId` to its programme/service code, or `null` if it
 * is not a mapped youth-opportunity form.
 */
export function resolveServiceCodeFromFormId(
  formId: string,
): ServiceCode | null {
  return FORM_ID_SERVICE_CODES[formId] ?? null;
}
