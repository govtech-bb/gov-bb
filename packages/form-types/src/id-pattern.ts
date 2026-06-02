/**
 * Canonical kebab-case identifier pattern, shared across the schema, the form
 * builder's id inputs (field/step/formId), and the validation pre-flight so the
 * rule never diverges between what an input accepts and what the contract
 * validator accepts.
 *
 * Matches a leading lowercase letter optionally followed by lowercase/digit
 * characters and hyphen-separated segments, e.g. `field`, `step-1`,
 * `applicant-first-name`. Rejects leading digits, leading/trailing hyphens, and
 * doubled hyphens.
 */
export const KEBAB_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Human-readable hint shown when an id fails {@link KEBAB_ID_PATTERN}. */
export const KEBAB_ID_ERROR =
  "Use lowercase letters, numbers, and hyphens only (e.g. birth-registration)";
