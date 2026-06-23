/**
 * Branch-name builders for the form builder's Deploy and Erase PR flows.
 *
 * Branch names must not contain "." — Amplify's preview-domain cert is a
 * single-label wildcard, so a dotted branch yields a multi-label preview
 * subdomain whose HTTPS fails, and CI's pr-preview "Guard branch name" step
 * hard-fails any dotted branch (#805). Both builders dash-sanitize the
 * user-influenced segments (version, formId); callers keep the real dotted
 * version in the committed file path, commit message, and PR title.
 *
 * Shared here (rather than duplicated per app) so the two publish
 * implementations — apps/form_builder and apps/form_builder_api — can never
 * drift apart.
 */

function dotless(segment: string): string {
  return segment.replace(/\./g, "-");
}

/** Prefix shared by every Deploy branch for a form — `deployBranchName` minus
 * the timestamp. Exported so the publish flow can recognise open deploy PRs for
 * a form without duplicating the naming scheme. */
export function deployBranchPrefix(formId: string): string {
  return `form-builder/${dotless(formId)}-`;
}

/** Branch for a Deploy PR, e.g. `form-builder/passport-renewal-<ts>`. Recipe
 * versioning is retired (#1196), so the branch no longer carries a version. */
export function deployBranchName(formId: string): string {
  return `${deployBranchPrefix(formId)}${Date.now()}`;
}

/** Branch for an Erase PR, e.g. `form-builder/erase-passport-renewal-<ts>`. */
export function eraseBranchName(formId: string): string {
  return `form-builder/erase-${dotless(formId)}-${Date.now()}`;
}
