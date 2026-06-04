import { z } from "zod";

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

/**
 * Reusable zod schema for any identifier position governed by
 * {@link KEBAB_ID_PATTERN}: stepIds, fieldIds, behaviour targets and
 * block-override keys. Enforcing the rule at the schema level guarantees the
 * composite form-state key `${stepId}_${fieldId}` round-trips through
 * `splitCompositeId`, whose split assumes ids never contain `_` (issue #741).
 */
export const kebabIdSchema = z.string().regex(KEBAB_ID_PATTERN, KEBAB_ID_ERROR);
