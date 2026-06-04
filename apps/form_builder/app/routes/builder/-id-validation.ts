/**
 * Shared kebab-case id validation for the form builder.
 *
 * `KEBAB_ID_PATTERN` and `KEBAB_ID_ERROR` are the single source of truth defined
 * in `@govtech-bb/form-types` (the same rule the contract schema enforces).
 * They're re-exported here so the builder's id inputs (field/step/formId) all
 * reference one definition and can never diverge from the server validator.
 */
export { KEBAB_ID_PATTERN, KEBAB_ID_ERROR } from "@govtech-bb/form-types";

/**
 * Normalize arbitrary input toward a kebab-case id. Lowercases, trims, replaces
 * any run of non-alphanumeric characters with a single hyphen, then strips
 * leading/trailing hyphens.
 *
 * Note: this does NOT split on camelCase word boundaries — `"camelCase"`
 * normalizes to `"camelcase"`, not `"camel-case"`.
 */
export function kebabize(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
