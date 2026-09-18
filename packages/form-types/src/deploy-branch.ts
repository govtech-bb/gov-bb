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

/** The id segment a form's Deploy branch carries: the form id itself, or its
 * fitted (truncated + hashed) form when the full id would push the preview
 * label past 63 chars (#2488). This — not the id — is what
 * `formIdFromDeployBranch` recovers from a head ref, so the artifact↔PR join
 * is `formIdFromDeployBranch(headRef) === deployBranchLabel(formId)`. */
export function deployBranchLabel(formId: string): string {
  return fitBranchSegment("form-builder/", dotless(formId));
}

/** Prefix shared by every Deploy branch for a form — `deployBranchName` minus
 * the timestamp. */
export function deployBranchPrefix(formId: string): string {
  return `form-builder/${deployBranchLabel(formId)}-`;
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
 * Recovers the Deploy branch label from a head ref, or `null` if the ref isn't
 * a Deploy branch — a non-form-builder (e.g. content) branch, an Erase branch,
 * or a branch missing its trailing timestamp. The label is the form id unless
 * the id was too long for the branch to carry, in which case it is
 * `deployBranchLabel(formId)`'s truncated, hashed form (#2488) — so callers
 * join a candidate form with `=== deployBranchLabel(formId)`, never
 * `=== formId`. The publish flow uses that join to spot an already-open Deploy
 * PR for a form and reuse it instead of opening a duplicate (#2390).
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
