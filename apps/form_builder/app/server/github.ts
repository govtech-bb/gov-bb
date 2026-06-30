import { REPO_NAME, repoOwner } from "./github-repo";
import {
  createPublishClient,
  authHeaders as ghAuthHeaders,
  ghError as ghErrorImpl,
  createdAtFromContents as createdAtFromContentsImpl,
  type OpenPRHead,
  type PutFileOptions,
  type OpenPullRequestOptions,
} from "@govtech-bb/git-publish";

/**
 * The GitHub plumbing shared by every PR-based deploy flow (recipe publish,
 * recipe erase, content pages): URL/auth/error primitives plus the common
 * operations built on them. The primitives themselves live in
 * `@govtech-bb/git-publish` (shared with form_builder_api's publish flow);
 * this module binds them to *this app's* env-driven repo identity
 * (`repoOwner()`/`REPO_NAME`, from `./github-repo`) and preserves the call
 * signatures the deploy/erase/content server fns already use. Flow semantics —
 * branch naming, PR copy, gates — stay with the callers.
 */

// Resolved per call: `repoOwner()` throws when GITHUB_ORG is unset, matching
// the original module's lazy read so a missing env var still fails at use, not
// at import.
function client() {
  return createPublishClient({ owner: repoOwner(), repo: REPO_NAME });
}

export type { OpenPRHead };

export function repoUrl(suffix: string): string {
  return client().repoUrl(suffix);
}

export const authHeaders = ghAuthHeaders;
export const ghError = ghErrorImpl;
// Pure helper (no repo binding) — re-exported so publish flows read every
// GitHub-Contents helper from this one facade. Used to preserve a recipe's
// committed createdAt on re-publish (#1720).
export const createdAtFromContents = createdAtFromContentsImpl;

export function createBranchFrom(
  token: string,
  baseBranch: string,
  branch: string,
): Promise<string> {
  return client().createBranchFrom(token, baseBranch, branch);
}

export function deleteBranch(branch: string, token: string): Promise<void> {
  return client().deleteBranch(token, branch);
}

export function getContents(
  token: string,
  path: string,
  ref: string,
): Promise<Response> {
  return client().getContents(token, path, ref);
}

export function putFile(
  token: string,
  opts: PutFileOptions,
): Promise<Response> {
  return client().putFile(token, opts);
}

export function openPullRequest(
  token: string,
  opts: OpenPullRequestOptions,
): Promise<{ prUrl: string; prNumber: number }> {
  return client().openPullRequest(token, opts);
}

export function listOpenPRHeads(
  token: string,
  baseBranch: string,
): Promise<OpenPRHead[]> {
  return client().listOpenPRHeads(token, baseBranch);
}
