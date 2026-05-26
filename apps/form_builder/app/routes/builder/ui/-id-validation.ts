/**
 * Shared kebab-case id validation for the form builder.
 *
 * `KEBAB_ID_PATTERN` matches a single lowercase letter optionally followed by
 * additional lowercase/digit characters and hyphen-separated segments, e.g.
 * `field`, `step-1`, `applicant-first-name`.
 */
export const KEBAB_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

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
