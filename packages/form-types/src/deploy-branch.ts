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

import { KEBAB_ID_PATTERN } from "./id-pattern";

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

/**
 * Recovers the form id from a Deploy branch's head ref, or `null` if the ref
 * isn't one — a non-form-builder (e.g. content) branch, an Erase branch, or a
 * branch missing its trailing timestamp. This is the consumer
 * `deployBranchPrefix`'s doc comment promised (#2390): the publish flow uses
 * it to spot an already-open Deploy PR for a form and reuse it instead of
 * opening a duplicate.
 *
 * Deliberately does NOT test `headRef.startsWith(deployBranchPrefix(formId))`
 * for a candidate formId — `deployBranchPrefix("passport")` is
 * `form-builder/passport-`, which is itself a string-prefix of
 * `form-builder/passport-renewal-<ts>`, so that check would let form
 * "passport" claim form "passport-renewal"'s PR and push the wrong recipe
 * onto it. Instead this splits the ref generically (namespace, then id, then
 * trailing digits) without reference to any particular formId, so that
 * ambiguity can't arise.
 *
 * The recovered id is validated against KEBAB_ID_PATTERN, which also rejects
 * "/" — so a nested ref segment (e.g. an accidental `a/b-123`) can't be
 * mistaken for an id. And because KEBAB_ID_PATTERN forbids ".", every valid
 * formId already satisfies `dotless(formId) === formId`, which is why the
 * recovered id can be compared directly to a formId with no extra sanitizing.
 *
 * One accepted ambiguity: a form whose id genuinely began with "erase-" would
 * be mistaken for an Erase branch and return null here, degrading to today's
 * behaviour (the publish flow just opens a new PR) rather than anything
 * unsafe — Deploy and Erase branches must never be confused for each other.
 */
export function formIdFromDeployBranch(headRef: string): string | null {
  if (!headRef.startsWith("form-builder/")) return null;

  const rest = headRef.slice("form-builder/".length);
  if (rest.startsWith("erase-")) return null;

  const lastDash = rest.lastIndexOf("-");
  if (lastDash === -1) return null;

  const id = rest.slice(0, lastDash);
  const timestamp = rest.slice(lastDash + 1);
  if (!/^[0-9]+$/.test(timestamp)) return null;

  return KEBAB_ID_PATTERN.test(id) ? id : null;
}
