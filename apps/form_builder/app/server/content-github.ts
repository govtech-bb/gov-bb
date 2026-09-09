import { repoUrl, authHeaders, ghError } from "./github";

export async function listPRFiles(
  token: string,
  prNumber: number,
): Promise<
  {
    filename: string;
    previous_filename?: string;
    status: string;
  }[]
> {
  const files: {
    filename: string;
    previous_filename?: string;
    status: string;
  }[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(
      repoUrl(`/pulls/${prNumber}/files?per_page=100&page=${page}`),
      { headers: authHeaders(token) },
    );
    if (!res.ok) throw await ghError(`Failed to read PR #${prNumber}`, res);
    const batch = (await res.json()) as typeof files;
    files.push(...batch);
    if (batch.length < 100) return files;
  }
  throw new Error(`PR #${prNumber} has too many files to inspect safely.`);
}

async function githubJson<T>(
  token: string,
  suffix: string,
  init: RequestInit,
  label: string,
): Promise<T> {
  const res = await fetch(repoUrl(suffix), {
    ...init,
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw await ghError(label, res);
  return (await res.json()) as T;
}

/**
 * Create one commit containing every file and advance the PR ref only when it
 * still points at `expectedHeadSha`. A concurrent commit makes the ref update
 * non-fast-forward, leaving the newly-created objects unreachable and the PR
 * unchanged rather than applying half an update.
 */
export async function commitFilesToExistingPR(
  token: string,
  branch: string,
  expectedHeadSha: string,
  message: string,
  files: { path: string; content: string }[],
): Promise<boolean> {
  const commit = await githubJson<{ tree: { sha: string } }>(
    token,
    `/git/commits/${expectedHeadSha}`,
    { method: "GET" },
    "Failed to read the open PR revision",
  );
  const blobs = await Promise.all(
    files.map(async (file) => ({
      path: file.path,
      sha: (
        await githubJson<{ sha: string }>(
          token,
          "/git/blobs",
          {
            method: "POST",
            body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
          },
          `Failed to prepare ${file.path}`,
        )
      ).sha,
    })),
  );
  const tree = await githubJson<{ sha: string }>(
    token,
    "/git/trees",
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: commit.tree.sha,
        tree: blobs.map((blob) => ({
          path: blob.path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        })),
      }),
    },
    "Failed to prepare the PR update",
  );
  const nextCommit = await githubJson<{ sha: string }>(
    token,
    "/git/commits",
    {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [expectedHeadSha],
      }),
    },
    "Failed to create the PR update",
  );
  const update = await fetch(repoUrl(`/git/refs/heads/${branch}`), {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ sha: nextCommit.sha, force: false }),
  });
  if (update.status === 409 || update.status === 422) return false;
  if (!update.ok) throw await ghError("Failed to update the open PR", update);
  return true;
}
