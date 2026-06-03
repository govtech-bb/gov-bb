import type { ServiceCode } from "./application-code";

/**
 * Backend form definitions name youth-opportunity recipes
 * `youth-opportunity-<opportunityId>` (e.g. `youth-opportunity-byac`). This
 * maps each opportunityId to the programme/service code the case-management
 * webhook expects — the same mapping the frontend used
 * (frontend-alpha/src/data/youth-opportunity-service-codes.ts). Keep the two in
 * sync: an opportunity that submits but is absent here is not dispatched.
 *
 * NOTE: `spreading-joy-2025` (JOY) has no backend recipe yet but is retained so
 * adding the recipe needs no code change.
 */
export const YOUTH_OPPORTUNITY_SERVICE_CODES: Record<string, ServiceCode> = {
  byac: "BYAC",
  ydp: "YDP",
  pathways: "PATH",
  "bright-sparks-2": "SPARKS",
  "bridge-to-future-2025": "BRIDGE",
  cip: "CIP",
  btu: "BTU",
  "cyber-security-training": "CYBER",
  "web-design-entrepreneurs": "WEBDEV",
  cap: "CAP",
  yes: "YES",
  yar: "YAR",
  "community-canvas": "CANVAS",
  "national-summer-camp": "CAMP",
  ceep: "CEEP",
  "mission-barbados": "MISSION",
  "barbados-blooming-libraries": "BLOOM",
  cmc: "CMC",
  "spreading-joy-2025": "JOY",
  "centre-access": "BOOKING",
};

const FORM_ID_PREFIX = "youth-opportunity-";

/** True when a submission's formId belongs to the youth-opportunity family. */
export function isYouthOpportunityFormId(formId: string): boolean {
  return formId.startsWith(FORM_ID_PREFIX);
}

/**
 * Resolves a submission `formId` to its programme/service code, or `null` if it
 * is not a mapped youth-opportunity form.
 */
export function resolveServiceCodeFromFormId(
  formId: string,
): ServiceCode | null {
  if (!isYouthOpportunityFormId(formId)) return null;
  const opportunityId = formId.slice(FORM_ID_PREFIX.length);
  return YOUTH_OPPORTUNITY_SERVICE_CODES[opportunityId] ?? null;
}
