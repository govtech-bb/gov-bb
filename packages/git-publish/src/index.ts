/**
 * Shared GitHub-REST client for the recipe-publish flow used by both
 * form_builder (the Deploy/Erase server fns) and form_builder_api (POST
 * /builder/publish). The primitives — URL/auth/error plus the common
 * branch-create / file-write / open-PR / cleanup-delete operations — were
 * duplicated in each app; this is the single source of truth for them.
 *
 * Repo identity ({owner, repo}) is injected by the caller via
 * `createPublishClient` so each app keeps its own env-driven source of truth
 * for what repo it publishes to. Flow semantics — branch naming, PR copy,
 * validation gates, per-sink path/branch sanitisation — stay with the callers.
 */

const GH_API = "https://api.github.com";

export interface GitHubRepo {
  owner: string;
  repo: string;
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

/**
 * Pull a committed recipe's `createdAt` out of a GitHub Contents API response
 * body so a re-publish can preserve it instead of restamping (#1720). The
 * Contents response carries the file as base64 `content`; decode it, parse the
 * recipe JSON, and return its `createdAt`. Returns `undefined` whenever there's
 * nothing to preserve — no inline content (GitHub omits it for files over 1MB),
 * unparseable content, or no string `createdAt` — so callers fall back to the
 * freshly-stamped value, which is exactly first-publish behaviour.
 */
export function createdAtFromContents(body: {
  content?: string;
}): string | undefined {
  if (!body.content) return undefined;
  try {
    const decoded = Buffer.from(body.content, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { createdAt?: unknown };
    return typeof parsed.createdAt === "string" ? parsed.createdAt : undefined;
  } catch {
    return undefined;
  }
}

export interface OpenPRHead {
  number: number;
  htmlUrl: string;
  headRef: string;
}

export interface PutFileOptions {
  path: string;
  message: string;
  content: string;
  branch: string;
  sha?: string;
}

export interface OpenPullRequestOptions {
  base: string;
  head: string;
  title: string;
  body: string;
}

export interface RecipePublishClient {
  repoUrl(suffix: string): string;
  createBranchFrom(
    token: string,
    baseBranch: string,
    branch: string,
  ): Promise<string>;
  deleteBranch(token: string, branch: string): Promise<void>;
  getContents(token: string, path: string, ref: string): Promise<Response>;
  putFile(token: string, opts: PutFileOptions): Promise<Response>;
  openPullRequest(
    token: string,
    opts: OpenPullRequestOptions,
  ): Promise<{ prUrl: string; prNumber: number }>;
  listOpenPRHeads(token: string, baseBranch: string): Promise<OpenPRHead[]>;
}

/** A GitHub-REST client bound to one `{owner, repo}` identity. */
export function createPublishClient(repo: GitHubRepo): RecipePublishClient {
  const repoUrl = (suffix: string): string =>
    `${GH_API}/repos/${repo.owner}/${repo.repo}${suffix}`;

  /** Tip commit SHA of `branch`. */
  const readBranchSha = async (
    token: string,
    branch: string,
  ): Promise<string> => {
    const res = await fetch(repoUrl(`/git/ref/heads/${branch}`), {
      headers: authHeaders(token),
    });
    if (!res.ok) throw await ghError(`Failed to read ${branch} branch`, res);
    return ((await res.json()) as { object: { sha: string } }).object.sha;
  };

  return {
    repoUrl,

    /** Create `branch` off the tip of `baseBranch`; returns the base tip SHA. */
    async createBranchFrom(token, baseBranch, branch) {
      const baseSha = await readBranchSha(token, baseBranch);
      const res = await fetch(repoUrl("/git/refs"), {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
      });
      if (!res.ok) throw await ghError("Failed to create branch", res);
      return baseSha;
    },

    /** Best-effort branch cleanup after a failed flow — logs and swallows. */
    async deleteBranch(token, branch) {
      try {
        await fetch(repoUrl(`/git/refs/heads/${branch}`), {
          method: "DELETE",
          headers: authHeaders(token),
        });
      } catch (err) {
        console.warn(`cleanup DELETE failed for branch ${branch}:`, err);
      }
    },

    /** GET /contents for `path` at `ref`. Callers branch on `res.status`. */
    async getContents(token, path, ref) {
      return fetch(
        repoUrl(`/contents/${path}?ref=${encodeURIComponent(ref)}`),
        { headers: authHeaders(token) },
      );
    },

    /**
     * PUT a UTF-8 file via the Contents API (create, or update when `sha` is
     * given). Returns the raw Response — status semantics (409 on stale sha, …)
     * differ per flow, so callers own the error handling.
     */
    async putFile(token, opts) {
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
    },

    async openPullRequest(token, opts) {
      const res = await fetch(repoUrl("/pulls"), {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify(opts),
      });
      if (!res.ok) throw await ghError("Failed to open pull request", res);
      const json = (await res.json()) as { number: number; html_url: string };
      return { prUrl: json.html_url, prNumber: json.number };
    },

    /** Every open PR against `baseBranch` (paginated; callers filter by branch). */
    async listOpenPRHeads(token, baseBranch) {
      const heads: OpenPRHead[] = [];
      for (let page = 1; page <= 5; page++) {
        const res = await fetch(
          repoUrl(
            `/pulls?state=open&base=${encodeURIComponent(baseBranch)}&per_page=100&page=${page}`,
          ),
          { headers: authHeaders(token) },
        );
        if (!res.ok)
          throw await ghError("Failed to list open pull requests", res);
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
    },
  };
}
