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
 * They must also keep the preview host resolvable: Amplify names it after the
 * branch with "/" → "-", and a DNS label is capped at 63 characters, so a
 * longer branch yields a host that never resolves and the A11y + smoke gates
 * fail on infrastructure rather than on the change (#2488). `fitBranchSegment`
 * truncates and hashes the id segment when a name would overshoot; the same
 * pr-preview guard hard-fails anything still over the cap.
 *
 * Shared here (rather than duplicated per app) so the two publish
 * implementations — apps/form_builder and apps/form_builder_api — can never
 * drift apart.
 */

import { KEBAB_ID_PATTERN } from "./id-pattern";

/** A single DNS label — one dot-separated part of a hostname — is capped at
 * 63 characters (RFC 1035 §2.3.4); the Amplify preview host spends one whole
 * label on the branch name. */
export const AMPLIFY_BRANCH_LABEL_MAX = 63;

/** `-<Date.now()>`: 13 digits until the year 2286. */
const TIMESTAMP_SUFFIX_LENGTH = 14;

const HASH_LENGTH = 6;

/** 32-bit FNV-1a of `input` as exactly HASH_LENGTH lowercase base-36 chars —
 * kebab-safe, dependency-free, and the same in the browser and node. */
function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 36 ** HASH_LENGTH).toString(36).padStart(HASH_LENGTH, "0");
}

/**
 * `segment` unchanged when `${prefix}${segment}-<Date.now()>` fits the Amplify
 * preview label; otherwise the head of `segment` plus `-<hash of the full
 * segment>`, cut so the whole branch fits exactly (#2488). The hash keeps two
 * long ids that share a head from landing on one branch, and the result is a
 * pure function of its inputs, so a parser can regenerate it from the same id
 * or path. "/" and "-" are both one character, so the prefix's length is its
 * label length.
 */
export function fitBranchSegment(prefix: string, segment: string): string {
  const budget =
    AMPLIFY_BRANCH_LABEL_MAX - prefix.length - TIMESTAMP_SUFFIX_LENGTH;
  if (segment.length <= budget) return segment;
  const head = segment.slice(0, budget - HASH_LENGTH - 1).replace(/-+$/, "");
  return `${head}-${shortHash(segment)}`;
}

function dotless(segment: string): string {
  return segment.replace(/\./g, "-");
}

/** Prefix shared by every Deploy branch for a form — `deployBranchName` minus
 * the timestamp. Exported so the publish flow can recognise open deploy PRs for
 * a form without duplicating the naming scheme. */
export function deployBranchPrefix(formId: string): string {
  return `form-builder/${fitBranchSegment("form-builder/", dotless(formId))}-`;
}

/** Branch for a Deploy PR, e.g. `form-builder/passport-renewal-<ts>`. Recipe
 * versioning is retired (#1196), so the branch no longer carries a version. */
export function deployBranchName(formId: string): string {
  return `${deployBranchPrefix(formId)}${Date.now()}`;
}

/** Branch for an Erase PR, e.g. `form-builder/erase-passport-renewal-<ts>`. */
export function eraseBranchName(formId: string): string {
  const prefix = "form-builder/erase-";
  return `${prefix}${fitBranchSegment(prefix, dotless(formId))}-${Date.now()}`;
}

/**
 * True when `headRef` is a Deploy branch for `formId`: the form's exact
 * `deployBranchPrefix` followed by nothing but a timestamp. Requiring the
 * all-digit tail is what stops `deployBranchPrefix("passport")` from claiming
 * `form-builder/passport-renewal-<ts>` (#2390) — the tail there is
 * `renewal-<ts>`. For an over-length id the prefix carries a hash of the full
 * id, so two long ids sharing a truncated head can't cross-match either
 * (#2488). The publish flow uses this to reuse an already-open Deploy PR
 * instead of opening a duplicate.
 */
export function deployBranchMatchesFormId(
  headRef: string,
  formId: string,
): boolean {
  const prefix = deployBranchPrefix(formId);
  return (
    headRef.startsWith(prefix) && /^[0-9]+$/.test(headRef.slice(prefix.length))
  );
}

/**
 * Recovers the form id from a Deploy branch's head ref, or `null` if the ref
 * isn't one — a non-form-builder (e.g. content) branch, an Erase branch, or a
 * branch missing its trailing timestamp. Feeds the open-deploy-PRs listing;
 * PR reuse goes through `deployBranchMatchesFormId`. For an over-length id
 * the branch carries `fitBranchSegment`'s truncated, hashed label rather than
 * the full id, and that label is what comes back (#2488).
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
