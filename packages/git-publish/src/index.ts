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
 * Parse the committed recipe out of a GitHub Contents API response body, so a
 * re-publish can read what is already on the branch instead of assuming the
 * incoming payload is the whole truth. The Contents response carries the file
 * as base64 `content`. Returns `undefined` whenever there is nothing to read —
 * no inline content (GitHub omits it for files over 1MB) or content that isn't
 * a JSON object — so callers fall back to first-publish behaviour.
 */
export function recipeFromContents(body: {
  content?: string;
}): Record<string, unknown> | undefined {
  if (!body.content) return undefined;
  try {
    const decoded = Buffer.from(body.content, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Pull a committed recipe's `createdAt` out of a GitHub Contents API response
 * body so a re-publish can preserve it instead of restamping (#1720). Returns
 * `undefined` whenever there's nothing to preserve — nothing `recipeFromContents`
 * can read, or no string `createdAt` — so callers fall back to the freshly-stamped
 * value, which is exactly first-publish behaviour.
 */
export function createdAtFromContents(body: {
  content?: string;
}): string | undefined {
  const createdAt = recipeFromContents(body)?.["createdAt"];
  return typeof createdAt === "string" ? createdAt : undefined;
}

export interface OpenPRHead {
  number: number;
  htmlUrl: string;
  headRef: string;
  /** Tip used to bind an edit to the exact PR revision it loaded. */
  headSha?: string;
  /** A PR from a fork is reviewable but must not be written through this repo. */
  headRepoFullName?: string;
  /** Optional flow marker used by callers to distinguish builder-owned PRs. */
  body?: string;
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
  findOpenPRByHeadRef(
    token: string,
    baseBranch: string,
    isMatch: (headRef: string) => boolean,
  ): Promise<OpenPRHead | null>;
  commentOnPR(token: string, prNumber: number, body: string): Promise<void>;
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

  const client: RecipePublishClient = {
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
          head: {
            ref: string;
            sha?: string;
            repo?: { full_name?: string } | null;
          };
          body?: string | null;
        }[];
        for (const pr of prs) {
          heads.push({
            number: pr.number,
            htmlUrl: pr.html_url,
            headRef: pr.head.ref,
            headSha: pr.head.sha,
            headRepoFullName: pr.head.repo?.full_name,
            ...(typeof pr.body === "string" ? { body: pr.body } : {}),
          });
        }
        if (prs.length < 100) break;
        if (page === 5) {
          throw new Error(
            "More than 500 open pull requests matched the base branch; the review inventory is incomplete.",
          );
        }
      }
      return heads;
    },

    /**
     * Find the open PR against `baseBranch` whose head ref satisfies
     * `isMatch`, built on top of `listOpenPRHeads` rather than duplicating
     * its paginated fetch loop. The branch-naming scheme is a caller concern
     * (#2390) — this transport-level client only knows how to list and
     * filter PRs, not how a caller names its branches — so the match
     * predicate is supplied by the caller, not baked in here.
     *
     * Returns `null` when nothing matches. Matching more than one PR
     * shouldn't happen (a given head ref should have at most one open PR
     * against a given base) but can if someone opens a duplicate by hand; in
     * that case, return the highest-numbered (most recent) match so the
     * result stays deterministic rather than picking an arbitrary one.
     */
    async findOpenPRByHeadRef(token, baseBranch, isMatch) {
      const heads = await client.listOpenPRHeads(token, baseBranch);
      const matches = heads.filter((head) => isMatch(head.headRef));
      if (matches.length === 0) return null;
      return matches.reduce((latest, head) =>
        head.number > latest.number ? head : latest,
      );
    },

    /**
     * Comment on a PR's conversation thread. GitHub serves PR conversation
     * comments through the issues API (`/issues/{n}/comments`) since every PR
     * is also an issue under the hood; `/pulls/{n}/comments` is a different
     * endpoint for line-level review comments and would be a natural but
     * wrong reach here. Throws via `ghError` on a non-ok response — it's up
     * to the caller to decide whether a failed comment is fatal (for #2390
     * it isn't).
     */
    async commentOnPR(token, prNumber, body) {
      const res = await fetch(repoUrl(`/issues/${prNumber}/comments`), {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify({ body }),
      });
      if (!res.ok)
        throw await ghError("Failed to comment on pull request", res);
    },
  };

  return client;
}
