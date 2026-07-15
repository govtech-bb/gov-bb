import type { ServiceCode } from "../forms/submissions/processors/application-code";

/**
 * Maps a submission's `formId` to the programme/service code the case-management
 * webhook expects — the same programmes the frontend dispatched
 * (frontend-alpha/src/data/youth-opportunity-service-codes.ts).
 *
 * Keyed on the *exact* formId each recipe declares, not on a stripped
 * `youth-opportunity-<id>` suffix. Most youth-opportunity recipes follow that
 * naming convention, but several predate it and ship a bare formId — e.g.
 * `cyber-security-training`, `web-design-entrepreneurs`, `yes`, `yar`,
 * `national-summer-camp`, `mission-barbados`. A prefix-strip approach silently
 * dropped those (the formId never started with `youth-opportunity-`, so nothing
 * was dispatched). Keying on the real formId dispatches every mapped programme
 * regardless of naming, and—because it's an exact match—won't pick up a
 * same-stemmed sibling such as the standalone `ydp` recipe.
 *
 * Keep this in sync with the recipes: a programme whose formId is absent here
 * is not dispatched.
 */
export const FORM_ID_SERVICE_CODES: Record<string, ServiceCode> = {
  "youth-opportunity-byac": "BYAC",
  "youth-opportunity-ydp": "YDP",
  "youth-opportunity-pathways": "PATH",
  "youth-opportunity-bright-sparks-2": "SPARKS",
  "youth-opportunity-cip": "CIP",
  "youth-opportunity-btu": "BTU",
  "cyber-security-training": "CYBER",
  "web-design-entrepreneurs": "WEBDEV",
  "youth-opportunity-cap": "CAP",
  yes: "YES",
  yar: "YAR",
  "youth-opportunity-community-canvas": "CANVAS",
  "national-summer-camp": "CAMP",
  "youth-opportunity-ceep": "CEEP",
  "mission-barbados": "MISSION",
  "youth-opportunity-barbados-blooming-libraries": "BLOOM",
  "youth-opportunity-cmc": "CMC",
  "youth-opportunity-centre-access": "BOOKING",
};

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
