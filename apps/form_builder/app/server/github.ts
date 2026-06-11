import { REPO_NAME, repoOwner } from "./github-repo";

/**
 * The GitHub plumbing shared by every PR-based deploy flow (recipe publish,
 * recipe erase, content pages): URL/auth/error primitives plus the common
 * operations built on them. Flow semantics — branch naming, PR copy, gates —
 * stay with the callers.
 */

const GH_API = "https://api.github.com";

export function repoUrl(suffix: string): string {
  return `${GH_API}/repos/${repoOwner()}/${REPO_NAME}${suffix}`;
}

export function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function jsonHeaders(token: string): Record<string, string> {
  return { ...authHeaders(token), "Content-Type": "application/json" };
}

export async function ghError(label: string, res: Response): Promise<Error> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }
  return new Error(`${label} (status ${res.status}): ${body.slice(0, 500)}`);
}

/** Tip commit SHA of `branch`. */
async function readBranchSha(token: string, branch: string): Promise<string> {
  const res = await fetch(repoUrl(`/git/ref/heads/${branch}`), {
    headers: authHeaders(token),
  });
  if (!res.ok) throw await ghError(`Failed to read ${branch} branch`, res);
  return ((await res.json()) as { object: { sha: string } }).object.sha;
}

/** Create `branch` off the tip of `baseBranch`; returns the base tip SHA. */
export async function createBranchFrom(
  token: string,
  baseBranch: string,
  branch: string,
): Promise<string> {
  const baseSha = await readBranchSha(token, baseBranch);
  const res = await fetch(repoUrl("/git/refs"), {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });
  if (!res.ok) throw await ghError("Failed to create branch", res);
  return baseSha;
}

/** Best-effort branch cleanup after a failed flow — logs and swallows. */
export async function deleteBranch(
  branch: string,
  token: string,
): Promise<void> {
  try {
    await fetch(repoUrl(`/git/refs/heads/${branch}`), {
      method: "DELETE",
      headers: authHeaders(token),
    });
  } catch (err) {
    console.warn(`cleanup DELETE failed for branch ${branch}:`, err);
  }
}

/** GET /contents for `path` at `ref`. Callers branch on `res.status`. */
export async function getContents(
  token: string,
  path: string,
  ref: string,
): Promise<Response> {
  return fetch(repoUrl(`/contents/${path}?ref=${encodeURIComponent(ref)}`), {
    headers: authHeaders(token),
  });
}

/**
 * PUT a UTF-8 file via the Contents API (create, or update when `sha` is
 * given). Returns the raw Response — status semantics (409 on stale sha, …)
 * differ per flow, so callers own the error handling.
 */
export async function putFile(
  token: string,
  opts: {
    path: string;
    message: string;
    content: string;
    branch: string;
    sha?: string;
  },
): Promise<Response> {
  return fetch(repoUrl(`/contents/${opts.path}`), {
    method: "PUT",
    headers: jsonHeaders(token),
    body: JSON.stringify({
      message: opts.message,
      content: Buffer.from(opts.content, "utf8").toString("base64"),
      branch: opts.branch,
      ...(opts.sha ? { sha: opts.sha } : {}),
    }),
  });
}

export async function openPullRequest(
  token: string,
  opts: { base: string; head: string; title: string; body: string },
): Promise<{ prUrl: string; prNumber: number }> {
  const res = await fetch(repoUrl("/pulls"), {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw await ghError("Failed to open pull request", res);
  const json = (await res.json()) as { number: number; html_url: string };
  return { prUrl: json.html_url, prNumber: json.number };
}

export interface OpenPRHead {
  number: number;
  htmlUrl: string;
  headRef: string;
}

/** Every open PR against `baseBranch` (paginated; callers filter by branch). */
export async function listOpenPRHeads(
  token: string,
  baseBranch: string,
): Promise<OpenPRHead[]> {
  const heads: OpenPRHead[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(
      repoUrl(
        `/pulls?state=open&base=${encodeURIComponent(baseBranch)}&per_page=100&page=${page}`,
      ),
      { headers: authHeaders(token) },
    );
    if (!res.ok) throw await ghError("Failed to list open pull requests", res);
    const prs = (await res.json()) as {
      number: number;
      html_url: string;
      head: { ref: string };
    }[];
    for (const pr of prs) {
      heads.push({
        number: pr.number,
        htmlUrl: pr.html_url,
        headRef: pr.head.ref,
      });
    }
    if (prs.length < 100) break;
  }
  return heads;
}
